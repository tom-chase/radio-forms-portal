// app/js/features/dayPilotCalendar.js

import { getAppBridge } from '../services/appBridge.js';
import { formioRequest } from '../services/formioService.js';
import { startEditSubmission, startViewSubmission } from './submissions.js?v=2.19';
import { renderViewToggle } from '../utils/viewUtils.js';
import { showConfirm } from '../ui/modalUtils.js';

function $(id) { return document.getElementById(id); }

function pad2(n) {
    return String(n).padStart(2, '0');
}

function toLocalDateTimeString(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function toISOStringFromDayPilotDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value.toDate === 'function') {
        const d = value.toDate();
        if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
    }
    if (typeof value.toString === 'function') {
        const s = value.toString();
        const d = new Date(s);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    return null;
}

/**
 * Data transform functions for DayPilot calendar configurations
 */
const dataTransforms = {
    /**
     * Transform engineering schedule submissions to DayPilot events
     * Maps form fields to calendar event structure
     */
    engineeringScheduleTransform: (submissions, formMeta) => {
        return (submissions || []).map((submission) => {
            const data = submission.data || {};
            
            // Parse datetime fields from form data
            // Handle timezone properly - Form.io stores in ISO format
            let start = null;
            let end = null;
            
            if (data.startDateTime) {
                start = toLocalDateTimeString(data.startDateTime);
            }
            
            if (data.endDateTime) {
                end = toLocalDateTimeString(data.endDateTime);
            }
            
            // Use engineer email as event text, fallback to submission ID
            const text = data.engineer || `Shift ${submission._id.substring(0, 8)}`;
            
            const eventObj = {
                id: submission._id,
                text: text,
                start: start,
                end: end,
                data: {
                    submission: submission,
                    engineer: data.engineer,
                    submittedBy: data.submittedBy,
                    notes: data.notes
                },
                // Style based on time of day (morning vs afternoon)
                backColor: isMorningShift(start) ? "#e3f2fd" : "#fff3e0",
                borderColor: isMorningShift(start) ? "#1976d2" : "#f57c00"
            };
            
            return eventObj;
        }).filter(event => event.start && event.end); // Filter out invalid events
    },

    eventTransform: (submissions, formMeta) => {
        const colorMap = {
            'meeting':         { back: '#e3f2fd', border: '#1976d2' },
            'deadline':        { back: '#fce4ec', border: '#c62828' },
            'community event': { back: '#e8f5e9', border: '#2e7d32' },
            'partner event':   { back: '#fff3e0', border: '#f57c00' },
            'outside event':   { back: '#f3e5f5', border: '#7b1fa2' },
        };
        const defaultColor = { back: '#f5f5f5', border: '#616161' };

        return (submissions || []).map((submission) => {
            const data = submission.data || {};
            const start = data.startDateTime ? toLocalDateTimeString(data.startDateTime) : null;
            const end   = data.endDateTime   ? toLocalDateTimeString(data.endDateTime)   : null;
            const text  = data.title || data.eventType || `Event ${submission._id.substring(0, 8)}`;
            const colors = colorMap[data.eventType] || defaultColor;

            return {
                id: submission._id,
                text: text,
                start: start,
                end: end,
                data: {
                    submission: submission,
                    eventType: data.eventType,
                    author: data.author,
                    description: data.description
                },
                backColor: colors.back,
                borderColor: colors.border
            };
        }).filter(event => event.start && event.end);
    }
};

/**
 * Helper function to determine if a shift is morning (6am-1pm)
 * Works with both Date objects and ISO strings
 */
function isMorningShift(startDate) {
    if (!startDate) return false;
    
    let hour;
    if (typeof startDate === 'string') {
        // Parse ISO string to get hour
        const date = new Date(startDate);
        hour = date.getHours();
    } else if (typeof startDate.getHours === 'function') {
        // Use Date object method
        hour = startDate.getHours();
    } else {
        return false;
    }
    
    return hour >= 6 && hour < 13;
}

/**
 * Check if DayPilot library is available
 */
function isDayPilotAvailable() {
    return typeof DayPilot !== "undefined";
}

