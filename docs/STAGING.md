# Staging Environment Setup

## 🎯 Staging Server Configuration

### **Server Specifications**
- **Instance**: t3.medium (2 vCPU, 4GB RAM)
- **Storage**: 25GB gp3 SSD
- **Network**: Same VPC as production, different subnet
- **Cost**: ~$66.50/month

### **Purpose & Use Cases**
- **Testing**: QA validation and UAT
- **Integration**: End-to-end testing
- **Performance**: Load testing and optimization
- **Validation**: Pre-production verification
- **Training**: Team training and demos

## 🏗️ AWS Staging Setup

### **EC2 Instance Configuration**
```bash
# Launch Configuration:
AMI: Debian 13 (Trixie)
Instance: t3.medium
Storage: 25GB gp3 SSD
Security Group: RadioFormsStagingSG
IAM Role: RadioFormsEC2Role
SSH Key: Your existing key
Monitoring: Detailed monitoring (optional)
```

### **Security Group: RadioFormsStagingSG**
```bash
# Inbound Rules:
Port 22  (SSH)    → YOUR_IP/32, TEAM_IPS/32
Port 80  (HTTP)    → 0.0.0.0/0
Port 443 (HTTPS)   → 0.0.0.0/0

# Optional: Restrict web access to team only
Port 80/443 → YOUR_IP/32, TEAM_IPS/32
```

### **Network Configuration**
```bash
# VPC: Same as production (radio-forms VPC)
# Subnet: Public subnet (different from production)
# Elastic IP: Assign static IP for DNS
# DNS: Create staging-specific records
```

### **DNS Setup (Route 53)**
```bash
# Staging A Records:
{$STAGING_SPA_DOMAIN}        → A → STAGING_ELASTIC_IP
{$STAGING_API_DOMAIN}    → A → STAGING_ELASTIC_IP
{$STAGING_ADMIN_DOMAIN}  → A → STAGING_ELASTIC_IP
```

## 🔧 Staging Configuration

### **Environment Variables**
```bash
# Staging .env configuration:
FORMIO_DOMAIN=https://{$STAGING_API_DOMAIN}
FORMIO_HOST={$STAGING_API_DOMAIN}
FORMIO_PROTOCOL=https
FORMIO_ALLOWED_ORIGINS_ARRAY=["https://{$STAGING_SPA_DOMAIN}"]

# Backup Settings:
S3_PREFIX=staging/
BACKUP_RETENTION=7

# Debug Settings:
DEBUG=formio:*
LOG_LEVEL=debug
NODE_ENV=staging
```

### **Caddyfile for Staging**
```bash
# Staging Caddyfile (Caddyfile.staging):
{
    email example@your-domain.com
    acme_ca https://acme-staging-v02.api.letsencrypt.org/directory
}

# 1. The Radio Forms Portal (Static SPA)
{$STAGING_SPA_DOMAIN} {
    tls {$EMAIL}

    root * /var/www/html
    file_server
    encode gzip
    
    # Fallback for SPA client-side routing
    try_files {path} /index.html

    log {
        output file /var/log/spa_access.log
        format json
    }
}

# 2. The Form.io API & Admin Portal
{$STAGING_API_DOMAIN} {
    tls {$EMAIL}

    # Proxy all traffic directly to the formio container
    reverse_proxy formio:3001 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }

    log {
        output file /var/log/api_access.log
        format json
    }
}
```

## 🚀 Staging Deployment Pipeline

### **Step 1: Deploy Develop → Staging**
```bash
# From develop branch:
git checkout develop
git pull origin develop

# Deploy to staging:
./scripts/deploy-staging.sh develop

# Generate staging configuration:
./scripts/setup-environment.sh staging

# Start services:
docker-compose up -d --build
```

### **Step 2: Validate Deployment**
```bash
# Health checks:
./scripts/health-check.sh staging

# Manual testing checklist:
□ All forms load correctly
□ Form submissions work
□ File uploads functional
□ User authentication works
□ API endpoints responsive
□ SSL certificates valid
□ Backup system working
□ Monitoring alerts configured
□ Team access verified
```

### **Step 3: Testing & QA**
```bash
# Automated testing:
- Unit tests
- Integration tests
- API endpoint tests
- Form functionality tests

# Manual testing:
- User workflow testing
- Cross-browser testing
- Mobile responsiveness
- Performance testing
- Load testing (optional)
```

## 📊 Staging Monitoring

