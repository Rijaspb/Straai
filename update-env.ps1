# PowerShell script to update .env file with Supabase DATABASE_URL

Write-Host "🔧 Updating .env file with Supabase DATABASE_URL..." -ForegroundColor Yellow

# Read current .env content
$envContent = Get-Content ".env" -Raw

# Check if DATABASE_URL already exists
if ($envContent -match "DATABASE_URL=") {
    Write-Host "❌ DATABASE_URL already exists in .env file" -ForegroundColor Red
    Write-Host "Please update it manually with your Supabase connection string" -ForegroundColor Yellow
} else {
    # Add DATABASE_URL after the first comment line
    $newContent = $envContent -replace "# Database", "# Database`nDATABASE_URL=`"postgresql://postgres:[YOUR-PASSWORD]@db.dotnntebicmrtvrtwpao.supabase.co:5432/postgres`""
    
    # Write back to file
    Set-Content ".env" $newContent -Encoding UTF8
    
    Write-Host "✅ Added DATABASE_URL to .env file" -ForegroundColor Green
    Write-Host "⚠️  IMPORTANT: Replace [YOUR-PASSWORD] with your actual Supabase database password" -ForegroundColor Yellow
    Write-Host "   Get it from: https://supabase.com/dashboard/project/dotnntebicmrtvrtwpao/settings/database" -ForegroundColor Cyan
}

Write-Host "`n📋 Next steps:" -ForegroundColor Blue
Write-Host "1. Update DATABASE_URL with your actual password" -ForegroundColor White
Write-Host "2. Run: npm run db:push" -ForegroundColor White
Write-Host "3. Run: npm run db:seed" -ForegroundColor White
Write-Host "4. Restart server: npm run dev" -ForegroundColor White
