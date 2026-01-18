# Email Campaign Personalization - Complete Implementation

## Overview
Complete email personalization system with dynamic tokens, validation, templates, and live preview.

## Features Implemented

### 1. Token System
- **Supported Tokens**: `{first_name}`, `{last_name}`, `{name}`, `{email}`, `{phone_number}`, `{company}`, `{city}`, `{country}`, `{business_context}`
- **Fallback Syntax**: `{token|Fallback text}` - e.g., `{first_name|Valued Customer}`
- **Name Parsing**: Automatically extracts `first_name` and `last_name` from `name` field
- **No Case Transformations**: Preserves original text exactly as stored

### 2. Validation System
- **Strict Blocking Validation**: Campaign creation blocked if tokens without fallbacks reference missing data
- **Contact-Level Error Report**: Detailed validation showing which contacts are missing which tokens
- **Client + Server Validation**: Both frontend and backend validate before sending
- **Validation Timing**: Only at campaign creation (not during editing or other stages)

### 3. Template Library
- **8 Pre-built Templates**:
  - Introduction: 2 templates (product intro, service intro)
  - Follow-up: 2 templates (meeting follow-up, general follow-up)
  - Promotion: 1 template (special offer)
  - Event: 1 template (webinar invitation)
  - Thank You: 2 templates (purchase thank you, feedback thank you)
- **System-Wide Access**: All users can use system templates
- **Template Categories**: Filterable by category (introduction, follow_up, promotion, event, thank_you)
- **Template Search**: Search by name or subject

### 4. Live Preview
- **Per-Contact Preview**: See how email renders for each recipient
- **Sample Contact Selector**: Dropdown to choose which contact to preview
- **Token Highlighting**: Shows which tokens are used in subject/body
- **Real-time Updates**: Preview updates as you type

### 5. UI Components
- **Token Picker**: Dropdown with all available tokens organized by category
- **Template Selector**: Modal dialog to browse and select templates
- **Preview Panel**: Live preview with contact selector
- **Token Autocomplete**: `{` keystroke triggers token suggestions (ready for integration)

## Backend Implementation

### Files Created/Modified

#### 1. `backend/src/utils/emailTokenReplacer.ts` (NEW)
**Purpose**: Core token parsing, validation, and replacement engine

**Key Functions**:
- `extractTokens(text)`: Extract all tokens from text
- `parseToken(tokenString)`: Split token from fallback
- `replaceTokens(text, contact)`: Replace tokens with contact data
- `validateTokensForContacts(subject, body, contactIds)`: Validate tokens against contacts
- `getSupportedTokens()`: Get list of supported tokens
- `generatePreview(subject, body, contact)`: Generate preview for one contact
- `extractFirstName(name)` / `extractLastName(name)`: Parse name components

**Interface**:
```typescript
interface ContactData {
  name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  company?: string | null;
  city?: string | null;
  country?: string | null;
  business_context?: string | null;
}

interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    contactId: string;
    contactName: string;
    contactEmail: string;
    missingTokens: string[];
  }>;
  totalContacts: number;
  contactsWithErrors: number;
}
```

#### 2. `backend/src/migrations/1010_add_email_id_to_lead_analytics.sql` (NEW)
**Purpose**: Link sent emails to lead analytics timeline

**Schema Changes**:
```sql
ALTER TABLE lead_analytics ADD COLUMN email_id UUID NULL;
ALTER TABLE lead_analytics ADD CONSTRAINT fk_lead_analytics_email
  FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE SET NULL;
CREATE INDEX idx_lead_analytics_email_id ON lead_analytics(email_id);
```

#### 3. `backend/src/constants/emailTemplates.ts` (NEW)
**Purpose**: System-wide reusable email templates

**Template Structure**:
```typescript
interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: 'introduction' | 'follow_up' | 'promotion' | 'event' | 'thank_you';
  tokens_used: string[];
}
```

**Available Templates**:
- `intro-1`: Product Introduction Email
- `intro-2`: Service Introduction Email
- `followup-1`: Meeting Follow-up Email
- `followup-2`: General Follow-up Email
- `promo-1`: Special Offer Promotion
- `event-1`: Webinar/Event Invitation
- `thankyou-1`: Purchase Thank You
- `thankyou-2`: Feedback Thank You

#### 4. `backend/src/services/emailCampaignService.ts` (MODIFIED)
**Added Methods**:
- `validateCampaignTokens(userId, subject, body, contactIds)`: Validate tokens before campaign creation
  - Fetches contacts from database
  - Calls `validateTokensForContacts()` utility
  - Returns detailed validation report