/**
 * Apply data transform function if specified
 */
async function applyDataTransform(submissions, transformName, formMeta) {
    if (!transformName || !dataTransforms[transformName]) {
        return submissions;
    }
    
    try {
        return dataTransforms[transformName](submissions, formMeta);
    } catch (e) {
        console.error(`Error applying DayPilot data transform '${transformName}':`, e);
        return submissions;
    }
}

/**
 * Create default DayPilot calendar configuration
 */
function createDefaultConfig() {
    return {
        viewType: "Week",
        showAllDayEvents: false,
        businessBeginsHour: 6,
        businessEndsHour: 20,
        height: "100%",
        cellWidth: 40,
        timeHeaders: [
            { groupBy: "Day", format: "dddd, MMMM d, yyyy" },
            { groupBy: "Hour", format: "h tt" }
        ],
        scale: "ThirtyMinutes",
        eventResizeHandling: "Update",
        eventMoveHandling: "Update",
        eventClickHandling: "Edit",
        eventDeleteHandling: "Disabled",
        eventHoverHandling: "Bubble",
        allowEventOverlap: false,
        eventHeight: 30,
        headerHeight: 30,
        contextMenu: new DayPilot.Menu({
            items: [
                {
                    text: "View",
                    onClick: async (args) => {
                        await handleEventAction(args.source, 'view');
                    }
                },
                {
                    text: "Edit",
                    onClick: async (args) => {
                        await handleEventAction(args.source, 'edit');
                    }
                },
                {
                    text: "Delete",
                    onClick: async (args) => {
                        await handleEventAction(args.source, 'delete');
                    }
                },
                { 
                    text: "-" 
                },
                {
                    text: "View JSON",
                    onClick: async (args) => {
                        await handleEventAction(args.source, 'json');
                    }
                }
            ]
        }),
        onEventClick: async (args) => {
        },
        onEventResize: async (args) => {
            await updateEventTimes(args.e, args.newStart, args.newEnd);
        },
        onEventMove: async (args) => {
            await updateEventTimes(args.e, args.newStart, args.newEnd);
        }
    };
}

/**
 * Handle event actions (view, edit, delete, json) with proper permissions checking
 */
async function handleEventAction(event, action) {
    const { actions, state } = getAppBridge();
    
    // Try different ways to get the submission data from DayPilot event
    let submission = null;
    let eventId = null;
    
    // DayPilot events have method properties, not direct properties
    if (event && typeof event.id === 'function') {
        eventId = event.id();
    } else if (event && event.id) {
        eventId = event.id;
    }
    
    // Method 1: From event.data.submission (from data transform)
    if (event.data && event.data.submission) {
        submission = event.data.submission;
    }
    // Method 2: From event.data (if the entire submission is stored directly)
    else if (event.data && event.data._id) {
        submission = event.data;
    }
    // Method 3: From the calendar events list using event.id
    else if (eventId && state.currentDayPilotCalendar) {
        // Try different ways to access the events
        let eventsList = null;
        if (Array.isArray(state.currentDayPilotCalendar.events)) {
            eventsList = state.currentDayPilotCalendar.events;
        } else if (state.currentDayPilotCalendar.events && state.currentDayPilotCalendar.events.list) {
            eventsList = state.currentDayPilotCalendar.events.list;
        } else if (state.currentDayPilotCalendar.events && typeof state.currentDayPilotCalendar.events.toArray === 'function') {
            eventsList = state.currentDayPilotCalendar.events.toArray();
        }
        
        if (eventsList && eventsList.length > 0) {
            const calendarEvent = eventsList.find(e => e.id === eventId);
            if (calendarEvent && calendarEvent.data && calendarEvent.data.submission) {
                submission = calendarEvent.data.submission;
            }
        }
    }
    
    if (!submission) {
        actions.showToast?.("Unable to find submission data for this event", "error");
        return;
    }
    
    // Use stored form metadata and permissions from calendar rendering
    const formMeta = state.currentDayPilotFormMeta;
    const permissions = state.currentDayPilotPermissions;
    const currentUser = state.currentDayPilotUser;
    
    if (!formMeta || !permissions) {
        actions.showToast?.("Unable to determine form permissions", "error");
        return;
    }
    
    const currentUserId = currentUser?._id || null;
    const isOwner = !!currentUserId && submission.owner === currentUserId;
    
    const canEditThis = permissions.canUpdateAll || (permissions.canUpdateOwn && isOwner);
    const canDeleteThis = permissions.canDeleteAll || (permissions.canDeleteOwn && isOwner);
    const canViewThis = permissions.canReadAll || (permissions.canReadOwn && isOwner);
    
    // Handle different actions
    if (action === "json") {
        actions.showJsonModal?.(submission.data || {});
    } else if (action === "view") {
        if (!canViewThis) {
            actions.showToast?.("You don't have permission to view this submission", "warning");
            return;
        }
        // For calendar events, use read-only viewing
        startViewSubmission(submission);
    } else if (action === "edit") {
        if (!canEditThis) {
            actions.showToast?.("You don't have permission to edit this submission", "warning");
            return;
        }
        // For calendar events, use main panel editing
        startEditSubmission(submission);
    } else if (action === "delete") {
        if (!canDeleteThis) {
            actions.showToast?.("You don't have permission to delete this submission", "warning");
            return;
        }
        
        const confirmed = await showConfirm("Delete this submission? This cannot be undone.");
        if (!confirmed) return;
        
        try {
            const path = String(formMeta?.path || '').replace(/^\/+/, '');
            await formioRequest(`/${path}/submission/${submission._id}`, { method: "DELETE" });
            actions.showToast?.("Submission deleted.", "success");
            
            // Reload the calendar to show updated data
            const { loadSubmissions } = await import('./submissions.js?v=2.19');
            await loadSubmissions(formMeta, permissions, currentUser);
        } catch (err) {
            console.error("deleteSubmission error", err);
            actions.showToast?.("Error deleting submission.", "danger");
        }
    }
}

