// app/js/services/authService.js - Proposed new service

import { formioRequest, buildUrl, getToken, setToken, clearToken } from './formioService.js';
import { getCurrentUser } from './formioService.js';
import { log } from '../utils/logger.js';

/**
 * Form.io SDK-based authentication service
 * Replaces manual login handling in formManagement.js
 */
export class AuthService {
    static async login(credentials, loginPath = '/user/login') {
        const Formio = window.Formio;
        
        try {
            // Use SDK's built-in login form creation and submission
            const loginForm = await Formio.createForm(document.createElement('div'), buildUrl(loginPath));
            
            // Set credentials programmatically
            loginForm.setData(credentials);
            
            // Let SDK handle submission and token management
            const result = await loginForm.submit();
            
            // SDK automatically sets token, but we ensure consistency
            if (result.token) {
                setToken(result.token);
            }
            
            return result;
        } catch (error) {
            log.error('Login failed:', error);
            throw error;
        }
    }
    
    static async logout() {
        const Formio = window.Formio;
        
        try {
            // Use SDK logout if available
            if (typeof Formio.logout === 'function') {
                await Formio.logout();
            }
        } catch (error) {
            log.warn('SDK logout failed, using manual cleanup:', error);
        } finally {
            // Always clear token
            clearToken();
        }
    }
    
    static async getCurrentUser() {
        return getCurrentUser();
    }
    
    static isAuthenticated() {
        return !!getToken();
    }
}
