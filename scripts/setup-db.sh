#!/bin/bash

# Database setup script for Straai
# This script initializes the database with migrations and seed data

set -e

echo "🚀 Setting up Straai database..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please copy env.example to .env and configure your database URL."
    exit 1
fi

# Generate Prisma client
echo "📦 Generating Prisma client..."
npm run db:generate

# Run migrations
echo "🔄 Running database migrations..."
npm run db:migrate

# Seed the database
echo "🌱 Seeding database with sample data..."
npm run db:seed

echo "✅ Database setup complete!"
echo ""
echo "🎉 You can now:"
echo "   - Start the development server: npm run dev"
echo "   - Open Prisma Studio: npm run db:studio"
echo "   - View the application at: http://localhost:3000"