/**
 * Update event times in the submission data
 */
async function updateEventTimes(event, newStart, newEnd) {
    const { actions, state } = getAppBridge();
    const submission = event.data.submission;
    
    if (!submission) {
        actions.showToast?.("Unable to update event: submission data not found", "error");
        return;
    }

    try {
        // Update the submission data with new times
        const newStartIso = toISOStringFromDayPilotDate(newStart);
        const newEndIso = toISOStringFromDayPilotDate(newEnd);
        if (!newStartIso || !newEndIso) {
            actions.showToast?.("Unable to update shift times (invalid date)", "error");
            return;
        }

        const updatedData = {
            ...submission.data,
            startDateTime: newStartIso,
            endDateTime: newEndIso
        };

        // Update the submission via Form.io API
        const formPath = String(state.currentDayPilotFormMeta?.path || '').replace(/^\/+/, '');
        if (!formPath) {
            actions.showToast?.("Unable to update shift (form path missing)", "error");
            return;
        }

        await formioRequest(`/${formPath}/submission/${submission._id}`, {
            method: 'PUT',
            data: {
                ...submission,
                data: updatedData
            }
        });

        actions.showToast?.("Shift updated successfully", "success");
        
        // Reload the calendar to show updated times
        const { loadSubmissions } = await import('./submissions.js?v=2.19');
        if (state.currentDayPilotFormMeta) {
            await loadSubmissions(
                state.currentDayPilotFormMeta,
                state.currentDayPilotPermissions,
                state.currentDayPilotUser
            );
        }
    } catch (error) {
        console.error('Error updating event times:', error);
        actions.showToast?.("Error updating shift times", "error");
    }
}

/**
 * Merge form-specific config with defaults
 */
function mergeDayPilotConfig(formConfig = {}, defaultConfig = createDefaultConfig()) {
    
    const finalConfig = {
        ...defaultConfig,
        ...formConfig,
        // Ensure critical callbacks are preserved
        onEventClick: formConfig.onEventClick || defaultConfig.onEventClick,
        onEventResize: formConfig.onEventResize || defaultConfig.onEventResize,
        onEventMove: formConfig.onEventMove || defaultConfig.onEventMove,
        // Preserve context menu if not overridden
        contextMenu: formConfig.contextMenu || defaultConfig.contextMenu,
        // Ensure height is always valid
        height: formConfig.height || defaultConfig.height
    };
    return finalConfig;
}

