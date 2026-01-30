// app/js/features/admin/roles.js

import { formioRequest } from '../../services/formioService.js';
import { fetchProjectRoles, clearRolesCache } from '../../services/rbacService.js';
import { escapeHTML, showToast } from '../../services/uiService.js';

function $(id) { return document.getElementById(id); }
function slugify(str) {
    return String(str ?? "").toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function loadRoles(force = false) {
    const rolesList = $("rolesList");
    if (!rolesList) return;
    rolesList.innerHTML = '<div class="text-center py-2"><div class="spinner-border spinner-border-sm text-secondary" role="status"></div></div>';

    try {
      const roles = await fetchProjectRoles(!!force);
      if (!Array.isArray(roles) || !roles.length) {
        rolesList.innerHTML = '<div class="alert alert-warning small mb-0">No roles found or access denied.</div>';
        return;
      }
      renderRolesTable(roles, rolesList);
    } catch (e) {
      console.error("loadRoles error", e);
      rolesList.innerHTML = '<div class="alert alert-danger small mb-0">Error loading roles.</div>';
    }
}

function renderRolesTable(roles, rolesListEl) {
    const coreNames = new Set(["admin", "administrator", "authenticated", "anonymous"]);
    let html = `<div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0">
      <thead class="table-light"><tr>
        <th>Title</th><th>Machine name</th><th>Description</th>
        <th class="text-center">Admin</th><th class="text-center">Default</th>
        <th class="text-end">Actions</th>
      </tr></thead><tbody>`;

    for (const r of roles) {
      const id = escapeHTML(r?._id || "");
      const title = escapeHTML(r?.title || "");
      const machine = escapeHTML(r?.machineName || r?.name || "");
      const desc = escapeHTML(r?.description || "");
      const isCore = coreNames.has(String(r?.machineName || r?.name || "").toLowerCase());
      html += `<tr data-role-id="${id}">
        <td style="min-width:160px;"><input class="form-control form-control-sm role-title" value="${title}"></td>
        <td style="min-width:160px;"><input class="form-control form-control-sm role-machine" value="${machine}"></td>
        <td style="min-width:220px;"><input class="form-control form-control-sm role-desc" value="${desc}"></td>
        <td class="text-center"><input type="checkbox" class="form-check-input role-admin" ${r?.admin ? "checked" : ""}></td>
        <td class="text-center"><input type="checkbox" class="form-check-input role-default" ${r?.default ? "checked" : ""}></td>
        <td class="text-end"><div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" data-action="save" data-id="${id}" title="Save"><i class="bi bi-save"></i></button>
          <button class="btn btn-outline-danger" data-action="delete" data-id="${id}" ${isCore ? "disabled" : ""} title="${isCore ? "Cannot delete core role" : "Delete"}"><i class="bi bi-trash"></i></button>
        </div></td></tr>`;
    }
    html += `</tbody></table></div>`;
    rolesListEl.innerHTML = html;

    rolesListEl.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        const role = roles.find(r => r?._id === id);
        if (!role) return;
        const row = btn.closest("tr");
        if (!row) return;

        if (action === "save") {
          const title = (row.querySelector(".role-title")?.value || "").trim();
          const machineName = (row.querySelector(".role-machine")?.value || "").trim() || slugify(title);
          const description = (row.querySelector(".role-desc")?.value || "").trim();
          const admin = !!row.querySelector(".role-admin")?.checked;
          const deflt = !!row.querySelector(".role-default")?.checked;

          try {
            await formioRequest(`/role/${id}`, { method: "PUT", data: { ...role, title, machineName, description, admin, default: deflt } });
            showToast("Role updated.", "success");
            clearRolesCache();
            await loadRoles(true);
          } catch (e) {
            console.error("Role save failed", e);
            showToast("Error updating role.", "danger");
          }
        }

        if (action === "delete") {
          if (!window.confirm(`Delete role "${role.title || id}"? This may break access.`)) return;
          try {
            await formioRequest(`/role/${id}`, { method: "DELETE" });
            showToast("Role deleted.", "success");
            clearRolesCache();
            await loadRoles(true);
          } catch (e) {
            console.error("Role delete failed", e);
            showToast("Error deleting role.", "danger");
          }
        }
      });
    });
}