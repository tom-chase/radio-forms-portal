// app/js/services/uploadsService.js

import { log } from '../utils/logger.js';
import { CONFIG } from '../config.js';
import { formioRequest } from './formioService.js';
import { getAppBridge } from './appBridge.js';

function getUploadMode() {
    const mode = String(CONFIG.UPLOAD?.MODE || "local").toLowerCase();
    return mode === "s3" ? "s3" : "local";
}

function shouldUseS3Fallback() {
    return !!CONFIG.UPLOAD?.ENABLE_S3_FALLBACK;
}

function buildAttachmentMeta(file, uploadSpec, storage) {
    const uploadedAt = uploadSpec?.uploadedAt || new Date().toISOString();
    const objectUrl = uploadSpec?.fileUrl || uploadSpec?.url || "";
    const storageKey = uploadSpec?.storageKey || uploadSpec?.key || null;

    return {
        fileName: uploadSpec?.fileName || file.name,
        fileUrl: objectUrl,
        description: "",
        name: file.name,
        size: file.size,
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
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("formPath", String(formMeta?.path || "unknown"));

    const submissionId = formio?.submission?._id;
    if (submissionId) {
        formData.append("submissionId", String(submissionId));
    }

    const spec = await formioRequest(CONFIG.UPLOAD.LOCAL_UPLOAD_URL, {
        method: "POST",
        data: formData,
    });

    return buildAttachmentMeta(file, spec, "local");
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
            fileName: file?.name,
            error: err?.message || String(err),
        });

        return uploadFileToS3WithMetadata(file, formMeta);
    }
}

export async function handleS3Upload(formio, formMeta) {
    const { actions } = getAppBridge();

    // Create a hidden <input type="file" multiple> just for this upload
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.multiple = true; // set to false if you want only one file
    fileInput.style.display = "none";

    document.body.appendChild(fileInput);

    fileInput.addEventListener("change", async (event) => {
        const files = Array.from(event.target.files || []);

        if (!files.length) {
            document.body.removeChild(fileInput);
            return;
        }

        actions.showToast?.(
            `Uploading ${files.length} file(s)...`,
            "primary"
        );

        let uploadedCount = 0;

        for (const file of files) {
            try {
                const fileMeta = await uploadWithConfiguredProvider(
                    formio,
                    file,
                    formMeta
                );

                actions.addAttachmentToFormData?.(formio, fileMeta);
                uploadedCount += 1;
            } catch (err) {
                console.error(
                    "File upload error:",
                    err
                );
                actions.showToast?.(
                    `Error uploading ${file.name}: ${
                        err.message || "Unknown error"
                    }`,
                    "danger"
                );
            }
        }

        if (uploadedCount > 0) {
            actions.showToast?.(
                "Upload(s) complete. Remember to submit the form.",
                "success"
            );
        } else {
            actions.showToast?.(
                "No files were uploaded.",
                "warning"
            );
        }
        document.body.removeChild(fileInput);
    });

    // Trigger the file picker
    fileInput.click();
}
