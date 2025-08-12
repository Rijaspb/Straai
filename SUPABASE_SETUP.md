# Supabase Database Setup Guide

## 🎯 **Step 1: Get Your Supabase Database URL**

1. **Go to your Supabase project dashboard**
2. **Navigate to Settings → Database**
3. **Copy the "Connection string" (URI format)**
   - It should look like: `postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres`

## 🔧 **Step 2: Update Environment Variables**

### **Backend (.env file in server directory):**
```env
# Database (Replace with your actual Supabase connection string)
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"

# Supabase (Replace with your actual values)
SUPABASE_URL="https://[YOUR-PROJECT-REF].supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.[YOUR-ANON-KEY]"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.[YOUR-SERVICE-ROLE-KEY]"

# OAuth Credentials (Get these from Shopify/Klaviyo developer portals)
SHOPIFY_CLIENT_ID="your_shopify_client_id"
SHOPIFY_CLIENT_SECRET="your_shopify_client_secret"
KLAVIYO_CLIENT_ID="your_klaviyo_client_id"
KLAVIYO_CLIENT_SECRET="your_klaviyo_client_secret"

# Security (Generate these)
ENCRYPTION_KEY="your_64_character_hex_encryption_key_here_32bytes"
JWT_SECRET="your_jwt_secret_key_here"

# URLs
API_BASE_URL="http://localhost:8000"
CLIENT_URL="http://localhost:3000"
```

### **Frontend (client/.env file):**
```env
# Supabase (Replace with your actual values)
VITE_SUPABASE_URL="https://[YOUR-PROJECT-REF].supabase.co"
VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.[YOUR-ANON-KEY]"

# API Base URL
VITE_API_BASE_URL="http://localhost:8000"
```

## 🗄️ **Step 3: Set Up Database Schema**

Run these commands from the project root:

```bash
# Generate Prisma client
npm run db:generate

# Push schema to Supabase database
npm run db:push

# Seed with sample data
npm run db:seed
```

## 🔄 **Step 4: Restart Servers**

```bash
# Terminal 1 - Backend
cd server && npm run dev

# Terminal 2 - Frontend
cd client && npm run dev
```

## ✅ **Step 5: Test Everything**

1. **Navigate to** http://localhost:3000
2. **Sign up/Sign in** with Supabase auth
3. **Go to dashboard** - you should see the integration cards
4. **Click "Connect Store" or "Connect Klaviyo"** - buttons should work!

## 🔍 **Troubleshooting**

### **If you get database connection errors:**
- Double-check your `DATABASE_URL` format
- Make sure your Supabase project is active
- Verify the password in the connection string

### **If you get authentication errors:**
- Check that `SUPABASE_URL` and `SUPABASE_ANON_KEY` match your project
- Ensure the frontend and backend are using the same Supabase project

### **If connect buttons still don't work:**
- Check browser console for errors
- Verify server logs show "Sync scheduler initialized"
- Make sure both servers are running on correct ports

## 📋 **Quick Commands Reference**

```bash
# Database operations
npm run db:generate    # Generate Prisma client
npm run db:push        # Push schema to database
npm run db:seed        # Seed with sample data
npm run db:setup       # All of the above

# Development
npm run dev            # Start both servers
npm run dev:client     # Start frontend only
npm run dev:server     # Start backend only
```
