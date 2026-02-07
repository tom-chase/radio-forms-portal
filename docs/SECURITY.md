# Security Documentation

## 🔐 Production Security Setup

### **AWS Security Configuration**

#### **Security Group: RadioFormsSG**
```bash
# Inbound Rules (Principle of Least Privilege):
Port 22  (SSH)    → YOUR_HOME_IP/32    # Admin access only
Port 80  (HTTP)    → 0.0.0.0/0        # Redirect to HTTPS
Port 443 (HTTPS)   → 0.0.0.0/0        # Public web access

# Blocked from public:
Port 27017 (MongoDB) → INTERNAL ONLY   # No direct DB access
Port 3001 (Form.io)   → INTERNAL ONLY   # Behind reverse proxy
```

#### **IAM Role Configuration**
```json
{
  "RoleName": "RadioFormsEC2Role",
  "Description": "EC2 role for Radio Forms application",
  "Policies": [
    {
      "PolicyName": "S3BackupAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::radio-forms-backups-*"
    },
    {
      "PolicyName": "CloudWatchAccess", 
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData",
        "cloudwatch:GetMetricStatistics",
        "logs:CreateLogGroup",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ],
  "TrustRelationship": {
    "Service": "ec2.amazonaws.com"
  }
}
```

### **Network Security**

#### **VPC Configuration**
```bash
# Network Design:
- Custom VPC: 10.0.0.0/16
- Public Subnets: 10.0.1.0/24, 10.0.2.0/24
- Private Subnets: 10.0.10.0/24, 10.0.20.0/24
- Internet Gateway: For public subnets
- NAT Gateways: For private subnets
```

#### **SSL/TLS Configuration**
```bash
# Certificate Management:
Provider: Let's Encrypt (via Caddy)
Auto-renewal: Enabled
Email: example@your-domain.com
Staging CA: acme-staging-v02.api.letsencrypt.org

# Security Headers:
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer-when-downgrade
Content-Security-Policy: default-src 'self'; script-src 'self'
```

## 🖥️ Server Security Hardening

### **Operating System Security**
```bash
# Debian 12 (Bookworm) Hardening:

# 1. System Updates
sudo apt update && sudo apt upgrade -y
sudo apt autoremove -y

# 2. Firewall Configuration
sudo ufw enable
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 27017/tcp  # Block MongoDB from internet
sudo ufw --force enable

# 3. SSH Security
sudo nano /etc/ssh/sshd_config
# Configure:
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2

sudo systemctl restart sshd
```

### **Application Security**

#### **Form.io Configuration**
```json
{
  "jwt": {
    "secret": "${JWT_SECRET}",           # 32+ character random string
    "expireTime": "1h"               # Short expiration for security
    "issuer": "formio"
  },
  "trust proxy": true,                  # Behind Caddy reverse proxy
  "settings": {
    "cors": {
      "enabled": true,
      "origin": "https://forms.your-domain.com"  # Specific domains only
    }
  }
}
```

#### **Environment Variables Security**
```bash
# Production .env file security:
chmod 600 .env                    # Owner read/write only
chown admin:admin .env             # Correct ownership

# Never commit to git:
echo ".env" >> .gitignore           # Already configured
```

### **Database Security**

#### **MongoDB Configuration**
```yaml
# Security Settings:
auth: true
authorization: enabled
net:
  port: 27017
  bindIp: 127.0.0.1           # Local only
security:
  authorization: enabled
  javascriptEnabled: false        # Prevent code injection
```

#### **Database Access Control**
```bash
# Application user (limited access):
mongo --username formio_app --password ${APP_PASSWORD} --authenticationDatabase admin

# Admin user (full access):
mongo --username ${MONGO_ROOT_USERNAME} --password ${MONGO_ROOT_PASSWORD} --authenticationDatabase admin

# Network isolation:
# MongoDB only accessible from:
- localhost (within container)
- Form.io container (internal)
- Backup container (internal)
```

## 🔍 Access Control

