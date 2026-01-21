// forms-control/server.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// -------------------- Config --------------------
const PORT = process.env.PORT || 8080;

const SPA_ORIGIN = process.env.SPA_ORIGIN || "https://forms.your-domain.com";

// Form.io (internal)
const FORMIO_INTERNAL_BASE = process.env.FORMIO_INTERNAL_BASE || "http://formio:3001";
const FORMIO_JWT_SECRET = process.env.FORMIO_JWT_SECRET || "";

// Service account (for role/admin checks + applying changes)
const FORMIO_ADMIN_EMAIL = process.env.FORMIO_ADMIN_EMAIL || "";
const FORMIO_ADMIN_PASSWORD = process.env.FORMIO_ADMIN_PASSWORD || "";

// Webhook shared secret
const WEBHOOK_SHARED_SECRET = process.env.WEBHOOK_SHARED_SECRET || "";

// S3
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET || "";
const UPLOAD_PREFIX = (process.env.UPLOAD_PREFIX || "uploads").replace(/^\/+|\/+$/g, "");
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 20 * 1024 * 1024);
const PRESIGN_EXPIRES_SECONDS = Number(process.env.PRESIGN_EXPIRES_SECONDS || 900);

// Optional allowlists
const ALLOWED_FORM_PATHS = (process.env.ALLOWED_FORM_PATHS || "")
  .split(",").map(s => s.trim()).filter(Boolean);
const ALLOWED_MIME_PREFIXES = (process.env.ALLOWED_MIME_PREFIXES || "image/,application/pdf,text/")
  .split(",").map(s => s.trim()).filter(Boolean);

// -------------------- App --------------------
const app = express();
app.set("trust proxy", true);

app.use(helmet());
app.use(express.json({ limit: "256kb" }));

// Serve static files with correct MIME types
app.use(express.static('../app', {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json');
        }
    }
}));

app.use(cors({
  origin: SPA_ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-RFP-Webhook-Secret", "X-Webhook-Secret"]
}));

app.use(rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false
}));

app.get("/healthz", (_req, res) => res.status(200).json({ ok: true }));

const s3 = new S3Client({ region: AWS_REGION });

// -------------------- Helpers --------------------
function badRequest(res, msg) {
  return res.status(400).json({ error: msg });
}

function normalizeFileName(name) {
  return String(name || "").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isAllowedMime(type) {
  const t = String(type || "");
  if (!t) return true;
  return ALLOWED_MIME_PREFIXES.some(prefix => t.startsWith(prefix));
}

function verifyFormioJwtFromHeaders(headers) {
  const auth = headers.authorization || headers.Authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    const e = new Error("Missing Authorization header");
    e.status = 401;
    throw e;
  }
  if (!FORMIO_JWT_SECRET) {
    const e = new Error("FORMIO_JWT_SECRET not configured");
    e.status = 500;
    throw e;
  }
  try {
    return jwt.verify(token, FORMIO_JWT_SECRET);
  } catch {
    const e = new Error("Invalid or expired token");
    e.status = 401;
    throw e;
  }
}

async function formioFetch(path, { method = "GET", headers = {}, body } = {}) {
  const url = `${FORMIO_INTERNAL_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}

  if (!res.ok) {
    const e = new Error(json?.error || json?.message || text || `Form.io error ${res.status}`);
    e.status = res.status;
    e.payload = json;
    throw e;
  }
  return json;
}

// ---- service-account token cache
let cachedAdminToken = null;
let cachedAdminTokenExpMs = 0;

async function getServiceAdminToken() {
  const now = Date.now();
  if (cachedAdminToken && (cachedAdminTokenExpMs - now) > 60_000) return cachedAdminToken;

  if (!FORMIO_ADMIN_EMAIL || !FORMIO_ADMIN_PASSWORD) {
    const e = new Error("Service admin credentials not configured");
    e.status = 500;
    throw e;
  }

  const loginResp = await formioFetch("/admin/login", {
    method: "POST",
    body: { data: { email: FORMIO_ADMIN_EMAIL, password: FORMIO_ADMIN_PASSWORD } }
  });

  const token = loginResp?.token;
  if (!token) {
    const e = new Error("No token returned from Form.io admin login");
    e.status = 500;
    throw e;
  }

  const decoded = jwt.decode(token);
  const expSec = decoded?.exp ? Number(decoded.exp) : null;
  cachedAdminToken = token;
  cachedAdminTokenExpMs = expSec ? expSec * 1000 : (Date.now() + 10 * 60_000);
  return token;
}

function requireWebhookSecret(req, res, next) {
  if (!WEBHOOK_SHARED_SECRET) return next(); // optional
  const got = req.header("X-Webhook-Secret") || req.header("X-RFP-Webhook-Secret") || "";
  if (got !== WEBHOOK_SHARED_SECRET) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }
  return next();
}

// ---- admin role check (fail-closed)
let cachedRoles = null;
let cachedRolesAt = 0;

async function loadProjectRoles(adminToken) {
  const now = Date.now();
  if (cachedRoles && (now - cachedRolesAt) < 60_000) return cachedRoles;
  const roles = await formioFetch("/role", {
    method: "GET",
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  cachedRoles = Array.isArray(roles) ? roles : [];
  cachedRolesAt = now;
  return cachedRoles;
}

async function callerIsAdmin(callerUserId) {
  const adminToken = await getServiceAdminToken();
  const roles = await loadProjectRoles(adminToken);
  const adminRoleIds = new Set(roles.filter(r => r?.admin && r._id).map(r => r._id));

  // Pull caller user submission to get roles reliably
  const caller = await formioFetch(`/user/submission/${callerUserId}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  const callerRoleIds = new Set(Array.isArray(caller?.roles) ? caller.roles : []);
  for (const rid of callerRoleIds) {
    if (adminRoleIds.has(rid)) return true;
  }
  return false;
}

