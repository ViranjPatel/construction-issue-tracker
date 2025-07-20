#!/bin/bash

# Construction Issue Tracker - Quick Setup Script
# This script helps you get started quickly

set -e

echo "🏗️  Construction Issue Tracker - Quick Setup"
echo "============================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    echo "   Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    
    # Generate a random JWT secret
    JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "your-super-secret-key-change-in-production")
    
    # Update the .env file with the generated secret
    if command -v sed &> /dev/null; then
        sed -i.bak "s/your-super-secret-key-change-in-production-make-it-long-and-random/$JWT_SECRET/" .env
        rm .env.bak 2>/dev/null || true
    fi
    
    echo "✅ Environment file created (.env)"
    echo "   You can edit this file to customize your setup"
else
    echo "✅ Environment file already exists"
fi

# Create uploads directory
mkdir -p uploads
echo "✅ Uploads directory created"

# Pull Docker images
echo "📦 Pulling Docker images..."
docker-compose pull

# Build the application
echo "🔧 Building application..."
docker-compose build

# Start the services
echo "🚀 Starting services..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check if services are running
if docker-compose ps | grep -q "Up"; then
    echo ""
    echo "🎉 Construction Issue Tracker is now running!"
    echo ""
    echo "📍 Access your application:"
    echo "   Web Interface: http://localhost:3000"
    echo "   API Documentation: http://localhost:3000/api"
    echo "   Health Check: http://localhost:3000/health"
    echo ""
    echo "🔑 Default Admin Login:"
    echo "   Email: admin@construction.local"
    echo "   Password: admin123"
    echo ""
    echo "📊 Additional Services:"
    echo "   MinIO Console: http://localhost:9001 (minioadmin/minioadmin)"
    echo "   PostgreSQL: localhost:5432"
    echo "   Redis: localhost:6379"
    echo ""
    echo "📖 Next Steps:"
    echo "   1. Change the default admin password"
    echo "   2. Create your first project"
    echo "   3. Add team members"
    echo "   4. Start tracking issues!"
    echo ""
    echo "🛠️  Management Commands:"
    echo "   Stop:    docker-compose down"
    echo "   Restart: docker-compose restart"
    echo "   Logs:    docker-compose logs -f"
    echo "   Update:  git pull && docker-compose build && docker-compose up -d"
else
    echo ""
    echo "❌ Some services failed to start. Check the logs:"
    echo "   docker-compose logs"
    echo ""
    echo "🔧 Troubleshooting:"
    echo "   - Make sure ports 3000, 5432, 6379, 9000, 9001 are available"
    echo "   - Check Docker daemon is running"
    echo "   - Review the logs for specific error messages"
fi