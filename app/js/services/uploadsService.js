// app/js/services/uploadsService.js

import { log } from '../utils/logger.js';
import { CONFIG } from '../config.js';
import { getToken } from './formioService.js';
import { getAppBridge } from './appBridge.js';

async function requestUploadUrlFromLambda(file, formMeta) {
    const token = getToken();

    const res = await fetch(CONFIG.UPLOAD.PRESIGN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token
                ? { 
                    Authorization: `Bearer ${token}`,
                    'x-jwt-token': token 
                }
                : {}),
        },
        body: JSON.stringify({
            fileName: file.name,
            fileType:
                file.type || "application/octet-stream",
            fileSize: file.size,
            formPath: formMeta.path,
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(
            `Upload URL request failed (${res.status}): ${
                text || "Unknown error"
            }`
        );
    }

    return res.json();
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

        for (const file of files) {
            try {
                const spec =
                    await requestUploadUrlFromLambda(
                        file,
                        formMeta
                    );
                await uploadFileToS3(file, spec.uploadUrl);

                const fileMeta = {
                    name: file.name,
                    size: file.size,
                    type:
                        file.type ||
                        "application/octet-stream",
                    s3Key: spec.key,
                    url: spec.fileUrl,
                    uploadedAt: new Date().toISOString(),
                };

                actions.addAttachmentToFormData?.(formio, fileMeta);
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

        actions.showToast?.(
            "Upload(s) complete. Remember to submit the form.",
            "success"
        );
        document.body.removeChild(fileInput);
    });

    // Trigger the file picker
    fileInput.click();
}