function buildRoleIdsFromFlags(flags, roles) {
  const byMachine = new Map(
    (roles || [])
      .filter(r => r && r._id)
      .map(r => [String(r.machineName || r.name || '').toLowerCase(), r._id])
  );

  const keyAliases = {
    administrator: ['administrator', 'admin'],
    admin: ['administrator', 'admin'],
    management: ['management'],
    staff: ['staff'],
    programmer: ['programmer'],
    engineering: ['engineering'],
    underwriting: ['underwriting'],
    volunteer: ['volunteer']
  };

  const out = new Set();
  for (const [key, aliases] of Object.entries(keyAliases)) {
    if (flags?.[key] !== true) continue;
    const found = aliases
      .map(a => byMachine.get(String(a).toLowerCase()))
      .find(Boolean);
    if (found) out.add(found);
  }
  return Array.from(out);
}

// ---- upload key parsing/validation
function ensureKeyAllowed(key) {
  const k = String(key || "");
  if (!k) {
    const e = new Error("Missing key");
    e.status = 400;
    throw e;
  }
  if (k.includes("..")) {
    const e = new Error("Invalid key");
    e.status = 400;
    throw e;
  }
  const prefix = `${UPLOAD_PREFIX}/`;
  if (!k.startsWith(prefix)) {
    const e = new Error("Key not in allowed prefix");
    e.status = 403;
    throw e;
  }
  return k;
}

function parseUploadKey(key) {
  // uploads/{formPath}/{userId}/{rest...}
  const parts = String(key).split("/");
  const [p0, formPath, userId] = parts;
  if (p0 !== UPLOAD_PREFIX || !formPath || !userId) return null;
  return { formPath, userId };
}

// -------------------- Routes --------------------

// Upload presign (SPA)
app.post("/v1/uploads/presign", async (req, res) => {
  try {
    const user = verifyFormioJwtFromHeaders(req.headers);

    const { fileName, fileType, fileSize, formPath } = req.body || {};
    if (!fileName || !fileSize || !formPath) {
      return badRequest(res, "fileName, fileSize, and formPath are required");
    }

    const size = Number(fileSize);
    if (!Number.isFinite(size) || size <= 0) return badRequest(res, "fileSize must be a positive number");
    if (size > MAX_UPLOAD_BYTES) return res.status(413).json({ error: `File too large. Max ${MAX_UPLOAD_BYTES} bytes.` });

    const fp = String(formPath || "").trim();
    if (!fp) return badRequest(res, "formPath is required");
    if (ALLOWED_FORM_PATHS.length && !ALLOWED_FORM_PATHS.includes(fp)) {
      return res.status(403).json({ error: "Uploads not allowed for this formPath" });
    }

    const contentType = String(fileType || "application/octet-stream");
    if (!isAllowedMime(contentType)) return res.status(415).json({ error: "File type not allowed" });
    if (!UPLOAD_BUCKET) return res.status(500).json({ error: "UPLOAD_BUCKET not configured" });

    const safeName = normalizeFileName(fileName);
    const userId = user?._id || "anonymous";

    const key = [UPLOAD_PREFIX, fp, userId, `${Date.now()}-${safeName}`].join("/");

    const command = new PutObjectCommand({
      Bucket: UPLOAD_BUCKET,
      Key: key,
      ContentType: contentType
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRES_SECONDS });

    // IMPORTANT: store a SPA-relative download URL, not a raw S3 URL.
    const fileUrl = `/api/v1/uploads/download?key=${encodeURIComponent(key)}`;

    return res.status(200).json({
      uploadUrl,
      key,
      fileUrl,
      // optional debug:
      s3Url: `https://${UPLOAD_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${encodeURIComponent(key)}`
    });
  } catch (err) {
    const status = err.status || err.statusCode || 500;
    return res.status(status).json({ error: err.message || "Internal server error" });
  }
});

