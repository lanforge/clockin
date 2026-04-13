#!/bin/bash

# Production Deployment Script for LANForge Employee Dashboard
# Usage: ./deploy-production.sh

set -e  # Exit on error

echo "🚀 Starting production deployment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1)
if [ $NODE_MAJOR -lt 16 ]; then
    echo "❌ Node.js version must be 16 or higher. Current version: $NODE_VERSION"
    exit 1
fi

echo "✅ Node.js $NODE_VERSION detected"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed"
    exit 1
fi

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2 globally..."
    npm install -g pm2
    echo "✅ PM2 installed"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --only=production
echo "✅ Dependencies installed"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env 2>/dev/null || echo "⚠️  No .env.example found, please create .env manually"
    echo "⚠️  Please update the .env file with your production values"
    exit 1
fi

# Validate .env file
echo "🔍 Validating environment variables..."
if ! grep -q "SESSION_SECRET" .env || [ "$(grep SESSION_SECRET .env | cut -d'=' -f2)" = "lanforge-employee-dashboard-secret-key-production-change-this" ]; then
    echo "⚠️  WARNING: Using default session secret. Please change SESSION_SECRET in .env"
fi

if ! grep -q "MONGODB_URI" .env; then
    echo "❌ MONGODB_URI is not set in .env"
    exit 1
fi

echo "✅ Environment variables validated"

# Create logs directory
echo "📁 Creating logs directory..."
mkdir -p logs
echo "✅ Logs directory created"

# Stop existing PM2 process if running
echo "🛑 Stopping existing PM2 process..."
pm2 stop lanforge-employee-dashboard 2>/dev/null || true
pm2 delete lanforge-employee-dashboard 2>/dev/null || true

# Start application with PM2
echo "🚀 Starting application with PM2..."
pm2 start server.js --name "lanforge-employee-dashboard" \
  --log "logs/app.log" \
  --error "logs/error.log" \
  --output "logs/output.log" \
  --time \
  --restart-delay=3000 \
  --max-memory-restart 512M

# Save PM2 configuration
echo "💾 Saving PM2 configuration..."
pm2 save

# Setup PM2 startup script
echo "🔧 Setting up PM2 startup..."
pm2 startup 2>/dev/null || echo "⚠️  PM2 startup setup may require sudo. Run: sudo env PATH=\$PATH:\$(npm bin) pm2 startup"

echo "✅ Deployment complete!"
echo ""
echo "📊 Application Status:"
pm2 status lanforge-employee-dashboard
echo ""
echo "📋 Useful commands:"
echo "  pm2 status lanforge-employee-dashboard    # Check application status"
echo "  pm2 logs lanforge-employee-dashboard      # View application logs"
echo "  pm2 monit lanforge-employee-dashboard     # Monitor application"
echo "  pm2 restart lanforge-employee-dashboard   # Restart application"
echo "  pm2 stop lanforge-employee-dashboard      # Stop application"
echo ""
echo "🌐 Application should be running on: http://localhost:$(grep -o 'PORT=[0-9]*' .env | cut -d'=' -f2 || echo '3000')"
echo ""
echo "🔒 For production, consider:"
echo "  1. Setting up HTTPS with a reverse proxy (nginx/apache)"
echo "  2. Configuring a firewall"
echo "  3. Setting up monitoring and alerts"
echo "  4. Regular database backups"
