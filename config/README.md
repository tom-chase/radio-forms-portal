# Configuration Directory

This directory contains all configuration files for the Radio Forms Portal project.

## 📁 Directory Structure

```
config/
├── env/                   # Environment-specific Form.io configurations
│   ├── default.json        # Default development configuration (in repo)
│   ├── development.json    # Generated from template (ignored)
│   ├── staging.json        # Generated from template (ignored)
│   └── production.json    # Generated from template (ignored)
├── actions/               # Form.io action scripts
│   └── UpdateLatestRoleLogId.js
└── bootstrap/             # Form.io bootstrap templates
    └── default-template.json
```

## 📋 Configuration Files

### `env/` Directory
Contains Form.io Community Edition configuration files for different environments.

**default.json**: 
- Default development configuration included in repository
- Safe for local development
- Contains placeholder secrets that should be changed in production

**Environment-specific files**:
- Generated from `formio-config.json.template` using `scripts/lib/generate-formio-config.sh`
- Contains real environment-specific settings and secrets
- Ignored by Git for security

### `actions/` Directory
Contains Form.io action scripts that extend form functionality.

**UpdateLatestRoleLogId.js**:
- Custom action to track latest role management log entries
- Automatically mounted to Form.io container in development
- Used by role management workflows

### `bootstrap/` Directory
Contains Form.io project bootstrap templates.

**default-template.json**:
- Complete form definitions and project structure
- Automatically loaded during Form.io initialization
- Includes user management, role management, and custom forms

## 🔧 Configuration Generation

### Development Setup
```bash
# Copy default configuration
cp config/env/default.json config/env/development.json

# Or generate from template
./scripts/lib/generate-formio-config.sh development
```

### Production/Staging Setup
```bash
./scripts/lib/generate-formio-config.sh production
./scripts/lib/generate-formio-config.sh staging
```

## 🔒 Security Notes

- **Never commit** environment-specific JSON files with real secrets
- **Always use** `scripts/lib/generate-formio-config.sh` for production environments
- **Change default secrets** in `default.json` for any production use
- **Environment variables** in `.env` file are never committed

## 📚 Related Documentation

- **[DEPLOYMENT.md](../docs/DEPLOYMENT.md)** - Complete deployment guide
- **[../scripts/lib/generate-formio-config.sh](../scripts/lib/generate-formio-config.sh)** - Configuration generation script
- **[../formio-config.json.template](../formio-config.json.template)** - Configuration template
