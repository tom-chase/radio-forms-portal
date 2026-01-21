// app/js/services/formFactory.js

import { buildUrl } from './formioService.js';
import { getCurrentUser } from './formioService.js';
import { log } from '../utils/logger.js';

/**
 * Centralized Form.io form creation and management
 * Replaces scattered Formio.createForm calls
 */
export class FormFactory {
    static async createForm(container, formPath, options = {}) {
        const Formio = window.Formio;
        
        const defaultOptions = {
            user: await getCurrentUser(),
            // Add any global form defaults here
        };
        
        const mergedOptions = { ...defaultOptions, ...options };
        
        try {
            const form = await Formio.createForm(
                container, 
                buildUrl(formPath), 
                mergedOptions
            );
            
            // Apply standard event handlers
            this.attachStandardHandlers(form, options.context || 'Form');
            
            return form;
        } catch (error) {
            log.error(`Form creation failed for ${formPath}:`, error);
            throw error;
        }
    }
    
    static async createBuilder(container, formDefinition, options = {}) {
        const Formio = window.Formio;
        
        try {
            const builder = await Formio.builder(container, formDefinition, options);
            this.attachStandardHandlers(builder, 'Builder');
            return builder;
        } catch (error) {
            log.error('Builder creation failed:', error);
            throw error;
        }
    }
    
    static attachStandardHandlers(formInstance, context) {
        // Standard error handling
        formInstance.on('error', (err) => {
            console.error(`${context} error:`, err);
        });
        
        // Standard submission handling
        formInstance.on('submit', (submission) => {
            log.debug(`${context} submitted:`, submission);
        });
        
        // Add other standard handlers as needed
    }
    
    static async setSubmission(formInstance, submission) {
        try {
            await formInstance.setSubmission(submission);
        } catch (error) {
            log.error('Failed to set submission:', error);
            throw error;
        }
    }
    
    static destroyForm(formInstance) {
        if (formInstance && typeof formInstance.destroy === 'function') {
            try {
                formInstance.destroy(true);
            } catch (error) {
                log.warn('Error destroying form instance:', error);
            }
        }
    }
}
