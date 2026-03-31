// app/js/services/uploadsService.js

import { log } from '../utils/logger.js';
import { CONFIG } from '../config.js';
import { formioRequest } from './formioService.js';
import { getAppBridge } from './appBridge.js';

function getUploadMode() {
    const mode = String((CONFIG.UPLOAD && CONFIG.UPLOAD.MODE) || "local").toLowerCase();
    return mode === "s3" ? "s3" : "local";
}

function shouldUseS3Fallback() {
    return !!(CONFIG.UPLOAD && CONFIG.UPLOAD.ENABLE_S3_FALLBACK);
}

function stripTrailingSlash(value) {
    return String(value || "").replace(/\/+$/, "");
}

function getLocalUploadUrlCandidates() {
    const primaryUrl = String((CONFIG.UPLOAD && CONFIG.UPLOAD.LOCAL_UPLOAD_URL) || "").trim();
    const apiBase = stripTrailingSlash(CONFIG.API_BASE);
    const apiUploadUrl = apiBase
        ? `${apiBase}/api/v1/uploads/local`
        : "";

    const candidates = [];
    if (primaryUrl) candidates.push(primaryUrl);
    if (apiUploadUrl && !candidates.includes(apiUploadUrl)) {
        candidates.push(apiUploadUrl);
    }

    return candidates;
}

function isRetryableLocalUploadError(err) {
    const status = Number((err && err.status) || (err && err.original && err.original.status) || 0);
    return [0, 404, 405, 502, 503, 504].includes(status);
}

function formatFileSize(bytes) {
    if (bytes == null || isNaN(bytes) || bytes < 0) return "";
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, i);
    return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

function buildAttachmentMeta(file, uploadSpec, storage) {
    const uploadedAt = (uploadSpec && uploadSpec.uploadedAt) || new Date().toISOString();
    const objectUrl = (uploadSpec && uploadSpec.fileUrl) || (uploadSpec && uploadSpec.url) || "";
    const storageKey = (uploadSpec && uploadSpec.storageKey) || (uploadSpec && uploadSpec.key) || null;

    return {
        fileName: (uploadSpec && uploadSpec.fileName) || file.name,
        fileUrl: objectUrl,
        description: "",
        name: file.name,
        sizeBytes: file.size,
        size: formatFileSize(file.size),
        type: file.type || "application/octet-stream",
        storage,
        storageKey,
        s3Key: storage === "s3" ? storageKey : null,
        url: objectUrl,
        uploadedAt,
    };
}

async function requestS3UploadSpec(file, formMeta) {
    return formioRequest(CONFIG.UPLOAD.PRESIGN_URL, {
        method: "POST",
        data: {
            fileName: file.name,
            fileType: file.type || "application/octet-stream",
            fileSize: file.size,
            formPath: formMeta.path,
        },
    });
}

async function uploadFileToS3(file, uploadUrl) {
    const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
            "Content-Type":
                file.type || "application/octet-stream",
        },
        body: file,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(
            `S3 upload failed (${res.status}): ${
                text || "Unknown error"
            }`
        );
    }
}

async function uploadFileToLocal(formio, file, formMeta) {
    const submissionId = formio && formio.submission && formio.submission._id;
    const uploadUrls = getLocalUploadUrlCandidates();

    const buildFormData = () => {
        const formData = new FormData();
        formData.append("file", file, file.name);
        formData.append("formPath", String((formMeta && formMeta.path) || "unknown"));
        if (submissionId) {
            formData.append("submissionId", String(submissionId));
        }
        return formData;
    };

    let lastError = null;

    for (let index = 0; index < uploadUrls.length; index += 1) {
        const uploadUrl = uploadUrls[index];
        try {
            const spec = await formioRequest(uploadUrl, {
                method: "POST",
                data: buildFormData(),
            });

            if (index > 0) {
                log.warn("Primary upload URL failed; fallback URL succeeded", {
                    primaryUploadUrl: uploadUrls[0],
                    fallbackUploadUrl: uploadUrl,
                });
            }

            return buildAttachmentMeta(file, spec, "local");
        } catch (err) {
            lastError = err;
            const hasAnotherCandidate = index < uploadUrls.length - 1;
            if (!hasAnotherCandidate || !isRetryableLocalUploadError(err)) {
                throw err;
            }

            log.warn("Local upload URL failed; retrying alternate URL", {
                failedUploadUrl: uploadUrl,
                nextUploadUrl: uploadUrls[index + 1],
                status: Number((err && err.status) || (err && err.original && err.original.status) || 0),
                error: (err && err.message) || String(err),
            });
        }
    }

    throw lastError || new Error("Local upload failed");
}

async function uploadFileToS3WithMetadata(file, formMeta) {
    const spec = await requestS3UploadSpec(file, formMeta);
    await uploadFileToS3(file, spec.uploadUrl);
    return buildAttachmentMeta(file, spec, "s3");
}

async function uploadWithConfiguredProvider(formio, file, formMeta) {
    const mode = getUploadMode();

    if (mode === "s3") {
        return uploadFileToS3WithMetadata(file, formMeta);
    }

    try {
        return await uploadFileToLocal(formio, file, formMeta);
    } catch (err) {
        if (!shouldUseS3Fallback()) {
            throw err;
        }

        log.warn("Local upload failed, attempting S3 fallback", {
            fileName: file && file.name,
            error: (err && err.message) || String(err),
        });

        return uploadFileToS3WithMetadata(file, formMeta);
    }
}

