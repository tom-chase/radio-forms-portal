// app/js/features/inlineNotes.js

import { formioRequest, buildUrl } from '../services/formioService.js';
import { getAppBridge } from '../services/appBridge.js';
import { getUIState } from '../state/uiState.js';
import { getCurrentUserWithRoles } from '../services/sessionService.js';
import { getSubmissionPermissions, checkSubmissionRowAccess } from '../services/rbacService.js';

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
    const { actions, state } = getAppBridge();
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

        // Filter notes by share settings
        const currentUser = await getCurrentUserWithRoles();
        const isAdmin = !!getUIState('adminMode');
        const noteFormMeta = await formioRequest('/note', { method: 'GET' });
        const visibleNotes = (notes || []).filter(note =>
            checkSubmissionRowAccess(currentUser, note, noteFormMeta, { isAdmin })
        );

        if (visibleNotes.length === 0) {
            notesTableContainer.innerHTML = `
                <p class="text-muted small mb-0">No notes yet. Click "Add Note" to create one.</p>
            `;
            return;
        }

        // Transform notes data for Tabulator
        const tableData = visibleNotes.map(note => ({
            _id: note._id,
            author: note.data?.author || 'Unknown',
            title: note.data?.title || '',
            content: note.data?.content || '',
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
            placeholder: "No notes found",
            columns: [
                {
                    title: "Title",
                    field: "title",
                    responsive: 0,
                    minWidth: 150,
                    formatter: "textarea"
                },
                {
                    title: "Note",
                    field: "content",
                    responsive: 1,
                    minWidth: 200,
                    formatter: (cell) => {
                        const value = cell.getValue();
                        if (!value) return '';
                        const tmp = document.createElement('div');
                        tmp.innerHTML = value;
                        const plainText = tmp.textContent || tmp.innerText || '';
                        return plainText.substring(0, 100) + (plainText.length > 100 ? '...' : '');
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
                    title: '',
                    field: "_id",
                    width: 50,
                    responsive: 0,
                    hozAlign: "center",
                    headerSort: false,
                    resizable: false,
                    cssClass: 'rfp-actions-cell',
                    formatter: (cell) => {
                        const id = cell.getValue();
                        if (!id) return '';
                        return `<div class="rfp-kebab-dropdown">
                            <button type="button" class="rfp-kebab-btn" aria-label="Actions"><i class="bi bi-three-dots-vertical"></i></button>
                            <div class="rfp-kebab-menu">
                                <button class="rfp-kebab-item" data-action="view-note">View</button>
                                <button class="rfp-kebab-item" data-action="edit-note">Edit</button>
                                <div class="rfp-kebab-divider"></div>
                                <button class="rfp-kebab-item text-danger" data-action="delete-note">Delete</button>
                            </div>
                        </div>`;
                    },
                    cellClick: async (e, cell) => {
                        const kebabBtn = e?.target?.closest?.('.rfp-kebab-btn');
                        if (kebabBtn) {
                            const menu = kebabBtn.nextElementSibling;
                            if (!menu) return;
                            document.querySelectorAll('.rfp-kebab-menu.show').forEach(m => {
                                if (m !== menu) m.classList.remove('show');
                            });
                            const rect = kebabBtn.getBoundingClientRect();
                            menu.classList.toggle('rfp-dropup', (window.innerHeight - rect.bottom) < 200);
                            menu.classList.toggle('show');
                            e.stopPropagation();
                            return;
                        }

                        const target = e?.target?.closest?.('.rfp-kebab-item');
                        if (!target) return;
                        const action = target.dataset.action;
                        if (!action) return;

                        const openMenu = target.closest('.rfp-kebab-menu');
                        if (openMenu) openMenu.classList.remove('show');

                        const row = cell.getRow();
                        const rowData = row.getData();
                        
                        if (action === 'view-note') {
                            await showInlineNoteFormRow(table, row, rowData, parentType, parentId, 'view');
                        } else if (action === 'edit-note') {
                            await showInlineNoteFormRow(table, row, rowData, parentType, parentId, 'edit');
                        } else if (action === 'delete-note') {
                            await deleteNote(rowData._id, parentType, parentId);
                        }
                    }
                }
            ]
        });

        // Store table instance for cleanup
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
    const { state } = getAppBridge();
    const table = state.inlineNotesTableInstance;
    
    if (!table) {
        console.error('Notes table not found');
        return;
    }
    
    const parentType = parentFormMeta.path.replace(/^\/+/, '');
    const parentId = parentSubmission._id;
    
    // Show inline form at top of table for adding
    await showInlineNoteFormRow(table, null, null, parentType, parentId, 'add');
}

/**
 * Hides the inline note form - removes any inline form rows
 */
function hideInlineNoteForm() {
    const { state } = getAppBridge();
    if (state.inlineNotesTableInstance) {
        removeInlineFormRows(state.inlineNotesTableInstance);
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
        // Remove inline form rows first
        removeInlineFormRows(state.inlineNotesTableInstance);
        
        try {
            state.inlineNotesTableInstance.destroy();
        } catch (e) {
            console.warn('Error destroying notes table:', e);
        }
        state.inlineNotesTableInstance = null;
    }

    // Clear state
    state.inlineNotesSubmissionId = null;
    state.inlineNotesContainerEl = null;
    state.inlineNotesParentType = null;
}

/**
 * Helper functions
 */
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
    const { actions, state } = getAppBridge();
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

        // Filter notes by share settings
        const currentUser = await getCurrentUserWithRoles();
        const isAdmin = !!getUIState('adminMode');
        const noteFormMeta = await formioRequest('/note', { method: 'GET' });
        const visibleNotes = (notes || []).filter(note =>
            checkSubmissionRowAccess(currentUser, note, noteFormMeta, { isAdmin })
        );

        if (visibleNotes.length === 0) {
            notesTableContainer.innerHTML = '';
        }

        // Transform notes data for Tabulator
        const tableData = visibleNotes.map(note => ({
            _id: note._id,
            author: note.data?.author || 'Unknown',
            title: note.data?.title || '',
            content: note.data?.content || '',
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
            placeholder: "No notes found",
            columns: [
                {
                    title: "Title",
                    field: "title",
                    responsive: 0,
                    minWidth: 150,
                    formatter: "textarea"
                },
                {
                    title: "Note",
                    field: "content",
                    responsive: 1,
                    minWidth: 200,
                    formatter: (cell) => {
                        const value = cell.getValue();
                        if (!value) return '';
                        const tmp = document.createElement('div');
                        tmp.innerHTML = value;
                        const plainText = tmp.textContent || tmp.innerText || '';
                        return plainText.substring(0, 100) + (plainText.length > 100 ? '...' : '');
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
                    title: '',
                    field: "_id",
                    width: 50,
                    responsive: 0,
                    hozAlign: "center",
                    headerSort: false,
                    resizable: false,
                    cssClass: 'rfp-actions-cell',
                    formatter: (cell) => {
                        const id = cell.getValue();
                        if (!id) return '';
                        return `<div class="rfp-kebab-dropdown">
                            <button type="button" class="rfp-kebab-btn" aria-label="Actions"><i class="bi bi-three-dots-vertical"></i></button>
                            <div class="rfp-kebab-menu">
                                <button class="rfp-kebab-item" data-action="view-note">View</button>
                                <button class="rfp-kebab-item" data-action="edit-note">Edit</button>
                                <div class="rfp-kebab-divider"></div>
                                <button class="rfp-kebab-item text-danger" data-action="delete-note">Delete</button>
                            </div>
                        </div>`;
                    },
                    cellClick: async (e, cell) => {
                        const kebabBtn = e?.target?.closest?.('.rfp-kebab-btn');
                        if (kebabBtn) {
                            const menu = kebabBtn.nextElementSibling;
                            if (!menu) return;
                            document.querySelectorAll('.rfp-kebab-menu.show').forEach(m => {
                                if (m !== menu) m.classList.remove('show');
                            });
                            const rect = kebabBtn.getBoundingClientRect();
                            menu.classList.toggle('rfp-dropup', (window.innerHeight - rect.bottom) < 200);
                            menu.classList.toggle('show');
                            e.stopPropagation();
                            return;
                        }

                        const target = e?.target?.closest?.('.rfp-kebab-item');
                        if (!target) return;
                        const action = target.dataset.action;
                        if (!action) return;

                        const openMenu = target.closest('.rfp-kebab-menu');
                        if (openMenu) openMenu.classList.remove('show');

                        const row = cell.getRow();
                        const rowData = row.getData();
                        
                        if (action === 'view-note') {
                            await showInlineNoteFormRow(table, row, rowData, parentType, parentId, 'view');
                        } else if (action === 'edit-note') {
                            await showInlineNoteFormRow(table, row, rowData, parentType, parentId, 'edit');
                        } else if (action === 'delete-note') {
                            await deleteNoteFormView(rowData._id, parentType, parentId);
                        }
                    }
                }
            ]
        });

        // Store table instance and parent info for add button
        state.notesTableFormView = table;
        state.notesTableParentType = parentType;
        state.notesTableParentId = parentId;

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
 * Shows inline note form row in the Tabulator table
 * @param {Tabulator} table - The Tabulator table instance
 * @param {Row} row - The selected row (for edit/view) or null (for add)
 * @param {Object} noteData - The note data (for edit/view) or null (for add)
 * @param {string} parentType - The parent resource type
 * @param {string} parentId - The parent submission ID
 * @param {string} mode - 'add', 'edit', or 'view'
 */
async function showInlineNoteFormRow(table, row, noteData, parentType, parentId, mode = 'view') {
    const { actions, state } = getAppBridge();
    
    // Remove any existing inline form rows first
    removeInlineFormRows(table);
    
    // Generate unique ID for this inline form row
    const inlineRowId = `inline-form-${Date.now()}`;
    
    // Create inline form row data
    const inlineRowData = {
        _id: inlineRowId,
        _isInlineForm: true,
        _mode: mode,
        _parentNoteId: noteData?._id || null
    };
    
    try {
        const currentUser = await getCurrentUserWithRoles();
        const noteFormMeta = await formioRequest('/note', { method: 'GET' });
        const notePerms = getSubmissionPermissions(currentUser, noteFormMeta, { isAdmin: state.adminMode });
        
        // Check permissions
        if (mode === 'add' && !notePerms.canCreateAll && !notePerms.canCreateOwn) {
            actions.showToast?.('You do not have permission to create notes', 'warning');
            return;
        }
        if (mode === 'edit' && !notePerms.canUpdateAll && !notePerms.canUpdateOwn) {
            actions.showToast?.('You do not have permission to edit notes', 'warning');
            return;
        }
        
        // Add the inline row
        let inlineRow;
        if (mode === 'add') {
            // Add at the top of the table
            inlineRow = await table.addRow(inlineRowData, true);
        } else {
            // Add after the selected row for edit/view
            inlineRow = await table.addRow(inlineRowData, false, row);
        }
        
        // Get the row element and replace its content with the form
        const rowElement = inlineRow.getElement();
        if (rowElement) {
            // Clear the row content and create a full-width cell for the form
            rowElement.innerHTML = '';
            rowElement.classList.add('inline-note-form-row');
            rowElement.style.backgroundColor = '#f8f9fa';
            
            const formCell = document.createElement('td');
            formCell.colSpan = table.getColumns().length;
            formCell.style.padding = '15px';
            formCell.style.border = '2px solid #dee2e6';
            
            // Create form header with cancel button
            const headerTitle = mode === 'add' ? 'New Note' : (mode === 'edit' ? 'Edit Note' : 'View Note');
            const headerClass = mode === 'add' ? 'bg-primary' : (mode === 'edit' ? 'bg-warning' : 'bg-info');
            const textClass = mode === 'view' ? 'text-dark' : 'text-white';
            
            formCell.innerHTML = `
                <div class="d-flex justify-content-between align-items-center py-2 px-3 ${headerClass} ${textClass} rounded-top">
                    <h6 class="mb-0">
                        <i class="bi ${mode === 'add' ? 'bi-plus-circle' : (mode === 'edit' ? 'bi-pencil' : 'bi-eye')} me-2"></i>
                        ${headerTitle}
                    </h6>
                    <button type="button" class="btn btn-sm ${mode === 'view' ? 'btn-outline-dark' : 'btn-outline-light'}" id="cancelInlineForm-${inlineRowId}">
                        <i class="bi bi-x-lg me-1"></i>Cancel
                    </button>
                </div>
                <div id="inlineFormRender-${inlineRowId}" class="p-3"></div>
            `;
            
            rowElement.appendChild(formCell);
            
            // Render the Form.io form
            const formRenderContainer = document.getElementById(`inlineFormRender-${inlineRowId}`);
            
            // Determine readOnly mode and form URL
            const isReadOnly = mode === 'view';
            
            // For edit/view, use the submission URL; for add, use the form URL
            let formUrl;
            if ((mode === 'edit' || mode === 'view') && noteData?.rawData?._id) {
                formUrl = buildUrl(`/note/submission/${noteData.rawData._id}`);
            } else {
                formUrl = buildUrl('/note');
            }
            
            const formio = await Formio.createForm(
                formRenderContainer,
                formUrl,
                {
                    readOnly: isReadOnly,
                    user: currentUser
                }
            );
            
            // For edit/view, explicitly set the submission to ensure Form.io knows it's an update
            if ((mode === 'edit' || mode === 'view') && noteData?.rawData) {
                const existingSubmission = {
                    _id: noteData.rawData._id,
                    data: noteData.rawData.data || {}
                };
                formio.submission = existingSubmission;
            }
            
            // Prepare submission data for add mode only
            if (mode === 'add') {
                const submissionData = {
                    parentRef: {
                        parentType: parentType,
                        parentId: parentId,
                    },
                    author: currentUser.data?.email || currentUser.data?.name || 'Unknown'
                };
                submissionData.parentRef[`parentId_${parentType}`] = parentId;
                formio.submission = { data: submissionData };
            }
            
            // Hide the parent reference fields
            formio.on('render', () => {
                const parentRefContainer = formio.element.querySelector('[ref="parentRef"]');
                if (parentRefContainer) {
                    parentRefContainer.style.display = 'none';
                }
            });
            
            // Wire up cancel button
            const cancelBtn = document.getElementById(`cancelInlineForm-${inlineRowId}`);
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    removeInlineFormRows(table);
                });
            }
            
            // Handle submit event - manually update for edit mode to ensure PUT instead of POST
            formio.on('submit', async (submission) => {
                // For edit mode, manually PUT to ensure update instead of create
                if (mode === 'edit' && noteData?.rawData?._id) {
                    try {
                        await formioRequest(`/note/submission/${noteData.rawData._id}`, {
                            method: 'PUT',
                            body: JSON.stringify(submission)
                        });
                        actions.showToast?.('Note updated successfully', 'success');
                        removeInlineFormRows(table);
                        await loadNotesTableFormView(parentType, parentId);
                    } catch (error) {
                        console.error('Error updating note:', error);
                        actions.showToast?.('Error updating note', 'danger');
                    }
                    return false; // Prevent default submission
                }
                // For add mode, let default submission proceed
            });
            
            // Handle successful submission (for add mode only since edit is handled above)
            formio.on('submitDone', async (submission) => {
                if (mode === 'add') {
                    actions.showToast?.('Note added successfully', 'success');
                    removeInlineFormRows(table);
                    await loadNotesTableFormView(parentType, parentId);
                }
            });
            
            // Handle errors
            formio.on('error', (errors) => {
                console.error('Note form error:', errors);
                actions.showToast?.('Form error: ' + (errors.message || errors.toString()), 'danger');
            });
            
            // Scroll the inline form into view
            rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
        }
    } catch (error) {
        console.error('Error showing inline note form:', error);
        actions.showToast?.('Error loading note form', 'danger');
        // Remove the inline row if form failed to load
        removeInlineFormRows(table);
    }
}

/**
 * Removes all inline form rows from the table
 */
function removeInlineFormRows(table) {
    if (!table) return;
    
    const rows = table.getRows();
    rows.forEach(row => {
        const data = row.getData();
        if (data._isInlineForm) {
            table.deleteRow(row);
        }
    });
}

/**
 * Shows inline note form for adding a new note (at top of table)
 */
async function showFormViewNoteForm(parentSubmission, parentFormMeta) {
    const { state } = getAppBridge();
    const table = state.notesTableFormView;
    
    if (!table) {
        console.error('Notes table not found');
        return;
    }
    
    const parentType = parentFormMeta.path.replace(/^\/+/, '');
    const parentId = parentSubmission._id;
    
    // Show inline form at top of table for adding
    await showInlineNoteFormRow(table, null, null, parentType, parentId, 'add');
}

/**
 * Hides form view note form - removes any inline form rows
 */
function hideFormViewNoteForm() {
    const { state } = getAppBridge();
    if (state.notesTableFormView) {
        removeInlineFormRows(state.notesTableFormView);
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
