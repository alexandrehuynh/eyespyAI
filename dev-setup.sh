#!/bin/bash

# EyeSpyAI Development Environment Setup Script
echo "🚀 Setting up EyeSpyAI development environment..."

# Check if PostgreSQL is running
if ! pg_isready -q; then
    echo "📦 Starting PostgreSQL service..."
    brew services start postgresql@15
    sleep 3
fi

# Check if database exists, create if not
if ! psql -lqt | cut -d \| -f 1 | grep -qw eyespyai; then
    echo "🗄️ Creating database 'eyespyai'..."
    createdb eyespyai
fi

# Set environment variables
export DATABASE_URL="postgresql://localhost:5432/eyespyai"
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
