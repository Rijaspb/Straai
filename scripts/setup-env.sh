#!/bin/bash

# Environment setup script for Straai
# This script helps set up the required environment files

echo "🔧 Setting up Straai environment files..."

# Copy root environment file
if [ ! -f .env ]; then
    echo "📄 Creating root .env file..."
    cp env.example .env
    echo "✅ Created .env from env.example"
else
    echo "ℹ️  Root .env file already exists"
fi

# Copy client environment file
if [ ! -f client/.env ]; then
    echo "📄 Creating client .env file..."
    cp client/env.example client/.env
    echo "✅ Created client/.env from client/env.example"
else
    echo "ℹ️  Client .env file already exists"
fi

echo ""
echo "⚠️  IMPORTANT: You need to configure your environment variables!"
echo ""
echo "📝 Steps to complete setup:"
echo "1. Create a Supabase project at https://supabase.com"
echo "2. Get your project URL and API keys from Settings → API"
echo "3. Edit .env and set:"
echo "   - SUPABASE_URL=https://your-project-ref.supabase.co"
echo "   - SUPABASE_SERVICE_ROLE_KEY=your_service_role_key"
echo "4. Edit client/.env and set:"
echo "   - VITE_SUPABASE_URL=https://your-project-ref.supabase.co"
echo "   - VITE_SUPABASE_ANON_KEY=your_anon_key"
echo "5. Configure Google OAuth in Supabase Auth settings"
echo "6. Run: npm run db:setup"
echo "7. Run: npm run dev"
echo ""
echo "🚀 After configuration, your app will be ready at http://localhost:3000"
