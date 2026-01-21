/**
 * Tabulator configuration utilities
 */

/**
 * Merge user configuration with default configuration
 */
export function mergeTabulatorConfig(userConfig) {
    const defaults = {
        height: "100%",
        layout: "fitColumns",
        responsiveLayout: "hide",
        pagination: "local",
        paginationSize: 10,
        paginationSizeSelector: [10, 25, 50, 100],
        placeholder: "No Data Available",
        dataTree: true,
        dataTreeStartExpanded: true,
        dataTreeFilter: false,
        dataTreeElementAttribute: "data-path",
        dataTreeChildElementAttribute: "data-field",
        selectable: "highlight",
        movableRows: true,
        resizableColumns: true,
        columnMinWidth: 100,
        tooltips: true,
        tooltipsHeader: false,
        scrollToRowIfVisible: true,
        scrollToRowPosition: "top",
        groupBy: false,
        groupHeader: false,
        groupOpen: false,
        printAsHtml: true,
        printHeader: false,
        printFooter: false,
        printCopyStyle: false,
        printRowRange: "all",
        printRowFormatter: false,
        htmlOutputConfig: false,
        keybindings: {
            "copy": "ctrl+c",
            "del": "ctrl+backspace"
        },
        columns: []
    };

    if (!userConfig) return defaults;

    return {
        ...defaults,
        ...userConfig,
        // Ensure critical arrays are properly merged
        columns: userConfig.columns ? [...defaults.columns, ...userConfig.columns] : defaults.columns,
        initialSort: userConfig.initialSort || defaults.initialSort,
        initialFilter: userConfig.initialFilter || defaults.initialFilter
    };
}

/**
 * Get available data transform functions
 */
export function getDataTransforms() {
    return {
        userRolesTransform: "userRolesTransform"
    };
}