/**
 * Render submissions using DayPilot calendar configuration from form settings
 */
export async function renderDayPilotCalendar(submissions, formMeta, user, permissions) {
    const { actions, state } = getAppBridge();
    const subsList = $("subsList");
    const subsSearchInput = $("subsSearch");

    if (!isDayPilotAvailable()) {
        subsList.innerHTML = `
            <div class="alert alert-warning">
                DayPilot library not loaded. Calendar view cannot be displayed.
            </div>
        `;
        return;
    }

    try {
        const dayPilotConfig = formMeta?.settings?.dayPilotCalendar;
        if (!dayPilotConfig || dayPilotConfig.enabled === false) {
            return false;
        }

        // Apply data transform if specified
        const transformedSubmissions = await applyDataTransform(
            submissions,
            dayPilotConfig.dataTransform,
            formMeta
        );
        const maybeEvents = Array.isArray(transformedSubmissions) ? transformedSubmissions : [];
        if (maybeEvents.some(e => e && (e.start === undefined || e.end === undefined))) {
            throw new Error("Calendar dataTransform did not produce DayPilot events (missing start/end)");
        }
        state.currentDayPilotFormMeta = formMeta;
        state.currentDayPilotPermissions = permissions;
        state.currentDayPilotUser = user;

        // Initialize calendar state if not present
        if (!state.dayPilotConfig) {
            state.dayPilotConfig = {
                startDate: new DayPilot.Date().toString("yyyy-MM-dd"),
                viewType: getResponsiveViewType()
            };
        }

        const { enabled, dataTransform, ...configInput } = dayPilotConfig || {};
        
        // Merge configs, prioritizing our dynamic state
        const config = mergeDayPilotConfig({
            ...configInput,
            startDate: state.dayPilotConfig.startDate,
            viewType: state.dayPilotConfig.viewType
        });

        const host = document.getElementById('rfpDayPilotCalendar') || subsList;
        
        // Render Toolbar + Calendar Container
        host.innerHTML = `
            ${renderCalendarToolbar(state.dayPilotConfig)}
            <div id="dpCalendarContainer"></div>
        `;

        const calendarHost = document.getElementById('dpCalendarContainer');
        const calendar = new DayPilot.Calendar(calendarHost, config);
        
        // Update calendar with events
        calendar.events.list = maybeEvents;
        
        // Initialize calendar
        calendar.init();
        
        // Store instance in state
        state.currentDayPilotCalendar = calendar;
        
        // Wire up toolbar events
        wireToolbarEvents(calendar, state);

        return true;
    } catch (error) {
        console.error('Error rendering DayPilot calendar:', error);
        subsList.innerHTML = `
            <div class="alert alert-danger">
                Error loading calendar: ${error.message}
            </div>
        `;
        return false;
    }
}

/**
 * Determine default view based on screen width
 */
function getResponsiveViewType() {
    return window.innerWidth < 768 ? "Day" : "Week";
}

/**
 * Render the navigation and view control toolbar
 */
