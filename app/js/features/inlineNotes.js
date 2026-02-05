// app/js/features/inlineNotes.js

import { formioRequest, buildUrl } from '../services/formioService.js';
import { getAppBridge } from '../services/appBridge.js';
import { getCurrentUserWithRoles } from '../services/sessionService.js';
import { getSubmissionPermissions } from '../services/rbacService.js';

function $(id) { return document.getElementById(id); }

/**
 * Opens an inline notes view in the submissions table
 * @param {Object} parentSubmission - The parent submission
 * @param {Object} parentFormMeta - The parent form metadata
 * @param {Object} user - Current user object
 */
export async function openInlineNotesView(parentSubmission, parentFormMeta, user) {
    const { actions, state } = getAppBridge();
    const subsList = $("subsList");
    if (!subsList || !parentFormMeta) return;

    const parentId = parentSubmission._id;
    const parentType = parentFormMeta.path.replace(/^\/+/, '');
    
    const detailRow = subsList.querySelector(
        `tr.submission-inline-row[data-detail-for="${parentId}"]`
    );
    if (!detailRow) return;

    const container = detailRow.querySelector(".inline-form-container");
    if (!container) return;

    // If clicking the same row that's already open, toggle it closed
    if (state.inlineNotesSubmissionId === parentId && state.inlineNotesContainerEl === container) {
        detailRow.classList.add("d-none");
        destroyInlineNotes();
        return;
    }

    // Close any previously-open inline view
    if (state.inlineNotesContainerEl && state.inlineNotesContainerEl !== container) {
        const prevRow = state.inlineNotesContainerEl.closest("tr.submission-inline-row");
        if (prevRow) prevRow.classList.add("d-none");
        destroyInlineNotes();
    }

    // Also close any open inline form
    if (state.inlineFormContainerEl) {
        const prevFormRow = state.inlineFormContainerEl.closest("tr.submission-inline-row");
        if (prevFormRow) prevFormRow.classList.add("d-none");
        actions.destroyInlineForm?.();
    }

    detailRow.classList.remove("d-none");
    container.innerHTML = `
        <div class="notes-inline-view">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h6 class="mb-0">
                    <i class="bi bi-chat-left-text me-2"></i>Notes
                </h6>
                <button type="button" class="btn btn-sm btn-primary" id="addNoteInlineBtn">
                    <i class="bi bi-plus-lg me-1"></i>Add Note
                </button>
            </div>
            <div id="notesTableContainer"></div>
            <div id="noteFormInlineContainer" class="d-none mt-3"></div>
        </div>
    `;

    state.inlineNotesSubmissionId = parentId;
    state.inlineNotesContainerEl = container;
    state.inlineNotesParentType = parentType;

    // Wire up add note button
    const addNoteBtn = container.querySelector('#addNoteInlineBtn');
    if (addNoteBtn) {
        addNoteBtn.addEventListener('click', () => {
            showInlineNoteForm(parentSubmission, parentFormMeta, user);
        });
    }

    // Load and render notes table
    await loadNotesTable(parentType, parentId);
}

/**
 * Loads notes and renders them in a Tabulator table
 */
