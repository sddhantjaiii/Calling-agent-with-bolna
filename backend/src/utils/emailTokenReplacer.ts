/**
 * Email Token Replacement Utility
 * 
 * Handles personalization tokens in email campaigns:
 * - Syntax: {token} or {token|Fallback Text}
 * - Supported tokens: first_name, last_name, name, email, phone_number, company, city, country, business_context
 * - Validates tokens and provides detailed error reporting
 */

export interface ContactData {
  id: string;
  name: string;
  phone_number: string;
  email?: string;
  company?: string;
  city?: string;
  country?: string;
  business_context?: string;
}

export interface TokenValidationError {
  contactId: string;
  contactName: string;
  missingTokens: string[];
  tokensFailed: Array<{
    token: string;
    reason: string;
  }>;
}

export interface ValidationResult {
  valid: boolean;
  errors: TokenValidationError[];
  totalContacts: number;
  contactsWithErrors: number;
}

const SUPPORTED_TOKENS = [
  'first_name',
  'last_name', 
  'name',
  'email',
  'phone_number',
  'company',
  'city',
  'country',
  'business_context'
] as const;

type SupportedToken = typeof SUPPORTED_TOKENS[number];

/**
 * Extract first name from full name
 */
function extractFirstName(fullName: string): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || '';
}

/**
 * Extract last name from full name
 */
function extractLastName(fullName: string): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return '';
  return parts.slice(1).join(' ');
}

/**
 * Get token value from contact data
 */
function getTokenValue(token: SupportedToken, contact: ContactData): string | null {
  switch (token) {
    case 'first_name':
      return extractFirstName(contact.name);
    case 'last_name':
      return extractLastName(contact.name);
    case 'name':
      return contact.name || null;
    case 'email':
      return contact.email || null;
    case 'phone_number':
      return contact.phone_number || null;
    case 'company':
      return contact.company || null;
    case 'city':
      return contact.city || null;
    case 'country':
      return contact.country || null;
    case 'business_context':
      return contact.business_context || null;
    default:
      return null;
  }
}

/**
 * Parse token string to extract token name and optional fallback
 * Examples:
 *   {first_name} => { token: 'first_name', fallback: null }
 *   {first_name|Valued Customer} => { token: 'first_name', fallback: 'Valued Customer' }
 */
function parseToken(tokenString: string): { token: string; fallback: string | null } | null {
  // Remove surrounding braces
  const inner = tokenString.slice(1, -1);
  
  // Split by | to separate token from fallback
  const parts = inner.split('|');
  const token = parts[0].trim();
  const fallback = parts.length > 1 ? parts.slice(1).join('|').trim() : null;
  
  return { token, fallback };
}

/**
 * Extract all tokens from text (subject or body)
 * Returns array of token strings like ['{first_name}', '{company|ABC Corp}']
 */
export function extractTokens(text: string): string[] {
  const tokenRegex = /\{[^}]+\}/g;
  return text.match(tokenRegex) || [];
}

/**
 * Validate that all tokens in text are supported
 * Returns unsupported token names
 */
export function validateTokens(text: string): string[] {
  const tokens = extractTokens(text);
  const unsupportedTokens: string[] = [];
  
  for (const tokenString of tokens) {
    const parsed = parseToken(tokenString);
    if (!parsed) continue;
    
    if (!SUPPORTED_TOKENS.includes(parsed.token as SupportedToken)) {
      unsupportedTokens.push(parsed.token);
    }
  }
  
  return unsupportedTokens;
}

/**
 * Replace all tokens in text with values from contact data
 * Respects fallback values defined with {token|fallback}
 */
export function replaceTokens(text: string, contact: ContactData): string {
  const tokens = extractTokens(text);
  let result = text;
  
  for (const tokenString of tokens) {
    const parsed = parseToken(tokenString);
    if (!parsed) continue;
    
    // Get token value
    const value = getTokenValue(parsed.token as SupportedToken, contact);
    
    // Use fallback if value is missing
    const replacement = value || parsed.fallback || '';
    
    // Replace all occurrences of this exact token string
    result = result.split(tokenString).join(replacement);
  }
  
  return result;
}

/**
 * Validate tokens for multiple contacts
 * Returns detailed error report for contacts with missing token values (no fallback)
 */
export function validateTokensForContacts(
  subject: string,
  body: string,
  contacts: ContactData[]
): ValidationResult {
  const errors: TokenValidationError[] = [];
  const allTokens = [...extractTokens(subject), ...extractTokens(body)];
  
  // First check for unsupported tokens
  const unsupportedSubject = validateTokens(subject);
  const unsupportedBody = validateTokens(body);
  const unsupported = [...new Set([...unsupportedSubject, ...unsupportedBody])];
  
  if (unsupported.length > 0) {
    return {
      valid: false,
      errors: [{
        contactId: 'GLOBAL',
        contactName: 'Template Validation',
        missingTokens: [],
        tokensFailed: unsupported.map(token => ({
          token,
          reason: `Unsupported token. Supported tokens: ${SUPPORTED_TOKENS.join(', ')}`
        }))
      }],
      totalContacts: contacts.length,
      contactsWithErrors: 1
    };
  }
  
  // Check each contact for missing values
  for (const contact of contacts) {
    const missingTokens: string[] = [];
    const tokensFailed: Array<{ token: string; reason: string }> = [];
    
    for (const tokenString of allTokens) {
      const parsed = parseToken(tokenString);
      if (!parsed) continue;
      
      // Skip if token has a fallback
      if (parsed.fallback) continue;
      
      // Check if value exists
      const value = getTokenValue(parsed.token as SupportedToken, contact);
      if (!value) {
        missingTokens.push(tokenString);
        tokensFailed.push({
          token: tokenString,
          reason: `Contact missing '${parsed.token}' field and no fallback provided`
        });
      }
    }
    
    if (missingTokens.length > 0) {
      errors.push({
        contactId: contact.id,
        contactName: contact.name,
        missingTokens,
        tokensFailed
      });
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    totalContacts: contacts.length,
    contactsWithErrors: errors.length
  };
}

/**
 * Get list of supported tokens for UI display
 */
export function getSupportedTokens(): Array<{ token: string; description: string }> {
  return [
    { token: 'first_name', description: 'First name extracted from contact name' },
    { token: 'last_name', description: 'Last name extracted from contact name' },
    { token: 'name', description: 'Full contact name' },
    { token: 'email', description: 'Contact email address' },
    { token: 'phone_number', description: 'Contact phone number' },
    { token: 'company', description: 'Contact company name' },
    { token: 'city', description: 'Contact city' },
    { token: 'country', description: 'Contact country' },
    { token: 'business_context', description: 'Contact business context/notes' }
  ];
}

/**
 * Generate preview for a sample contact
 */
export function generatePreview(
  subject: string,
  body: string,
  sampleContact: ContactData
): { subject: string; body: string } {
  return {
    subject: replaceTokens(subject, sampleContact),
    body: replaceTokens(body, sampleContact)
  };
}
