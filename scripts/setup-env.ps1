# Environment setup script for Straai (PowerShell)
# This script helps set up the required environment files

Write-Host "🔧 Setting up Straai environment files..." -ForegroundColor Green

# Copy root environment file
if (-not (Test-Path ".env")) {
    Write-Host "📄 Creating root .env file..." -ForegroundColor Blue
    Copy-Item "env.example" ".env"
    Write-Host "✅ Created .env from env.example" -ForegroundColor Green
} else {
    Write-Host "ℹ️  Root .env file already exists" -ForegroundColor Yellow
}

# Copy client environment file
if (-not (Test-Path "client\.env")) {
    Write-Host "📄 Creating client .env file..." -ForegroundColor Blue
    Copy-Item "client\env.example" "client\.env"
    Write-Host "✅ Created client\.env from client\env.example" -ForegroundColor Green
} else {
    Write-Host "ℹ️  Client .env file already exists" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "⚠️  IMPORTANT: You need to configure your environment variables!" -ForegroundColor Red
Write-Host ""
Write-Host "📝 Steps to complete setup:" -ForegroundColor Yellow
Write-Host "1. Create a Supabase project at https://supabase.com" -ForegroundColor White
Write-Host "2. Get your project URL and API keys from Settings → API" -ForegroundColor White
Write-Host "3. Edit .env and set:" -ForegroundColor White
Write-Host "   - SUPABASE_URL=https://your-project-ref.supabase.co" -ForegroundColor Gray
Write-Host "   - SUPABASE_SERVICE_ROLE_KEY=your_service_role_key" -ForegroundColor Gray
Write-Host "4. Edit client\.env and set:" -ForegroundColor White
Write-Host "   - VITE_SUPABASE_URL=https://your-project-ref.supabase.co" -ForegroundColor Gray
Write-Host "   - VITE_SUPABASE_ANON_KEY=your_anon_key" -ForegroundColor Gray
Write-Host "5. Configure Google OAuth in Supabase Auth settings" -ForegroundColor White
Write-Host "6. Run: npm run db:setup" -ForegroundColor White
Write-Host "7. Run: npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "🚀 After configuration, your app will be ready at http://localhost:3000" -ForegroundColor Green
