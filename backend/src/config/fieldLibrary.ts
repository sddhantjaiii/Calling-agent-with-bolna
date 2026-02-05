/**
 * Field Library Configuration
 * 
 * This file contains the complete field library based on the 23 universal columns
 * designed for MSME businesses. Admin can select from these fields when configuring
 * custom field extraction for users.
 * 
 * Field Structure:
 * - key: Unique identifier used in custom_fields JSON
 * - label: Display name for admin UI
 * - type: Data type (text, number, date, boolean, dropdown, email, phone)
 * - category: 5W+H classification (WHO, WHAT, HOW MUCH, WHERE, WHEN, HOW, SO WHAT)
 * - extraction_hint: Instruction for OpenAI to extract this field from transcript
 * - options: Available choices (for dropdown type only)
 * - core: Whether this maps to an existing lead_analytics column (not in custom_fields)
 */

export type FieldType = 'text' | 'number' | 'date' | 'boolean' | 'dropdown' | 'email' | 'phone';
export type FieldCategory = 'WHO' | 'WHAT' | 'HOW MUCH' | 'WHERE' | 'WHEN' | 'HOW' | 'SO WHAT';

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  category: FieldCategory;
  extraction_hint: string;
  options?: string[];
  core?: boolean; // If true, maps to existing lead_analytics column (not stored in custom_fields)
  db_column?: string; // The actual database column name if core=true
}

/**
 * Complete field library (19 custom fields)
 * Based on CSV: "Final Columns - Sheet1.csv"
 * 
 * NOTE: Core fields (company_name, phone_number, email, requirements) are NOT included here
 * because they are already extracted to dedicated database columns:
 * - company_name → lead_analytics.company_name, contacts.company
 * - phone_number → contacts.phone_number, lead_analytics.phone_number
 * - email → contacts.email, lead_analytics.extracted_email
 * - requirements → lead_analytics.requirements
 */
