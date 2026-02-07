---
description: Provision or update AWS infrastructure via CloudFormation
---

# Provision Infrastructure

Deploys the CloudFormation stack defined in `infrastructure/cloudformation.yaml`.

## Preconditions
- AWS CLI configured with appropriate credentials
- SSH key pair created in the target AWS region

## Steps

1. **Run the provisioning script**:
   ```bash
   ./scripts/provision-infrastructure.sh [environment] [key-pair-name] [allowed-ssh-cidr] [instance-type] [volume-size]
   ```
   Example:
   ```bash
   ./scripts/provision-infrastructure.sh production my-key-pair 192.168.1.50/32 t3.large 50
   ```
   The script:
   - Validates the environment
   - Finds the latest Debian 12 (Bookworm) AMI
   - Deploys/updates the CloudFormation stack
   - Outputs the new Public IP and Instance ID

2. **Update DNS** (Route 53 or your DNS provider):
   ```
   A   forms.your-domain.com       → [Elastic IP]
   A   api.forms.your-domain.com   → [Elastic IP]
   ```

3. **Configure the server**:
   - SSH in: `ssh -i ~/.ssh/your-key.pem admin@[Elastic IP]`
   - Set up `.env` on the server
   - Set up `Caddyfile` on the server with production domains and ACME email
   - Deploy code via `deploy-production-code` workflow

## Stack Resources
- VPC + Public Subnet + Internet Gateway
- Security Groups (ports 80, 443, 22)
- IAM Role (S3 backup access, CloudWatch, SSM)
- EC2 Instance (Debian 12, configurable type/volume)
- S3 Backup Bucket (versioned, encrypted, 30-day lifecycle)
- Elastic IP

## Reference
- CloudFormation template: `infrastructure/cloudformation.yaml`
- Full infrastructure docs: `docs/INFRASTRUCTURE.md`
