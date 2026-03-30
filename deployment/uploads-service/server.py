import cgi
import json
import mimetypes
import os
import re
import shutil
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urlparse
from urllib.request import Request, urlopen

UPLOADS_ROOT = os.path.normpath(os.getenv("UPLOADS_ROOT", "/uploads"))
FORMIO_API_BASE = os.getenv("FORMIO_API_BASE", "http://formio:3001").rstrip("/")
UPLOADS_HOST = os.getenv("UPLOADS_HOST", "0.0.0.0")
UPLOADS_PORT = int(os.getenv("UPLOADS_PORT", "3002"))
UPLOAD_PUBLIC_BASE = os.getenv("UPLOAD_PUBLIC_BASE", "").strip().rstrip("/")
UPLOAD_S3_PRESIGN_URL = os.getenv("UPLOAD_S3_PRESIGN_URL", "").strip()


def iso_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sanitize_component(value, fallback):
    raw = str(value or "").strip().lower()
    cleaned = re.sub(r"[^a-z0-9._-]+", "-", raw).strip("-._")
    return cleaned or fallback


def sanitize_filename(filename):
    basename = os.path.basename(filename or "upload.bin")
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", basename).strip("._")
    return cleaned or "upload.bin"


class UploadsHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print(f"[uploads-service] {self.address_string()} - {fmt % args}", flush=True)

    def _send_cors_headers(self):
        origin = self.headers.get("Origin")
        self.send_header("Access-Control-Allow-Origin", origin if origin else "*")
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-jwt-token, x-token")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _token(self):
        token = self.headers.get("x-jwt-token") or self.headers.get("x-token")
        if not token:
            auth = self.headers.get("Authorization", "")
            if auth.lower().startswith("bearer "):
                token = auth[7:].strip()
        token = str(token or "").strip()
        if token.lower().startswith("bearer "):
            token = token[7:].strip()
        return token or None

    def _auth_headers(self):
        token = self._token()
        if not token:
            return None
        return {
            "x-jwt-token": token,
            "x-token": token,
            "Authorization": f"Bearer {token}",
        }

    def _require_authenticated_user(self):
        auth_headers = self._auth_headers()
        if not auth_headers:
            self._send_json(401, {"error": "Unauthorized", "message": "Missing auth token."})
            return None, None

        req = Request(
            f"{FORMIO_API_BASE}/current",
            headers={"Accept": "application/json", **auth_headers},
            method="GET",
        )

        try:
            with urlopen(req, timeout=10) as resp:
                payload = json.loads((resp.read() or b"{}").decode("utf-8"))
                return payload, auth_headers
        except HTTPError as exc:
            detail = (exc.read() or b"").decode("utf-8", errors="ignore")
            self._send_json(401, {
                "error": "Unauthorized",
                "message": "Token validation failed.",
                "detail": detail,
            })
        except URLError as exc:
            self._send_json(502, {
                "error": "UpstreamUnavailable",
                "message": "Could not reach Form.io auth endpoint.",
                "detail": str(exc),
            })
        except Exception as exc:
            self._send_json(500, {
                "error": "AuthError",
                "message": "Unexpected authentication error.",
                "detail": str(exc),
            })

        return None, None

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}

        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._send_json(400, {"error": "BadRequest", "message": "Invalid JSON body."})
            return None

    def _build_file_url(self, storage_key):
        if UPLOAD_PUBLIC_BASE:
            base = UPLOAD_PUBLIC_BASE
        else:
            scheme = self.headers.get("X-Forwarded-Proto", "http")
            host = self.headers.get("Host", "localhost")
            base = f"{scheme}://{host}"
        return f"{base}/api/v1/uploads/object/{quote(storage_key, safe='')}"

    def _resolve_storage_key(self, storage_key):
        normalized_key = str(storage_key or "").strip().lstrip("/")
        if not normalized_key:
            return None
        if ".." in normalized_key.split("/"):
            return None

        abs_path = os.path.normpath(os.path.join(UPLOADS_ROOT, normalized_key))
        if abs_path != UPLOADS_ROOT and not abs_path.startswith(f"{UPLOADS_ROOT}{os.sep}"):
            return None

        return abs_path

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        path = urlparse(self.path).path

        if path == "/api/v1/uploads/local":
            return self._handle_local_upload()

        if path == "/api/v1/uploads/presign":
            return self._handle_presign_proxy()

        self._send_json(404, {"error": "NotFound"})

    def do_GET(self):
        path = urlparse(self.path).path

        if path.startswith("/api/v1/uploads/object/"):
            storage_key = unquote(path[len("/api/v1/uploads/object/"):])
            return self._handle_object_get(storage_key)

        if path.startswith("/api/v1/uploads/download/"):
            storage_key = unquote(path[len("/api/v1/uploads/download/"):])
            return self._handle_object_get(storage_key)

        if path == "/api/v1/uploads/health":
            return self._send_json(200, {"status": "ok", "time": iso_now()})

        self._send_json(404, {"error": "NotFound"})

    def _handle_local_upload(self):
        user, _ = self._require_authenticated_user()
        if user is None:
            return

        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            self._send_json(400, {
                "error": "BadRequest",
                "message": "Expected multipart/form-data.",
            })
            return

        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": content_type,
                "CONTENT_LENGTH": self.headers.get("Content-Length", "0"),
            },
            keep_blank_values=True,
        )

        if "file" not in form:
            self._send_json(400, {"error": "BadRequest", "message": "Missing file field."})
            return

        file_field = form["file"]
        if isinstance(file_field, list):
            file_field = file_field[0]

        if not getattr(file_field, "file", None):
            self._send_json(400, {"error": "BadRequest", "message": "No uploaded file data found."})
            return

        original_name = file_field.filename or "upload.bin"
        safe_name = sanitize_filename(original_name)
        form_path = sanitize_component(form.getfirst("formPath", "unknown"), "unknown")
        submission_id = sanitize_component(form.getfirst("submissionId", "draft"), "draft")

        rel_dir = os.path.join(form_path, submission_id)
        abs_dir = os.path.normpath(os.path.join(UPLOADS_ROOT, rel_dir))
        if abs_dir != UPLOADS_ROOT and not abs_dir.startswith(f"{UPLOADS_ROOT}{os.sep}"):
            self._send_json(400, {"error": "BadRequest", "message": "Invalid upload path."})
            return

        os.makedirs(abs_dir, exist_ok=True)
        stored_name = f"{uuid.uuid4().hex}_{safe_name}"
        abs_path = os.path.join(abs_dir, stored_name)

        with open(abs_path, "wb") as output_file:
            shutil.copyfileobj(file_field.file, output_file)

        storage_key = os.path.join(rel_dir, stored_name).replace(os.sep, "/")
        file_size = os.path.getsize(abs_path)
        file_url = self._build_file_url(storage_key)

        self._send_json(201, {
            "fileName": original_name,
            "fileUrl": file_url,
            "url": file_url,
            "storage": "local",
            "storageKey": storage_key,
            "key": storage_key,
            "type": file_field.type or "application/octet-stream",
            "size": file_size,
            "uploadedAt": iso_now(),
            "uploadedBy": user.get("_id"),
            "isPublic": False,
        })

    def _handle_presign_proxy(self):
        _, auth_headers = self._require_authenticated_user()
        if auth_headers is None:
            return

        if not UPLOAD_S3_PRESIGN_URL:
            self._send_json(501, {
                "error": "NotConfigured",
                "message": "S3 presign fallback is not configured on the upload service.",
            })
            return

        payload = self._read_json_body()
        if payload is None:
            return

        body = json.dumps(payload).encode("utf-8")
        req = Request(
            UPLOAD_S3_PRESIGN_URL,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                **auth_headers,
            },
            method="POST",
        )

        try:
            with urlopen(req, timeout=20) as resp:
                raw = resp.read() or b"{}"
                try:
                    parsed = json.loads(raw.decode("utf-8"))
                except json.JSONDecodeError:
                    parsed = {"raw": raw.decode("utf-8", errors="ignore")}
                self._send_json(resp.getcode(), parsed)
        except HTTPError as exc:
            detail = (exc.read() or b"").decode("utf-8", errors="ignore")
            self._send_json(exc.code or 502, {
                "error": "PresignRequestFailed",
                "message": "S3 presign upstream returned an error.",
                "detail": detail,
            })
        except URLError as exc:
            self._send_json(502, {
                "error": "PresignUpstreamUnavailable",
                "message": "Could not reach S3 presign upstream.",
                "detail": str(exc),
            })

    def _handle_object_get(self, storage_key):
        _, _auth_headers = self._require_authenticated_user()
        if _auth_headers is None:
            return

        abs_path = self._resolve_storage_key(storage_key)
        if not abs_path:
            self._send_json(400, {"error": "BadRequest", "message": "Invalid file key."})
            return

        if not os.path.exists(abs_path) or not os.path.isfile(abs_path):
            self._send_json(404, {"error": "NotFound", "message": "File not found."})
            return

        content_type = mimetypes.guess_type(abs_path)[0] or "application/octet-stream"
        stored_name = os.path.basename(abs_path)
        original_name = stored_name.split("_", 1)[1] if "_" in stored_name else stored_name
        size = os.path.getsize(abs_path)

        self.send_response(200)
        self._send_cors_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(size))
        self.send_header("Content-Disposition", f'inline; filename="{original_name}"')
        self.send_header("Cache-Control", "private, no-store")
        self.end_headers()

        with open(abs_path, "rb") as file_obj:
            shutil.copyfileobj(file_obj, self.wfile)


if __name__ == "__main__":
    os.makedirs(UPLOADS_ROOT, exist_ok=True)
    server = ThreadingHTTPServer((UPLOADS_HOST, UPLOADS_PORT), UploadsHandler)
    print(f"[uploads-service] listening on {UPLOADS_HOST}:{UPLOADS_PORT} | uploads_root={UPLOADS_ROOT}", flush=True)
    server.serve_forever()
