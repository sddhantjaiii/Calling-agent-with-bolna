# Call Campaign CSV Upload Template

## Overview
This template allows you to bulk upload contacts for call campaigns. The system will automatically create a campaign and queue all contacts for calling.

## File Format
- **File Type**: CSV (Comma Separated Values)
- **Encoding**: UTF-8
- **Max File Size**: 10 MB
- **Max Contacts**: 1000 per upload

## Required Columns

| Column Name | Required | Description | Example |
|-------------|----------|-------------|---------|
| `name` | Yes | Contact's full name | John Smith |
| `phone_number` | Yes | Phone number with country code | +91 9876543210 |
| `email` | No | Email address | john@example.com |
| `company` | No | Company name | ABC Corp |
| `notes` | No | Additional notes about contact | Interested in enterprise plan |

## Optional Columns (Custom Data)

You can add custom columns that will be included in the call context:

| Column Name | Description | Example |
|-------------|-------------|---------|
| `lead_score` | Lead qualification score | Hot, Warm, Cold |
| `last_interaction` | Last contact date | 2025-09-15 |
| `industry` | Company industry | Technology, Finance |
| `deal_size` | Potential deal value | $50,000 |
| `custom_field_1` | Any custom field | Custom value |

## Example CSV

```csv
name,phone_number,email,company,notes,lead_score,last_interaction
John Smith,+91 9876543210,john@example.com,ABC Corp,Interested in demo,Hot,2025-09-20
Jane Doe,+1 5551234567,jane@example.com,XYZ Inc,Follow up on pricing,Warm,2025-09-18
Bob Johnson,+44 7700900123,bob@example.com,Tech Solutions,New lead from website,Cold,2025-09-22
```

## Download Templates

### Basic Template (Required Fields Only)
```csv
name,phone_number,email,company,notes
John Smith,+91 9876543210,john@example.com,ABC Corp,Interested in demo
```

### Advanced Template (With Custom Fields)
```csv
name,phone_number,email,company,notes,lead_score,last_interaction,industry,deal_size
John Smith,+91 9876543210,john@example.com,ABC Corp,Interested in demo,Hot,2025-09-20,Technology,$50000
```

## Phone Number Format

**Supported Formats:**
- ✅ `+91 9876543210` (Recommended - with country code and space)
- ✅ `+919876543210` (With country code, no space)
- ✅ `9876543210` (Without country code - will default to +91)

**Invalid Formats:**
- ❌ `(987) 654-3210` (US format with parentheses)
- ❌ `987-654-3210` (Dashes without country code)
- ❌ `91-9876543210` (Hyphen after country code)

## Validation Rules

### Required Field Validation
- ✅ `name` - Must not be empty
- ✅ `phone_number` - Must be valid phone number (10+ digits)

### Optional Field Validation
- Email: Must be valid email format if provided
- Phone: Automatically normalized to `+[country_code] [number]` format

### Duplicate Handling
- Duplicate phone numbers in CSV: **Only first occurrence is imported**
- Existing contact in database: **Skipped, not updated**

## After Upload

Once you upload the CSV, you'll be prompted to configure:

1. **Campaign Name** - Give your campaign a meaningful name
2. **Agent Selection** - Choose which AI agent to use
3. **Next Action** - What should the agent try to accomplish?
4. **Time Window** - When should calls happen?
   - First call time (e.g., 9:00 AM)
   - Last call time (e.g., 6:00 PM)
5. **Start Date** - When should campaign begin?

## System Behavior

### Call Scheduling
- Calls are distributed evenly within your time window
- Example: 10 calls between 9 AM - 6 PM = 1 call every ~54 minutes
- System respects your concurrency limit (e.g., max 2 concurrent calls)

### Priority Rules
- Contacts with names (from `name` column) get **higher priority**
- Within same priority, calls are processed **FIFO** (First In, First Out)
- Scheduled time is respected (calls don't happen before scheduled time)

### Continuation Logic
- If time window ends (e.g., 6 PM) with pending calls:
  - ✅ Calls continue **next day** within same time window
  - ❌ No calls made outside time window

### User Data Sent to Bolna API
The system automatically constructs the `user_data` payload:

```json
{
  "summary": "name: John Smith, email: john@example.com, company: ABC Corp, last_conversation: 2025-09-20, transcript_summary: [Previous call summary if exists], lead_score: Hot, industry: Technology",
  "next_action": "[Your configured next action from campaign settings]"
}
```

## Error Handling

### Common Import Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Invalid phone number | Missing digits or invalid format | Check phone number has 10+ digits |
| Duplicate phone number | Same number appears twice in CSV | Remove duplicate rows |
| Missing required field | `name` or `phone_number` is empty | Fill in required fields |
| Invalid CSV format | Malformed CSV structure | Check commas, quotes, and encoding |
| File too large | File exceeds 10 MB | Split into multiple files |

### Import Summary
After upload, you'll see:
- ✅ Successfully imported: 95 contacts
- ⚠️ Skipped (duplicates): 3 contacts
- ❌ Failed (invalid): 2 contacts
- 📄 Error report downloadable

## Best Practices

### Before Upload
1. ✅ Remove duplicate phone numbers
2. ✅ Validate email formats
3. ✅ Normalize phone numbers (add country codes)
4. ✅ Fill in as much data as possible (better AI context)
5. ✅ Test with small batch first (10-20 contacts)

### During Campaign
1. Monitor campaign progress in "Call Campaigns" section
2. Check queue status for estimated completion time
3. Pause campaign if needed (e.g., end of business day)
4. Review call results and adjust strategy

### After Campaign
1. Export campaign results
2. Analyze successful vs failed calls
3. Follow up on unsuccessful attempts manually
4. Update contact records based on call outcomes

## Troubleshooting

### CSV Not Uploading
- Check file encoding is UTF-8
- Ensure no special characters in column names
- Verify file size is under 10 MB
- Check for extra commas in data fields

### Invalid Phone Numbers
- Add country code (e.g., +91 for India)
- Remove spaces, dashes, and parentheses
- Ensure 10+ digit minimum

### Campaign Not Starting
- Check concurrency limits in Settings
- Verify agent is active and configured
- Ensure start date is not in past
- Check time window is valid (first < last)

## Support

For additional help:
- Contact support@yourcompany.com
- View documentation: https://docs.yourcompany.com/campaigns
- Check FAQ: https://help.yourcompany.com/call-campaigns

---

**Last Updated**: October 8, 2025  
**Version**: 1.0
