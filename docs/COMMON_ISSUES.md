# Common Issues & Fixes

This document covers common issues encountered during development and their standard solutions.

---

### 1. Form.io `readOnly` State is Not Toggling Correctly

- **Symptom**: A form does not switch between editable and read-only modes as expected. Clicking an "Edit" or "View" button does not reliably change the form's state.

- **Cause**: Directly manipulating the `readOnly` property of a live Form.io instance (e.g., `formio.readOnly = true`) is unreliable across different Form.io versions and rendering cycles.

- **Solution**: The most robust pattern is to completely destroy the existing form instance and create a new one with the desired `readOnly` option set at creation time. This ensures a clean and predictable state.

- **Implementation**:
  - The `createMainFormInstance` function in `app/js/features/forms.js` implements this pattern.
  - Functions like `startViewSubmission` and `startEditSubmission` in `app/js/features/submissions.js` use this helper to ensure the main form is correctly rendered in either read-only or editable mode.

---

### 2. `TypeError` in Form.io Custom Functions (e.g., `calculateValue`)

- **Symptom**: The browser console shows a `TypeError` originating from `formio.full.min.js`, often mentioning `can't access property "X" of undefined`. This may prevent a form from rendering correctly.

- **Cause**: A `calculateValue` or `customConditional` script within a form's JSON definition is attempting to access a nested property of an object that is `null` or `undefined`. For example, accessing `data.user.data.email` when `data.user.data` does not exist.

- **Solution**: Always write defensive code in custom scripts. Check for the existence of each object in a nested chain before accessing its properties.

- **Example**:
  - **Unsafe**:
    ```javascript
    "calculateValue": "value = data.user.data.email;"
    ```
  - **Safe**:
    ```javascript
    "calculateValue": "if (data.user && data.user.data && data.user.data.email) { value = data.user.data.email; } else { value = ''; }"
    ```

---

### 3. Changes to `default-template.json` Are Not Applying

- **Symptom**: After editing a form's structure or custom logic in `config/bootstrap/default-template.json`, the live application continues to show the old form behavior.

- **Cause**: The application loads form definitions from the `default-template.json` file into the MongoDB database only on the **initial startup** of the Form.io container. Subsequent changes to the file are not automatically synced to the database for existing forms.

- **Solution**: To apply your changes, you must either:
  1.  **Restart the development environment with a clean database**: Run `docker-compose down -v` followed by `docker-compose up`. This will destroy the database volume and force a fresh import of the template.
  2.  **Manually Re-import the Form**: Use the "Import JSON" feature in the Admin Tools section of the application to upload the updated `default-template.json` file. Ensure the "Overwrite existing form/resource" checkbox is ticked.

---

### 4. Form.io Template Error: `TypeError: util.each is not a function`

- **Symptom**: Custom templates (e.g., in EditGrid rows) fail to render, showing an error stack trace in the console referencing `util.each`.

- **Cause**: The `util` object exposed in the Form.io template context does not contain an `each` method. While some Form.io documentation or examples might suggest `util.each`, it is not reliably available in all renderer contexts.

- **Solution**: Use the Lodash `_` object, which is globally available in the template context.

- **Example**:
  - **Broken**: `{% util.each(components, function(component) { %}`
  - **Fixed**: `{% _.each(components, function(component) { %}`

---

### 5. Tabulator Filter Error: "No such editor found: undefined"

- **Symptom**: Tabulator fails to initialize or renders incorrectly, logging "Filter Error - Cannot build header filter, No such editor found: undefined".

- **Cause**: The `headerFilter` property in a column definition is set to `undefined`, `null`, or the string literal `"undefined"` (often a result of imperfect serialization/sanitization of form settings). Tabulator expects a valid editor type string (e.g., "input", "select") or for the property to be omitted entirely.

- **Solution**: Ensure strict sanitization of column definitions before passing them to the Tabulator constructor. Remove any keys where the value is not a valid string or boolean.

