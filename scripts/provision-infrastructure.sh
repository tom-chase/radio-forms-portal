#!/bin/bash

# provision-infrastructure.sh
# Deploys the AWS infrastructure using CloudFormation
# Usage: ./provision-infrastructure.sh [environment] [key-pair-name] [allowed-ssh-cidr]

set -e

ENV=${1:-production}
KEY_NAME=${2}
ALLOWED_SSH=${3:-"0.0.0.0/0"}
INSTANCE_TYPE=${4:-"t3.large"}
VOLUME_SIZE=${5:-50}
STACK_NAME="radio-forms-${ENV}-stack"
REGION=${AWS_DEFAULT_REGION:-"us-east-1"}

if [ -z "$KEY_NAME" ]; then
    echo "Usage: $0 [environment] [key-pair-name] [allowed-ssh-cidr] [instance-type] [volume-size]"
    echo "Example: $0 production my-key-pair 192.168.1.1/32 t3.xlarge 100"
    exit 1
fi

# Validation: KeyName should be a name, not a path
if [[ "$KEY_NAME" == *"/"* ]] || [[ "$KEY_NAME" == *".pem"* ]]; then
    echo "❌ Error: KeyName '$KEY_NAME' appears to be a file path or file name."
    echo "   Please provide the AWS EC2 Key Pair NAME (as seen in the AWS Console), not the local file path."
    echo "   Example: If your key file is ~/.ssh/my-key.pem, the Key Pair name in AWS is likely 'my-key'."
    exit 1
fi

echo "🚀 Starting infrastructure provision for environment: $ENV"
echo "Stack Name: $STACK_NAME"
echo "Region: $REGION"
echo "Key Pair: $KEY_NAME"
echo "Instance Type: $INSTANCE_TYPE"
echo "Volume Size: ${VOLUME_SIZE}GB"

# 1. Find AMI for Debian 12 (Bookworm) or 13 (Trixie)
# Note: Debian 13 is 'testing', so we default to stable Bookworm (12) for production reliability
# unless we find a specific Trixie AMI. Most official marketplace AMIs are stable.
echo "🔍 Searching for latest Debian 12 (Bookworm) AMI..."
AMI_ID=$(aws ec2 describe-images \
    --owners 136693071363 \
    --filters "Name=name,Values=debian-12-amd64-*" "Name=architecture,Values=x86_64" \
    --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
    --output text \
    --region $REGION)

if [ "$AMI_ID" == "None" ] || [ -z "$AMI_ID" ]; then
    echo "❌ Error: Could not find a valid Debian AMI."
    exit 1
fi

echo "✅ Found AMI: $AMI_ID"

# Check for failed stack state (ROLLBACK_COMPLETE) and clean up
echo "🔍 Checking stack status..."
STACK_STATUS=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query "Stacks[0].StackStatus" --output text 2>/dev/null || echo "None")

if [ "$STACK_STATUS" == "ROLLBACK_COMPLETE" ]; then
    echo "⚠️  Stack $STACK_NAME is in ROLLBACK_COMPLETE state (failed creation)."
    echo "🗑️  Deleting failed stack to allow recreation..."
    aws cloudformation delete-stack --stack-name $STACK_NAME --region $REGION
    echo "⏳ Waiting for stack deletion..."
    aws cloudformation wait stack-delete-complete --stack-name $STACK_NAME --region $REGION
    echo "✅ Stack deleted."
elif [ "$STACK_STATUS" == "DELETE_IN_PROGRESS" ]; then
    echo "⏳ Stack is currently deleting. Waiting..."
    aws cloudformation wait stack-delete-complete --stack-name $STACK_NAME --region $REGION
    echo "✅ Stack deletion complete."
fi

# 2. Deploy CloudFormation Stack
echo "🏗️  Deploying CloudFormation stack..."
aws cloudformation deploy \
    --template-file infrastructure/cloudformation.yaml \
    --stack-name $STACK_NAME \
    --parameter-overrides \
        Environment=$ENV \
        KeyName=$KEY_NAME \
        AllowedSSHLocation=$ALLOWED_SSH \
        AmiId=$AMI_ID \
        InstanceType=$INSTANCE_TYPE \
        VolumeSize=$VOLUME_SIZE \
    --capabilities CAPABILITY_NAMED_IAM \
    --region $REGION

# 3. Get Outputs
echo "✅ Deployment complete. Fetching outputs..."
aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
    --output table \
    --region $REGION

echo "🎉 Infrastructure ready!"
