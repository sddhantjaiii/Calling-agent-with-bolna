# Lead Analytics Schema Analysis & Fixes

## 📊 Schema Analysis Summary

### ✅ **What's Working Well**

1. **Core Structure**
   - UUID primary key with auto-generation
   - Proper foreign key relationships
   - JSONB fields for flexible data (reasoning, cta_interactions)
   - Score validation with CHECK constraints (0-100)

2. **Data Integrity**
   - Cascading deletes from users/calls
   - Composite FK for call+user consistency
   - Analysis type validation ('individual' or 'complete')

3. **OpenAI Integration**
   - All required fields present for OpenAI Response API
   - Proper JSONB storage for reasoning and extraction
   - CTA tracking fields (boolean conversions work correctly)

---

## 🔧 **Issues Found & Fixed**

### Issue 1: Missing Unique Constraint for Complete Analysis ✅ FIXED
**Status**: Resolved via `run-constraint-migration.js`

**What was wrong**:
```sql
-- Code expects this to exist:
ON CONFLICT (user_id, phone_number, analysis_type)
-- But database didn't have this constraint
```

**Fix applied**:
```sql
CREATE UNIQUE INDEX idx_lead_analytics_complete_unique 
ON lead_analytics (user_id, phone_number, analysis_type)
WHERE analysis_type = 'complete';
```

---

### Issue 2: Conflicting call_id UNIQUE Constraint ⚠️ NEEDS FIX

**What's wrong**:
```sql
call_id UUID UNIQUE NOT NULL  -- ❌ This breaks complete analysis updates!
```

**Why it's a problem**:
- `call_id` is UNIQUE across ALL records
- Complete analysis needs to update with each new call
- Each call has a different `call_id`
- Upsert tries to change `call_id` → UNIQUE constraint violation

**Example scenario**:
```
Call 1: Individual analysis (call_id: abc-123) ✓
Call 1: Complete analysis (call_id: abc-123, phone: +91xxx) ✓

Call 2: Individual analysis (call_id: def-456) ✓
Call 2: Complete analysis tries to UPDATE:
  - Set call_id = def-456 (latest call)
  - WHERE user_id + phone_number match
  - ❌ FAILS: call_id=abc-123 already exists (from individual analysis)
```

**Recommended fix**:
```sql
-- Remove global UNIQUE constraint
ALTER TABLE lead_analytics DROP CONSTRAINT IF EXISTS unique_call_id_lead_analytics;

-- Create partial UNIQUE for individual analysis only
CREATE UNIQUE INDEX unique_call_id_individual_analytics 
ON lead_analytics (call_id)
WHERE analysis_type = 'individual';
```

This allows:
- ✅ Individual analyses: Each has unique call_id
- ✅ Complete analyses: Can reference any call_id (updates with latest)

---

### Issue 3: demo_book_datetime Type ✅ CORRECT AS-IS

**What OpenAI returns**:
```json
{
  "demo_book_datetime": "2025-10-11T23:00:00+05:30"  // ISO 8601 string
}
```

**Database column**:
```sql
demo_book_datetime TIMESTAMP WITH TIME ZONE
```

**TypeScript interface**:
```typescript
demo_book_datetime?: string;
```

**Status**: ✅ **This is correct!**
- OpenAI returns ISO 8601 string
- Code passes string to database
- PostgreSQL automatically converts string → TIMESTAMP WITH TIME ZONE
- No conversion needed in code

---

### Issue 4: Legacy Fields from ElevenLabs 🧹 CLEANUP RECOMMENDED

**Unused/outdated fields**:
```sql
call_successful VARCHAR(20)        -- Not used in Bolna workflow
transcript_summary TEXT            -- Duplicates transcript table
call_summary_title VARCHAR(500)    -- Not populated by OpenAI
analysis_source VARCHAR(50)        -- Default is 'elevenlabs' (should be 'bolna')
raw_analysis_data JSONB            -- Not used (reasoning stores everything)
```

**Recommended actions**:
1. Update `analysis_source` default to 'bolna'
2. Update existing records to 'bolna'
3. Consider removing unused columns in future

---

### Issue 5: smart_notification Length Limit ⚠️ NEEDS FIX

**Current**:
```sql
smart_notification VARCHAR(255)  -- May be too short
```

**Problem**: OpenAI can return longer notification messages

**Fix**:
```sql
ALTER TABLE lead_analytics 
ALTER COLUMN smart_notification TYPE TEXT;
```

---

## 🚀 **Migration Script Created**

### Files Created:
1. **`fix-lead-analytics-schema.sql`** - SQL migration script
2. **`run-schema-fix.js`** - Node.js script to apply fixes

### What the migration does:

#### ✅ Critical Fixes (Run these now):
1. Remove global `call_id` UNIQUE constraint
2. Create partial UNIQUE index for individual analysis
3. Increase `smart_notification` to TEXT
4. Update `analysis_source` default to 'bolna'
5. Add performance indexes

#### 🔍 Verification:
- Shows statistics (individual vs complete counts)
- Lists all indexes
- Confirms Bolna records

