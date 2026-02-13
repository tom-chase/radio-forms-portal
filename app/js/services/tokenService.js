// app/js/services/tokenService.js

import { getToken as getFormioToken, setToken as setFormioToken, clearToken as clearFormioToken } from './formioService.js';
import { log } from '../utils/logger.js';

/**
 * Enhanced token management with additional security and convenience.
 * Wraps formioService.js token primitives with expiration checks.
 */
export class TokenService {
    static ADMIN_FLAG_KEY = 'rfp_admin_login';
    
    /**
     * Return the current token if it exists and is not expired.
     * Clears storage automatically when an expired/invalid token is found.
     */
    static getToken() {
        const token = getFormioToken();
        if (!token) return null;

        if (this.isTokenExpired(token)) {
            log.warn('Stored token is expired; clearing it');
            this.clearToken();
            return null;
        }

        return token;
    }
    
    /**
     * Set token (delegates to formioService).
     */
    static setToken(token) {
        setFormioToken(token);
    }
    
    /**
     * Clear token and related client-side flags.
     */
    static clearToken() {
        clearFormioToken();
        try {
            localStorage.removeItem(this.ADMIN_FLAG_KEY);
        } catch (error) {
            log.warn('Failed to clear token metadata:', error);
        }
    }
    
    /**
     * Check if a JWT is expired.
     * Tolerates tokens up to 30 s past their `exp` claim so that
     * minor clock skew doesn't cause false positives on the client
     * while the server still accepts the token.
     */
    static isTokenExpired(token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const now = Date.now() / 1000;
            return payload.exp < (now - 30);
        } catch {
            return true;
        }
    }
    
    /**
     * Set admin flag.
     */
    static setAdminFlag(isAdmin) {
        try {
            localStorage.setItem(this.ADMIN_FLAG_KEY, String(isAdmin));
        } catch (error) {
            log.warn('Failed to set admin flag:', error);
        }
    }
    
    /**
     * Get admin flag.
     */
    static isAdminUser() {
        try {
            return localStorage.getItem(this.ADMIN_FLAG_KEY) === 'true';
        } catch {
            return false;
        }
    }
}
