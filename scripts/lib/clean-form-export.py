#!/usr/bin/env python3
"""
clean-form-export.py — Strip Form.io server-export noise from a single-form export
and merge it cleanly into the matching form_templates/*.json file.

Usage:
    python3 scripts/lib/clean-form-export.py <raw-export.json> <template-file.json> [--dry-run]

    raw-export.json   : Output of:  curl -sf -H "x-token: $API_KEYS" http://localhost:3001/<formpath>
    template-file.json: Existing clean template, e.g. config/bootstrap/form_templates/organization.json
    --dry-run         : Print diff only, do not write

The script:
  1. Strips server-injected IDs and runtime-default fields from all components recursively.
  2. Normalises access/submissionAccess back to role-name strings (exports use {_id, type} objects).
  3. Preserves the 'settings' block from the EXISTING template (groupPermissions, tabulatorList,
     ui, revisionTracking are never stored server-side).
  4. Keeps only the canonical top-level fields.
  5. Prints a summary, then writes (or diffs with --dry-run).
"""

import json
import sys
import copy
import difflib
import os

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Top-level fields to keep from the export (everything else is dropped)
KEEP_TOP_LEVEL = {
    "title", "name", "path", "type", "display", "tags",
    "access", "submissionAccess", "settings", "components",
}

# Component-level scalar fields that are always stripped
STRIP_ALWAYS = {
    "_id", "id", "created", "modified", "owner", "project",
    "persistent", "protected", "dbIndex", "encrypted",
    "autofocus", "tabindex", "prefix", "suffix", "unique",
    "refreshOn", "redrawOn", "dataGridLabel",
    "addAnotherPosition", "removePlacement",
    "showCharCount", "showWordCount",
    "disableOnInvalid", "errorLabel",
    "modalEdit", "widget",  # widget is re-added only when non-trivial (see below)
}

# (field, value) pairs: strip the field only when its value equals the given default
STRIP_IF_DEFAULT = [
    ("hideLabel", False),
    ("clearOnHide", True),
    ("multiple", False),
    ("lazyLoad", False),
    ("block", False),
    ("labelPosition", "top"),
    ("size", "md"),
    ("theme", "default"),
    ("inputType", "text"),
    ("spellcheck", True),
    ("case", ""),
    ("truncateMultipleSpaces", False),
    ("kickbox", {"enabled": False}),
    ("authenticate", False),
    ("addResource", False),  # only strip when false; keep when true
    ("allowCalculateOverride", False),
    ("calculateServer", False),
    ("showFullResults", False),
]

# Known role names for access normalisation (order matters for index-based fallback)
KNOWN_ROLES = ["anonymous", "authenticated", "staff", "management", "administrator"]

# Placeholder patterns to warn about in component fields
PLACEHOLDER_PATTERNS = ["_PLACEHOLDER", "DEPT_PLACEHOLDER"]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

stripped_counts: dict[str, int] = {}


def _count(field: str):
    stripped_counts[field] = stripped_counts.get(field, 0) + 1


def is_server_id(val) -> bool:
    """Return True if val looks like a 24-char hex MongoDB ObjectId."""
    return isinstance(val, str) and len(val) == 24 and all(c in "0123456789abcdef" for c in val.lower())


def normalise_widget(widget):
    """Keep widget only if it carries non-trivial content."""
    if widget is None:
        return None
    if isinstance(widget, str):
        # e.g. "choicesjs" is handled via the component's own type field
        return None
    if isinstance(widget, dict):
        trivial_keys = {"type", "mode"}
        non_trivial = {k: v for k, v in widget.items() if k not in trivial_keys}
        if not non_trivial:
            return None
        return widget
    return widget


def normalise_access(access_list):
    """
    Convert server-export access format to our clean format.

    Server export uses:
        [{"type": "read_all", "roles": ["<24-hex-id>", ...]}, ...]
    OR the old individual-entry format:
        [{"_id": "...", "type": "read_all"}, ...]  (one entry per role per type)

    Our format:
        [{"type": "read_all", "roles": ["authenticated", "staff", ...]}, ...]
    """
    if not isinstance(access_list, list):
        return access_list

    # Detect old individual-entry format (has _id at top level of each entry)
    if access_list and "_id" in access_list[0]:
        # Group by type; roles are identified only by position/order heuristic — warn
        by_type: dict = {}
        for entry in access_list:
            t = entry.get("type", "")
            if t not in by_type:
                by_type[t] = []
            # Can't recover role names from IDs alone without a lookup table
            # Just carry through as-is and let the user fix if needed
            by_type[t].append(entry.get("role") or entry.get("_id") or "unknown")
        result = []
        for t, roles in by_type.items():
            result.append({"type": t, "roles": roles})
        print(
            "  ⚠️  WARNING: access/submissionAccess contains _id-keyed entries. "
            "Role names could not be recovered automatically. "
            "Please verify access/submissionAccess in the output file.",
            file=sys.stderr,
        )
        return result

    # New format: roles array may contain 24-hex IDs → warn but pass through
    for entry in access_list:
        if isinstance(entry, dict) and "roles" in entry:
            bad = [r for r in entry["roles"] if is_server_id(r)]
            if bad:
                print(
                    f"  ⚠️  WARNING: access type '{entry.get('type')}' contains resolved role IDs "
                    f"({bad}). These should be role names like 'authenticated'. "
                    "Keeping existing template's access block instead.",
                    file=sys.stderr,
                )
                return None  # signal caller to fall back to existing template

    return access_list