### **CloudWatch Alarms**
```bash
# Staging-specific alarms:
- CPU > 70% for 5 minutes (lower threshold)
- Memory > 80% for 5 minutes
- Disk > 85% for 5 minutes
- Error rate > 5% (more sensitive)
- Response time > 2 seconds
```

### **Logging & Debugging**
```bash
# Enhanced logging for staging:
DEBUG=formio:*
LOG_LEVEL=debug

# Log locations:
- Application logs: /var/log/formio/
- Access logs: /var/log/
- Docker logs: docker-compose logs
- System logs: /var/log/syslog
```

## 💾 Staging Data Management

### **Data Strategy**
```bash
# Options for staging data:
1. Synthetic test data (recommended)
2. Anonymized production data subset
3. Fresh empty database

# Data refresh strategy:
- Monthly refresh from production (anonymized)
- Or quarterly refresh schedule
- Or maintain synthetic test data
```

### **Backup Configuration**
```bash
# Staging backup settings:
- Daily backups to S3 (staging/ prefix)
- 7-day retention policy
- Weekly EBS snapshots
- Lower priority storage class
- Same backup procedures as production
```

## 🔐 Staging Security

### **Access Control**
```bash
# SSH access (team members):
- Developer SSH keys
- QA team SSH keys
- Time-limited access for contractors
- Regular key rotation

# Web access:
- Team IP restrictions (optional)
- Basic authentication (optional)
- VPN access (optional)
```

### **Security Considerations**
```bash
# Staging security differences:
- More permissive for testing
- Team access for debugging
- Detailed logging enabled
- Test SSL certificates
- Staging-specific secrets
```

## 🔄 Staging Workflow

### **Development to Staging**
```bash
# Feature branch workflow:
1. Develop on feature branch
2. PR to develop branch
3. Code review and testing
4. Merge to develop
5. Deploy to staging
6. QA validation
7. Approve for production
```

### **Staging to Production**
```bash
# Production promotion:
1. Staging validation complete
2. Performance tests passed
3. Security review complete
4. Merge develop to main
5. Deploy to production
6. Post-deployment monitoring
```

## 📋 Staging Setup Checklist

### **Infrastructure Setup**
```bash
□ EC2 t3.medium instance created
□ 25GB gp3 EBS volume attached
□ Elastic IP allocated
□ Security group configured
□ IAM role attached
□ DNS records created
□ SSL certificates obtained
□ Monitoring configured
□ Backup system setup
```

### **Application Setup**
```bash
□ Docker installed and configured
□ Application deployed from develop
□ Environment variables configured
□ Database initialized
□ SSL/TLS working
□ Backup system tested
□ Health checks passing
□ Team access verified
□ Logging configured
□ Monitoring alerts active
```

### **Validation & Testing**
```bash
□ All services running
□ Health checks passing
□ Forms and submissions working
□ File uploads functional
□ User authentication working
□ API endpoints responsive
□ SSL certificates valid
□ Performance acceptable
□ Load testing (optional)
□ Team training completed
```

## 🚨 Staging Incident Response

### **Common Issues**
```bash
# Deployment failures:
- Check docker-compose logs
- Verify environment variables
- Check resource availability
- Validate DNS configuration

# Performance issues:
- Monitor CPU/memory usage
- Check database performance
- Review application logs
- Test with reduced load

# Access issues:
- Verify security group rules
- Check SSH key configuration
- Validate DNS resolution
- Test SSL certificates
```

### **Troubleshooting Commands**
```bash
# Check service status:
docker-compose ps
docker-compose logs formio
docker-compose logs caddy

# Check system resources:
free -h
df -h
top
htop

# Check network connectivity:
curl -I https://{$STAGING_SPA_DOMAIN}
nslookup {$STAGING_SPA_DOMAIN}
ping {$STAGING_SPA_DOMAIN}

# Check application health:
./scripts/health-check.sh staging
curl http://localhost:3001/health
```

## 📚 Staging Best Practices

### **Development Practices**
```bash
# Keep staging in sync:
- Regular deployments from develop
- Same configuration as production
- Regular dependency updates
- Security patches applied

# Testing practices:
- Comprehensive test coverage
- Regular regression testing
- Performance testing
- Security testing
```

### **Maintenance Practices**
```bash
# Regular maintenance:
- Weekly dependency updates
- Monthly security patches
- Quarterly capacity review
- Annual infrastructure audit

# Data management:
- Regular data refresh
- Backup verification
- Log rotation
- Performance monitoring
```

---

**Last Updated**: 2026-01-21
**Maintainer**: tomchase@duck.com
