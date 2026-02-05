# Notes Component Pattern for Form.io

## Overview

This document describes how to add an inline notes display/creation component to any Form.io resource that needs activity tracking.

## Approach: HTML Component with Custom JavaScript

Since Form.io doesn't have a native "related submissions" component, we use an HTML component with embedded JavaScript that:
1. Fetches notes related to the current submission
2. Displays them in a styled list
3. Provides an inline form for creating new notes
4. Auto-populates parent references

## Implementation

### Step 1: Add HTML Component to Form

Add this component to any form where you want notes display (e.g., `contact.json`, `orgs.json`, `uwContracts.json`):

```json
{
  "label": "Notes",
  "key": "notesDisplay",
  "type": "htmlelement",
  "input": false,
  "tableView": false,
  "content": "<div id=\"inline-notes-container\" data-parent-type=\"contact\" data-parent-id=\"{{ data._id }}\"></div>",
  "refreshOnChange": false,
  "customConditional": "show = !!data._id;",
  "description": "Activity log and notes for this record"
}
```

**Key Points:**
- `data-parent-type`: Set this to the resource name (e.g., "contact", "orgs", "uwContracts")
- `data-parent-id`: Uses `{{ data._id }}` to get the current submission ID
- `customConditional`: Only shows when viewing/editing an existing submission (has `_id`)

### Step 2: Initialize Notes on Form Render

In your form rendering code, after the form is created, initialize the notes:

```javascript
formio.on('render', () => {
    const notesContainer = formio.element.querySelector('#inline-notes-container');
    if (notesContainer) {
        const parentType = notesContainer.dataset.parentType;
        const parentId = notesContainer.dataset.parentId;
        
        if (parentId && parentId !== '{{ data._id }}') {
            // Import and render notes
            import('./features/notesUI.js').then(module => {
                module.renderNotesSection(
                    { _id: parentId },
                    { path: parentType },
                    notesContainer
                );
            });
        }
    }
});
```

## Alternative: Pure HTML Component (No External JS)

For a completely self-contained approach, you can embed all the JavaScript directly in the HTML component:

```json
{
  "label": "Notes",
  "key": "notesDisplay",
  "type": "htmlelement",
  "input": false,
  "tableView": false,
  "content": "<div id=\"notes-{{ instance.id }}\" class=\"notes-section\"></div><script>(function(){const container=document.getElementById('notes-{{ instance.id }}');const parentType='contact';const parentId='{{ data._id }}';if(!parentId||parentId==='{{ data._id }}')return;fetch(`/note/submission?data.parentType=${parentType}&data.parentId=${parentId}&sort=-created`).then(r=>r.json()).then(notes=>{let html='<h6>Notes</h6>';if(!notes.length){html+='<p class=\"text-muted small\">No notes yet.</p>';}else{html+='<div class=\"list-group\">';notes.forEach(n=>{html+=`<div class=\"list-group-item\"><strong>${n.data.author||'Unknown'}</strong><br><small>${new Date(n.created).toLocaleDateString()}</small><p>${n.data.note||''}</p></div>`;});html+='</div>';}container.innerHTML=html;}).catch(e=>console.error('Error loading notes:',e));})();</script>",
  "customConditional": "show = !!data._id;"
}
```

**Limitations:**
- Read-only display (no inline creation)
- Harder to maintain
- Limited styling options
- No permission checks

## Recommendation

**Use the external `notesUI.js` approach** (current implementation) because:

1. **Reusability**: Write once, use everywhere
2. **Maintainability**: Single source of truth for notes logic
3. **Features**: Full CRUD, permissions, styling, real-time updates
4. **Performance**: Lazy-loaded only when needed
5. **Separation of Concerns**: Form definition stays clean

The external JS is automatically triggered when viewing/editing any submission, so it "just works" without adding anything to each form definition.

## When to Use HTML Component Approach

Use the HTML component approach when:
- You need notes display to be part of the form's PDF export
- You want notes visible in form builder preview
- You need different note displays for different forms
- You want to customize the notes UI per form

## Hybrid Approach (Best of Both Worlds)

Keep the current `notesUI.js` for automatic notes display, but add an HTML component to forms where you want notes to appear in a specific position within the form layout:

```json
{
  "label": "Activity Log",
  "key": "activityLogPlaceholder",
  "type": "htmlelement",
  "input": false,
  "content": "<div id=\"custom-notes-position\"></div>",
  "customConditional": "show = !!data._id;"
}
```

Then in `forms.js`, check for this placeholder and render notes there instead of at the bottom:

```javascript
const customNotesPosition = formRender.querySelector('#custom-notes-position');
if (customNotesPosition) {
    await renderNotesSection(submission, formMeta, customNotesPosition);
} else {
    // Fallback to default position at bottom
    const notesContainer = document.createElement('div');
    notesContainer.id = 'submissionNotesContainer';
    formRender.appendChild(notesContainer);
    await renderNotesSection(submission, formMeta, notesContainer);
}
```

This gives you control over placement while keeping the logic centralized.
