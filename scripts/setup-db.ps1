# Database setup script for Straai (PowerShell)
# This script initializes the database with migrations and seed data

$ErrorActionPreference = "Stop"

Write-Host "🚀 Setting up Straai database..." -ForegroundColor Green

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Host "❌ .env file not found. Please copy env.example to .env and configure your database URL." -ForegroundColor Red
    exit 1
}

# Generate Prisma client
Write-Host "📦 Generating Prisma client..." -ForegroundColor Blue
npm run db:generate

# Run migrations
Write-Host "🔄 Running database migrations..." -ForegroundColor Blue
npm run db:migrate

# Seed the database
Write-Host "🌱 Seeding database with sample data..." -ForegroundColor Blue
npm run db:seed

Write-Host "✅ Database setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "🎉 You can now:" -ForegroundColor Yellow
Write-Host "   - Start the development server: npm run dev" -ForegroundColor White
Write-Host "   - Open Prisma Studio: npm run db:studio" -ForegroundColor White
Write-Host "   - View the application at: http://localhost:3000" -ForegroundColor White
