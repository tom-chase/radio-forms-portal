
import { formioRequest } from '../services/formioService.js';
import { createModal } from '../ui/modalUtils.js';
import { log } from '../utils/logger.js';

export async function openGroupMgmtModal({ targetUserSubmission, onSaved }) {
    if (!targetUserSubmission) return;

    // Dynamic Form Definition
    const [depts, comms] = await Promise.all([
        formioRequest('/department/submission', { method: 'GET', query: { limit: 1000, sort: 'data.name' } }),
        formioRequest('/committee/submission', { method: 'GET', query: { limit: 1000, sort: 'data.name' } })
    ]);

    log.debug("Raw Groups Data", { 
        deptsType: typeof depts,
        deptsIsArray: Array.isArray(depts),
        deptsLen: Array.isArray(depts) ? depts.length : null,
        firstDept: Array.isArray(depts) ? depts[0] : depts,
        commsType: typeof comms,
        commsIsArray: Array.isArray(comms),
        commsLen: Array.isArray(comms) ? comms.length : null
    });
    
    const formatOption = (item) => {
        if (!item) return { label: 'Unknown', value: 'unknown' };
        const name = item.data?.name || item.name || item.title || `Group ${item._id}`;
        return { label: name, value: item._id };
    };

    const deptOptions = (Array.isArray(depts) ? depts : []).map(formatOption);
    const commOptions = (Array.isArray(comms) ? comms : []).map(formatOption);
    
    log.debug("Formatted Options", { 
        deptCount: deptOptions.length,
        commCount: commOptions.length,
        deptOptions: deptOptions.slice(0, 3), 
        commOptions: commOptions.slice(0, 3) 
    });

    const groupMgmtSchema = {
        components: [
            {
                label: 'Departments',
                key: 'departments',
                type: 'select',
                input: true,
                multiple: true,
                dataSrc: 'values',
                data: {
                    values: deptOptions
                },
                dataType: 'string',
                valueProperty: 'value',
                template: '<span>{{ item.label }}</span>',
                widget: 'choicesjs'
            },
            {
                label: 'Committees',
                key: 'committees',
                type: 'select',
                input: true,
                multiple: true,
                dataSrc: 'values',
                data: {
                    values: commOptions
                },
                dataType: 'string',
                valueProperty: 'value',
                template: '<span>{{ item.label }}</span>',
                widget: 'choicesjs'
            },
            {
                type: 'button',
                label: 'Save Changes',
                key: 'submit',
                action: 'submit',
                theme: 'primary',
                className: 'mt-3'
            }
        ]
    };

    const hostId = `groupMgmtHost_${Math.random().toString(16).slice(2)}`;
    let modalContainer = null;

    const email = targetUserSubmission.data?.email || targetUserSubmission.email || 'User';

    const modal = createModal({
        title: `Manage Groups: ${email}`,
        body: `<div id="${hostId}"></div>`,
        size: 'lg',
        showFooter: false,
        onCreate: (container) => {
            modalContainer = container;
        }
    });

    modal.show();

    const hostEl = modalContainer?.querySelector(`#${hostId}`);
    if (!hostEl) return;

    try {
        const formio = await Formio.createForm(hostEl, groupMgmtSchema, {
            readOnly: false
        });

        // Pre-fill data
        // We only care about data.departments and data.committees
        const normalizeGroupIds = (items) => {
            if (!Array.isArray(items)) return [];
            return items
                .map((item) => {
                    if (typeof item === 'string') return item;
                    if (item && typeof item === 'object') return item._id || item.value || item.id;
                    return null;
                })
                .filter(Boolean);
        };

        const initialDepartments = normalizeGroupIds(targetUserSubmission.data?.departments);
        const initialCommittees = normalizeGroupIds(targetUserSubmission.data?.committees);

        const deptValues = deptOptions.map(o => o?.value).filter(Boolean);
        const commValues = commOptions.map(o => o?.value).filter(Boolean);
        const deptMatches = initialDepartments.filter(id => deptValues.includes(id));
        const deptMissing = initialDepartments.filter(id => !deptValues.includes(id));
        const commMatches = initialCommittees.filter(id => commValues.includes(id));
        const commMissing = initialCommittees.filter(id => !commValues.includes(id));

        log.debug("Pre-filling Group Mgmt Form", { 
            email: targetUserSubmission.data?.email, 
            dept: initialDepartments, 
            comm: initialCommittees,
            deptMatches,
            deptMissing,
            commMatches,
            commMissing,
            deptFirstType: typeof initialDepartments?.[0],
            deptFirst: initialDepartments?.[0]
        });

        const submissionData = {
            data: {
                departments: initialDepartments,
                committees: initialCommittees
            }
        };

        if (formio?.ready) {
            await formio.ready;
        }

        if (typeof formio?.setSubmission === 'function') {
            await formio.setSubmission(submissionData);
        } else {
            formio.submission = submissionData;
        }

        log.debug("Group Mgmt After Prefill", {
            departments: formio?.submission?.data?.departments,
            committees: formio?.submission?.data?.committees
        });

        const deptComp = typeof formio?.getComponent === 'function' ? formio.getComponent('departments') : null;
        const commComp = typeof formio?.getComponent === 'function' ? formio.getComponent('committees') : null;
        if (typeof deptComp?.setValue === 'function') {
            deptComp.setValue(initialDepartments);
        }
        if (typeof commComp?.setValue === 'function') {
            commComp.setValue(initialCommittees);
        }

        formio.on('submit', async (submission) => {
            try {
                // We need to merge this with the existing user data to avoid data loss
                // However, since we are only updating specific fields, we should fetch fresh first?
                // The API usually handles partial updates if we are careful, but Form.io PUT replaces the whole object usually.
                // Best practice: Fetch latest, merge, put.
                
                const userId = targetUserSubmission._id;
                const freshUser = await formioRequest(`/user/submission/${userId}`, { method: 'GET' });

                const departments = normalizeGroupIds(submission.data?.departments);
                const committees = normalizeGroupIds(submission.data?.committees);
                
                const updatedData = {
                    ...freshUser,
                    data: {
                        ...freshUser.data,
                        departments,
                        committees
                    }
                };

                await formioRequest(`/user/submission/${userId}`, {
                    method: 'PUT',
                    data: updatedData
                });

                if (onSaved) await onSaved();
                
                // Close modal
                const modalInstance = bootstrap.Modal.getInstance(modalContainer.querySelector('.modal'));
                modalInstance?.hide();

            } catch (err) {
                console.error("Error updating groups", err);
                formio.emit('error', 'Failed to save group changes.');
            }
        });

    } catch (e) {
        console.error("Failed to render group management form", e);
        hostEl.innerHTML = '<div class="alert alert-danger">Error loading form.</div>';
    }
}
