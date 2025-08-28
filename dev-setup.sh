#!/bin/bash

# EyeSpyAI Development Environment Setup Script
echo "🚀 Setting up EyeSpyAI development environment..."

# Check if unified-services PostgreSQL is running
echo "🔍 Checking if unified-services PostgreSQL is running..."
if ! docker ps | grep -q "main-postgres"; then
    echo "📦 Starting unified-services PostgreSQL..."
    cd ../unified-services
    docker-compose up -d postgres
    cd ../EyeSpyAI
    sleep 5
else
    echo "✅ PostgreSQL is already running"
fi

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until docker exec main-postgres pg_isready -U postgres; do
    echo "Waiting for PostgreSQL..."
    sleep 2
done

# Check if database exists, create if not
echo "🗄️ Checking if 'eyespyai' database exists..."
if ! docker exec main-postgres psql -U postgres -lqt | cut -d \| -f 1 | grep -qw eyespyai; then
    echo "🗄️ Creating database 'eyespyai'..."
    docker exec main-postgres createdb -U postgres eyespyai
fi

# Set environment variables for development
export DATABASE_URL="postgresql://postgres:password@localhost:5432/eyespyai"
export SESSION_SECRET="eyespy-ai-fitness-tracker-secret-key-2025"
export NODE_ENV="development"

echo "✅ Environment variables set:"
echo "   DATABASE_URL: $DATABASE_URL"
echo "   NODE_ENV: $NODE_ENV"

# Run database migrations
echo "🔄 Running database migrations..."
npm run db:push

echo "🎉 Setup complete! You can now run 'npm run dev' to start the development server."
echo "🌐 The application will be available at http://localhost:3000"
echo ""
echo "🐳 To run with Docker Compose:"
echo "   cd ../unified-services && docker-compose up eyespyai"
