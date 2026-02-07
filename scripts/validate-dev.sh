#!/bin/bash

# Development Environment Validation Script
# Validates that all services are running correctly

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Validating development environment...${NC}"
echo ""

# Track validation results
issues=0

# Check Docker
echo -e "${BLUE}🐳 Checking Docker...${NC}"
if docker info > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Docker is running${NC}"
else
    echo -e "${RED}❌ Docker is not running${NC}"
    issues=$((issues + 1))
fi

# Check containers
echo ""
echo -e "${BLUE}📦 Checking containers...${NC}"

containers=("mongo-dev" "formio-dev" "dev-web")
for container in "${containers[@]}"; do
    if docker ps --format "table {{.Names}}" | grep -q "$container"; then
        status=$(docker inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "no-healthcheck")
        if [[ "$status" == "healthy" || "$status" == "no-healthcheck" ]]; then
            echo -e "${GREEN}✅ $container is running${NC}"
        else
            echo -e "${YELLOW}⚠️  $container is running but health check: $status${NC}"
        fi
    else
        echo -e "${RED}❌ $container is not running${NC}"
        issues=$((issues + 1))
    fi
done

# Check ports
echo ""
echo -e "${BLUE}🔌 Checking port accessibility...${NC}"

ports=("3000:Caddy (SPA)" "3001:Form.io API" "27017:MongoDB")
for port_info in "${ports[@]}"; do
    port=$(echo "$port_info" | cut -d':' -f1)
    service=$(echo "$port_info" | cut -d':' -f2)
    
    if [[ $port == "27017" ]]; then
        # MongoDB check
        if docker exec mongo-dev mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ $service (port $port) is responding${NC}"
        else
            echo -e "${RED}❌ $service (port $port) is not responding${NC}"
            issues=$((issues + 1))
        fi
    else
        # HTTP check
        if curl -s --max-time 5 "http://localhost:$port" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ $service (port $port) is responding${NC}"
        else
            echo -e "${RED}❌ $service (port $port) is not responding${NC}"
            issues=$((issues + 1))
        fi
    fi
done

# Check environment file
echo ""
echo -e "${BLUE}📄 Checking environment configuration...${NC}"

if [[ -f .env ]]; then
    required_vars=("MONGO_ROOT_USERNAME" "MONGO_ROOT_PASSWORD" "ROOT_EMAIL" "ROOT_PASSWORD" "JWT_SECRET" "MONGO_SECRET")
    missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if ! grep -q "^$var=" .env; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -eq 0 ]]; then
        echo -e "${GREEN}✅ All required environment variables are set${NC}"
    else
        echo -e "${YELLOW}⚠️  Missing environment variables: ${missing_vars[*]}${NC}"
        issues=$((issues + 1))
    fi
else
    echo -e "${RED}❌ .env file not found${NC}"
    issues=$((issues + 1))
fi

# Summary
echo ""
echo -e "${BLUE}📊 Validation Summary${NC}"
echo ""

if [[ $issues -eq 0 ]]; then
    echo -e "${GREEN}🎉 All checks passed! Development environment is ready.${NC}"
    echo ""
    echo -e "${BLUE}🌐 Access URLs:${NC}"
    echo -e "   • SPA (Frontend): ${YELLOW}http://localhost:3000${NC}"
    echo -e "   • Form.io API:    ${YELLOW}http://localhost:3001${NC}"
    echo -e "   • Form.io Admin:  ${YELLOW}http://localhost:3001${NC}"
else
    echo -e "${RED}❌ Found $issues issue(s) that need attention${NC}"
    echo ""
    echo -e "${YELLOW}🔧 Common fixes:${NC}"
    echo -e "   • Restart services: ${YELLOW}docker-compose -f docker-compose.dev.yml restart${NC}"
    echo -e "   • View logs:       ${YELLOW}docker-compose -f docker-compose.dev.yml logs -f${NC}"
    echo -e "   • Rebuild:         ${YELLOW}./scripts/lib/build-formio.sh${NC}"
    echo -e "   • Full setup:      ${YELLOW}./scripts/setup-dev.sh${NC}"
fi

echo ""
exit $issues