**Modified Methods**:
- `createEmailCampaign()`:
  - Added validation before campaign creation
  - Throws error with validation details if tokens missing
  - Blocks campaign creation on validation failure
  
- `sendCampaignEmails()`:
  - Added per-contact token replacement using `replaceTokens()`
  - Personalizes both subject and body for each recipient
  - Fetches full contact data (including company, city, country, business_context)
  - Links sent emails to `lead_analytics` via `email_id` after successful send
  - Updates existing lead_analytics records (most recent) with email_id

#### 5. `backend/src/controllers/emailCampaignController.ts` (NEW)
**Purpose**: API controllers for email campaign endpoints

**Endpoints**:
- `POST /api/email-campaigns/validate`: Validate tokens before creation
- `POST /api/email-campaigns`: Create email campaign (with validation)
- `GET /api/email-campaigns/:id`: Get campaign details
- `GET /api/email-campaigns`: List user's campaigns
- `GET /api/email-campaigns/templates`: Get system templates

#### 6. `backend/src/routes/emailCampaignRoutes.ts` (MODIFIED)
**Added Routes**:
```typescript
router.get('/templates', authenticateToken, EmailCampaignController.getTemplates);
router.post('/validate', authenticateToken, EmailCampaignController.validateTokens);
```

## Frontend Implementation

### Files Created

#### 1. `Frontend/src/components/campaigns/EmailTokenPicker.tsx` (NEW)
**Purpose**: Token insertion dropdown

**Features**:
- Displays all supported tokens grouped by category (Contact, Company)
- Click to insert token at cursor position
- Shows token usage examples and fallback syntax
- Disabled state support

**Props**:
```typescript
interface EmailTokenPickerProps {
  onInsertToken: (token: string) => void;
  disabled?: boolean;
}
```

#### 2. `Frontend/src/components/campaigns/EmailTemplateSelector.tsx` (NEW)
**Purpose**: Browse and select email templates

**Features**:
- Fetches system templates from API
- Search by template name or subject
- Filter by category (all, introduction, follow_up, promotion, event, thank_you)
- Shows tokens used in each template
- Preview template content
- Click to apply template to campaign

**Props**:
```typescript
interface EmailTemplateSelectorProps {
  onSelectTemplate: (template: EmailTemplate) => void;
  disabled?: boolean;
}
```

#### 3. `Frontend/src/components/campaigns/EmailPreview.tsx` (NEW)
**Purpose**: Live email preview with token replacement

**Features**:
- Select sample contact from dropdown
- Auto-fetches contact data
- Replaces tokens in real-time
- Shows which tokens are used
- Displays personalized subject and body
- Updates as you type

**Props**:
```typescript
interface EmailPreviewProps {
  subject: string;
  body: string;
  selectedContactIds: string[];
}
```

### Integration with CreateCampaignModal.tsx

**Required Changes** (to be integrated):

1. **Import Components**:
```typescript
import { EmailTokenPicker } from './EmailTokenPicker';
import { EmailTemplateSelector, EmailTemplate } from './EmailTemplateSelector';
import { EmailPreview } from './EmailPreview';
```

2. **Add Token Insertion Handler**:
```typescript
const insertTokenIntoSubject = (token: string) => {
  setEmailSubject(prev => prev + `{${token}}`);
};

const insertTokenIntoBody = (token: string) => {
  setEmailBody(prev => prev + `{${token}}`);
};
```

3. **Add Template Handler**:
```typescript
const handleSelectTemplate = (template: EmailTemplate) => {
  setEmailSubject(template.subject);
  setEmailBody(template.body);
};
```

4. **Add Token Picker to Email Subject Section**:
```tsx
<div className="space-y-2">
  <Label htmlFor="emailSubject">Email Subject</Label>
  <div className="flex gap-2">
    <Input
      id="emailSubject"
      value={emailSubject}
      onChange={(e) => setEmailSubject(e.target.value)}
      placeholder="Enter email subject"
    />
    <EmailTokenPicker onInsertToken={insertTokenIntoSubject} />
  </div>
</div>
```

5. **Add Token Picker and Template Selector to Email Body Section**:
```tsx
<div className="space-y-2">
  <Label htmlFor="emailBody">Email Body</Label>
  <div className="flex gap-2 mb-2">
    <EmailTemplateSelector onSelectTemplate={handleSelectTemplate} />
    <EmailTokenPicker onInsertToken={insertTokenIntoBody} />
  </div>
  <Textarea
    id="emailBody"
    value={emailBody}
    onChange={(e) => setEmailBody(e.target.value)}
    placeholder="Enter email body (HTML supported)"
    rows={10}
  />
</div>
```

