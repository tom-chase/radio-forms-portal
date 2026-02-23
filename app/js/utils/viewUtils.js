// app/js/utils/viewUtils.js

/**
 * Render view toggle buttons for switching between table, tabulator, and calendar views
 */
export async function renderViewToggle(formMeta, currentView, { showDownloads = false } = {}) {
    const { hasTabulatorConfig } = await import('../features/tabulatorLists.js');
    const { hasDayPilotConfig } = await import('../features/dayPilotCalendar.js');
    
    const hasDayPilot = hasDayPilotConfig(formMeta);
    const hasTabulator = hasTabulatorConfig(formMeta);
    
    const showToggle = hasDayPilot && hasTabulator;
    
    if (!showToggle && !showDownloads) return '';
    
    let toggleHtml = '';
    if (showToggle) {
        const views = [];
        if (hasDayPilot) views.push('calendar');
        if (hasTabulator) views.push('tabulator');
        
        toggleHtml = views.map(view => {
            const isActive = view === currentView;
            const icon = view === 'calendar' ? 'bi-calendar-week' : 
                       view === 'tabulator' ? 'bi-table' : 'bi-list-ul';
            const label = view === 'tabulator' ? 'List' : 
                         view.charAt(0).toUpperCase() + view.slice(1);
            
            return `<button type="button" 
                         class="btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline-secondary'}" 
                         data-view="${view}"
                         title="View as ${label}">
                         <i class="bi ${icon}"></i> ${label}
                    </button>`;
        }).join('');
    }

    const downloadHtml = showDownloads
        ? `<div class="ms-auto d-flex gap-1">
            <button type="button" class="btn btn-sm btn-outline-secondary rfp-download-btn" data-format="csv" title="Download CSV (filtered rows)">
                <i class="bi bi-filetype-csv"></i> CSV
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary rfp-download-btn" data-format="json" title="Download JSON (filtered rows)">
                <i class="bi bi-filetype-json"></i> JSON
            </button>
        </div>`
        : '';

    return `<div class="d-flex gap-1 mb-2">${toggleHtml}${downloadHtml}</div>`;
}