export const FIELD_LIBRARY: FieldDefinition[] = [
  // ==================== WHO ====================
  {
    key: 'student_name',
    label: 'Student Name',
    type: 'text',
    category: 'WHO',
    extraction_hint: 'Extract student\'s name (only applicable for education industry)'
  },
  {
    key: 'student_age',
    label: 'Student Age / Grade',
    type: 'number',
    category: 'WHO',
    extraction_hint: 'Extract student\'s age or grade level (e.g., 15 or "Grade 10")'
  },
  {
    key: 'course_program',
    label: 'Course / Program Requested',
    type: 'text',
    category: 'WHO',
    extraction_hint: 'Extract the specific course or program the student/parent is interested in'
  },
  {
    key: 'industry',
    label: 'Industry of Lead',
    type: 'dropdown',
    category: 'WHO',
    extraction_hint: 'Identify which industry sector the lead belongs to',
    options: ['Manufacturing', 'Salon & Beauty', 'IT & Software', 'Food & Beverage', 'Education', 'Healthcare', 'Retail', 'Real Estate', 'Other']
  },
  {
    key: 'lead_role',
    label: 'Lead Role / Designation',
    type: 'text',
    category: 'WHO',
    extraction_hint: 'Extract the role or job title of the person (e.g., Owner, Manager, Director, Receptionist)'
  },
  {
    key: 'address',
    label: 'Address of Lead',
    type: 'text',
    category: 'WHO',
    extraction_hint: 'Extract the complete address if mentioned (for delivery/site visits)'
  },

  // ==================== WHAT ====================
  {
    key: 'product_category',
    label: 'Product / Service Category',
    type: 'text',
    category: 'WHAT',
    extraction_hint: 'Classify the product/service into a category (e.g., Haircut, Skincare, Bulk steel, Branding)'
  },
  {
    key: 'offering_mix',
    label: 'Offering Mix',
    type: 'dropdown',
    category: 'WHAT',
    extraction_hint: 'Determine if they need a product, service, or bundle',
    options: ['Product Only', 'Service Only', 'Bundle (Product + Service)']
  },
  {
    key: 'quantity',
    label: 'Quantity / Seats / Covers',
    type: 'number',
    category: 'WHAT',
    extraction_hint: 'Extract quantity ordered, number of seats, covers, or service units (e.g., 5 boxes, 12 covers, 1 session)'
  },

  // ==================== HOW MUCH ====================
  {
    key: 'budget_range',
    label: 'Budget Range',
    type: 'dropdown',
    category: 'HOW MUCH',
    extraction_hint: 'Identify the budget range mentioned or inferred from conversation',
    options: ['< ₹5,000', '₹5,000 - ₹20,000', '₹20,000 - ₹50,000', '₹50,000+', 'Not Mentioned']
  },
  {
    key: 'payment_terms',
    label: 'Payment Terms Preference',
    type: 'dropdown',
    category: 'HOW MUCH',
    extraction_hint: 'Extract preferred payment method or terms',
    options: ['Advance Payment', 'On Spot / COD', 'Net 30', 'EMI / Installments', 'Credit', 'Not Discussed']
  },

  // ==================== WHERE & WHEN ====================
  {
    key: 'delivery_location',
    label: 'Delivery / Visit Location',
    type: 'text',
    category: 'WHERE',
    extraction_hint: 'Extract the location where service will be delivered or visit will happen (e.g., 123 MG Road, Walk-in, On-site)'
  },
  {
    key: 'delivery_date',
    label: 'Delivery / Appointment Date',
    type: 'date',
    category: 'WHEN',
    extraction_hint: 'Extract the date when delivery or service is needed (format: YYYY-MM-DD). Examples: 2025-02-15, Today, This week'
  },
  {
    key: 'delivery_time',
    label: 'Delivery / Visit Time',
    type: 'text',
    category: 'WHEN',
    extraction_hint: 'Extract preferred time slot if mentioned (e.g., Morning, 2 PM, Evening)'
  },
  {
    key: 'number_of_people',
    label: 'Number of People',
    type: 'number',
    category: 'WHERE',
    extraction_hint: 'Extract number of people (guests, attendees, batch size, covers). Works across all business types.'
  },

  // ==================== HOW ====================
  {
    key: 'special_requirements',
    label: 'Special Requirements',
    type: 'text',
    category: 'HOW',
    extraction_hint: 'Extract any special needs or custom requirements (e.g., Gluten-free, Waterproof, Wheelchair access)'
  },
  {
    key: 'on_site_visit',
    label: 'On-Site Visit Required',
    type: 'boolean',
    category: 'HOW',
    extraction_hint: 'Determine if an on-site visit is needed (salon visit, IT setup, delivery, installation). Return true/false.'
  },
  {
    key: 'preferred_communication',
    label: 'Preferred Communication Mode',
    type: 'dropdown',
    category: 'HOW',
    extraction_hint: 'Identify how the lead prefers to be contacted for follow-ups',
    options: ['WhatsApp', 'Phone Call', 'Email', 'SMS', 'Not Specified']
  },

  // ==================== SO WHAT ====================
  {
    key: 'existing_provider',
    label: 'Existing Provider Mentioned',
    type: 'boolean',
    category: 'SO WHAT',
    extraction_hint: 'Determine if the lead mentioned having a current provider/vendor. Return true/false. This indicates a switching opportunity.'
  },
  {
    key: 'repeat_customer',
    label: 'Repeat Customer',
    type: 'boolean',
    category: 'SO WHAT',
    extraction_hint: 'Determine if this is a returning/repeat customer. Return true/false. Indicates high lifetime value.'
  },
  {
    key: 'referral_source',
    label: 'Referral Source',
    type: 'dropdown',
    category: 'SO WHAT',
    extraction_hint: 'Identify how the lead found out about the business',
    options: ['Google Search', 'Friend Referral', 'Instagram', 'Facebook', 'Walk-in', 'Event', 'Advertisement', 'Other', 'Not Mentioned']
  },
  {
    key: 'quotation_requested',
    label: 'Quotation / Booking Requested',
    type: 'boolean',
    category: 'SO WHAT',
    extraction_hint: 'Determine if the lead explicitly asked for a quotation or booking. Return true/false. This is the strongest buying signal.'
  }
];

/**
 * Get field definitions for enabled fields
 */
export function getEnabledFieldDefinitions(enabledFieldKeys: string[]): FieldDefinition[] {
  return FIELD_LIBRARY.filter(field => enabledFieldKeys.includes(field.key));
}

/**
 * Get only custom fields (non-core fields)
 */