6. **Add Live Preview Below Email Body**:
```tsx
{selectedContacts.length > 0 && (
  <EmailPreview
    subject={emailSubject}
    body={emailBody}
    selectedContactIds={selectedContacts}
  />
)}
```

7. **Add Validation API Call Before Campaign Creation**:
```typescript
// Inside handleSubmit, before creating campaign:
if (campaignType === 'email') {
  // Validate tokens
  const validateResponse = await authenticatedFetch(
    `${API_ENDPOINTS.EMAIL_CAMPAIGNS}/validate`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject: emailSubject,
        body: emailBody,
        contactIds: selectedContacts,
      }),
    }
  );

  if (!validateResponse.ok) {
    throw new Error('Validation failed');
  }

  const validationResult = await validateResponse.json();
  
  if (!validationResult.data.isValid) {
    // Show validation errors
    const errorMessage = validationResult.data.errors
      .map((err: any) => `${err.contactName}: Missing ${err.missingTokens.join(', ')}`)
      .join('\n');
    
    toast({
      title: 'Validation Error',
      description: `${validationResult.data.contactsWithErrors} contacts have missing data:\n${errorMessage}`,
      variant: 'destructive',
    });
    return; // Block campaign creation
  }
}
```

## API Endpoints

### New Endpoints

#### 1. GET `/api/email-campaigns/templates`
**Purpose**: Fetch system email templates

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "intro-1",
      "name": "Product Introduction Email",
      "subject": "Introducing {name} - Transform Your Business",
      "body": "<p>Dear {first_name},</p><p>...</p>",
      "category": "introduction",
      "tokens_used": ["name", "first_name", "company"]
    }
  ],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### 2. POST `/api/email-campaigns/validate`
**Purpose**: Validate campaign tokens before creation

**Request**:
```json
{
  "subject": "Hi {first_name}!",
  "body": "Welcome to {company}",
  "contactIds": ["uuid1", "uuid2"]
}
```

**Response** (Success):
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "errors": [],
    "totalContacts": 2,
    "contactsWithErrors": 0
  }
}
```

**Response** (Validation Error):
```json
{
  "success": true,
  "data": {
    "isValid": false,
    "errors": [
      {
        "contactId": "uuid1",
        "contactName": "John Doe",
        "contactEmail": "john@example.com",
        "missingTokens": ["company"]
      }
    ],
    "totalContacts": 2,
    "contactsWithErrors": 1
  }
}
```

#### 3. POST `/api/email-campaigns` (Enhanced)
**Purpose**: Create email campaign with token validation

**Request**:
```json
{
  "name": "Q1 Product Launch",
  "subject": "Hi {first_name}, check out our new product!",
  "bodyHtml": "<p>Dear {first_name},</p><p>We at {company|Your Company} are excited...</p>",
  "bodyText": "Dear {first_name}, We at {company|Your Company} are excited...",
  "contactIds": ["uuid1", "uuid2"],
  "attachments": []
}
```

**Response** (Success):
```json
{
  "success": true,
  "data": {
    "id": "campaign-uuid",
    "name": "Q1 Product Launch",
    "status": "sent",
    "sent_count": 2,
    "total_count": 2
  }
}
```

**Response** (Validation Error):
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Missing required tokens without fallbacks: 2 contacts have missing data",
    "details": {
      "isValid": false,
      "errors": [...]
    }
  }
}
```

## Database Schema Changes

### lead_analytics Table
```sql
ALTER TABLE lead_analytics ADD COLUMN email_id UUID NULL;
ALTER TABLE lead_analytics ADD CONSTRAINT fk_lead_analytics_email
  FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE SET NULL;
CREATE INDEX idx_lead_analytics_email_id ON lead_analytics(email_id);
```

**Purpose**: Link sent campaign emails to lead analytics timeline for contact interaction history.

**Update Pattern**: After sending email, update most recent lead_analytics record:
```sql
UPDATE lead_analytics 
SET email_id = $1, updated_at = NOW()
WHERE user_id = $2 AND phone_number = $3 AND email_id IS NULL
ORDER BY created_at DESC
LIMIT 1
```

## Token Replacement Logic

### Name Parsing
```typescript
// Extract first name from "John Doe" -> "John"
function extractFirstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || '';
}

// Extract last name from "John Doe Smith" -> "Doe Smith"
function extractLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : '';
}
```

### Token Replacement
```typescript
// Regex: /\{([a-z_]+)(?:\|([^}]+))?\}/g
// Matches: {token} or {token|fallback}

function replaceTokens(text: string, contact: ContactData): string {
  return text.replace(/\{([a-z_]+)(?:\|([^}]+))?\}/g, (match, token, fallback) => {
    const value = getTokenValue(token, contact);
    if (value && value.trim()) {
      return value;
    }
    return fallback || match; // Use fallback or keep original token
  });
}
```

