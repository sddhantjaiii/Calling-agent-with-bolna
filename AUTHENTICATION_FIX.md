# 🔐 Authentication Fix - Campaign Frontend

**Issue**: API endpoints returning `MISSING_TOKEN` error  
**Date**: October 9, 2025  
**Status**: ✅ **FIXED**

---

## 🐛 Problem Identified

The campaign frontend components were using plain `fetch()` calls without authentication headers:

```typescript
// ❌ BEFORE (No Auth)
const response = await fetch('/api/campaigns');
```

Backend middleware requires JWT token in `Authorization` header:
```typescript
Authorization: Bearer <token>
```

---

## ✅ Solution Implemented

### 1. **Created Auth Utility** 
**File**: `frontend/src/utils/auth.ts`

```typescript
// Helper to get auth headers
export const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('auth_token');
  return token 
    ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
};

// Wrapper for authenticated fetch
export const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
  const authHeaders = getAuthHeaders();
  // Handle FormData (don't set Content-Type for file uploads)
  const headers = options.body instanceof FormData 
    ? { 'Authorization': authHeaders['Authorization'] } 
    : authHeaders;
  
  return fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
};
```

### 2. **Updated All Components**

#### ✅ Campaigns.tsx
- ✅ Campaign list fetch
- ✅ Start mutation
- ✅ Pause mutation
- ✅ Resume mutation
- ✅ Cancel mutation
- ✅ Delete mutation

```typescript
// ✅ AFTER (With Auth)
const response = await authenticatedFetch('/api/campaigns');
```

#### ✅ CreateCampaignModal.tsx
- ✅ Agents fetch (for dropdown)
- ✅ Create campaign mutation
- ✅ CSV upload mutation (special handling for FormData)

```typescript
// For FormData, only add Authorization (no Content-Type)
const token = localStorage.getItem('auth_token');
const response = await fetch('/api/campaigns/upload-csv', {
  method: 'POST',
  headers: token ? { 'Authorization': `Bearer ${token}` } : {},
  body: formData,
});
```

#### ✅ CampaignDetailsDialog.tsx
- ✅ Analytics fetch

---

## 🔑 How It Works

1. **Token Storage**: Auth token stored in `localStorage` as `auth_token`
2. **Token Retrieval**: `getAuthHeaders()` gets token from localStorage
3. **Header Format**: `Authorization: Bearer <token>`
4. **Auto-Application**: `authenticatedFetch()` wrapper adds headers automatically
5. **FormData Special Case**: File uploads only get Authorization header (not Content-Type)

---

## 📊 Files Modified

| File | Changes | Status |
|------|---------|--------|
| `frontend/src/utils/auth.ts` | Created new file | ✅ New |
| `frontend/src/pages/Campaigns.tsx` | Added auth to 6 API calls | ✅ Fixed |
| `frontend/src/components/campaigns/CreateCampaignModal.tsx` | Added auth to 3 API calls | ✅ Fixed |
| `frontend/src/components/campaigns/CampaignDetailsDialog.tsx` | Added auth to 1 API call | ✅ Fixed |

**Total**: 4 files, 10 authenticated API calls

---

## ✅ Testing Checklist

Now all these should work (assuming you're logged in):

- ✅ `GET /api/campaigns` - List campaigns
- ✅ `GET /api/agents` - Get agents for dropdown
- ✅ `POST /api/campaigns` - Create campaign
- ✅ `POST /api/campaigns/upload-csv` - Upload CSV
- ✅ `POST /api/campaigns/:id/start` - Start campaign
- ✅ `POST /api/campaigns/:id/pause` - Pause campaign
- ✅ `POST /api/campaigns/:id/resume` - Resume campaign
- ✅ `POST /api/campaigns/:id/cancel` - Cancel campaign
- ✅ `DELETE /api/campaigns/:id` - Delete campaign
- ✅ `GET /api/campaigns/:id/analytics` - Get analytics

---

## 🚀 Next Steps

1. **Restart Frontend Dev Server** (if running)
   ```bash
   cd frontend
   npm run dev
   ```

2. **Login to Your App**
   - Make sure you're logged in
   - Token will be in localStorage

3. **Test Campaigns**
   - Click on 🎯 Campaigns in sidebar
   - Should now load without authentication errors!

---

## 💡 Why This Pattern?

This follows your existing codebase pattern:

- ✅ Uses same `localStorage.getItem('auth_token')` as `apiService.ts`
- ✅ Uses same `Bearer` token format as backend expects
- ✅ Handles FormData correctly (no Content-Type for file uploads)
- ✅ Simple wrapper function for consistency
- ✅ Can be reused in other components

---

**Status**: 🟢 **Authentication Fixed - Ready to Test!**
