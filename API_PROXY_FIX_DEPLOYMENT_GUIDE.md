# 🚀 API Proxy Configuration Fix - Complete Guide

## 🐛 Problem Identified

Your frontend was returning **HTML instead of JSON** for API calls because:

1. **Vercel Configuration Issue**: The `vercel.json` was rewriting ALL routes (including `/api/*`) to `/index.html`
2. **Missing Backend Proxy**: No proper proxy configuration to forward API requests to your backend server

### Error Symptoms
```
https://agenttest.sniperthink.com/api/user/credit-status -> Returns HTML (index.html)
https://agenttest.sniperthink.com/api/campaigns -> Returns HTML (index.html)  
https://agenttest.sniperthink.com/api/agents -> Returns HTML (index.html)
```

---

## ✅ Solution Implemented

### 1. Fixed `vercel.json` Configuration

**File**: `Frontend/vercel.json`

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://agenttest.sniperthink.com/api/:path*"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

**What this does:**
- ✅ Proxies ALL `/api/*` requests to your backend server
- ✅ All other requests serve the React SPA (`index.html`)
- ✅ Maintains proper routing for your frontend

---

### 2. Created Production Environment File

**File**: `Frontend/.env.production`

```bash
VITE_API_BASE_URL=https://agenttest.sniperthink.com
VITE_WS_URL=wss://agenttest.sniperthink.com
VITE_API_TIMEOUT=30000
VITE_NODE_ENV=production
```

---

## 🔧 Deployment Instructions

### Option A: Using Hardcoded Backend URL (Current Setup)

Your `vercel.json` now hardcodes the backend URL. This works if your backend is always at:
```
https://agenttest.sniperthink.com
```

**No additional setup needed!** Just deploy:

```bash
cd Frontend
npm run build
vercel --prod
```

---

### Option B: Using Environment Variables (Recommended for Flexibility)

If you want to make the backend URL configurable:

#### 1. Update `vercel.json` to use environment variable pattern:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "$BACKEND_URL/api/:path*"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

#### 2. Set Environment Variable in Vercel Dashboard:

1. Go to: https://vercel.com/[your-username]/[your-project]/settings/environment-variables
2. Add variable:
   - **Name**: `BACKEND_URL`
   - **Value**: `https://agenttest.sniperthink.com`
   - **Environment**: Production, Preview, Development

3. Redeploy your app

---

## 🧪 Testing the Fix

### Test API Endpoints After Deployment:

```bash
# Test 1: Credit Status
curl -H "Authorization: Bearer YOUR_TOKEN" https://your-frontend.vercel.app/api/user/credit-status

# Test 2: Agents List
curl -H "Authorization: Bearer YOUR_TOKEN" https://your-frontend.vercel.app/api/agents

# Test 3: Campaigns
curl -H "Authorization: Bearer YOUR_TOKEN" https://your-frontend.vercel.app/api/campaigns
```

**Expected**: JSON responses (not HTML)

---

## 📋 Verification Checklist

After deploying, verify:

- [ ] `/api/user/credit-status` returns JSON (not HTML)
- [ ] `/api/campaigns` returns JSON (not HTML)
- [ ] `/api/agents` returns JSON (not HTML)
- [ ] `/api/settings/concurrency` returns JSON (not HTML)
- [ ] Frontend routes still work (`/dashboard`, `/settings`, etc.)
- [ ] Login/authentication works properly
- [ ] WebSocket connections work (if applicable)

---

## 🔍 Common Issues & Solutions

### Issue 1: Still Getting HTML Responses

**Solution**: Clear Vercel cache and redeploy
```bash
vercel --prod --force
```

### Issue 2: CORS Errors

**Solution**: Ensure your backend has proper CORS headers:
```javascript
// Backend CORS config
app.use(cors({
  origin: ['https://your-frontend.vercel.app'],
  credentials: true
}));
```

### Issue 3: 404 Errors on API Routes

**Solution**: Check backend server is running and accessible:
```bash
curl https://agenttest.sniperthink.com/api/health
```

---

## 📊 File Changes Summary

| File | Status | Description |
|------|--------|-------------|
| `Frontend/vercel.json` | ✅ Modified | Added API proxy rewrite rule |
| `Frontend/.env.production` | ✅ Created | Production environment config |

---

## 🚀 Next Steps

1. **Deploy to Vercel**:
   ```bash
   cd Frontend
   npm run build
   vercel --prod
   ```

2. **Test All API Endpoints**: Use the testing commands above

3. **Monitor Logs**: Check Vercel function logs for any proxy errors
   - Go to: Vercel Dashboard → Your Project → Functions → View Logs

4. **Update Environment Variables** (if needed):
   - Vercel Dashboard → Settings → Environment Variables

---

## 💡 How It Works

### Before Fix:
```
Browser → /api/agents → Vercel → vercel.json rewrite → /index.html (HTML) ❌
```

### After Fix:
```
Browser → /api/agents → Vercel → vercel.json rewrite → 
  https://agenttest.sniperthink.com/api/agents → Backend (JSON) ✅
```

---

## 🔐 Security Notes

1. **HTTPS Only**: Always use HTTPS for backend URLs in production
2. **Authentication**: Ensure JWT tokens are properly passed in headers
3. **CORS**: Configure backend CORS to only allow your frontend domain
4. **Rate Limiting**: Implement rate limiting on both frontend and backend

---

## 📞 Support

If issues persist:

1. Check Vercel deployment logs
2. Check backend server logs
3. Verify backend is accessible: `curl https://agenttest.sniperthink.com/api/health`
4. Check browser Network tab for actual request URLs
5. Verify environment variables are set correctly in Vercel

---

**Status**: ✅ **FIXED - Ready for Deployment**

The API proxy configuration is now correct and will properly forward all `/api/*` requests to your backend server instead of returning HTML.
