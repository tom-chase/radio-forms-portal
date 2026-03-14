// app/js/services/loginLogService.js

import { formioRequest } from './formioService.js';
import { log } from '../utils/logger.js';

const SESSION_FLAG_KEY = 'rfp_login_recorded';
const IP_FETCH_TIMEOUT_MS = 3000;

/**
 * Fetch the client's public IP address via ipify.
 * Returns 'unknown' on any error or timeout.
 */
async function fetchIpAddress() {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), IP_FETCH_TIMEOUT_MS);
        const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) return 'unknown';
        const json = await res.json();
        return json?.ip || 'unknown';
    } catch {
        return 'unknown';
    }
}

/**
 * Record a login event to the loginLog resource.
 * Deduplicates within the same tab session using sessionStorage so that
 * token refreshes / initSession re-runs don't generate duplicate entries.
 *
 * This is fire-and-forget — callers should .catch(() => {}) the returned promise.
 *
 * @param {object} user - The authenticated user object from Form.io
 */
export async function recordLoginEvent(user) {
    try {
        if (sessionStorage.getItem(SESSION_FLAG_KEY) === 'true') {
            return;
        }

        const loginAt = new Date().toISOString();
        const userEmail = user?.data?.email || user?.email || '';
        const userId = user?._id || '';
        const userAgent = navigator.userAgent || '';
        const ipAddress = await fetchIpAddress();

        await formioRequest('/loginlog/submission', {
            method: 'POST',
            data: {
                data: {
                    loginAt,
                    userEmail,
                    userId,
                    ipAddress,
                    userAgent
                }
            }
        });

        try {
            sessionStorage.setItem(SESSION_FLAG_KEY, 'true');
        } catch {
        }

        log.debug('[loginLogService] Login event recorded', { userEmail, ipAddress });
    } catch (e) {
        log.warn('[loginLogService] Failed to record login event', e);
    }
}
