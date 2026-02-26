// app/js/features/uwOnboarding.js
//
// Driver.js guided onboarding tour for Underwriting department users.
// Triggered automatically once per browser (localStorage flag).
// Can be manually re-triggered via the Help button injected into the navbar.

const TOUR_SEEN_KEY = 'rfp_uw_tour_seen';
const TOUR_BTN_ID = 'uwTourBtn';

/**
 * Normalize a department value to a plain ID string.
 * Handles both populated objects ({_id:'...'}) and plain ID strings.
 */
function normalizeId(val) {
    if (!val) return null;
    if (typeof val === 'string') return val;
    if (typeof val === 'object') return val._id || null;
    return null;
}

/**
 * Resolve the Underwriting department submission ID from loaded forms.
 * Scans groupPermissions for an entry with _groupName === 'Underwriting'.
 * Returns the resolved submission ID string, or null.
 */
function resolveUwDeptId(allForms) {
    if (!Array.isArray(allForms)) return null;
    for (const form of allForms) {
        const gp = form?.settings?.groupPermissions;
        if (!gp) continue;
        const list = Array.isArray(gp) ? gp : [gp];
        for (const entry of list) {
            if (entry?._groupName === 'Underwriting' && entry.resource) {
                return entry.resource;
            }
        }
    }
    return null;
}

/**
 * Returns true if the user is a member of the Underwriting department.
 * Primary path: compares user's plain-ID departments against the resolved
 * Underwriting department submission ID from form groupPermissions.
 * Fallback: checks populated object shapes (d.data.name / d.label).
 */
function isUnderwritingUser(user, allForms) {
    if (!user?.data?.departments) return false;
    const depts = user.data.departments;
    if (!Array.isArray(depts) || !depts.length) return false;

    // Primary: ID-based match via groupPermissions
    const uwDeptId = resolveUwDeptId(allForms);
    if (uwDeptId) {
        const userDeptIds = new Set(depts.map(normalizeId).filter(Boolean));
        if (userDeptIds.has(uwDeptId)) return true;
    }

    // Fallback: populated-object name match (edge case)
    return depts.some(d => {
        if (!d || typeof d !== 'object') return false;
        if (d.data?.name === 'Underwriting') return true;
        if (d.label === 'Underwriting') return true;
        return false;
    });
}

/**
 * Build and return the Driver.js tour steps.
 * Steps are defined against stable DOM selectors present in index.html.
 *
 * NOTE: Several descriptions use HTML (<strong>, <em>). Driver.js 1.3.x
 * renders descriptions via innerHTML by default. If upgrading driver.js,
 * verify that HTML rendering is still supported or enable it explicitly.
 */
function buildSteps() {
    return [
        {
            element: '[data-tag-slug="underwriting"]',
            popover: {
                title: '👋 Welcome to the Underwriting Workflow',
                description:
                    'This portal manages the full sponsorship lifecycle — from prospecting ' +
                    'and contracts to spot production, aircheck logging, and activity notes. ' +
                    'Your Underwriting forms are listed here in the sidebar.',
            },
        },
        {
            element: '#toggleCreateCollapseBtn',
            popover: {
                title: 'Creating New Records',
                description:
                    'Click a form in the sidebar to select it, then expand this panel to ' +
                    'create a new submission — a new Organization, Contact, Contract, Campaign, ' +
                    'Spot, Log entry, or Note.',
            },
        },
        {
            element: '#subsCollapse',
            popover: {
                title: 'Viewing & Editing Records',
                description:
                    'After you select a form from the sidebar, its existing submissions ' +
                    'appear here. Click any row to view the full record, or use the action ' +
                    'menu to edit or delete.',
            },
        },
        {
            element: '#subsSearch',
            popover: {
                title: 'Search & Filter',
                description:
                    'Once a form is selected, type here to filter its submissions instantly. ' +
                    'Works across names, dates, and other visible fields.',
            },
        },
        {
            popover: {
                title: '⚠️ FCC Compliance Reminder',
                description:
                    '<strong>Underwriting is not advertising.</strong> Spot copy must be ' +
                    'value-neutral — no calls to action, no price information, no comparative ' +
                    'claims. The Compliance Officer\'s sign-off at approval level 3 is the ' +
                    'final FCC gate before a spot airs. When in doubt, consult the ' +
                    '<em>Underwriting Workflow</em> book in the portal.',
            },
        },
        {
            element: `#${TOUR_BTN_ID}`,
            popover: {
                title: 'Revisit This Tour Anytime',
                description:
                    'Click the <strong>Tour</strong> button here to re-launch this walkthrough ' +
                    'at any time. You can also find detailed guidance in the ' +
                    '<em>Underwriting Workflow</em> book under the Books section of the sidebar.',
            },
        },
    ];
}

/**
 * Inject the "Tour" help button into the navbar (before the Logout button).
 * Only injects once; safe to call multiple times.
 */
function ensureTourButton(onClickFn) {
    if (document.getElementById(TOUR_BTN_ID)) return;

    const logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn) return;

    const btn = document.createElement('button');
    btn.id = TOUR_BTN_ID;
    btn.type = 'button';
    btn.className = 'btn btn-outline-light btn-sm d-none';
    btn.title = 'Re-launch underwriting tour';
    btn.innerHTML = '<i class="bi bi-signpost-split me-1"></i> Tour';
    btn.addEventListener('click', onClickFn);

    logoutBtn.parentNode.insertBefore(btn, logoutBtn);
}

/**
 * Show the tour button (called after confirming user is in Underwriting dept).
 */
function showTourButton() {
    const btn = document.getElementById(TOUR_BTN_ID);
    if (btn) btn.classList.remove('d-none');
}

/**
 * Run the Driver.js tour.
 */
function runTour() {
    // driver.js IIFE exposes window.driver.js.driver
    const driverFn = window?.driver?.js?.driver;
    if (typeof driverFn !== 'function') {
        console.warn('[uwOnboarding] driver.js not available on window.driver.js.driver');
        return;
    }

    const steps = buildSteps();
    const lastStepIndex = steps.length - 1;

    const driverObj = driverFn({
        showProgress: true,
        animate: true,
        overlayColor: 'rgba(0,0,0,0.55)',
        popoverClass: 'rfp-driver-popover',
        nextBtnText: 'Next →',
        prevBtnText: '← Back',
        doneBtnText: 'Done',
        onDestroyStarted: () => {
            // Mark as seen only if user completed the tour or intentionally
            // closed it (advanced past step 0). Accidental dismiss on step 0
            // lets the tour re-trigger next login.
            const idx = driverObj.getActiveIndex();
            if (idx === undefined || idx > 0 || idx === lastStepIndex) {
                localStorage.setItem(TOUR_SEEN_KEY, '1');
            }
            driverObj.destroy();
        },
    });

    driverObj.setSteps(steps);
    driverObj.drive();
}

/**
 * Main entry point.
 * Call this from main.js after initSession() resolves and loadForms() completes.
 *
 * @param {Object} user      - The current user object from uiState ('currentUserObj').
 * @param {Array}  allForms  - The loaded forms array from uiState ('allVisibleForms').
 */
export function maybeStartUwTour(user, allForms) {
    if (!isUnderwritingUser(user, allForms)) return;

    ensureTourButton(runTour);
    showTourButton();

    // Auto-start only if not seen before
    if (localStorage.getItem(TOUR_SEEN_KEY)) return;

    // Small delay so the sidebar has rendered before Driver.js measures elements
    setTimeout(runTour, 600);
}
