# WhatsApp Template R2 Integration - Setup Complete ✅

## Overview
Backend is now fully integrated with Cloudflare R2 and WhatsApp microservice for template management with media support.

## Architecture Flow
```
Frontend → Backend (port 3000) → R2 Upload → WhatsApp Microservice (port 4000) → Meta API
```

## What Was Implemented

### 1. Environment Configuration ✅
- **Files Updated**: `.env` and `.env.example`
- **R2 Credentials**: Added your actual R2 credentials
- **WhatsApp Service URL**: `CHAT_AGENT_SERVER_URL=http://localhost:4000`

```env
# R2 Configuration
R2_ACCOUNT_ID=3c946c1874c456b1fdef2a60890675a5
R2_ACCESS_KEY_ID=1d7a8d264c46907af2ba3ca8cc6354e1
R2_SECRET_ACCESS_KEY=a3b1f18f5b952929218cf168c7d1dd343a1a8c3e66060a08bf3e2bf5f2cc9e6c
R2_BUCKET_NAME=calling-agent
R2_PUBLIC_URL=https://pub-969c174d4aad4d5fac6e674467066c51.r2.dev
```

### 2. R2 Storage Service ✅
**File**: `backend/src/services/r2StorageService.ts`

**Features**:
- Upload media files to R2 (IMAGE, VIDEO, DOCUMENT)
- Validate file types and sizes per WhatsApp requirements
- Generate unique filenames with timestamps
- Return public URLs for Meta to fetch
- Delete files from R2
- Check file existence

**Supported Media**:
- **IMAGE**: JPG, PNG (max 5MB)
- **VIDEO**: MP4 (max 16MB)
- **DOCUMENT**: PDF (max 100MB)

**Usage**:
```typescript
import { uploadToR2 } from '../services/r2StorageService';

const result = await uploadToR2(
  {
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
  },
  'IMAGE', // or 'VIDEO', 'DOCUMENT'
  userId
);

if (result.success) {
  console.log(result.url); // https://pub-xxxxx.r2.dev/templates/...
}
```

### 3. WhatsApp Microservice Client ✅
**File**: `backend/src/services/whatsappService.ts`

**Features**:
- Axios client configured for port 4000
- Template CRUD operations
- Submit templates to Meta
- Sync templates from Meta
- Button click analytics
- Request/response logging
- Error handling

**Available Methods**:
- `listTemplates(options)` - List all templates
- `getTemplate(templateId)` - Get single template
- `createTemplate(data)` - Create new template
- `deleteTemplate(templateId)` - Delete template
- `submitTemplate(templateId)` - Submit to Meta
- `syncTemplates(userId, phoneNumberId)` - Sync from Meta
- `getButtonClicks(templateId)` - Get button analytics
- `listButtonClicks(options)` - List all clicks
- `getLeadButtonActivity(phone, userId)` - Lead activity

### 4. WhatsApp Controller ✅
**File**: `backend/src/controllers/whatsappController.ts`

**Features**:
- Multer integration for multipart/form-data
- Automatic media upload to R2 before template creation
- Inject R2 URLs into template components
- Proxy all requests to WhatsApp microservice
- Clean up R2 files on template deletion

### 5. Routes ✅
**File**: `backend/src/routes/whatsapp.ts`
**Mounted At**: `/api/whatsapp`

**Endpoints**:
```
GET    /api/whatsapp/templates                              - List templates
GET    /api/whatsapp/templates/:templateId                  - Get template
POST   /api/whatsapp/templates                              - Create template (multipart)
DELETE /api/whatsapp/templates/:templateId                  - Delete template
POST   /api/whatsapp/templates/:templateId/submit           - Submit to Meta
POST   /api/whatsapp/templates/sync                         - Sync from Meta
GET    /api/whatsapp/templates/:templateId/button-clicks    - Button analytics
GET    /api/whatsapp/button-clicks                          - List all clicks
GET    /api/whatsapp/leads/:customerPhone/button-activity   - Lead activity
```

### 6. Main Router Updated ✅
**File**: `backend/src/routes/index.ts`
- WhatsApp routes mounted with authentication
- Rate limiting applied

## Frontend Usage Guide

### Creating Template with Image

```typescript
// Frontend code
const formData = new FormData();

// Add image file
const imageFile = document.querySelector('input[type="file"]').files[0];
formData.append('media', imageFile);

// Add template data as JSON string
const templateData = {
  user_id: 'user_123',
  phone_number_id: 'pn_456',
  name: 'welcome_message',
  category: 'MARKETING',
  components: [
    // HEADER will be auto-populated with R2 URL
    {
      type: 'BODY',
      text: 'Hello {{1}}! Welcome to our service.',
      example: {
        body_text: [['John']]
      }
    },
    {
      type: 'BUTTONS',
      buttons: [
        { type: 'QUICK_REPLY', text: 'Get Started' }
      ]
    }
  ],
  variables: [
    {
      variable_name: 'customer_name',
      position: 1,
      component_type: 'BODY',
      default_value: 'Customer'
    }
  ]
};

formData.append('templateData', JSON.stringify(templateData));

// Send to backend
const response = await fetch('http://localhost:3000/api/whatsapp/templates', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const result = await response.json();
console.log(result);
```

