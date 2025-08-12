# PowerShell script to set up environment variables for development
# Run this script before starting the server

Write-Host "Setting up environment variables for development..." -ForegroundColor Green

# Set environment variables for the current session
$env:NODE_ENV = "development"
$env:PORT = "8000"

# Set API and Client URLs for OAuth
$env:API_BASE_URL = "http://localhost:8000"
$env:CLIENT_URL = "http://localhost:3000"

# Set encryption key (generate a random 64-character hex string)
$env:ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

# Set JWT secret
$env:JWT_SECRET = "your_jwt_secret_key_here_for_development_only"
$env:JWT_EXPIRES_IN = "7d"

# Set Supabase URLs (you'll need to replace these with your actual values)
$env:SUPABASE_URL = "https://your-project-ref.supabase.co"
$env:SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your_anon_key"
$env:SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your_service_role_key"

# Set database URL (you'll need to replace this with your actual value)
$env:DATABASE_URL = "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"

# Set OAuth provider credentials (you'll need to replace these with your actual values)
$env:SHOPIFY_CLIENT_ID = "your_shopify_client_id"
$env:SHOPIFY_CLIENT_SECRET = "your_shopify_client_secret"
$env:KLAVIYO_CLIENT_ID = "your_klaviyo_client_id"
$env:KLAVIYO_CLIENT_SECRET = "your_klaviyo_client_secret"

Write-Host "Environment variables set for current session." -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANT: You need to set the following environment variables with your actual values:" -ForegroundColor Yellow
Write-Host "- SUPABASE_URL and keys" -ForegroundColor Yellow
Write-Host "- DATABASE_URL" -ForegroundColor Yellow
Write-Host "- SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET" -ForegroundColor Yellow
Write-Host "- KLAVIYO_CLIENT_ID and KLAVIYO_CLIENT_SECRET" -ForegroundColor Yellow
Write-Host ""
Write-Host "You can now start the server with: npm run dev" -ForegroundColor Green
Write-Host "Or run this script in a new terminal session to set the variables again." -ForegroundColor Green