async function loadNotesTable(parentType, parentId) {
    const { actions } = getAppBridge();
    const notesTableContainer = document.getElementById('notesTableContainer');
    if (!notesTableContainer) return;

    notesTableContainer.innerHTML = `
        <div class="text-center py-3">
            <div class="spinner-border spinner-border-sm text-secondary" role="status">
                <span class="visually-hidden">Loading notes...</span>
            </div>
        </div>
    `;

    try {
        const notes = await formioRequest('/note/submission', {
            method: 'GET',
            query: {
                'data.parentRef.parentType': parentType,
                'data.parentRef.parentId': parentId,
                sort: '-created',
                limit: 1000
            }
        });

        if (!notes || notes.length === 0) {
            notesTableContainer.innerHTML = `
                <p class="text-muted small mb-0">No notes yet. Click "Add Note" to create one.</p>
            `;
            return;
        }

        // Transform notes data for Tabulator
        const tableData = notes.map(note => ({
            _id: note._id,
            author: note.data?.author || 'Unknown',
            noteType: note.data?.noteType || 'general',
            title: note.data?.title || '',
            note: note.data?.note || '',
            followUpDate: note.data?.followUpDate || null,
            created: note.created,
            modified: note.modified,
            rawData: note
        }));

        // Create Tabulator table
        const table = new Tabulator(notesTableContainer, {
            data: tableData,
            layout: "fitColumns",
            responsiveLayout: "collapse",
            height: "400px",
            placeholder: "No notes found",
            columns: [
                {
                    title: "Type",
                    field: "noteType",
                    width: 100,
                    responsive: 0,
                    formatter: (cell) => {
                        const value = cell.getValue();
                        const badges = {
                            'general': '<span class="badge bg-secondary">General</span>',
                            'follow-up': '<span class="badge bg-warning text-dark">Follow-up</span>',
                            'important': '<span class="badge bg-danger">Important</span>',
                            'meeting': '<span class="badge bg-info">Meeting</span>',
                            'phone': '<span class="badge bg-primary">Phone</span>',
                            'email': '<span class="badge bg-success">Email</span>'
                        };
                        return badges[value] || badges['general'];
                    }
                },
                {
                    title: "Title",
                    field: "title",
                    responsive: 0,
                    minWidth: 150,
                    formatter: "textarea"
                },
                {
                    title: "Note",
                    field: "note",
                    responsive: 1,
                    minWidth: 200,
                    formatter: (cell) => {
                        const value = cell.getValue();
                        return value ? value.substring(0, 100) + (value.length > 100 ? '...' : '') : '';
                    }
                },
                {
                    title: "Author",
                    field: "author",
                    width: 150,
                    responsive: 2
                },
                {
                    title: "Date",
                    field: "created",
                    width: 120,
                    responsive: 1,
                    formatter: (cell) => {
                        const date = new Date(cell.getValue());
                        return formatRelativeDate(date);
                    }
                },
                {
                    title: "Actions",
                    field: "_id",
                    width: 100,
                    responsive: 0,
                    hozAlign: "center",
                    formatter: (cell) => {
                        return `
                            <div class="btn-group btn-group-sm" role="group">
                                <button class="btn btn-outline-primary btn-view-note" title="View">
                                    <i class="bi bi-eye"></i>
                                </button>
                                <button class="btn btn-outline-danger btn-delete-note" title="Delete">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        `;
                    },
                    cellClick: async (e, cell) => {
                        const target = e.target.closest('button');
                        if (!target) return;

                        const rowData = cell.getRow().getData();
                        
                        if (target.classList.contains('btn-view-note')) {
                            viewNoteDetails(rowData);
                        } else if (target.classList.contains('btn-delete-note')) {
                            await deleteNote(rowData._id, parentType, parentId);
                        }
                    }
                }
            ]
        });

        // Store table instance for cleanup
        const { state } = getAppBridge();
        state.inlineNotesTableInstance = table;

    } catch (error) {
        console.error('Error loading notes:', error);
        notesTableContainer.innerHTML = `
            <div class="alert alert-danger small mb-0">
                Unable to load notes. Please try again.
            </div>
        `;
    }
}

/**
 * Shows inline note creation form
 */
