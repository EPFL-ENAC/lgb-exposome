#!/bin/bash
set -e

echo "🐳 Setting up Docker environment for lgb-exposome..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install it and try again."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📄 Creating .env file from template..."
    cp .env.example .env
    echo "✅ .env file created. Please edit it with your configuration."
fi

# Build the Docker image
echo "🔨 Building Docker image..."
docker build -t lgb-exposome .

# Start the development environment
echo "🚀 Starting development environment..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Run database migrations
echo "🗄️ Running database migrations..."
docker-compose exec -T web python manage.py migrate

# Collect static files
echo "📁 Collecting static files..."
docker-compose exec -T web python manage.py collectstatic --noinput

echo "✅ Setup complete!"
echo ""
echo "🌐 Your application is now running at:"
echo "   http://localhost:8000"
echo ""
echo "📊 To view logs:"
echo "   make docker-logs"
echo ""
echo "🛑 To stop the application:"
echo "   make docker-stop"
echo ""
echo "👤 To create a superuser:"
echo "   make docker-createsuperuser"
