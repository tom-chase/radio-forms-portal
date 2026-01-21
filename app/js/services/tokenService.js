// app/js/services/tokenService.js

import { getToken as getFormioToken, setToken as setFormioToken, clearToken as clearFormioToken } from './formioService.js';
import { log } from '../utils/logger.js';

/**
 * Enhanced token management with additional security and convenience
 * Extends formioService.js token functionality
 */
export class TokenService {
    static TOKEN_KEY = 'formioToken';
    static ADMIN_FLAG_KEY = 'rfp_admin_login';
    
    /**
     * Get token with validation
     */
    static getToken() {
        const token = getFormioToken();
        
        if (!token) {
            return null;
        }
        
        // Basic token validation
        if (this.isTokenExpired(token)) {
            this.clearToken();
            return null;
        }
        
        return token;
    }
    
    /**
     * Set token with additional metadata
     */
    static setToken(token, metadata = {}) {
        setFormioToken(token);
        
        // Store additional metadata if needed
        if (metadata.rememberMe) {
            try {
                localStorage.setItem('formioTokenMetadata', JSON.stringify({
                    timestamp: Date.now(),
                    ...metadata
                }));
            } catch (error) {
                log.warn('Failed to store token metadata:', error);
            }
        }
    }
    
    /**
     * Clear token and related data
     */
    static clearToken() {
        clearFormioToken();
        
        // Clear metadata
        try {
            localStorage.removeItem('formioTokenMetadata');
            localStorage.removeItem(this.ADMIN_FLAG_KEY);
        } catch (error) {
            log.warn('Failed to clear token metadata:', error);
        }
    }
    
    /**
     * Check if token is expired (basic JWT check)
     */
    static isTokenExpired(token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const now = Date.now() / 1000;
            return payload.exp < now;
        } catch (error) {
            // If we can't parse token, assume it's invalid
            return true;
        }
    }
    
    /**
     * Get token expiration time
     */
    static getTokenExpiration(token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.exp ? new Date(payload.exp * 1000) : null;
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Check if user is authenticated
     */
    static isAuthenticated() {
        return !!this.getToken();
    }
    
    /**
     * Set admin flag
     */
    static setAdminFlag(isAdmin) {
        try {
            localStorage.setItem(this.ADMIN_FLAG_KEY, String(isAdmin));
        } catch (error) {
            log.warn('Failed to set admin flag:', error);
        }
    }
    
    /**
     * Get admin flag
     */
    static isAdminUser() {
        try {
            return localStorage.getItem(this.ADMIN_FLAG_KEY) === 'true';
        } catch (error) {
            return false;
        }
    }
}