async function showInlineNoteForm(parentSubmission, parentFormMeta, user) {
    const { actions, state } = getAppBridge();
    const noteFormContainer = document.getElementById('noteFormInlineContainer');
    const addNoteBtn = document.getElementById('addNoteInlineBtn');
    
    if (!noteFormContainer) return;

    const parentType = parentFormMeta.path.replace(/^\/+/, '');
    const parentId = parentSubmission._id;

    // Hide add button, show form
    if (addNoteBtn) addNoteBtn.classList.add('d-none');
    noteFormContainer.classList.remove('d-none');
    
    noteFormContainer.innerHTML = `
        <div class="card">
            <div class="card-header bg-light d-flex justify-content-between align-items-center">
                <h6 class="mb-0">New Note</h6>
                <button type="button" class="btn-close" id="cancelNoteInlineBtn" aria-label="Close"></button>
            </div>
            <div class="card-body">
                <div id="noteFormInlineRender"></div>
            </div>
        </div>
    `;

    const noteFormRender = document.getElementById('noteFormInlineRender');
    const cancelNoteBtn = document.getElementById('cancelNoteInlineBtn');

    // Wire up cancel button
    if (cancelNoteBtn) {
        cancelNoteBtn.addEventListener('click', () => {
            hideInlineNoteForm();
        });
    }

    try {
        // Check permissions for note form
        const currentUser = user || await getCurrentUserWithRoles();
        const noteFormMeta = await formioRequest('/note', { method: 'GET' });
        const notePerms = getSubmissionPermissions(currentUser, noteFormMeta, { isAdmin: state.adminMode });

        if (!notePerms.canCreateAll && !notePerms.canCreateOwn) {
            noteFormRender.innerHTML = `
                <div class="alert alert-warning small mb-0">
                    You do not have permission to create notes.
                </div>
            `;
            return;
        }

        // Create the note form with pre-populated parent reference
        const formio = await Formio.createForm(
            noteFormRender,
            buildUrl('/note'),
            {
                readOnly: false,
                user: currentUser
            }
        );

        // Pre-populate the parent reference fields
        const submissionData = {
            parentRef: {
                parentType: parentType,
                parentId: parentId,
            },
            author: currentUser.data?.email || currentUser.data?.name || 'Unknown'
        };
        
        // Set the appropriate conditional field based on parentType
        submissionData.parentRef[`parentId_${parentType}`] = parentId;
        
        formio.submission = { data: submissionData };

        // Hide the parent reference fields since they're auto-populated
        formio.on('render', () => {
            const parentRefContainer = formio.element.querySelector('[ref="parentRef"]');
            if (parentRefContainer) {
                parentRefContainer.style.display = 'none';
            }
        });

        // Handle successful submission
        formio.on('submitDone', async (submission) => {
            actions.showToast?.('Note added successfully', 'success');
            hideInlineNoteForm();
            await loadNotesTable(parentType, parentId);
        });

        // Handle errors
        formio.on('error', (errors) => {
            console.error('Note form error:', errors);
        });

        // Store form instance for cleanup
        state.inlineNoteFormInstance = formio;

    } catch (error) {
        console.error('Error creating note form:', error);
        noteFormRender.innerHTML = `
            <div class="alert alert-danger small mb-0">
                Unable to load note form. Please try again.
            </div>
        `;
    }
}

/**
 * Hides the inline note form
 */
function hideInlineNoteForm() {
    const { state } = getAppBridge();
    const noteFormContainer = document.getElementById('noteFormInlineContainer');
    const addNoteBtn = document.getElementById('addNoteInlineBtn');
    
    if (noteFormContainer) {
        noteFormContainer.classList.add('d-none');
        noteFormContainer.innerHTML = '';
    }
    
    if (addNoteBtn) {
        addNoteBtn.classList.remove('d-none');
    }

    // Destroy form instance
    if (state.inlineNoteFormInstance) {
        try {
            state.inlineNoteFormInstance.destroy();
        } catch (e) {
            console.warn('Error destroying note form:', e);
        }
        state.inlineNoteFormInstance = null;
    }
}

/**
 * Views note details in a modal
 */
function viewNoteDetails(noteData) {
    const { actions } = getAppBridge();
    
    const modalContent = `
        <div class="note-details">
            <div class="mb-3">
                <strong>Type:</strong> 
                <span class="badge ${getNoteTypeBadgeClass(noteData.noteType)}">${noteData.noteType}</span>
            </div>
            <div class="mb-3">
                <strong>Title:</strong> ${escapeHtml(noteData.title)}
            </div>
            <div class="mb-3">
                <strong>Note:</strong>
                <div class="mt-2 p-2 bg-light rounded">${escapeHtml(noteData.note)}</div>
            </div>
            <div class="mb-3">
                <strong>Author:</strong> ${escapeHtml(noteData.author)}
            </div>
            <div class="mb-3">
                <strong>Created:</strong> ${new Date(noteData.created).toLocaleString()}
            </div>
            ${noteData.followUpDate ? `
                <div class="mb-3">
                    <strong>Follow-up Date:</strong> 
                    <span class="text-warning">${new Date(noteData.followUpDate).toLocaleDateString()}</span>
                </div>
            ` : ''}
        </div>
    `;

    // Use existing modal or create a simple alert
    if (actions.showModal) {
        actions.showModal('Note Details', modalContent);
    } else {
        alert(`Title: ${noteData.title}\n\nNote: ${noteData.note}\n\nAuthor: ${noteData.author}`);
    }
}

