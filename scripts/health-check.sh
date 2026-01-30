#!/bin/bash

# Health Check Script
# Usage: ./scripts/health-check.sh [dev|staging|production]

set -e

ENVIRONMENT=${1:-dev}
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🏥 Running health check for $ENVIRONMENT environment..."

# Determine ports and URLs based on environment
case $ENVIRONMENT in
    "dev")
        APP_URL="http://localhost:3000"
        FORMIO_URL="http://localhost:3001"
        MONGO_URL="localhost:27017"
        ;;
    "staging")
        APP_URL="https://staging.forms.your-domain.com"
        FORMIO_URL="https://api.staging.forms.your-domain.com"
        MONGO_URL="staging-mongo-server:27017"
        ;;
    "production")
        APP_URL="https://forms.your-domain.com"
        FORMIO_URL="https://api.forms.your-domain.com"
        MONGO_URL="prod-mongo-server:27017"
        ;;
esac

# Check Docker containers
echo "🐳 Checking Docker containers..."
if command -v docker-compose &> /dev/null; then
    cd "$PROJECT_DIR"
    
    # Check container status
    CONTAINERS=$(docker-compose ps --services --filter status=running)
    if [ -z "$CONTAINERS" ]; then
        echo "❌ No containers are running"
        exit 1
    fi
    
    echo "✅ Running containers: $CONTAINERS"
    
    # Check container health
    UNHEALTHY=$(docker-compose ps --services --filter status=unhealthy)
    if [ -n "$UNHEALTHY" ]; then
        echo "⚠️  Unhealthy containers: $UNHEALTHY"
        docker-compose ps --filter status=unhealthy
    fi
    
    # Check for mongo-backup container
    if docker-compose ps --services | grep -q "mongo-backup"; then
        echo "✅ Backup service is running"
    fi
else
    echo "⚠️  Docker Compose not available"
fi

# Check application endpoints
echo "🌐 Checking application endpoints..."

# Check main app
if curl -f -s -o /dev/null "$APP_URL"; then
    echo "✅ Main application: $APP_URL"
else
    echo "❌ Main application unavailable: $APP_URL"
fi

# Check Form.io API
if curl -f -s -o /dev/null "$FORMIO_URL/health"; then
    echo "✅ Form.io API: $FORMIO_URL"
else
    echo "⚠️  Form.io API health check failed: $FORMIO_URL"
fi

# Check MongoDB connection (if running locally)
if [ "$ENVIRONMENT" = "dev" ]; then
    echo "🗄️  Checking MongoDB connection..."
    if nc -z localhost 27017; then
        echo "✅ MongoDB: localhost:27017"
    else
        echo "❌ MongoDB unavailable: localhost:27017"
    fi
fi

# Check disk space
echo "💾 Checking disk space..."
DISK_USAGE=$(df -h . | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 85 ]; then
    echo "⚠️  High disk usage: ${DISK_USAGE}%"
else
    echo "✅ Disk usage: ${DISK_USAGE}%"
fi

# Check memory usage
if command -v free &> /dev/null; then
    echo "🧠 Checking memory usage..."
    MEM_USAGE=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    if [ "$MEM_USAGE" -gt 85 ]; then
        echo "⚠️  High memory usage: ${MEM_USAGE}%"
    else
        echo "✅ Memory usage: ${MEM_USAGE}%"
    fi
fi

# Check log files for errors
echo "📋 Checking for recent errors..."
if [ -d "$PROJECT_DIR/logs" ]; then
    ERROR_COUNT=$(find "$PROJECT_DIR/logs" -name "*.log" -mtime -1 -exec grep -l "ERROR\|FATAL" {} \; | wc -l)
    if [ "$ERROR_COUNT" -gt 0 ]; then
        echo "⚠️  Found $ERROR_COUNT log files with recent errors"
        find "$PROJECT_DIR/logs" -name "*.log" -mtime -1 -exec grep -l "ERROR\|FATAL" {} \;
    else
        echo "✅ No recent errors in logs"
    fi
fi

echo "✅ Health check complete for $ENVIRONMENT environment!"