---

## 📋 **Field Mapping: OpenAI → Database**

### Scores (Direct mapping):
```typescript
intent_level       → intent_level       (VARCHAR)
intent_score       → intent_score       (INTEGER)
urgency_level      → urgency_level      (VARCHAR)
urgency_score      → urgency_score      (INTEGER)
budget_constraint  → budget_constraint  (VARCHAR)
budget_score       → budget_score       (INTEGER)
fit_alignment      → fit_alignment      (VARCHAR)
fit_score          → fit_score          (INTEGER)
engagement_health  → engagement_health  (VARCHAR)
engagement_score   → engagement_score   (INTEGER)
total_score        → total_score        (INTEGER)
lead_status_tag    → lead_status_tag    (VARCHAR)
```

### JSONB Fields:
```typescript
reasoning {
  intent, urgency, budget, 
  fit, engagement, cta_behavior
} → reasoning (JSONB)
```

### Extraction (Nested → Flattened):
```typescript
extraction.name              → extracted_name      (VARCHAR)
extraction.email_address     → extracted_email     (VARCHAR)
extraction.company_name      → company_name        (VARCHAR)
extraction.smartnotification → smart_notification  (TEXT)
```

### CTA Fields (String → Boolean):
```typescript
"Yes" / "No" / null → boolean (true/false/null)

cta_pricing_clicked      → cta_pricing_clicked      (BOOLEAN)
cta_demo_clicked         → cta_demo_clicked         (BOOLEAN)
cta_followup_clicked     → cta_followup_clicked     (BOOLEAN)
cta_sample_clicked       → cta_sample_clicked       (BOOLEAN)
cta_escalated_to_human   → cta_escalated_to_human   (BOOLEAN)
```

### Special Fields:
```typescript
// ISO 8601 string → PostgreSQL auto-converts
demo_book_datetime: "2025-10-11T23:00:00+05:30" 
→ demo_book_datetime (TIMESTAMP WITH TIME ZONE)

// Aggregated CTA tracking (JSONB object)
{
  pricing_clicked: boolean,
  demo_clicked: boolean,
  followup_clicked: boolean,
  sample_clicked: boolean,
  escalated_to_human: boolean
} → cta_interactions (JSONB)
```

---

## 🎯 **Recommended Actions**

### Immediate (Required):
```bash
# Run the schema fix script
cd backend
node src/migrations/run-schema-fix.js
```

This will:
- ✅ Fix the `call_id` constraint issue
- ✅ Increase `smart_notification` size
- ✅ Update `analysis_source` to 'bolna'
- ✅ Add performance indexes

### After Migration:
1. Restart backend server
2. Make test calls
3. Verify complete analysis upserts correctly
4. Check logs for any errors

### Future Cleanup (Optional):
```sql
-- Remove unused legacy columns (do this AFTER testing everything works)
ALTER TABLE lead_analytics 
  DROP COLUMN call_successful,
  DROP COLUMN transcript_summary,
  DROP COLUMN call_summary_title,
  DROP COLUMN raw_analysis_data;
```

---

## 📊 **Performance Indexes Added**

New indexes for better query performance:

```sql
-- For fetching lead history by phone
idx_lead_analytics_phone_type_timestamp (phone_number, analysis_type, analysis_timestamp DESC)

-- For user dashboard queries
idx_lead_analytics_user_type_timestamp (user_id, analysis_type, analysis_timestamp DESC)

-- For filtering high-value leads
idx_lead_analytics_score_filters (user_id, total_score DESC, lead_status_tag)
WHERE analysis_type = 'complete'
```

---

## ✅ **Final Checklist**

- [x] Unique constraint for complete analysis added (`idx_lead_analytics_complete_unique`)
- [ ] Run schema fix script (`run-schema-fix.js`)
- [ ] Verify `call_id` constraint fixed
- [ ] Test complete analysis upsert
- [ ] Check `smart_notification` handles long messages
- [ ] Confirm `analysis_source` is 'bolna' for new records

---

## 📞 **Test Scenario**

After applying fixes, test this workflow:

```
1. Make first call to +91 8979556941
   ✅ Individual analysis created (call_id: abc-123)
   ✅ Complete analysis created (call_id: abc-123, phone: +91 8979556941)

2. Make second call to same number
   ✅ Individual analysis created (call_id: def-456)
   ✅ Complete analysis UPDATED (call_id: def-456, previous_calls_analyzed: 1)
      - Should NOT fail with call_id UNIQUE constraint error
      - Should update existing complete analysis record
      - Should NOT create duplicate

3. Query database:
   SELECT * FROM lead_analytics 
   WHERE phone_number = '+91 8979556941'
   ORDER BY analysis_type, created_at;
   
   Expected:
   - 2 individual analysis records (one per call)
   - 1 complete analysis record (updated with latest data)
```

---

**Last Updated**: October 11, 2025  
**Status**: Schema fixes ready to apply  
**Next Step**: Run `node src/migrations/run-schema-fix.js`
