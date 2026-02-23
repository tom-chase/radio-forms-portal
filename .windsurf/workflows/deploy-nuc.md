---
description: Deploy application code to NUC production server via tarball push
---

# Deploy to NUC Production Server

Pushes the SPA, scripts, and Docker configuration to the ASUS NUC 14 N150 acting as the primary production server. Uses the same `deploy-production.sh` script as EC2 — target is overridden via environment variables. Does **not** update Form.io project structure — see `deploy-production-formio` workflow for that.

## Preconditions
- On `main` branch with clean working tree
- WireGuard VPN running on the NUC (port 51820 UDP forwarded on router)
- WireGuard peer config installed on your Mac (`wg show` shows handshake with NUC)
- NUC has SSH key-based auth configured for the `admin` user
- Server `.env` on the NUC has `SPA_DOMAIN`, `API_DOMAIN`, and all required variables set
- Server `Caddyfile` exists on the NUC with production domains (excluded from tarball — must be created manually once)
- Docker and docker-compose installed on NUC

## NUC-Specific Notes

### Accessing the NUC via WireGuard
Port 22 is not exposed publicly. SSH access goes through the WireGuard VPN tunnel:
```bash
# Bring up the WireGuard interface on your Mac (if not already up):
sudo wg-quick up wg0

# The NUC is reachable at its WireGuard VPN IP:
ssh admin@10.8.0.1

# Confirm tunnel is active:
sudo wg show
# Look for: latest handshake: X seconds/minutes ago
```

### NAT Loopback Workaround (Local Access)
Verizon CR1000A routers do not support NAT hairpinning. When on the local network, add entries to `/etc/hosts` on your Mac:
```
192.168.1.50  forms.your-domain.com
192.168.1.50  api.forms.your-domain.com
```
Remove these entries when testing from outside the local network.

When outside the local network, WireGuard tunnels your SSH connection — no `/etc/hosts` changes needed for SSH access.

### S3 Backup Credentials
Unlike EC2 (which uses an IAM role), the NUC requires explicit AWS credentials in `.env`:
```
BACKUPS_AWS_ACCESS_KEY_ID=your-key-id
BACKUPS_AWS_SECRET_ACCESS_KEY=your-secret-key
```
Alternatively, use the local USB backup script (`deployment/nuc-local-backup.sh`) instead of or in addition to S3.

## Deployment Steps

### 1. Set NUC target and deploy

```bash
# Ensure WireGuard tunnel is up first:
sudo wg-quick up wg0

export PROD_SERVER="10.8.0.1"          # NUC's WireGuard VPN IP
export PROD_USER="admin"
export PROD_APP_DIR="/home/admin/radio-forms-portal"
export PROD_BACKUP_DIR="/home/admin/backups"

./scripts/deploy-production.sh /path/to/your-ssh-key
```

The script will:
- Package the app (excluding `.env`, `Caddyfile`, `app/config.js`, `config/env/production.json`)
- SCP the tarball to the NUC via WireGuard
- Extract and regenerate `config/env/production.json` and `app/config.js` from the NUC's `.env`
- Restart Docker Compose
- Run `post-bootstrap.js` (resolves group permission IDs, syncs form schemas)

### 2. Verify services

SSH into the NUC via WireGuard:
```bash
ssh admin@10.8.0.1
cd /home/admin/radio-forms-portal
docker-compose ps
docker-compose logs --tail=200 caddy
docker-compose logs --tail=200 formio
```

### 3. Run migrations (if this release includes migration scripts)

```bash
docker exec formio node /app/run-migrations.js
```

### 4. Smoke test

```bash
# From outside the local network (or with /etc/hosts removed):
curl -I https://forms.your-domain.com

# Verify:
# - SPA loads and points at correct API
# - Tabulator/DayPilot list views render
# - Create/edit/view flow works on a primary form
# - Badge counts update correctly
```

## Post-Deployment Verification

### Check SSL certificates
```bash
docker-compose logs caddy | grep -i "certificate\|tls\|acme"
```

### Check database health
```bash
docker exec mongo mongosh --eval "db.adminCommand('ping')"
```

### Verify post-bootstrap ran
```bash
tail -50 /home/admin/radio-forms-portal/logs/post-bootstrap.log
```

## Troubleshooting

### Caddy won't obtain certificate
- Verify DNS A records point to the NUC's **public** IP (not 192.168.1.50)
- Confirm ports 80 and 443 are forwarded on the Verizon CR1000A to 192.168.1.50
- Check `Caddyfile` has correct domains and ACME email

### SPA points at wrong API
- Verify `app/config.js` was regenerated: `cat /home/admin/radio-forms-portal/app/config.js`
- Hard refresh browser (Cmd+Shift+R)

### Form.io container crash loop
- Check MongoDB credentials in `.env` match `MONGO_ROOT_USERNAME`/`MONGO_ROOT_PASSWORD`
- Verify `config/env/production.json` was generated: `cat config/env/production.json`
- Review logs: `docker-compose logs formio`

### WireGuard tunnel not reachable
- On your Mac: `sudo wg show` — confirm a recent handshake timestamp
- If no handshake: `sudo wg-quick down wg0 && sudo wg-quick up wg0`
- Verify port 51820 UDP is forwarded on the router to 192.168.1.50
- Fallback (local network only): `ssh admin@192.168.1.50`

### post-bootstrap fails
- Check `logs/post-bootstrap.log` on the NUC for the specific error
- Common cause: Form.io container not yet healthy when script runs — wait 30s and re-run:
  ```bash
  docker exec formio node /app/post-bootstrap.js
  ```

## Related

- `deploy-production-formio` — Promote Form.io project structure (forms, resources, roles) to NUC
- `deploy-production-code` — EC2 equivalent of this workflow
- `docs/NUC_DEPLOYMENT.md` — Full NUC setup and initial deployment guide (includes WireGuard setup)