function isAttachmentsAddButtonClick(formio, target) {
    const rootElement = formio && formio.element;
    const attachmentsComponent = formio && formio.getComponent && formio.getComponent("attachments");
    const attachmentsRoot = (attachmentsComponent && attachmentsComponent.element)
        || (rootElement && rootElement.querySelector && rootElement.querySelector(".formio-component-attachments"));

    if (!attachmentsRoot || !target || typeof target.closest !== "function") {
        return false;
    }

    const clickable = target.closest("button, a, [role='button']");
    if (!clickable || !attachmentsRoot.contains(clickable)) {
        return false;
    }

    if (clickable.closest(".datagrid-row")) {
        return false;
    }

    const refAttr = String(clickable.getAttribute("ref") || "").toLowerCase();
    const nameAttr = String(clickable.getAttribute("name") || "").toLowerCase();
    const dataKeyAttr = String(clickable.getAttribute("data-key") || "").toLowerCase();
    const text = String(clickable.textContent || "").trim().toLowerCase();

    if (clickable.classList.contains("formio-button-add-row")) {
        return true;
    }

    if (["addbutton", "addanother"].includes(refAttr)) {
        return true;
    }

    if (["addrow", "addanother"].includes(nameAttr)) {
        return true;
    }

    if (["addbutton", "addanother"].includes(dataKeyAttr)) {
        return true;
    }

    if (!text || text.includes("remove") || text.includes("cancel") || text.includes("save")) {
        return false;
    }

    return text.includes("add attachment") || text === "add another" || text === "add";
}

export function bindAttachmentsDatagridUpload(formio, formMeta) {
    const rootElement = formio && formio.element;
    const hasAttachmentsDatagrid = !!(formio && formio.getComponent && formio.getComponent("attachments"));
    const isReadOnly = !!(formio && formio.options && formio.options.readOnly);

    if (!rootElement || typeof rootElement.addEventListener !== "function") {
        return;
    }

    if (!hasAttachmentsDatagrid || isReadOnly || formio.__attachmentsUploadHookBound) {
        return;
    }

    const onClick = (event) => {
        if (!isAttachmentsAddButtonClick(formio, event && event.target)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
        }

        handleFileUpload(formio, formMeta);
    };

    rootElement.addEventListener("click", onClick, true);
    formio.__attachmentsUploadHookBound = true;
}

export async function deleteAttachment(storageKey) {
    if (!storageKey) {
        throw new Error("No storageKey provided for deletion.");
    }
    const encodedKey = encodeURIComponent(storageKey);
    const objectBase = String((CONFIG.UPLOAD && CONFIG.UPLOAD.OBJECT_URL) || "").replace(/\/+$/, "");
    const deleteUrl = `${objectBase}/${encodedKey}`;
    return formioRequest(deleteUrl, { method: "DELETE" });
}

export async function handleFileUpload(formio, formMeta) {
    const { actions } = getAppBridge();

    // Create a hidden <input type="file" multiple> just for this upload
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.multiple = true;
    fileInput.style.display = "none";

    document.body.appendChild(fileInput);

    function removeFileInput() {
        if (fileInput.parentNode) {
            fileInput.parentNode.removeChild(fileInput);
        }
    }

    // Detect cancel: browsers may not fire 'change' when user cancels the picker.
    // After the picker closes, window regains focus — check if no files were selected.
    let changeHandled = false;
    const onWindowFocus = () => {
        window.removeEventListener("focus", onWindowFocus);
        // Defer check so a 'change' event that fires slightly after focus can run first.
        setTimeout(() => {
            if (!changeHandled) {
                removeFileInput();
            }
        }, 300);
    };
    window.addEventListener("focus", onWindowFocus);

    fileInput.addEventListener("change", async (event) => {
        changeHandled = true;
        window.removeEventListener("focus", onWindowFocus);
        const files = Array.from(event.target.files || []);

        if (!files.length) {
            removeFileInput();
            return;
        }

        // Validate file sizes before uploading
        const maxSizeMB = Number((CONFIG.UPLOAD && CONFIG.UPLOAD.MAX_FILE_SIZE_MB)) || 50;
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        const validFiles = [];
        for (const file of files) {
            if (file.size > maxSizeBytes) {
                const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
                actions.showToast && actions.showToast(
                    `${file.name} (${sizeMB} MB) exceeds the ${maxSizeMB} MB limit.`,
                    "danger"
                );
            } else {
                validFiles.push(file);
            }
        }

        if (!validFiles.length) {
            removeFileInput();
            return;
        }

        actions.showToast?.(
            `Uploading ${validFiles.length} attachment(s)...`,
            "primary"
        );

        let uploadedCount = 0;
        const totalFiles = validFiles.length;

        for (let i = 0; i < totalFiles; i += 1) {
            const file = validFiles[i];
            if (totalFiles > 1) {
                actions.showToast && actions.showToast(
                    `Uploading ${i + 1} of ${totalFiles}: ${file.name}`,
                    "primary"
                );
            }
            try {
                const fileMeta = await uploadWithConfiguredProvider(
                    formio,
                    file,
                    formMeta
                );

                actions.addAttachmentToFormData && actions.addAttachmentToFormData(formio, fileMeta);
                uploadedCount += 1;
            } catch (err) {
                console.error(
                    "File upload error:",
                    err
                );
                actions.showToast && actions.showToast(
                    `Error uploading attachment ${file.name}: ${
                        err.message || "Unknown error"
                    }`,
                    "danger"
                );
            }
        }

        if (uploadedCount > 0) {
            actions.showToast && actions.showToast(
                "Attachment upload complete. Remember to submit the form.",
                "success"
            );
        } else {
            actions.showToast && actions.showToast(
                "No attachments were uploaded.",
                "warning"
            );
        }
        removeFileInput();
    });

    // Trigger the file picker
    fileInput.click();
}

// Backward-compatible alias (event name in form schemas is still 's3Upload')
export { handleFileUpload as handleS3Upload };
