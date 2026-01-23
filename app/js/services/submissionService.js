// app/js/services/submissionService.js - Proposed new service

import { FormFactory } from './formFactory.js';
import { formioRequest, buildUrl } from './formioService.js';
import { getSubmissionPermissions } from './rbacService.js';
import { getCurrentUserWithRoles } from './sessionService.js';
import { log } from '../utils/logger.js';

/**
 * SDK-based submission management service
 * Replaces manual submission handling in submissions.js
 */
export class SubmissionService {
    static async loadSubmissions(formMeta, permissions, user) {
        const currentUser = user || await getCurrentUserWithRoles();
        const perms = permissions || getSubmissionPermissions(currentUser, formMeta);
        
        // Use SDK Formio instance for better integration
        const Formio = window.Formio;
        const formUrl = buildUrl(`/${formMeta.path}`);
        const formio = new Formio(formUrl);
        
        try {
            // Build query parameters based on permissions
            const query = this.buildSubmissionQuery(perms, currentUser);
            
            // Use SDK's built-in submission loading
            const submissions = await formio.loadSubmissions({ query });
            
            return submissions;
        } catch (error) {
            log.error('Failed to load submissions:', error);
            throw error;
        }
    }
    
    static buildSubmissionQuery(permissions, currentUser) {
        const query = { limit: 25, sort: '-created' };
        
        if (!permissions.canReadAll && permissions.canReadOwn) {
            query.owner = currentUser?._id || 'me';
        }
        
        return query;
    }
    
    static async createSubmission(formPath, submissionData) {
        const Formio = window.Formio;
        const formUrl = buildUrl(formPath);
        const formio = new Formio(formUrl);
        
        try {
            return await formio.saveSubmission(submissionData);
        } catch (error) {
            log.error('Failed to create submission:', error);
            throw error;
        }
    }
    
    static async updateSubmission(formPath, submissionId, submissionData) {
        const Formio = window.Formio;
        const formUrl = buildUrl(formPath);
        const formio = new Formio(formUrl);
        
        try {
            return await formio.saveSubmission({ ...submissionData, _id: submissionId });
        } catch (error) {
            log.error('Failed to update submission:', error);
            throw error;
        }
    }
    
    static async deleteSubmission(formPath, submissionId) {
        const Formio = window.Formio;
        const formUrl = buildUrl(formPath);
        const formio = new Formio(formUrl);
        
        try {
            return await formio.deleteSubmission(submissionId);
        } catch (error) {
            log.error('Failed to delete submission:', error);
            throw error;
        }
    }
    
    static async getSubmission(formPath, submissionId) {
        const Formio = window.Formio;
        const formUrl = buildUrl(formPath);
        const formio = new Formio(formUrl);
        
        try {
            return await formio.loadSubmission(submissionId);
        } catch (error) {
            log.error('Failed to load submission:', error);
            throw error;
        }
    }
}
