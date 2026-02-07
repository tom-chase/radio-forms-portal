---
trigger: always_on
---
# Project Constraints

## Tech Stack (Invariants)
- **Backend**: Form.io Community Edition (v4.6.0-rc.4) on Node.js 20+.
- **Database**: MongoDB 6.0.
- **Web Server**: Caddy 2 (automatic HTTPS).
- **Frontend**: Vanilla JS (ES6 Modules) + Bootstrap 5.3 + Tabulator.js + DayPilot Lite.
- **Production OS**: Debian 12 (Bookworm).

## MUST
- Use `platform: linux/amd64` for the Form.io Docker service on ARM64 hosts.
- Serve frontend files raw — no Webpack, Vite, or any build step.
- Keep changes minimal and justified; prefer single-purpose edits.

## MUST NOT
- **Never `git push`** to the remote repository. The user is solely responsible for pushing. Agents may only commit locally.
- Never introduce a frontend bundler or build step without explicit user instruction.