function renderCalendarToolbar(currentConfig) {
    const startDate = new DayPilot.Date(currentConfig.startDate);
    const viewType = currentConfig.viewType;
    
    // Calculate date range label
    let rangeLabel = "";
    if (viewType === "Day") {
        rangeLabel = startDate.toString("MMMM d, yyyy");
    } else {
        const start = startDate.firstDayOfWeek();
        const end = start.addDays(6);
        // Format: "Jan 20 - Jan 26, 2026" or "Jan 20 - 26, 2026"
        if (start.getYear() === end.getYear() && start.getMonth() === end.getMonth()) {
            rangeLabel = `${start.toString("MMM d")} - ${end.toString("d, yyyy")}`;
        } else if (start.getYear() === end.getYear()) {
            rangeLabel = `${start.toString("MMM d")} - ${end.toString("MMM d, yyyy")}`;
        } else {
            rangeLabel = `${start.toString("MMM d, yyyy")} - ${end.toString("MMM d, yyyy")}`;
        }
    }

    return `
        <div class="d-flex flex-wrap justify-content-between align-items-center mb-2 p-2 bg-light rounded border">
            <div class="btn-group" role="group">
                <button type="button" class="btn btn-outline-secondary btn-sm" id="dpPrevBtn" title="Previous">
                    <i class="bi bi-chevron-left"></i>
                </button>
                <button type="button" class="btn btn-outline-secondary btn-sm" id="dpTodayBtn">Today</button>
                <button type="button" class="btn btn-outline-secondary btn-sm" id="dpNextBtn" title="Next">
                    <i class="bi bi-chevron-right"></i>
                </button>
            </div>
            
            <div class="fw-bold text-center my-1" style="min-width: 200px;">
                ${rangeLabel}
            </div>
            
            <div class="btn-group" role="group">
                <button type="button" class="btn btn-sm ${viewType === 'Day' ? 'btn-secondary' : 'btn-outline-secondary'}" id="dpViewDay">Day</button>
                <button type="button" class="btn btn-sm ${viewType === 'Week' ? 'btn-secondary' : 'btn-outline-secondary'}" id="dpViewWeek">Week</button>
            </div>
        </div>
    `;
}

/**
 * Wire up toolbar click handlers
 */
function wireToolbarEvents(calendar, state) {
    const updateCalendar = () => {
        calendar.update({
            startDate: state.dayPilotConfig.startDate,
            viewType: state.dayPilotConfig.viewType
        });
        
        // Re-render toolbar to update label and active states
        const toolbarContainer = document.getElementById('rfpDayPilotCalendar').querySelector('div:first-child');
        if (toolbarContainer) {
            // Replace the toolbar HTML cleanly
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = renderCalendarToolbar(state.dayPilotConfig);
            toolbarContainer.replaceWith(tempDiv.firstElementChild);
            // Re-wire events for new buttons
            wireToolbarEvents(calendar, state);
        }
    };

    $('dpPrevBtn')?.addEventListener('click', () => {
        const current = new DayPilot.Date(state.dayPilotConfig.startDate);
        const days = state.dayPilotConfig.viewType === "Week" ? 7 : 1;
        state.dayPilotConfig.startDate = current.addDays(-days).toString("yyyy-MM-dd");
        updateCalendar();
    });

    $('dpNextBtn')?.addEventListener('click', () => {
        const current = new DayPilot.Date(state.dayPilotConfig.startDate);
        const days = state.dayPilotConfig.viewType === "Week" ? 7 : 1;
        state.dayPilotConfig.startDate = current.addDays(days).toString("yyyy-MM-dd");
        updateCalendar();
    });

    $('dpTodayBtn')?.addEventListener('click', () => {
        state.dayPilotConfig.startDate = new DayPilot.Date().toString("yyyy-MM-dd");
        updateCalendar();
    });

    $('dpViewDay')?.addEventListener('click', () => {
        if (state.dayPilotConfig.viewType !== "Day") {
            state.dayPilotConfig.viewType = "Day";
            updateCalendar();
        }
    });

    $('dpViewWeek')?.addEventListener('click', () => {
        if (state.dayPilotConfig.viewType !== "Week") {
            state.dayPilotConfig.viewType = "Week";
            updateCalendar();
        }
    });
}

/**
 * Destroy existing DayPilot instance
 */
export function destroyDayPilot() {
    const { state } = getAppBridge();
    
    if (state.currentDayPilotCalendar) {
        try { 
            state.currentDayPilotCalendar.dispose(); 
        } catch (e) { 
            console.warn('Error destroying DayPilot calendar:', e);
        }
    }
    state.currentDayPilotCalendar = null;
}

/**
 * Check if a form has DayPilot calendar configuration
 */
export function hasDayPilotConfig(formMeta) {
    const config = formMeta?.settings?.dayPilotCalendar;
    return config && config.enabled !== false;
}

/**
 * Get available data transform functions
 */
export function getDataTransforms() {
    return Object.keys(dataTransforms);
}
