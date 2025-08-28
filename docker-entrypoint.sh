#!/bin/bash
set -e

echo "Waiting for postgres..."

# Wait for postgres to be ready
while ! pg_isready -h postgres -p 5432 -U postgres; do
  sleep 2
done

echo "PostgreSQL started"

# Run database migrations using npx
echo "Running database migrations..."
npx drizzle-kit push

# Start the application
echo "Starting application..."
exec npm run start
