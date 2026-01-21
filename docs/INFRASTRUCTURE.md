# Infrastructure Documentation

## 🏗️ AWS CloudFormation Infrastructure

The entire infrastructure is defined as code in `infrastructure/cloudformation.yaml`. This ensures reproducibility and consistency across environments.

### **Stack Resources**

#### **Network**
- **VPC**: `10.0.0.0/16` (`radio-forms-${Environment}-vpc`)
- **Public Subnet**: `10.0.1.0/24` (`radio-forms-${Environment}-public-subnet`)
- **Internet Gateway**: Attached for public access
- **Elastic IP**: Allocated and associated with the Web Server for a static IP.

#### **Compute**
- **Instance**: Configurable via `InstanceType` parameter (defaults to `t3.large`)
- **OS**: Debian **12 (Bookworm)** - *AMI ID selected by `scripts/provision-infrastructure.sh`*
- **Root Volume**: Configurable via `VolumeSize` parameter (defaults to 50GB gp3, encrypted)
- **Swap**: 2GB Swap file configured via UserData

#### **Security Groups**
**`WebServerSecurityGroup`** (`radio-forms-${Environment}-sg`)
| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 80 | TCP | 0.0.0.0/0 | HTTP (Caddy redirects to HTTPS) |
| 443 | TCP | 0.0.0.0/0 | HTTPS (App & API) |
| 22 | TCP | *Restricted* | SSH Access (Configured via `AllowedSSHLocation` parameter) |

#### **IAM & Permissions**
**Role**: `EC2Role` (`radio-forms-${Environment}-role`)
- **Managed Policies**:
  - `AmazonS3ReadOnlyAccess`
  - `CloudWatchAgentServerPolicy`
  - `AmazonSSMManagedInstanceCore` (Session Manager access)
- **Inline Policies**:
  - `S3BackupWriteAccess`: Allows `PutObject` to the specific backup bucket.

#### **Storage**
- **S3 Bucket**: `radio-forms-backups-{AccountId}-${Environment}`
  - **Versioning**: Enabled
  - **Encryption**: AES256
  - **Lifecycle**: 30-day retention (as defined in CloudFormation)

---

## 🚀 Provisioning

Infrastructure is deployed using the helper script:

```bash
./scripts/provision-infrastructure.sh [environment] [key-pair-name] [allowed-ssh-cidr] [instance-type] [volume-size]
```

**Example**:
```bash
./scripts/provision-infrastructure.sh production my-key-pair 192.168.1.50/32 t3.large 50
```

This script:
1. Validates the environment.
2. Finds the latest Debian 12 (Bookworm) AMI.
3. Deploys/Updates the CloudFormation stack.
4. Outputs the new Public IP and Instance ID.

---

## 📊 Environment Specifications

| Feature | Production | Staging |
|---------|------------|---------|
| **Instance Type** | `t3.large` (default) | `t3.large` (default) |
| **Volume Size** | 50 GB (default) | 50 GB (default) |
| **VPC CIDR** | `10.0.0.0/16` | `10.0.0.0/16` |
| **Backup Retention**| 30 Days | 30 Days |

## 💰 Estimated Costs (US-East-1)

| Resource | Spec | Est. Monthly Cost |
|----------|------|-------------------|
| **t3.large** | 2 vCPU, 8GB RAM | ~$60.00 |
| **EBS Volume** | 50GB gp3 | ~$4.00 |
| **Elastic IP** | 1 Static IP | $0.00 (Attached) |
| **Data Transfer**| ~100GB Out | ~$9.00 |
| **Total** | | **~$73.00 / month** |
 
*Note: Actual costs vary based on `InstanceType`, `VolumeSize`, and data transfer.*

---

## 🔧 DNS Configuration (Route 53)

After provisioning, update your DNS records to point to the new **Elastic IP**:

```
A   forms.your-domain.com       -> [Elastic IP]
A   api.forms.your-domain.com   -> [Elastic IP]
```

---

## 🔐 System Access

### SSH Access
Access is restricted to the KeyPair defined during provisioning.

```bash
ssh -i ~/.ssh/your-key.pem admin@[Elastic IP]
```

### Session Manager
The instance includes the SSM agent. You can also connect via AWS Console > Systems Manager > Session Manager without opening Port 22.