### Validation Logic
```typescript
function validateTokensForContacts(
  subject: string,
  body: string,
  contacts: Contact[]
): ValidationResult {
  const errors = [];
  
  for (const contact of contacts) {
    const missingTokens = [];
    const allTokens = extractTokens(subject + ' ' + body);
    
    for (const tokenMatch of allTokens) {
      const { token, hasFallback } = parseToken(tokenMatch);
      
      // Only validate tokens without fallbacks
      if (!hasFallback) {
        const value = getTokenValue(token, contact);
        if (!value || !value.trim()) {
          missingTokens.push(token);
        }
      }
    }
    
    if (missingTokens.length > 0) {
      errors.push({
        contactId: contact.id,
        contactName: contact.name,
        contactEmail: contact.email,
        missingTokens,
      });
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    totalContacts: contacts.length,
    contactsWithErrors: errors.length,
  };
}
```

## Usage Examples

### 1. Simple Personalization
```
Subject: Hi {first_name}!
Body: Dear {first_name}, thank you for joining {company}.
```

**Contact Data**:
```json
{
  "name": "John Doe",
  "company": "Acme Corp"
}
```

**Result**:
```
Subject: Hi John!
Body: Dear John, thank you for joining Acme Corp.
```

### 2. With Fallbacks
```
Subject: Hello {first_name|Valued Customer}!
Body: We at {company|our company} appreciate your business.
```

**Contact Data** (missing company):
```json
{
  "name": "Jane Smith",
  "company": null
}
```

**Result**:
```
Subject: Hello Jane!
Body: We at our company appreciate your business.
```

### 3. Validation Blocking
```
Subject: Hi {first_name}
Body: Welcome to {company}
```

**Contact Data** (missing company):
```json
{
  "name": "Bob Wilson",
  "company": null
}
```

**Validation Result**:
```
❌ Campaign creation blocked!
Error: Bob Wilson (bob@example.com) is missing: company
```

### 4. Using Templates
1. Click "Use Template" button
2. Select "Product Introduction Email" from template library
3. Template auto-fills subject and body with tokens
4. Customize template text as needed
5. Add/remove tokens using token picker
6. Preview how it looks for each contact
7. Create campaign

## Testing

### Backend Testing

1. **Token Replacement**:
```bash
# Test token extraction
extractTokens("Hi {first_name}, welcome to {company}!")
# Returns: ["first_name", "company"]

# Test replacement
replaceTokens("Hi {first_name}", { name: "John Doe" })
# Returns: "Hi John"
```

2. **Validation**:
```bash
# POST /api/email-campaigns/validate
curl -X POST http://localhost:3000/api/email-campaigns/validate \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Hi {first_name}",
    "body": "Welcome to {company}",
    "contactIds": ["uuid1"]
  }'
```

3. **Campaign Creation**:
```bash
# POST /api/email-campaigns
curl -X POST http://localhost:3000/api/email-campaigns \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Campaign",
    "subject": "Hi {first_name|Customer}",
    "bodyHtml": "<p>Welcome {first_name}!</p>",
    "bodyText": "Welcome {first_name}!",
    "contactIds": ["uuid1", "uuid2"]
  }'
```

### Frontend Testing

1. **Token Picker**:
   - Click "Insert Token" button
   - Verify tokens grouped by category
   - Click token to insert `{token_name}`

2. **Template Selector**:
   - Click "Use Template"
   - Search for templates
   - Filter by category
   - Click template to apply

3. **Live Preview**:
   - Select contacts
   - Type in subject/body with tokens
   - Change preview contact from dropdown
   - Verify personalization updates

4. **Validation**:
   - Create campaign with tokens without fallbacks
   - Verify validation error shows missing data
   - Add fallbacks and retry
   - Verify campaign creates successfully

## Migration Notes

### Running the Migration

The migration runs automatically on server start via `migrationRunner.ts`.

**Manual Run** (if needed):
```bash
cd backend
npm run migrate
```

**Verify Migration**:
```sql
-- Check if email_id column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'lead_analytics' AND column_name = 'email_id';

-- Check index
SELECT indexname FROM pg_indexes 
WHERE tablename = 'lead_analytics' AND indexname = 'idx_lead_analytics_email_id';
```

### Rollback (if needed)
```sql
ALTER TABLE lead_analytics DROP CONSTRAINT IF EXISTS fk_lead_analytics_email;
DROP INDEX IF EXISTS idx_lead_analytics_email_id;
ALTER TABLE lead_analytics DROP COLUMN IF EXISTS email_id;
```

