# Scripts Directory

This directory contains all deployment and maintenance scripts for the open-source Radio Forms Portal project, with comprehensive ARM64 support.

## 🚀 Quick Reference

### Environment Setup (ARM64 Optimized)
```bash
./scripts/setup-environment.sh [dev|staging|production] # Initialize environment (ARM64-optimized for dev)
./scripts/generate-formio-config.sh [env]               # Generate Form.io config
./scripts/generate-secrets.sh                            # Generate secure secrets
./scripts/validate-dev.sh                                # Validate local development setup
```

### Deployment
```bash
./scripts/deploy-dev.sh [branch]                         # Deploy to dev server
./scripts/deploy-production.sh [path-to-ssh-key]         # Deploy to production (tarball push)
./scripts/squash-branch.sh [branch] [message]             # Clean up commits
```

### Maintenance
```bash
./scripts/health-check.sh [env]                          # System health check
./scripts/backup.sh [env]                                # Create backup
./scripts/cleanup.sh [env] [--deep|--reset-data]         # Clean up system
./scripts/update-dependencies.sh [service]                # Update Docker images
./scripts/build-formio.sh                                # Build Form.io for ARM64
```

## 📋 Detailed Descriptions

### Environment Scripts

#### `setup-environment.sh`
**Environment Setup** - Unified setup for all environments with ARM64 optimization.
- Detects ARM64 architecture and enables optimized development workflow
- Creates `.env` from template if missing
- Generates Form.io configuration and secure secrets
- For ARM64 dev: builds Form.io from source, starts services, validates setup
- For staging/production: standard environment initialization
- Creates necessary directories and sets proper permissions

**Usage:** `./scripts/setup-environment.sh dev` (ARM64-optimized on Apple Silicon)

#### `generate-formio-config.sh`
Generates Form.io configuration files from templates.
- Sources environment variables
- Applies environment-specific settings
- Creates `config/env/production.json`
- Adds CORS, email, and project settings

**Usage:** `./scripts/generate-formio-config.sh staging`

#### `generate-secrets.sh`
Generates cryptographically secure secrets.
- MongoDB secret key
- JWT signing secret
- Formio admin key
- Updates `.env` file safely

**Usage:** `./scripts/generate-secrets.sh`

#### `validate-dev.sh`
Validates local development environment setup.
- Checks Docker and container status
- Verifies port accessibility (3000, 3001, 27017)
- Validates environment configuration
- Provides troubleshooting guidance
- Shows access URLs when setup is complete

**Usage:** `./scripts/validate-dev.sh`

### Deployment Scripts

#### `deploy-dev.sh`
Deploys branches to development server for testing.
- Pushes branch to remote
- SSH deployment with safety checks
- Docker compose restart
- Health verification

**Configuration:** Update `DEV_SERVER`, `DEV_USER`, `APP_DIR` in script

#### `deploy-production.sh`
Production deployment with full safety measures.
- Packages and uploads the current local directory (tarball push)
- Extracts on the server and restarts Docker Compose
- Regenerates backend configuration and frontend `app/config.js`

**Configuration:** You can override `PROD_SERVER`, `PROD_USER`, `PROD_APP_DIR`, and `PROD_BACKUP_DIR` via environment variables (defaults are set in the script).

#### `squash-branch.sh`
Cleans up git history before creating PRs.
- Squashes all commits into one
- Generates meaningful commit message
- Force-pushes cleaned branch

**Usage:** `./scripts/squash-branch.sh feature/new-form "feat: add responsive form validation"`

### Form Management Scripts

#### `sync-form-templates.sh`
**Form Template Sync** - Syncs selected form templates from `form_templates/` into `default-template.json`.
- Selective form syncing (comma-separated list)
- Automatic backup of default-template.json
- JSON validation and error handling
- Shows what changed during sync
- Supports both new and existing forms

**Usage:** 
```bash
./scripts/sync-form-templates.sh book                    # Sync book form only
./scripts/sync-form-templates.sh book,tasks,contacts      # Sync multiple forms
```

**Integration:** Automatically called by `deploy-dev.sh` with the forms specified as the second argument.

#### `deploy-dev.sh` (Updated)
Enhanced development deployment with form template sync integration.
- **New Parameter**: `[forms-to-sync]` - Comma-separated list of forms to sync
- **Automatic Sync**: Runs form template sync before starting services
- **Selective Development**: Only sync forms you're actively working on

**Usage:**
```bash
./scripts/deploy-dev.sh                    # Current branch, sync book form only
./scripts/deploy-dev.sh main               # Main branch, sync book form only  
./scripts/deploy-dev.sh feature-branch book,tasks  # Feature branch, sync book and tasks forms
```

**Workflow:**
1. Make changes to form templates in `config/bootstrap/form_templates/`
2. Run deploy-dev.sh with forms you want to sync
3. Post-bootstrap automatically applies schema changes
4. Test in UI at localhost:3000

