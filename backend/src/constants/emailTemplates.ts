/**
 * System-wide Email Templates
 * These are available to all users for quick campaign creation
 */

export interface EmailTemplate {
  id: string;
  name: string;
  category: 'introduction' | 'follow_up' | 'promotion' | 'event' | 'thank_you';
  subject: string;
  body: string;
  description: string;
  tokens_used: string[];
}

export const SYSTEM_EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'intro-1',
    name: 'Professional Introduction',
    category: 'introduction',
    subject: 'Hi {first_name|there}, let\'s connect!',
    body: `Hi {first_name|there},

I hope this email finds you well. I wanted to reach out to introduce myself and see if we could explore potential opportunities to work together.

{company|Your company} caught my attention, and I believe we could add significant value to your operations.

Would you be interested in a brief call this week?

Best regards`,
    description: 'Professional introduction email with company mention',
    tokens_used: ['first_name', 'company']
  },
  {
    id: 'intro-2',
    name: 'Warm Introduction',
    category: 'introduction',
    subject: 'Quick introduction from our team',
    body: `Hello {name|there},

Hope you're having a great day! I wanted to personally reach out and introduce our services.

We've been helping businesses {business_context|grow and succeed}, and I thought you might be interested in learning more.

Looking forward to connecting!

Cheers`,
    description: 'Friendly introduction with business context',
    tokens_used: ['name', 'business_context']
  },
  {
    id: 'followup-1',
    name: 'Post-Call Follow-up',
    category: 'follow_up',
    subject: 'Following up on our conversation, {first_name}',
    body: `Hi {first_name|there},

It was great speaking with you earlier! I wanted to follow up on our discussion and share some additional information.

As promised, here's what we discussed:
- [Key point 1]
- [Key point 2]
- [Next steps]

Feel free to reach out if you have any questions about {company|your business needs}.

Best regards`,
    description: 'Follow-up after a call or meeting',
    tokens_used: ['first_name', 'company']
  },
  {
    id: 'followup-2',
    name: 'Check-in Email',
    category: 'follow_up',
    subject: 'Checking in with you, {first_name}',
    body: `Hi {first_name|there},

I wanted to check in and see how things are going with {company|your business}.

Have you had a chance to review the information I sent over? I'd love to hear your thoughts and answer any questions you might have.

Looking forward to hearing from you!

Best`,
    description: 'Casual check-in for ongoing conversations',
    tokens_used: ['first_name', 'company']
  },
  {
    id: 'promo-1',
    name: 'Product Promotion',
    category: 'promotion',
    subject: 'Special offer for {company|you}, {first_name}!',
    body: `Hi {first_name|there},

I have some exciting news! We're offering an exclusive promotion that I think {company|you} would benefit from.

Here's what you'll get:
✓ [Feature 1]
✓ [Feature 2]
✓ [Feature 3]

This offer is available for a limited time. Interested in learning more?

Reply to this email or give me a call!

Best regards`,
    description: 'Promotional email with special offer',
    tokens_used: ['first_name', 'company']
  },
  {
    id: 'event-1',
    name: 'Event Invitation',
    category: 'event',
    subject: 'You\'re invited: [Event Name] in {city}',
    body: `Dear {name|Valued Contact},

We're hosting an exclusive event in {city|your area}, and I'd love for you to join us!

📅 Date: [Event Date]
📍 Location: {city|[Location]}
⏰ Time: [Event Time]

This is a great opportunity to:
- Network with industry leaders
- Learn about latest trends
- Discover new opportunities

{company|Your company} would be a great addition to the attendee list!

RSVP by [Date]

Looking forward to seeing you there!

Best regards`,
    description: 'Personalized event invitation',
    tokens_used: ['name', 'city', 'company']
  },
  {
    id: 'thankyou-1',
    name: 'Thank You After Meeting',
    category: 'thank_you',
    subject: 'Thank you for your time, {first_name}',
    body: `Hi {first_name|there},

Thank you so much for taking the time to meet with me today. I really enjoyed our conversation about {business_context|your business}.

As we discussed, I'll:
- [Action item 1]
- [Action item 2]
- Follow up with you by [Date]

If you need anything in the meantime, don't hesitate to reach out.

Thanks again, and looking forward to our next steps!

Best regards`,
    description: 'Professional thank you after a meeting',
    tokens_used: ['first_name', 'business_context']
  },
  {
    id: 'thankyou-2',
    name: 'Thank You for Purchase',
    category: 'thank_you',
    subject: 'Thank you for choosing us, {first_name}!',
    body: `Hi {first_name|there},

On behalf of everyone at our company, thank you for choosing us!

We're committed to providing {company|you} with exceptional service and support. If you have any questions or need assistance, we're here to help.

Welcome aboard!

Best regards`,
    description: 'Thank you email after a purchase or signup',
    tokens_used: ['first_name', 'company']
  }
];

/**
 * Get all system templates
 */
export function getSystemEmailTemplates(): EmailTemplate[] {
  return SYSTEM_EMAIL_TEMPLATES;
}

/**
 * Get template by ID
 */
export function getSystemEmailTemplateById(id: string): EmailTemplate | null {
  return SYSTEM_EMAIL_TEMPLATES.find(t => t.id === id) || null;
}

/**
 * Get templates by category
 */
export function getSystemEmailTemplatesByCategory(
  category: EmailTemplate['category']
): EmailTemplate[] {
  return SYSTEM_EMAIL_TEMPLATES.filter(t => t.category === category);
}