def clean_component(comp: dict) -> dict:
    """Recursively strip noise from a single component object."""
    if not isinstance(comp, dict):
        return comp

    out = {}

    for key, val in comp.items():
        # Always-strip fields
        if key in STRIP_ALWAYS:
            _count(key)
            continue

        # Strip-if-default fields
        skip = False
        for strip_key, strip_val in STRIP_IF_DEFAULT:
            if key == strip_key and val == strip_val:
                _count(key)
                skip = True
                break
        if skip:
            continue

        # Handle widget specially
        if key == "widget":
            cleaned_widget = normalise_widget(val)
            if cleaned_widget is None:
                _count("widget")
                continue
            out[key] = cleaned_widget
            continue

        # Recurse into nested component arrays
        if key == "components" and isinstance(val, list):
            out[key] = [clean_component(c) for c in val]
            continue

        # Recurse into columns (columns component)
        if key == "columns" and isinstance(val, list):
            out[key] = [
                {**col, "components": [clean_component(c) for c in col.get("components", [])]}
                if isinstance(col, dict) else col
                for col in val
            ]
            continue

        # Recurse into rows (table component)
        if key == "rows" and isinstance(val, list):
            out[key] = [
                [clean_component(cell) if isinstance(cell, dict) else cell for cell in row]
                if isinstance(row, list) else row
                for row in val
            ]
            continue

        # Warn if a component field value looks like a resolved ObjectId
        if isinstance(val, str) and is_server_id(val) and key not in ("key", "type", "action"):
            print(
                f"  ⚠️  WARNING: component '{comp.get('key', '?')}' field '{key}' "
                f"looks like a resolved server ID: {val}",
                file=sys.stderr,
            )

        out[key] = val

    return out


def check_placeholders(template: dict):
    """Warn if any placeholder strings from the existing template would be overwritten."""
    raw = json.dumps(template)
    for pat in PLACEHOLDER_PATTERNS:
        if pat in raw:
            print(
                f"  ⚠️  WARNING: Placeholder pattern '{pat}' found in cleaned export. "
                "This should not happen — verify groupPermissions were preserved from existing template.",
                file=sys.stderr,
            )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = [a for a in sys.argv[1:] if a.startswith("--")]
    dry_run = "--dry-run" in flags

    if len(args) < 2:
        print("Usage: clean-form-export.py <raw-export.json> <template-file.json> [--dry-run]")
        sys.exit(1)

    raw_path, template_path = args[0], args[1]

    print(f"\n{'='*60}")
    print(f"  clean-form-export.py")
    print(f"  Input : {raw_path}")
    print(f"  Output: {template_path}")
    print(f"  Mode  : {'DRY RUN (no write)' if dry_run else 'WRITE'}")
    print(f"{'='*60}\n")

    # Load raw export
    with open(raw_path, "r") as f:
        raw = json.load(f)

    # Load existing template (for settings preservation + access fallback)
    with open(template_path, "r") as f:
        existing = json.load(f)

    # ---- 1. Keep only canonical top-level fields ----
    cleaned = {k: copy.deepcopy(v) for k, v in raw.items() if k in KEEP_TOP_LEVEL}

    dropped_top = [k for k in raw if k not in KEEP_TOP_LEVEL]
    if dropped_top:
        print(f"Dropped top-level fields: {dropped_top}")

    # ---- 2. Normalise access / submissionAccess ----
    for acc_field in ("access", "submissionAccess"):
        if acc_field in cleaned:
            normalised = normalise_access(cleaned[acc_field])
            if normalised is None:
                # Fall back to existing template's access
                cleaned[acc_field] = existing.get(acc_field, cleaned[acc_field])
                print(f"  ↩  {acc_field}: using existing template value (resolved IDs detected)")
            else:
                cleaned[acc_field] = normalised

    # ---- 3. Always preserve settings from existing template ----
    if "settings" in existing:
        cleaned["settings"] = copy.deepcopy(existing["settings"])
        print("  ✓  settings: preserved from existing template")
    elif "settings" in cleaned:
        # No existing settings — keep from export but warn
        print("  ℹ️  settings: no existing template settings found; keeping export value")

    # ---- 4. Clean components recursively ----
    if "components" in cleaned and isinstance(cleaned["components"], list):
        cleaned["components"] = [clean_component(c) for c in cleaned["components"]]

    # ---- 5. Check for stray placeholders ----
    check_placeholders(cleaned)

    # ---- 6. Summary of stripped fields ----
    if stripped_counts:
        print(f"\nStripped component fields ({sum(stripped_counts.values())} total):")
        for field, count in sorted(stripped_counts.items(), key=lambda x: -x[1]):
            print(f"    {field}: {count}")

    # ---- 7. Diff / write ----
    cleaned_json = json.dumps(cleaned, indent=2, ensure_ascii=False) + "\n"
    existing_json = json.dumps(existing, indent=2, ensure_ascii=False) + "\n"

    diff_lines = list(difflib.unified_diff(
        existing_json.splitlines(keepends=True),
        cleaned_json.splitlines(keepends=True),
        fromfile=f"existing/{os.path.basename(template_path)}",
        tofile=f"cleaned/{os.path.basename(template_path)}",
        n=3,
    ))

    if not diff_lines:
        print("\n✅ No changes detected — template is already up to date.")
        return

    print(f"\n--- Diff ({len(diff_lines)} lines) ---")
    for line in diff_lines:
        sys.stdout.write(line)
    print()

    if dry_run:
        print("DRY RUN: no file written.")
    else:
        with open(template_path, "w") as f:
            f.write(cleaned_json)
        print(f"✅ Written to {template_path}")


if __name__ == "__main__":
    main()
