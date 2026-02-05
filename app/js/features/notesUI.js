// app/js/features/notesUI.js

import { formioRequest, buildUrl } from '../services/formioService.js';
import { getAppBridge } from '../services/appBridge.js';
import { getCurrentUserWithRoles } from '../services/sessionService.js';
import { getSubmissionPermissions } from '../services/rbacService.js';

/**
 * Renders a notes section for a given submission
 * @param {Object} parentSubmission - The parent submission object
 * @param {Object} parentFormMeta - The parent form metadata
 * @param {HTMLElement} container - Container element to render notes into
 */
export async function renderNotesSection(parentSubmission, parentFormMeta, container) {
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
                <button type="button" class="btn btn-sm btn-outline-primary" id="addNoteBtn">
                    <i class="bi bi-plus-lg me-1"></i>Add Note
                </button>
            </div>
            <div id="notesListContainer">
                <div class="text-center py-3">
                    <div class="spinner-border spinner-border-sm text-secondary" role="status">
                        <span class="visually-hidden">Loading notes...</span>
                    </div>
                </div>
            </div>
            <div id="noteFormContainer" class="d-none mt-3"></div>
        </div>
    `;

    // Load existing notes
    await loadNotes(parentType, parentId);

    // Wire up add note button
    const addNoteBtn = container.querySelector('#addNoteBtn');
    if (addNoteBtn) {
        addNoteBtn.addEventListener('click', () => {
            showNoteForm(parentType, parentId, parentFormMeta);
        });
    }
}

/**
 * Loads and displays notes for a given parent record
 */
async function loadNotes(parentType, parentId) {
    const notesListContainer = document.getElementById('notesListContainer');
    if (!notesListContainer) return;

    try {
        // Query notes that reference this parent
        const notes = await formioRequest('/note/submission', {
            method: 'GET',
            query: {
                'data.parentRef.parentType': parentType,
                'data.parentRef.parentId': parentId,
                sort: '-created',
                limit: 100
            }
        });

        if (!notes || notes.length === 0) {
            notesListContainer.innerHTML = `
                <p class="text-muted small mb-0">No notes yet. Click "Add Note" to create one.</p>
            `;
            return;
        }

        // Render notes list
        let html = '<div class="list-group list-group-flush">';
        
        for (const note of notes) {
            const data = note.data || {};
            const created = new Date(note.created);
            const author = data.author || 'Unknown';
            const noteText = data.note || '';
            const noteType = data.noteType || 'general';
            
            // Get badge color based on note type
            const badgeClass = getNoteTypeBadgeClass(noteType);
            
            html += `
                <div class="list-group-item px-0" data-note-id="${note._id}">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                            <strong>${escapeHtml(author)}</strong>
                            <span class="badge ${badgeClass} ms-2">${escapeHtml(noteType)}</span>
                        </div>
                        <small class="text-muted">${formatDate(created)}</small>
                    </div>
                    <div class="note-content">${escapeHtml(noteText)}</div>
                    ${data.followUpDate ? `
                        <div class="mt-2">
                            <small class="text-warning">
                                <i class="bi bi-calendar-event me-1"></i>
                                Follow-up: ${formatDate(new Date(data.followUpDate))}
                            </small>
                        </div>
                    ` : ''}
                </div>
            `;
        }
        
        html += '</div>';
        notesListContainer.innerHTML = html;

    } catch (error) {
        console.error('Error loading notes:', error);
        notesListContainer.innerHTML = `
            <div class="alert alert-danger small mb-0">
                Unable to load notes. Please try again.
            </div>
        `;
    }
}

/**
 * Shows the note creation form
 */
async function showNoteForm(parentType, parentId, parentFormMeta) {
    const { actions, state } = getAppBridge();
    const noteFormContainer = document.getElementById('noteFormContainer');
    const addNoteBtn = document.getElementById('addNoteBtn');
    
    if (!noteFormContainer) return;

    // Hide add button, show form
    if (addNoteBtn) addNoteBtn.classList.add('d-none');
    noteFormContainer.classList.remove('d-none');
    
    noteFormContainer.innerHTML = `
        <div class="card">
            <div class="card-header bg-light d-flex justify-content-between align-items-center">
                <h6 class="mb-0">New Note</h6>
                <button type="button" class="btn-close" id="cancelNoteBtn" aria-label="Close"></button>
            </div>
            <div class="card-body">
                <div id="noteFormRender"></div>
            </div>
        </div>
    `;

    const noteFormRender = document.getElementById('noteFormRender');
    const cancelNoteBtn = document.getElementById('cancelNoteBtn');

    // Wire up cancel button
    if (cancelNoteBtn) {
        cancelNoteBtn.addEventListener('click', () => {
            hideNoteForm();
        });
    }

    try {
        // Check permissions for note form
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
        submissionData[`parentRef.parentId_${parentType}`] = parentId;
        
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
            hideNoteForm();
            await loadNotes(parentType, parentId);
        });

        // Handle errors
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
 * Hides the note form
 */
function hideNoteForm() {
    const noteFormContainer = document.getElementById('noteFormContainer');
    const addNoteBtn = document.getElementById('addNoteBtn');
    
    if (noteFormContainer) {
        noteFormContainer.classList.add('d-none');
        noteFormContainer.innerHTML = '';
    }
    
    if (addNoteBtn) {
        addNoteBtn.classList.remove('d-none');
    }
}

/**
 * Get badge class for note type
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

/**
 * Format date for display
 */
function formatDate(date) {
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        if (hours === 0) {
            const minutes = Math.floor(diff / (1000 * 60));
            return minutes <= 1 ? 'Just now' : `${minutes} minutes ago`;
        }
        return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    } else if (days === 1) {
        return 'Yesterday';
    } else if (days < 7) {
        return `${days} days ago`;
    } else {
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
        });
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
