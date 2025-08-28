#!/bin/bash

# EyeSpyAI Unified Services Startup Script
echo "🐳 Starting EyeSpyAI with unified services..."

# Navigate to unified-services directory
cd ../unified-services

# Check if PostgreSQL is running, start if not
if ! docker ps | grep -q "main-postgres"; then
    echo "📦 Starting PostgreSQL service..."
    docker-compose up -d postgres
    echo "⏳ Waiting for PostgreSQL to be ready..."
    sleep 5
fi

# Wait for PostgreSQL to be ready
until docker exec main-postgres pg_isready -U postgres; do
    echo "Waiting for PostgreSQL..."
    sleep 2
done

# Create eyespyai database if it doesn't exist
if ! docker exec main-postgres psql -U postgres -lqt | cut -d \| -f 1 | grep -qw eyespyai; then
    echo "🗄️ Creating 'eyespyai' database..."
    docker exec main-postgres createdb -U postgres eyespyai
fi

# Start EyeSpyAI service
echo "🚀 Starting EyeSpyAI service..."
docker-compose up -d eyespyai

echo "✅ EyeSpyAI is starting up!"
echo "🌐 Application will be available at http://localhost:3000"
echo "📊 View logs: docker-compose logs -f eyespyai"
echo "🛑 Stop service: docker-compose stop eyespyai"