export function getCustomFieldDefinitions(enabledFieldKeys: string[] = []): FieldDefinition[] {
  // Handle undefined or null input
  const keys = enabledFieldKeys || [];
  return FIELD_LIBRARY.filter(field => 
    keys.includes(field.key) && !field.core
  );
}

/**
 * Get field definition by key
 */
export function getFieldDefinition(key: string): FieldDefinition | undefined {
  return FIELD_LIBRARY.find(field => field.key === key);
}

/**
 * Group fields by category
 */
export function getFieldsByCategory(): Record<FieldCategory, FieldDefinition[]> {
  return FIELD_LIBRARY.reduce((acc, field) => {
    if (!acc[field.category]) {
      acc[field.category] = [];
    }
    acc[field.category].push(field);
    return acc;
  }, {} as Record<FieldCategory, FieldDefinition[]>);
}

/**
 * Generate OpenAI extraction JSON for admin to copy
 * This is the JSON that admin will paste into Bolna.ai / OpenAI prompt platform
 * 
 * The JSON maintains the exact order required for analysis:
 * 1. Lead scoring fields (intent, urgency, budget, fit, engagement)
 * 2. Total score and lead status
 * 3. Demo booking datetime
 * 4. Reasoning object
 * 5. Extraction object with core fields + custom fields
 */
export function generateExtractionJSON(enabledFieldKeys: string[] = []): object {
  // Ensure enabledFieldKeys is always an array
  const keys = Array.isArray(enabledFieldKeys) ? enabledFieldKeys : [];
  const customFields = getCustomFieldDefinitions(keys);
  
  // Build custom_fields object with extraction hints
  const customFieldsObject = customFields.reduce((acc, field) => {
    let hint = field.extraction_hint;
    if (field.type === 'dropdown' && field.options) {
      hint += ` [Options: ${field.options.join(' | ')}]`;
    } else if (field.type === 'boolean') {
      hint += ' [Return: true | false]';
    } else if (field.type === 'number') {
      hint += ' [Return: number or null]';
    } else if (field.type === 'date') {
      hint += ' [Return: YYYY-MM-DD or null]';
    }
    acc[field.key] = hint;
    return acc;
  }, {} as Record<string, string>);

  // Return the complete extraction JSON in the exact order needed
  return {
    intent_level: "Low | Medium | High",
    intent_score: "1, 2, or 3 based on buying signals (1=Low, 2=Medium, 3=High)",
    urgency_level: "Low | Medium | High",
    urgency_score: "1, 2, or 3 based on timeline urgency (1=Low, 2=Medium, 3=High)",
    budget_constraint: "Yes | Maybe | No",
    budget_score: "1, 2, or 3 based on budget alignment (1=No, 2=Maybe, 3=Yes)",
    fit_alignment: "Low | Medium | High",
    fit_score: "1, 2, or 3 based on product/service fit (1=Low, 2=Medium, 3=High)",
    engagement_health: "Low | Medium | High",
    engagement_score: "1, 2, or 3 based on conversation engagement (1=Low, 2=Medium, 3=High)",
    total_score: "1-15 sum of all 5 scores (intent + urgency + budget + fit + engagement)",
    lead_status_tag: "Cold | Warm | Hot",
    demo_book_datetime: "ISO 8601 datetime if demo/meeting scheduled, null otherwise",
    reasoning: {
      intent: "Brief explanation of intent assessment",
      urgency: "Brief explanation of urgency assessment",
      budget: "Brief explanation of budget assessment",
      fit: "Brief explanation of fit assessment",
      engagement: "Brief explanation of engagement assessment",
      cta_behavior: "Description of any CTA interactions (pricing, demo, sample, escalation)"
    },
    extraction: {
      name: "Extract full name of the contact (null if not mentioned)",
      email_address: "Extract email address if mentioned (null if not mentioned)",
      company_name: "Extract company or business name (null if not mentioned)",
      smartnotification: "Generate a 4-5 word summary of user interaction",
      requirements: "Extract product/service requirements mentioned (null if none)",
      custom_cta: "Comma-separated list of custom CTAs clicked during the call",
      in_detail_summary: "Detailed summary of the entire conversation covering key points",
      ...(Object.keys(customFieldsObject).length > 0 && { custom_fields: customFieldsObject })
    }
  };
}