### Maintenance Scripts

#### `health-check.sh`
Comprehensive system health monitoring.
- Docker container status
- Application endpoint availability
- Database connectivity
- Disk and memory usage
- Recent error log analysis

**Usage:** `./scripts/health-check.sh production`

#### `backup.sh`
Automated backup system.
- MongoDB data volumes
- Configuration files
- Application code
- Backup manifest generation
- Automatic cleanup of old backups

**Usage:** `./scripts/backup.sh production`

#### `cleanup.sh`
System cleanup and maintenance.
- Stop and remove containers
- Clean Docker images
- Remove old logs (7+ days)
- Delete temporary files
- Optional deep cleaning with `--deep`
- Optional data reset with `--reset-data`

**Usage:** `./scripts/cleanup.sh production --deep`

#### `update-dependencies.sh`
Updates Docker images to latest versions.
- Form.io (latest stable)
- MongoDB (latest 6.x)
- Caddy (latest)
- Creates backup before changes

**Usage:** `./scripts/update-dependencies.sh all`

#### `build-formio.sh`
**ARM64 Form.io Build** - Builds Form.io from source for native ARM64 compatibility.
- Checks Docker prerequisites
- Builds Form.io service from source (4.6.x branch)
- Provides progress indication and troubleshooting
- Optimized for ARM64 MacBook Pro performance
- Takes 10-15 minutes on first build

**Usage:** `./scripts/build-formio.sh`

## 🔧 Configuration

### Server Configuration

Update these values in deployment scripts:

**Development Server (`deploy-dev.sh`):**
```bash
DEV_SERVER="your-dev-server.com"
DEV_USER="admin"
APP_DIR="/home/admin/radio-forms-portal"
```

**Production Server (`deploy-production.sh`):**
```bash
PROD_SERVER="your-production-server.com"
PROD_USER="admin"
PROD_APP_DIR="/home/admin/radio-forms-portal"
PROD_BACKUP_DIR="/home/admin/backups"
```

### Environment Variables

Key variables in `.env`:

```bash
# Database
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=secure_password
MONGO_SECRET=random_32_char_key

# Form.io
FORMIO_ROOT_EMAIL=admin@your-domain.com
FORMIO_ROOT_PASSWORD=secure_password
FORMIO_DOMAIN=https://api.forms.your-domain.com
JWT_SECRET=random_32_char_key

# Servers
PROD_SERVER=your-production-server.com
PROD_USER=admin
```

## 🚨 Safety Features

### Production Deployment
- Branch validation (main/master preferred)
- Automatic backup before deployment
- Health checks after deployment
- Rollback instructions in backup manifest

### Backup System
- Comprehensive backup creation
- Automatic cleanup (retention policy)
- Detailed restoration instructions
- Backup manifest with system info

### Health Monitoring
- Multi-layer health checks
- Error log analysis
- Resource usage monitoring
- Environment-specific checks

## 🔄 Workflow Integration

### ARM64 Development Workflow (Apple Silicon)
**Optimized for ARM64 MacBook Pro and other ARM64 architectures:**

1. **Complete Setup**: `setup-environment.sh dev` - Fully automated ARM64-optimized setup
2. **Start Services**: `docker-compose -f docker-compose.dev.yml up -d`
3. **Validate Setup**: `validate-dev.sh` - Verify ARM64-specific configuration
4. **Access Applications**: 
   - SPA: http://localhost:3000
   - Form.io Admin: http://localhost:3001/admin/login
   - Login: admin@dev.local / admin123
5. **Clean Builds**: `docker-compose -f docker-compose.dev.yml down -v && up -d`

**ARM64-Specific Features:**
- AMD64 emulation for Form.io compatibility
- Bootstrap template volume mounting
- ES6 module loading with type="module"
- Node.js 20+ compatibility
- Clean build workflows

### Standard Development Workflow
1. `setup-environment.sh dev` - Initialize (ARM64-optimized on Apple Silicon)
2. Local development with `docker-compose.dev.yml`
3. `deploy-dev.sh feature-branch` - Test on cloud
4. `squash-branch.sh` - Clean up before PR
5. Create PR on GitHub

### Production Workflow
1. PR approved and merged to main
2. `deploy-production.sh /path/to/your-ssh-key.pem` - Deploy
3. `health-check.sh production` - Verify
4. Monitor and maintain

### Maintenance Workflow
1. `health-check.sh` - Regular monitoring
2. `backup.sh` - Regular backups
3. `cleanup.sh` - System maintenance
4. `update-dependencies.sh` - Security updates

## 🛡️ Security

### Secrets Management
- All secrets generated with `generate-secrets.sh`
- Environment variables never committed
- Backup manifests include security warnings

### Access Control
- SSH key authentication required
- Proper file permissions set
- Sudo access only when necessary

### Audit Trail
- All deployments logged
- Backup manifests with timestamps
- Health check results preserved
