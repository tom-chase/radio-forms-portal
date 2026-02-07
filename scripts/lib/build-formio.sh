#!/bin/bash

# Build Form.io for ARM64 development
# This script builds the Form.io image from source for native ARM64 compatibility

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔨 Building Form.io from source for ARM64...${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

echo -e "${YELLOW}⏱️  This may take 10-15 minutes on first build...${NC}"
echo ""

# Build the formio service with progress indication
if docker-compose -f docker-compose.dev.yml build --progress=plain formio; then
    echo ""
    echo -e "${GREEN}✅ Form.io build completed successfully!${NC}"
    echo ""
    echo -e "${BLUE}🚀 Next steps:${NC}"
    echo -e "   • Start services: ${YELLOW}docker-compose -f docker-compose.dev.yml up -d${NC}"
    echo -e "   • View logs:     ${YELLOW}docker-compose -f docker-compose.dev.yml logs -f formio${NC}"
    echo -e "   • Check status:  ${YELLOW}docker-compose -f docker-compose.dev.yml ps${NC}"
else
    echo -e "${RED}❌ Form.io build failed${NC}"
    echo ""
    echo -e "${YELLOW}🔧 Troubleshooting:${NC}"
    echo -e "   • Ensure Docker Desktop has enough RAM (16GB+ recommended)"
    echo -e "   • Check Docker Desktop disk space"
    echo -e "   • Try rebuilding: ${YELLOW}docker-compose -f docker-compose.dev.yml build --no-cache formio${NC}"
    exit 1
fi
