# Windsurf Cascade Integration

This project uses **Windsurf Cascade** for AI-assisted development. This document explains how agent-facing guidance is organized and how to maintain it.

## Architecture

| Artifact | Location | Audience | Content |
|----------|----------|----------|---------|
| **Rules** | `.windsurf/rules/*.md` | Cascade (always-on) | Hard constraints: MUST/MUST NOT |
| **Workflows** | `.windsurf/workflows/*.md` | Cascade (on-demand, via `/slash-command`) | Step-by-step procedures with commands |
| **Memories** | Cascade memory DB | Cascade (auto-retrieved) | Architectural patterns, implementation decisions |
| **AGENT.md** | repo root | Cascade (orientation) | Slim quick-reference + memory bank |
| **docs/** | `docs/` | Humans | Architecture rationale, specs, checklists |

## Single Source of Truth Policy

- **Workflows** own "how to do X" (command sequences, preconditions, validation steps).
- **docs/** owns "why X exists" (architecture decisions, rationale, detailed guides).
- **AGENT.md** owns quick orientation and memory bank (domains, credentials structure).
- No verbatim duplication between these. Use links instead.

## Current Rules

| File | Purpose |
|------|---------|
| `project-constraints.md` | Tech stack invariants, no git push, no build step |
| `production-stability.md` | Hardcoded config pattern, deploy exclusions |
| `formio-patterns.md` | formioRequest() usage, dual-channel deployment, template management |

## Current Workflows

| Slash Command | File | Purpose |
|---------------|------|---------|
| `/local-dev-setup` | `local-dev-setup.md` | Set up or restart local dev environment |
| `/sync-form-template` | `sync-form-template.md` | Non-destructive schema sync to running dev |
| `/deploy-production-code` | `deploy-production-code.md` | Tarball push to production |
| `/deploy-production-formio` | `deploy-production-formio.md` | Form.io project promotion to production |
| `/create-migration` | `create-migration.md` | Create and test a new migration |
| `/provision-infrastructure` | `provision-infrastructure.md` | AWS CloudFormation deployment |

## How to Update

### Adding a new rule
1. Create `.windsurf/rules/<name>.md` with YAML frontmatter: `trigger: always`.
2. Write short MUST/MUST NOT constraints with a "Why" line.

### Adding a new workflow
1. Create `.windsurf/workflows/<name>.md` with YAML frontmatter: `description: <short description>`.
2. Include: preconditions, numbered steps with commands, validation steps.
3. The filename (without `.md`) becomes the `/slash-command`.

### When a script changes
1. Update the relevant workflow first.
2. Update `docs/` only if the "why" or architecture changed.
3. Update `AGENT.md` only if the quick-reference pointers changed.

### When to use memories vs rules
- **Memories**: Implementation patterns, architectural decisions, one-time context (auto-retrieved by Cascade when relevant).
- **Rules**: Hard constraints that must always be enforced (loaded on every conversation).