## Best Practices

### For Users

1. **Always Use Fallbacks**: Use `{first_name|Customer}` instead of `{first_name}` to avoid validation errors
2. **Preview Before Sending**: Check how emails render for different contacts
3. **Use Templates**: Start with a template and customize
4. **Test with Sample Contact**: Preview with a contact that has minimal data to see fallbacks work

### For Developers

1. **Token Naming**: Use lowercase with underscores (e.g., `business_context`, not `businessContext`)
2. **Fallback Delimiter**: Always use `|` (never allow `|` in fallback text)
3. **Validation Timing**: Only validate at campaign creation, not on every keystroke
4. **Error Messages**: Show contact-level detail (which contact missing which tokens)
5. **Database Queries**: Always include all token fields in SELECT when fetching contacts

## Future Enhancements

### Potential Features (Not Implemented)

1. **Custom User Templates**: Allow users to save their own templates (requires new `user_email_templates` table)
2. **Conditional Content**: `{if company}Welcome to {company}{/if}` blocks
3. **Token Transformations**: `{first_name|uppercase}`, `{name|titlecase}`
4. **Advanced Tokens**: `{unsubscribe_link}`, `{view_in_browser_link}`
5. **A/B Testing**: Multiple subject lines with token variations
6. **Token History**: Track which tokens used most often
7. **Validation During Typing**: Real-time validation as user types (currently only on submit)
8. **Drag-and-Drop Tokens**: Click and drag token chips into editor

## Troubleshooting

### Common Issues

1. **Validation Blocks Campaign Creation**:
   - **Cause**: Tokens without fallbacks reference missing contact data
   - **Solution**: Add fallbacks like `{token|Default}` or fill missing contact data

2. **Tokens Not Replaced in Sent Emails**:
   - **Cause**: `sendCampaignEmails` not using `replaceTokens()`
   - **Solution**: Verify `replaceTokens()` called for each contact

3. **Name Parsing Incorrect**:
   - **Cause**: Contact name field has unusual format
   - **Solution**: Use `{name}` token instead of `{first_name}/{last_name}`

4. **Template Not Loading**:
   - **Cause**: API endpoint `/api/email-campaigns/templates` not configured
   - **Solution**: Verify route added to `emailCampaignRoutes.ts`

5. **Preview Shows Original Tokens**:
   - **Cause**: Contact data not fetched or token syntax incorrect
   - **Solution**: Verify contact data includes all fields, check token syntax

## Summary

✅ **Backend Complete**:
- Token replacement utility with fallback support
- Strict validation at campaign creation
- Database migration for email_id linking
- System templates (8 pre-built)
- API endpoints for validation and templates
- Per-contact personalization in send loop

✅ **Frontend Complete**:
- Token picker component with categorized tokens
- Template selector with search and filter
- Live preview with sample contact selector
- Ready for integration into CreateCampaignModal

✅ **Features Delivered**:
- Dynamic tokens: `{first_name}`, `{company}`, etc.
- Fallback syntax: `{token|Fallback}`
- Strict validation with contact-level error reporting
- System-wide template library
- Email-to-lead-analytics timeline linking
- Live preview showing personalized content

🚀 **Next Steps** (Integration):
1. Add token picker, template selector, and preview components to CreateCampaignModal.tsx
2. Add validation API call before campaign creation
3. Test end-to-end: template → customize → validate → create → send
4. Deploy and monitor

## File Checklist

### Backend Files Created
- [x] `backend/src/utils/emailTokenReplacer.ts` (280 lines)
- [x] `backend/src/migrations/1010_add_email_id_to_lead_analytics.sql`
- [x] `backend/src/constants/emailTemplates.ts` (8 templates)
- [x] `backend/src/controllers/emailCampaignController.ts`

### Backend Files Modified
- [x] `backend/src/services/emailCampaignService.ts` (added validation + token replacement)
- [x] `backend/src/routes/emailCampaignRoutes.ts` (added validation + templates endpoints)

### Frontend Files Created
- [x] `Frontend/src/components/campaigns/EmailTokenPicker.tsx`
- [x] `Frontend/src/components/campaigns/EmailTemplateSelector.tsx`
- [x] `Frontend/src/components/campaigns/EmailPreview.tsx`

### Frontend Files To Modify
- [ ] `Frontend/src/components/campaigns/CreateCampaignModal.tsx` (integrate components)

---

**Implementation Date**: 2024-01-15
**Status**: Backend Complete, Frontend Components Ready for Integration
**Author**: AI Assistant
