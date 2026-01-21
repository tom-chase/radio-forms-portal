/**
 * Application Bridge - Central state and action management
 */

let appState = {
    forms: [],
    currentForm: null,
    currentSubmissions: [],
    currentUser: null,
    adminMode: false,
    tabulatorInstance: null
};

let appActions = {
    setForms: (forms) => { appState.forms = forms; },
    setCurrentForm: (form) => { appState.currentForm = form; },
    setCurrentSubmissions: (submissions) => { appState.currentSubmissions = submissions; },
    setCurrentUser: (user) => { appState.currentUser = user; },
    setAdminMode: (enabled) => { appState.adminMode = enabled; },
    setTabulatorInstance: (instance) => { appState.tabulatorInstance = instance; },
    
    getForms: () => appState.forms,
    getCurrentForm: () => appState.currentForm,
    getCurrentSubmissions: () => appState.currentSubmissions,
    getCurrentUser: () => appState.currentUser,
    getAdminMode: () => appState.adminMode,
    getTabulatorInstance: () => appState.tabulatorInstance
};

/**
 * Get application bridge
 */
export function getAppBridge() {
    return {
        config: {
            API_BASE: window.API_BASE || '/formio'
        },
        state: {
            get forms() { return appState.forms; },
            get currentForm() { return appState.currentForm; },
            get currentSubmissions() { return appState.currentSubmissions; },
            get currentUser() { return appState.currentUser; },
            get adminMode() { return appState.adminMode; },
            get tabulatorInstance() { return appState.tabulatorInstance; }
        },
        actions: {
            setForms: (forms) => { appState.forms = forms; },
            setCurrentForm: (form) => { appState.currentForm = form; },
            setCurrentSubmissions: (submissions) => { appState.currentSubmissions = submissions; },
            setCurrentUser: (user) => { appState.currentUser = user; },
            setAdminMode: (enabled) => { appState.adminMode = enabled; },
            setTabulatorInstance: (instance) => { appState.tabulatorInstance = instance; },
            
            getForms: () => appState.forms,
            getCurrentForm: () => appState.currentForm,
            getCurrentSubmissions: () => appState.currentSubmissions,
            getCurrentUser: () => appState.currentUser,
            getAdminMode: () => appState.adminMode,
            getTabulatorInstance: () => appState.tabulatorInstance
        }
    };
}
