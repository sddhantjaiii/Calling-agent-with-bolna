# Dynamic Variables for Bolna AI Calls

This document maps the UI placeholder variables to the actual Bolna API field names used during call initiation.

---

## Variable Mapping

| UI Placeholder | Bolna API Variable | Data Source | Description |
|----------------|-------------------|-------------|-------------|
| `{lead_name}` | `lead_name` | Contact name | The contact's full name |
| `{business_name}` | `business_name` | Contact company | The company/organization name |
| `{email}` | `email` | Contact email | Contact's email address |
| `{notes}` | `notes` | Contact notes | Free-form notes about the contact |
| `{product_interest}` | `product_interest` | Lead Analytics (requirements) | Product/service requirements extracted from previous calls |
| `{last_interaction_summary}` | `last_interaction_summary` | Lead Analytics (transcript_summary) | AI-generated summary of the most recent call |
| `{last_interaction_date}` | `last_interaction_date` | Contact last_contact_at | Formatted date of last interaction (e.g., "January 12, 2026") |

---

## Usage in Agent Prompts

These variables can be used in your Bolna AI agent's system prompt using double curly braces:

```
Hello {{lead_name}}, this is [Agent Name] calling from [Company].

{{lead_name}} - Contact's name
{{business_name}} - Their company name
{{email}} - Their email address
{{notes}} - Any notes about this contact
{{product_interest}} - What they're interested in (from previous calls)
{{last_interaction_summary}} - Summary of last conversation
{{last_interaction_date}} - When you last spoke
```

---

## Data Flow

### Direct Calls (Single Contact)
1. Contact data fetched from `contacts` table
2. Lead analytics fetched from `lead_analytics` table (complete analysis)
3. Variables merged and sent to Bolna API

### Campaign Calls (Bulk)
1. Contact data fetched in bulk from `contacts` table
2. Lead analytics fetched in bulk from `lead_analytics` table
3. Variables stored in `call_queue.user_data` column
4. Sent to Bolna API when each call is initiated

---

## Example Payload Sent to Bolna

```json
{
  "user_data": {
    "lead_name": "John Smith",
    "business_name": "Acme Corporation",
    "email": "john@acme.com",
    "notes": "Prefers morning calls",
    "product_interest": "Looking for enterprise CRM solution with API integration",
    "last_interaction_summary": "Discussed pricing tiers and integration capabilities. Interested in demo.",
    "last_interaction_date": "January 10, 2026"
  }
}
```

---

## Notes

- All variables default to empty string (`""`) if data is not available
- `last_interaction_date` is formatted as human-readable date (Month Day, Year)
- `product_interest` comes from AI extraction of call transcripts (stored as `requirements`)
- `last_interaction_summary` is the AI-generated transcript summary from the most recent call