/**
 * Deletes a note
 */
async function deleteNote(noteId, parentType, parentId) {
    const { actions } = getAppBridge();
    
    const confirmed = confirm('Delete this note? This cannot be undone.');
    if (!confirmed) return;

    try {
        await formioRequest(`/note/submission/${noteId}`, { method: 'DELETE' });
        actions.showToast?.('Note deleted successfully', 'success');
        await loadNotesTable(parentType, parentId);
    } catch (error) {
        console.error('Error deleting note:', error);
        actions.showToast?.('Error deleting note', 'danger');
    }
}

/**
 * Destroys inline notes view
 */
function destroyInlineNotes() {
    const { state } = getAppBridge();
    
    // Destroy Tabulator instance
    if (state.inlineNotesTableInstance) {
        try {
            state.inlineNotesTableInstance.destroy();
        } catch (e) {
            console.warn('Error destroying notes table:', e);
        }
        state.inlineNotesTableInstance = null;
    }

    // Destroy form instance if open
    hideInlineNoteForm();

    // Clear state
    state.inlineNotesSubmissionId = null;
    state.inlineNotesContainerEl = null;
    state.inlineNotesParentType = null;
}

/**
 * Helper functions
 */
function getNoteTypeBadgeClass(noteType) {
    const badges = {
        'general': 'bg-secondary',
        'follow-up': 'bg-warning text-dark',
        'important': 'bg-danger',
        'meeting': 'bg-info',
        'phone': 'bg-primary',
        'email': 'bg-success'
    };
    return badges[noteType] || 'bg-secondary';
}

