// app/js/utils/viewUtils.js

/**
 * Render view toggle buttons for switching between table, tabulator, and calendar views
 */
export async function renderViewToggle(formMeta, currentView) {
    const { hasTabulatorConfig } = await import('../features/tabulatorLists.js');
    const { hasDayPilotConfig } = await import('../features/dayPilotCalendar.js');
    
    const hasDayPilot = hasDayPilotConfig(formMeta);
    const hasTabulator = hasTabulatorConfig(formMeta);
    
    // Only show toggle when both DayPilot and Tabulator views are available
    if (!(hasDayPilot && hasTabulator)) return '';
    
    const views = [];
    if (hasDayPilot) views.push('calendar');
    if (hasTabulator) views.push('tabulator');
    // Remove fallback table - only show Calendar and Tabulator
    
    const buttons = views.map(view => {
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
    
    return `<div class="d-flex gap-1 mb-2">${buttons}</div>`;
}
