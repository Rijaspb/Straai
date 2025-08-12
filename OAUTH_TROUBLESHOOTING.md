# OAuth Callback Troubleshooting Guide

## Issue: OAuth callback success but no changes in frontend

### Symptoms
- Backend shows "OAuth callback success - Provider: klaviyo"
- Frontend doesn't reflect the connected status
- Integration card still shows "Connect" button instead of "Connected"

### Root Causes
1. **Environment Variables Not Set**: The server doesn't have the required environment variables
2. **Race Condition**: Frontend checks status too quickly after OAuth callback
3. **URL Parameter Issues**: OAuth callback parameters not being processed correctly
4. **Database Issues**: Integration not being saved to database

### Debugging Steps

#### 1. Check Environment Variables
Run the PowerShell script to set environment variables:
```powershell
.\setup-env.ps1
```

#### 2. Check Server Logs
Look for these log messages in the server console:
- "OAuth callback received - Provider: klaviyo"
- "OAuth callback success - Provider: klaviyo"
- "Redirecting to: http://localhost:3000/dashboard?connected=klaviyo&integration=123"

#### 3. Check Frontend Console
Look for these log messages in the browser console:
- "OAuth completed for klaviyo, refreshing status..."
- "Attempt 1: Checking klaviyo status..."
- "Successfully loaded klaviyo status: {...}"

#### 4. Test API Endpoints
Check if the backend is accessible:
```bash
# Health check (no auth required)
curl http://localhost:8000/api/integrations/health

# Debug OAuth config (requires auth)
curl http://localhost:8000/api/integrations/debug/oauth-config
```

#### 5. Check Database
Verify the integration was created in the database:
```sql
SELECT * FROM "Integration" WHERE provider = 'klaviyo' ORDER BY "createdAt" DESC LIMIT 1;
```

### Common Issues and Solutions

#### Issue: Environment variables undefined
**Symptoms**: Server logs show `undefined` for API_BASE_URL or CLIENT_URL
**Solution**: Run `.\setup-env.ps1` and restart the server

#### Issue: Frontend can't reach backend
**Symptoms**: Network errors in browser console
**Solution**: Ensure server is running on port 8000 and client on port 3000

#### Issue: OAuth callback URL mismatch
**Symptoms**: OAuth provider shows "redirect URI mismatch" error
**Solution**: Check that `API_BASE_URL` is set correctly in environment

#### Issue: Database connection failed
**Symptoms**: Server crashes or shows database errors
**Solution**: Check `DATABASE_URL` and ensure database is accessible

### Testing the Fix

1. **Set Environment Variables**: Run the setup script
2. **Restart Server**: Stop and restart the server
3. **Test OAuth Flow**: Try connecting Klaviyo again
4. **Check Logs**: Monitor both server and browser console
5. **Verify Status**: Check if integration status updates correctly

### Expected Flow After Fix

1. User clicks "Connect" on Klaviyo card
2. Frontend calls `/api/integrations/klaviyo/connect`
3. Backend returns OAuth URL
4. User is redirected to Klaviyo OAuth page
5. User authorizes the app
6. Klaviyo redirects to `/api/integrations/klaviyo/callback`
7. Backend processes OAuth callback and saves integration
8. Backend redirects to `/dashboard?connected=klaviyo&integration=123`
9. Frontend detects URL parameters and refreshes status
10. Integration card shows "Connected" status

### Additional Debugging

If the issue persists, check:
- Network tab in browser DevTools for failed requests
- Server console for any error messages
- Database for incomplete or failed integration records
- OAuth provider settings (redirect URIs, scopes, etc.)
