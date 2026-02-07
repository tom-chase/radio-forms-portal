# Documentation Hub

## 📚 Repository Documentation

This directory contains comprehensive documentation for the Radio Forms Portal project.

### **📋 Quick Navigation**

| Document | Purpose | Audience |
|----------|---------|----------|
| **[INFRASTRUCTURE.md](INFRASTRUCTURE.md)** | AWS setup, networking, scaling | DevOps, System Admins |
| **[SECURITY.md](SECURITY.md)** | Security configuration, hardening | DevOps, Security Team |
| **[STAGING.md](STAGING.md)** | Staging environment setup and workflow | Developers, QA Team |
| **[DEPLOYMENT.md](DEPLOYMENT.md)** | Deployment procedures, workflows, ARM64 setup | Developers, DevOps |
| **[../README.md](../README.md)** | Project overview, getting started, ARM64 compatibility | All Contributors |
| **[../scripts/README.md](../scripts/README.md)** | Script documentation | Developers, DevOps |
| **[../AGENT.md](../AGENT.md)** | AI agent orientation, quick reference | AI Agents, Developers |
| **[CASCADE_INTEGRATION.md](CASCADE_INTEGRATION.md)** | How Windsurf Cascade is used in this project | Developers, AI Agents |

---

## 🏗️ Infrastructure Documentation

### **[INFRASTRUCTURE.md](INFRASTRUCTURE.md)**
Complete AWS production infrastructure documentation including:

- **Current Setup**: Instance types, networking, storage
- **Security Groups**: Inbound/outbound rules, IAM roles
- **DNS Configuration**: Route 53 records, SSL setup
- **Monitoring**: CloudWatch alarms, backup strategies
- **Scaling Plans**: Growth phases, cost optimization
- **Maintenance Procedures**: Daily, weekly, monthly tasks
- **Incident Response**: Severity levels, response procedures

**Key Sections:**
- Production server specifications (t3.large recommendation)
- Security group configuration with least privilege
- Cost management and optimization strategies
- Backup and disaster recovery procedures

---

## 🔐 Security Documentation

### **[SECURITY.md](SECURITY.md)**
Comprehensive security documentation covering:

- **AWS Security**: Security groups, IAM roles, VPC design
- **Server Hardening**: OS security, SSH configuration, firewalls
- **Application Security**: Form.io config, database access, CORS
- **Access Control**: SSH keys, user roles, authentication
- **Monitoring**: Intrusion detection, log analysis, vulnerability management
- **Incident Response**: Security incident procedures and escalation

**Key Features:**
- Security checklists for pre/post-deployment
- Incident response procedures by severity level
- Configuration examples and best practices
- Compliance guidelines and resources

---

## 💻 ARM64 Development Documentation

### **[DEPLOYMENT.md](DEPLOYMENT.md) - ARM64 Section**
Comprehensive ARM64 development setup guide including:

- **ARM64 Compatibility**: AMD64 emulation for Form.io
- **Development Environment**: Docker Compose configuration
- **Bootstrap Integration**: Template mounting and configuration
- **ES6 Module Setup**: Module loading requirements
- **Troubleshooting**: Common ARM64 issues and solutions

### **[../AGENT.md](../AGENT.md) - ARM64 Section**
AI agent guidelines for ARM64 development:

- **Development Patterns**: ARM64-specific coding practices
- **Configuration Management**: Environment variable handling
- **Debugging Strategies**: ARM64-specific troubleshooting
- **Best Practices**: Clean build workflows and Git hygiene

**Key ARM64 Features:**
- Full Apple Silicon support
- Node.js 20+ compatibility
- AMD64 emulation for Form.io compatibility
- Optimized development workflow

---

## 🚀 Deployment Documentation

### **[DEPLOYMENT.md](DEPLOYMENT.md)**
Step-by-step deployment guides and workflows:

- **Environment Setup**: Development, staging, production
- **Script Usage**: All deployment scripts documented
- **Configuration**: Environment variables, Form.io settings
- **Troubleshooting**: Common issues and solutions
- **Best Practices**: Git workflow, testing procedures

**Integration with Scripts:**
- `deploy-dev.sh` - Local development setup
- `deploy-production.sh` - Production deployment
- `deploy-formio.sh` - Form.io project promotion
- `backup.sh` - Automated backup procedures
- `health-check.sh` - System monitoring

---

## 📊 Documentation Structure

### **For Different Audiences**

#### **👨‍💻 Developers**
```bash
# Getting Started:
../README.md                    # Project overview and setup
../scripts/README.md             # Script usage guide

# Development Workflow:
docs/DEPLOYMENT.md              # Development procedures
docs/STAGING.md                 # Staging environment setup
docs/INFRASTRUCTURE.md          # Production environment
```

#### **🔧 DevOps Engineers**
```bash
# Infrastructure:
docs/INFRASTRUCTURE.md          # Complete AWS setup
docs/SECURITY.md                # Security configuration

# Deployment:
docs/DEPLOYMENT.md              # Deployment automation
docs/STAGING.md                 # Staging setup and workflow
../scripts/README.md             # Script documentation
```

#### **🧪 QA Team**
```bash
# Testing:
docs/STAGING.md                 # Staging environment setup
docs/DEPLOYMENT.md              # Deployment procedures
../scripts/health-check.sh      # Health monitoring
```

#### **🛡️ Security Teams**
```bash
# Security:
docs/SECURITY.md                # Comprehensive security guide
docs/DEPLOYMENT.md              # Security in deployment
../.env.example                 # Security configuration
```

#### **👨‍💼 System Administrators**
```bash
# Operations:
docs/INFRASTRUCTURE.md          # Production setup
docs/SECURITY.md                # Security procedures
docs/STAGING.md                 # Staging environment
../scripts/backup.sh              # Backup procedures
../scripts/health-check.sh        # Monitoring
```

---

## 🔄 Documentation Maintenance

### **Keeping Documentation Current**

#### **When to Update**
- **Infrastructure Changes**: New AWS resources, scaling events
- **Security Updates**: New threats, policy changes, incidents
- **Deployment Changes**: New scripts, workflow updates
- **Quarterly Reviews**: Comprehensive accuracy check

#### **Update Process**
```bash
1. Update relevant documentation files
2. Update table of contents and cross-references
3. Update "Last Updated" timestamps
4. Review for accuracy and completeness
5. Commit changes with descriptive messages
```

### **Documentation Standards**

#### **Formatting Guidelines**
- Use Markdown for all documentation
- Include code blocks for commands and configurations
- Use tables for structured information
- Include navigation links between documents
- Add timestamps for last updates

#### **Content Guidelines**
- Provide step-by-step procedures
- Include examples and templates
- Add troubleshooting sections
- Reference external documentation
- Include checklists for critical procedures

---

## 🤖 AI Agent Integration

This project uses **Windsurf Cascade** for AI-assisted development. Agent-facing guidance is separated from human documentation:

- **Rules**: `.windsurf/rules/` — always-on constraints for Cascade
- **Workflows**: `.windsurf/workflows/` — step-by-step procedures (dev setup, deployments, migrations)
- **AGENT.md**: Quick orientation and memory bank for AI agents

See **[CASCADE_INTEGRATION.md](CASCADE_INTEGRATION.md)** for details on how to maintain this system.

---

**Documentation Hub Last Updated**: 2026-02-07
**Maintainer**: tomchase@duck.com