// Download (SPA): redirects to a short-lived presigned GET
app.get("/v1/uploads/download", async (req, res) => {
  try {
    const user = verifyFormioJwtFromHeaders(req.headers);
    const callerId = user?._id;
    if (!callerId) return res.status(401).json({ error: "Invalid session" });

    const key = ensureKeyAllowed(req.query.key);
    const parsed = parseUploadKey(key);
    if (!parsed) return res.status(400).json({ error: "Unrecognized key format" });

    const isAdmin = await callerIsAdmin(callerId);
    const isOwner = parsed.userId === String(callerId);

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: "Not authorized to download this file" });
    }

    if (!UPLOAD_BUCKET) return res.status(500).json({ error: "UPLOAD_BUCKET not configured" });

    // Suggest download filename based on key suffix
    const last = key.split("/").pop() || "download";
    const filename = last.replace(/^\d+-/, ""); // strip timestamp-
    const disposition = `attachment; filename="${normalizeFileName(filename)}"`;

    const cmd = new GetObjectCommand({
      Bucket: UPLOAD_BUCKET,
      Key: key,
      ResponseContentDisposition: disposition
    });

    const signed = await getSignedUrl(s3, cmd, { expiresIn: 300 }); // 5 minutes is plenty for download start
    return res.redirect(302, signed);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || "Internal server error" });
  }
});

// Delete (SPA): admin-only
app.delete("/v1/uploads/object", async (req, res) => {
  try {
    const user = verifyFormioJwtFromHeaders(req.headers);
    const callerId = user?._id;
    if (!callerId) return res.status(401).json({ error: "Invalid session" });

    const key = ensureKeyAllowed(req.query.key);
    if (!UPLOAD_BUCKET) return res.status(500).json({ error: "UPLOAD_BUCKET not configured" });

    const isAdmin = await callerIsAdmin(callerId);
    if (!isAdmin) return res.status(403).json({ error: "Admin role required to delete files" });

    await s3.send(new DeleteObjectCommand({ Bucket: UPLOAD_BUCKET, Key: key }));
    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || "Internal server error" });
  }
});

// Apply role changes (webhook preferred)
app.post("/v1/roles/apply", requireWebhookSecret, async (req, res) => {
  try {
    // Accept either:
    // - direct: { actorUserId, targetUserId, desiredRoleIds, ... }
    // - webhook: full submission object with .data.{actorUserId,targetUserId,desiredRoleIds}
    const submission = req.body?.submission || req.body;
    const data = submission?.data || req.body?.data || {};

    const actorUserId = data.actorUserId || req.body?.actorUserId;
    const targetUserId = data.targetUserId || data.userId || req.body?.targetUserId || req.body?.userId;
    const desiredRoleIdsRaw = data.desiredRoleIds || req.body?.desiredRoleIds;

    const roleLogId = submission?._id;
    if (!roleLogId) return badRequest(res, "Missing submission._id (roleMgmtLog id)");
    if (!actorUserId) return badRequest(res, "actorUserId required");
    if (!targetUserId) return badRequest(res, "targetUserId required");

    // Security: only admins can apply role changes.
    const isAdmin = await callerIsAdmin(actorUserId);
    if (!isAdmin) return res.status(403).json({ error: "Admin role required" });

    const adminToken = await getServiceAdminToken();

    // Determine desired roles
    let desiredRoleIds = Array.isArray(desiredRoleIdsRaw) ? desiredRoleIdsRaw.filter(Boolean) : null;
    if (!desiredRoleIds || !desiredRoleIds.length) {
      const roles = await loadProjectRoles(adminToken);
      desiredRoleIds = buildRoleIdsFromFlags(data, roles);
    }

    // Update target user submission
    const userSub = await formioFetch(`/user/submission/${targetUserId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const next = {
      ...(userSub || {}),
      data: {
        ...(userSub?.data || {}),
        latestRoleLogId: roleLogId
      },
      // Backward compatibility: some clients may have stored this at the top-level.
      latestRoleLogId: roleLogId
    };

    if (Array.isArray(desiredRoleIds) && desiredRoleIds.length) {
      next.roles = desiredRoleIds;
    }

    await formioFetch(`/user/submission/${targetUserId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: next
    });

    return res.status(200).json({ ok: true, targetUserId, latestRoleLogId: roleLogId });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || "Internal server error" });
  }
});

app.listen(PORT, () => console.log(`forms-control listening on :${PORT}`));