### List Templates

```typescript
const response = await fetch('http://localhost:3000/api/whatsapp/templates?status=APPROVED&limit=50', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data } = await response.json();
console.log(data); // Array of templates
```

### Submit Template to Meta

```typescript
const response = await fetch(`http://localhost:3000/api/whatsapp/templates/${templateId}/submit`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const result = await response.json();
// Status changes to PENDING, Meta reviews it
```

### Get Button Click Analytics

```typescript
const response = await fetch(`http://localhost:3000/api/whatsapp/templates/${templateId}/button-clicks`, {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data } = await response.json();
// [{button_id, button_text, total_clicks, unique_leads, click_rate}]
```

## Testing the Setup

### 1. Start Backend
```bash
cd backend
npm run dev
```

### 2. Check R2 Connection
The backend will log R2 configuration status on startup.

### 3. Verify WhatsApp Microservice
Make sure your WhatsApp microservice is running on port 4000:
```bash
# In another terminal
curl http://localhost:4000/admin/templates
```

### 4. Test Upload Endpoint
```bash
curl -X POST http://localhost:3000/api/whatsapp/templates \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "media=@path/to/image.jpg" \
  -F 'templateData={"user_id":"user_123","phone_number_id":"pn_456","name":"test_template","category":"MARKETING","components":[{"type":"BODY","text":"Hello {{1}}!","example":{"body_text":[["John"]]}}]}'
```

## File Structure

```
backend/src/
├── services/
│   ├── r2StorageService.ts       ← R2 upload/delete operations
│   └── whatsappService.ts        ← WhatsApp microservice client
├── controllers/
│   └── whatsappController.ts     ← Request handlers
├── routes/
│   ├── whatsapp.ts               ← WhatsApp routes
│   └── index.ts                  ← Main router (updated)
└── .env                          ← R2 credentials added
```

## Dependencies Installed

```json
{
  "@aws-sdk/client-s3": "^3.x.x"  ← S3-compatible R2 client
}
```

Already had: `multer` for file uploads

## Security Features

- ✅ JWT authentication required on all routes
- ✅ Rate limiting applied
- ✅ File type validation (prevents malicious uploads)
- ✅ File size validation (prevents large uploads)
- ✅ Unique filenames (prevents overwriting)
- ✅ Multi-tenant isolation (user_id filtering)

## Next Steps for Frontend

1. **Create Template Form UI**
   - File upload input for media
   - Template name, category
   - Component builder (body, buttons, footer)
   - Variable mapping

2. **Template List View**
   - Display templates with status badges
   - Thumbnail for image templates
   - Actions: Edit, Delete, Submit, View Analytics

3. **Template Submission Flow**
   - Create template (status: DRAFT)
   - Preview template
   - Submit to Meta (status: PENDING)
   - Poll for approval (status: APPROVED)

4. **Analytics Dashboard**
   - Button click rates per template
   - Lead engagement timeline
   - Top performing templates

## Troubleshooting

### R2 Upload Fails
- Check R2 credentials in `.env`
- Verify bucket name is correct
- Ensure bucket has public access enabled
- Check file size limits

### WhatsApp Service Connection Error
- Ensure microservice is running on port 4000
- Check `CHAT_AGENT_SERVER_URL` in `.env`
- Verify network connectivity

### File Upload Errors
- Check file type (only JPG, PNG, MP4, PDF)
- Verify file size limits
- Ensure multipart/form-data content type

## Production Checklist

Before deploying to production:

- [ ] Update R2 credentials in Railway environment variables
- [ ] Set `R2_PUBLIC_URL` to production domain
- [ ] Update `CHAT_AGENT_SERVER_URL` to production microservice URL
- [ ] Enable CORS for production frontend domain
- [ ] Test file upload with production R2 bucket
- [ ] Verify WhatsApp microservice connectivity
- [ ] Test template submission to Meta
- [ ] Monitor R2 storage usage

## API Reference

Full API documentation is available in: `TEMPLATE_API_REFERENCE.md`

## Summary

✅ R2 Storage configured and ready
✅ WhatsApp microservice client implemented
✅ Template CRUD with media upload working
✅ Routes mounted and authenticated
✅ Ready for frontend integration

**Status**: All backend components ready for WhatsApp template integration!
