import { buildUrl, formioRequest } from '../services/formioService.js';
import { getCurrentUserWithRoles } from '../services/sessionService.js';
import { createModal } from '../ui/modalUtils.js';

const ROLE_FLAG_KEYS = [
  'administrator',
  'admin',
  'management',
  'staff',
  'programmer',
  'engineering',
  'underwriting',
  'volunteer'
];

async function fetchLatestRoleLogSubmission(targetUserSubmission) {
  const targetUserId = targetUserSubmission?._id;
  if (!targetUserId) return null;

  const logId = targetUserSubmission?.data?.latestRoleLogId || targetUserSubmission?.latestRoleLogId;
  if (logId) {
    try {
      return await formioRequest(`/rolemgmtlog/submission/${logId}`, { method: 'GET' });
    } catch {
    }
  }

  try {
    // Some Form.io deployments don't support filtering on nested keys reliably.
    // Use a wide fetch and filter client-side.
    const res = await formioRequest('/rolemgmtlog/submission', {
      method: 'GET',
      query: {
        limit: 2000,
        sort: '-created',
        select: '_id,created,data',
      }
    });
    const list = Array.isArray(res) ? res : [];
    const match = list.find(x => String(x?.data?.targetUserId || '') === String(targetUserId));
    return match || null;
  } catch {
    return null;
  }
}

async function createFirstAvailableForm(containerEl, pathCandidates, actorUser) {
  let lastErr = null;
  for (const p of pathCandidates) {
    try {
      return await Formio.createForm(containerEl, buildUrl(p), { readOnly: false, user: actorUser });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Unable to load role management form');
}

function buildPrefilledRoleMgmtSubmission({
  targetUserSubmission,
  actorUser,
  latestRoleLog
}) {
  const data = {};

  const targetUserId = targetUserSubmission?._id;
  if (targetUserId) data.targetUserId = targetUserId;

  const actorUserId = actorUser?._id;
  if (actorUserId) data.actorUserId = actorUserId;

  // Add targetUser data for form's custom functions
  if (targetUserSubmission) {
    const userEmail = targetUserSubmission.data?.email || targetUserSubmission.email;
    
    data.targetUser = {
      _id: targetUserSubmission._id,
      email: userEmail,
      data: {
        ...targetUserSubmission.data,
        email: userEmail
      }
    };
    
    // Set targetUserEmail directly as fallback
    data.targetUserEmail = userEmail;
  }

  const logData = latestRoleLog?.data || {};

  for (const key of ROLE_FLAG_KEYS) {
    if (typeof logData[key] === 'boolean') {
      data[key] = logData[key];
    }
  }

  if (Array.isArray(logData.roles)) {
    data.roles = logData.roles;
  }

  return { data };
}

export async function openRoleMgmtModal({
  targetUserSubmission,
  variant = 'roleMgmt',
  onSaved
} = {}) {
  const formPathCandidates =
    variant === 'roleMgmtAdmin'
      ? ['/rolemgmtadmin', '/roleMgmtAdmin', '/rolemgmtAdmin', '/roleMgmtadmin']
      : ['/rolemgmt', '/roleMgmt'];

  let modalContainer = null;
  const hostId = `roleMgmtHost_${Math.random().toString(16).slice(2)}`;

  const titleUser =
    targetUserSubmission?.data?.email ||
    targetUserSubmission?.email ||
    targetUserSubmission?._id ||
    'User';

  const modal = createModal({
    title: variant === 'roleMgmtAdmin' ? `Admin Role Management: ${titleUser}` : `Role Management: ${titleUser}`,
    body: `<div id="${hostId}"></div>`,
    size: 'xl',
    showFooter: false,
    onCreate: (container) => {
      modalContainer = container;
    }
  });

  modal.show();

  const modalEl = modalContainer?.querySelector('.modal');
  const hostEl = modalContainer?.querySelector(`#${hostId}`);
  if (!modalEl || !hostEl) return;

  let formio = null;

  const cleanup = () => {
    if (formio && typeof formio.destroy === 'function') {
      try { formio.destroy(true); } catch {}
    }
    formio = null;
  };

  modalEl.addEventListener('hidden.bs.modal', cleanup, { once: true });

  const actorUser = await getCurrentUserWithRoles();
  const latestRoleLog = await fetchLatestRoleLogSubmission(targetUserSubmission);
  const prefilledSubmission = buildPrefilledRoleMgmtSubmission({
    targetUserSubmission,
    actorUser,
    latestRoleLog
  });

  formio = await createFirstAvailableForm(hostEl, formPathCandidates, actorUser);
  if (formio?.setSubmission) await formio.setSubmission(prefilledSubmission);
  
  // Apply checkbox selections to the form submission
  if (formio) {
    const { buildRoleIdMapFromRoles, applyRoleCheckboxesToSubmission } = await import('../utils/roleUtils.js');
    const { fetchProjectRoles } = await import('../services/rbacService.js');
    
    // Get all roles for checkbox mapping
    const allRoles = await fetchProjectRoles(true);
    const checkboxKeyToRoleId = buildRoleIdMapFromRoles(allRoles);
    
    // Apply checkbox selections to the form submission
    formio.on('change', () => {
      const submission = formio.submission || {};
      applyRoleCheckboxesToSubmission(submission, checkboxKeyToRoleId, false);
    });
  }
  
  // Set targetUser data immediately after form creation
  if (formio.submission && prefilledSubmission.data?.targetUser) {
    formio.submission.data.targetUser = prefilledSubmission.data.targetUser;
    
    // Use Form.io's setData method to ensure proper processing
    if (formio.setData) {
      await formio.setData(formio.submission.data);
    }
  }
  
  // Ensure targetUserId field is properly set (hiding can be configured in form itself)
  setTimeout(async () => {
    const targetUserField = formio.getComponent('targetUserId');
    if (targetUserField && prefilledSubmission.data?.targetUserId) {
      targetUserField.setValue(prefilledSubmission.data.targetUserId);
    }
  }, 100);

  formio.on('submitDone', async (res) => {
    try {
      const savedSubmission = res?.submission || res;
      
      const roleLogId = savedSubmission?._id;
      const targetUserId = targetUserSubmission?._id;
      const actorUserId = actorUser?._id;

      // Update user submission with latestRoleLogId (client-side fallback for webhook)
      if (roleLogId && targetUserId) {
        try {
          // Get current user submission to preserve existing data
          const currentUserData = await formioRequest(`/user/submission/${targetUserId}`, { method: 'GET' });
          
          await formioRequest(`/user/submission/${targetUserId}`, {
            method: 'PUT',
            data: {
              ...currentUserData, // Preserve all existing data
              data: {
                ...currentUserData.data, // Preserve existing form data
                latestRoleLogId: roleLogId // Only update this field
              }
            }
          });
        } catch (e) {
          console.warn('Failed to update latestRoleLogId on user submission:', e);
          // Continue anyway - webhook might still work
        }
      }

      if (typeof onSaved === 'function') {
        await onSaved(res);
      }
    } finally {
      bootstrap.Modal.getOrCreateInstance(modalEl).hide();
    }
  });
}