### **SSH Key Management**
```bash
# SSH Key Best Practices:
1. Use ED25519 or RSA 4096+ keys
2. Encrypt private keys with passphrase
3. Rotate keys every 90 days
4. Never store keys in repository
5. Use SSH config for host management

# SSH Configuration (~/.ssh/config):
Host radio-forms-prod
    HostName your-production-server.com
    User admin
    IdentityFile ~/.ssh/radio-forms-prod-key.pem
    Port 22
    ForwardAgent no
    StrictHostKeyChecking yes
    UserKnownHostsFile ~/.ssh/known_hosts
```

### **Application Access Control**
```bash
# Form.io User Roles:
- Administrator: Full system access
- Manager: Form and submission management
- User: Form submission only
- Guest: Read-only access

# Access Control Implementation:
- JWT-based authentication
- Role-based permissions
- API rate limiting
- IP whitelisting for admin
```

## 🚨 Security Monitoring

### **Intrusion Detection**
```bash
# AWS CloudWatch Alarms:
- SSH brute force attempts
- Unusual API access patterns
- Spike in form submissions
- Database connection failures
- High error rates
```

### **Log Monitoring**
```bash
# Security Events to Monitor:
1. Failed login attempts
2. Privilege escalation attempts
3. Unusual data access patterns
4. Configuration changes
5. Database schema modifications
6. File upload anomalies
```

### **Vulnerability Management**
```bash
# Regular Security Tasks:
- Monthly dependency updates (manual version bumps in docker-compose files)
- Quarterly security scans
- Annual penetration testing
- Continuous CVE monitoring
- SSL certificate expiration monitoring
```

## 📋 Security Checklist

### **Pre-Deployment Security**
```bash
□ Security groups configured correctly
□ IAM roles with minimum privileges
□ SSH keys secured and rotated
□ SSL certificates valid and auto-renewing
□ Database access restricted
□ Environment variables secured
□ Firewall rules applied
□ Monitoring and alerting configured
□ Backup encryption verified
□ Access logging enabled
□ Security headers configured
□ CORS properly restricted
□ Rate limiting implemented
□ Input validation enabled
□ Error handling doesn't leak info
□ Session management secure
□ File upload restrictions
□ Database encryption enabled
```

### **Post-Deployment Security**
```bash
□ Production access verified
□ Security testing completed
□ Monitoring baseline established
□ Incident response plan tested
□ Backup and recovery verified
□ Security documentation updated
□ Team training completed
□ Compliance requirements met
□ Third-party security audit (if required)
```

## 🔒 Incident Response

### **Security Incident Categories**
```bash
# Level 1 - Critical:
- Data breach
- System compromise
- Production outage
- Unauthorized admin access

# Level 2 - High:
- Security vulnerability exploit
- Performance degradation
- Partial data exposure
- Brute force attacks

# Level 3 - Medium:
- Suspicious activity
- Minor security misconfiguration
- Low-impact vulnerabilities

# Level 4 - Low:
- Information disclosure
- Security best practice violations
```

### **Response Procedures**
```bash
# Immediate Response (0-15 minutes):
1. Assess scope and impact
2. Contain the threat
3. Preserve evidence
4. Notify stakeholders
5. Initiate recovery

# Investigation (15 min - 4 hours):
1. Root cause analysis
2. Impact assessment
3. Vulnerability scanning
4. Log analysis
5. Security improvements

# Recovery (4-24 hours):
1. System restoration
2. Security hardening
3. Testing and validation
4. Documentation update
5. Post-incident review
```

## 📚 Security Resources

### **Documentation**
- [AWS Security Best Practices](https://docs.aws.amazon.com/security/)
- [Form.io Security Guide](https://docs.form.io/security/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

### **Tools & Services**
- AWS Security Hub
- AWS CloudTrail (audit logs)
- AWS Inspector (vulnerability scanning)
- Let's Encrypt (SSL certificates)
- UFW (host-based firewall)

---

**Last Updated**: 2026-01-21
**Security Contact**: tomchase@duck.com