function formatRelativeDate(date) {
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        if (hours === 0) {
            const minutes = Math.floor(diff / (1000 * 60));
            return minutes <= 1 ? 'Just now' : `${minutes}m ago`;
        }
        return hours === 1 ? '1h ago' : `${hours}h ago`;
    } else if (days === 1) {
        return 'Yesterday';
    } else if (days < 7) {
        return `${days}d ago`;
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Renders notes section in the form view (when viewing/editing a submission)
 * @param {Object} parentSubmission - The parent submission
 * @param {Object} parentFormMeta - The parent form metadata
 * @param {HTMLElement} container - Container element to render notes into
 */
export async function renderNotesInFormView(parentSubmission, parentFormMeta, container) {
    if (!parentSubmission || !parentFormMeta || !container) return;

    const { actions, state } = getAppBridge();
    const parentType = parentFormMeta.path.replace(/^\/+/, '');
    const parentId = parentSubmission._id;

    container.innerHTML = `
        <div class="notes-section mt-4 border-top pt-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h5 class="mb-0">
                    <i class="bi bi-chat-left-text me-2"></i>Notes
                </h5>
                <button type="button" class="btn btn-sm btn-primary" id="addNoteFormViewBtn">
                    <i class="bi bi-plus-lg me-1"></i>Add Note
                </button>
            </div>
            <div id="notesTableFormViewContainer"></div>
            <div id="noteFormFormViewContainer" class="d-none mt-3"></div>
        </div>
    `;

    // Wire up add note button
    const addNoteBtn = container.querySelector('#addNoteFormViewBtn');
    if (addNoteBtn) {
        addNoteBtn.addEventListener('click', () => {
            showFormViewNoteForm(parentSubmission, parentFormMeta);
        });
    }

    // Load and render notes table
    await loadNotesTableFormView(parentType, parentId);
}

/**
 * Loads notes table in form view
 */
async function loadNotesTableFormView(parentType, parentId) {
    const { actions } = getAppBridge();
    const notesTableContainer = document.getElementById('notesTableFormViewContainer');
    if (!notesTableContainer) return;

    notesTableContainer.innerHTML = `
        <div class="text-center py-3">
            <div class="spinner-border spinner-border-sm text-secondary" role="status">
                <span class="visually-hidden">Loading notes...</span>
            </div>
        </div>
    `;

    try {
        const notes = await formioRequest('/note/submission', {
            method: 'GET',
            query: {
                'data.parentRef.parentType': parentType,
                'data.parentRef.parentId': parentId,
                sort: '-created',
                limit: 1000
            }
        });

        if (!notes || notes.length === 0) {
            notesTableContainer.innerHTML = `
                <p class="text-muted small mb-0">No notes yet. Click "Add Note" to create one.</p>
            `;
            return;
        }

        // Transform notes data for Tabulator
        const tableData = notes.map(note => ({
            _id: note._id,
            author: note.data?.author || 'Unknown',
            noteType: note.data?.noteType || 'general',
            title: note.data?.title || '',
            note: note.data?.note || '',
            followUpDate: note.data?.followUpDate || null,
            created: note.created,
            modified: note.modified,
            rawData: note
        }));

        // Create Tabulator table
        const table = new Tabulator(notesTableContainer, {
            data: tableData,
            layout: "fitColumns",
            responsiveLayout: "collapse",
            height: "300px",
            placeholder: "No notes found",
            columns: [
                {
                    title: "Type",
                    field: "noteType",
                    width: 100,
                    responsive: 0,
                    formatter: (cell) => {
                        const value = cell.getValue();
                        const badges = {
                            'general': '<span class="badge bg-secondary">General</span>',
                            'follow-up': '<span class="badge bg-warning text-dark">Follow-up</span>',
                            'important': '<span class="badge bg-danger">Important</span>',
                            'meeting': '<span class="badge bg-info">Meeting</span>',
                            'phone': '<span class="badge bg-primary">Phone</span>',
                            'email': '<span class="badge bg-success">Email</span>'
                        };
                        return badges[value] || badges['general'];
                    }
                },
                {
                    title: "Title",
                    field: "title",
                    responsive: 0,
                    minWidth: 150,
                    formatter: "textarea"
                },
                {
                    title: "Note",
                    field: "note",
                    responsive: 1,
                    minWidth: 200,
                    formatter: (cell) => {
                        const value = cell.getValue();
                        return value ? value.substring(0, 100) + (value.length > 100 ? '...' : '') : '';
                    }
                },
                {
                    title: "Author",
                    field: "author",
                    width: 150,
                    responsive: 2
                },
                {
                    title: "Date",
                    field: "created",
                    width: 120,
                    responsive: 1,
                    formatter: (cell) => {
                        const date = new Date(cell.getValue());
                        return formatRelativeDate(date);
                    }
                },
                {
                    title: "Actions",
                    field: "_id",
                    width: 100,
                    responsive: 0,
                    hozAlign: "center",
                    formatter: (cell) => {
                        return `
                            <div class="btn-group btn-group-sm" role="group">
                                <button class="btn btn-outline-primary btn-view-note" title="View">
                                    <i class="bi bi-eye"></i>
                                </button>
                                <button class="btn btn-outline-danger btn-delete-note" title="Delete">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        `;
                    },
                    cellClick: async (e, cell) => {
                        const target = e.target.closest('button');
                        if (!target) return;

                        const rowData = cell.getRow().getData();
                        
                        if (target.classList.contains('btn-view-note')) {
                            viewNoteDetails(rowData);
                        } else if (target.classList.contains('btn-delete-note')) {
                            await deleteNoteFormView(rowData._id, parentType, parentId);
                        }
                    }
                }
            ]
        });

    } catch (error) {
        console.error('Error loading notes:', error);
        notesTableContainer.innerHTML = `
            <div class="alert alert-danger small mb-0">
                Unable to load notes. Please try again.
            </div>
        `;
    }
}

/**
 * Shows note form in form view
 */
async function showFormViewNoteForm(parentSubmission, parentFormMeta) {
    const { actions, state } = getAppBridge();
    const noteFormContainer = document.getElementById('noteFormFormViewContainer');
    const addNoteBtn = document.getElementById('addNoteFormViewBtn');
    
    if (!noteFormContainer) return;

    const parentType = parentFormMeta.path.replace(/^\/+/, '');
    const parentId = parentSubmission._id;

    // Hide add button, show form
    if (addNoteBtn) addNoteBtn.classList.add('d-none');
    noteFormContainer.classList.remove('d-none');
    
    noteFormContainer.innerHTML = `
        <div class="card">
            <div class="card-header bg-light d-flex justify-content-between align-items-center">
                <h6 class="mb-0">New Note</h6>
                <button type="button" class="btn-close" id="cancelNoteFormViewBtn" aria-label="Close"></button>
            </div>
            <div class="card-body">
                <div id="noteFormFormViewRender"></div>
            </div>
        </div>
    `;

    const noteFormRender = document.getElementById('noteFormFormViewRender');
    const cancelNoteBtn = document.getElementById('cancelNoteFormViewBtn');

    // Wire up cancel button
    if (cancelNoteBtn) {
        cancelNoteBtn.addEventListener('click', () => {
            hideFormViewNoteForm();
        });
    }

    try {
        const currentUser = await getCurrentUserWithRoles();
        const noteFormMeta = await formioRequest('/note', { method: 'GET' });
        const notePerms = getSubmissionPermissions(currentUser, noteFormMeta, { isAdmin: state.adminMode });

        if (!notePerms.canCreateAll && !notePerms.canCreateOwn) {
            noteFormRender.innerHTML = `
                <div class="alert alert-warning small mb-0">
                    You do not have permission to create notes.
                </div>
            `;
            return;
        }

        const formio = await Formio.createForm(
            noteFormRender,
            buildUrl('/note'),
            {
                readOnly: false,
                user: currentUser
            }
        );

        // Pre-populate the parent reference fields
        const submissionData = {
            parentRef: {
                parentType: parentType,
                parentId: parentId,
            },
            author: currentUser.data?.email || currentUser.data?.name || 'Unknown'
        };
        
        submissionData.parentRef[`parentId_${parentType}`] = parentId;
        formio.submission = { data: submissionData };

        // Hide the parent reference fields
        formio.on('render', () => {
            const parentRefContainer = formio.element.querySelector('[ref="parentRef"]');
            if (parentRefContainer) {
                parentRefContainer.style.display = 'none';
            }
        });

        // Handle successful submission
        formio.on('submitDone', async (submission) => {
            actions.showToast?.('Note added successfully', 'success');
            hideFormViewNoteForm();
            await loadNotesTableFormView(parentType, parentId);
        });

        formio.on('error', (errors) => {
            console.error('Note form error:', errors);
        });

    } catch (error) {
        console.error('Error creating note form:', error);
        noteFormRender.innerHTML = `
            <div class="alert alert-danger small mb-0">
                Unable to load note form. Please try again.
            </div>
        `;
    }
}

/**
 * Hides form view note form
 */
function hideFormViewNoteForm() {
    const noteFormContainer = document.getElementById('noteFormFormViewContainer');
    const addNoteBtn = document.getElementById('addNoteFormViewBtn');
    
    if (noteFormContainer) {
        noteFormContainer.classList.add('d-none');
        noteFormContainer.innerHTML = '';
    }
    
    if (addNoteBtn) {
        addNoteBtn.classList.remove('d-none');
    }
}

/**
 * Deletes note from form view
 */
async function deleteNoteFormView(noteId, parentType, parentId) {
    const { actions } = getAppBridge();
    
    const confirmed = confirm('Delete this note? This cannot be undone.');
    if (!confirmed) return;

    try {
        await formioRequest(`/note/submission/${noteId}`, { method: 'DELETE' });
        actions.showToast?.('Note deleted successfully', 'success');
        await loadNotesTableFormView(parentType, parentId);
    } catch (error) {
        console.error('Error deleting note:', error);
        actions.showToast?.('Error deleting note', 'danger');
    }
}
