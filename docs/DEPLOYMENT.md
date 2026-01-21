
 # Deployment Guide
 
 ## 📌 Overview
 
 This repository deploys as:
 - **SPA**: static files served by **Caddy**
 - **API**: **Form.io Community Edition** behind Caddy reverse proxy
 - **DB**: MongoDB
 
 This project currently prioritizes **production stability** over portability.
 
 ---
 
 ## ✅ Prerequisites
 
 - **Docker** + **Docker Compose**
 - A `.env` file (see `.env.example`)
 - DNS for your domains pointing to the server (production/staging)
 
 ---
 
 ## 🔒 The “Hardcoded Config” Production Pattern
 
 **Status**: Active
 
 During production bring-up we found that runtime substitution (especially in Caddy and frontend config) created failure modes that were hard to diagnose (empty vars, template substitution pitfalls, caching).
 
 In production we intentionally hardcode values in a few places to reduce risk:
 - `Caddyfile`
 - `scripts/deploy-production.sh` (generates `app/config.js`)
 - `app/js/config.js` (fallbacks)
 - `formio-config.json.template` (`trust proxy` is fixed)
 
 If you change domains or ACME email, update those files.
 
 ---
 
 ## 🚀 Production Deployment (“Tarball Push”)
 
 Production deploys do **not** use `git pull` on the server.
 
 ### 1) On your laptop
 
 - Ensure your local checkout is exactly what you want deployed.
 - Run:
 
 ```bash
 ./scripts/deploy-production.sh /path/to/your-ssh-key.pem
 ```
 
 What it does (high level):
 - Creates a tarball of the current directory (excluding `.env`, `.git`, etc.)
 - Uploads it to the server
 - Extracts it into the app directory
 - Regenerates Form.io config (from server `.env`)
 - Generates `app/config.js` for the SPA (hardcoded production URLs)
 - Restarts Docker Compose
 
 ### 2) On the server
 
 The script handles the remote steps for you.
 
 Useful validation commands:
 
 ```bash
 docker-compose ps
 docker-compose logs --tail=200 caddy
 docker-compose logs --tail=200 formio
 ```
 
 ---
 
 ## 🧩 Configuration Management
 
 ### `.env`
 
 - Local dev uses `.env` for secrets and local URLs.
 - Production keeps its own `.env` on the server.
 - The production deploy script explicitly **does not** upload your local `.env`.
 
 ### Backend config generation
 
 Backend configuration is generated via:
 
 ```bash
 ./scripts/generate-formio-config.sh production
 ```
 
 This produces `config/env/production.json` from `formio-config.json.template`.
 
 ---
 
 ## 💻 Local Development
 
 ### Setup
 
 ```bash
 ./scripts/setup-environment.sh dev
 docker-compose -f docker-compose.dev.yml up -d --build
 ```
 
 Default URLs:
 - SPA: `http://localhost:3000`
 - API: `http://localhost:3001`
 
 ### ARM64 (Apple Silicon) note
 
 Form.io Community Edition may require AMD64 emulation.
 If you see image/platform errors on ARM64, ensure the compose config uses:
 - `platform: linux/amd64` for the Form.io service
 
 ---
 
 ## 🧪 Staging
 
 Staging is intended for pre-production testing. See:
 - `STAGING.md`
 
 ---
 
 ## 🔧 Troubleshooting
 
 ### Caddy won’t start
 
 - Check `docker-compose logs caddy`
 - Validate the `Caddyfile` syntax
 - Confirm ports 80/443 are reachable and not already bound
 
 ### SPA points at `localhost`
 
 In production this usually means:
 - The generated `app/config.js` didn’t update as expected
 - The browser cached an old config
 
 Checks:
 - Confirm `app/config.js` exists on the server inside the deployed directory
 - Confirm `app/index.html` includes the `/config.js` loader
 - Hard refresh or clear cache if needed
 
 ### Form.io container crash loop
 
 - Check `docker-compose logs formio`
 - Validate the generated config JSON in `config/env/production.json`
 - Confirm MongoDB credentials match the server `.env`
 
 ---
 
 ## 📚 Related Docs
 
 - `INFRASTRUCTURE.md`
 - `SECURITY.md`
 - `STAGING.md`
 - `COMMON_ISSUES.md`

