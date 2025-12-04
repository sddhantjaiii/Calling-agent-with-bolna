-- Migration: Remove summary and next_steps variables from email template default
-- Date: 2025-01-15
-- Purpose: Simplify follow-up email template by removing AI-generated summary/next_steps fields

-- Update the default body template for existing rows that still use the old template
-- This replaces the summary and next_steps sections with a cleaner version
UPDATE user_email_settings 
SET body_template = '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4f46e5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; background: #f9f9f9; border-radius: 0 0 8px 8px; }
        .highlight { background: #e0e7ff; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Thank You for Speaking With Us!</h1>
        </div>
        <div class="content">
            <p>Hi {{lead_name}},</p>
            <p>Thank you for taking the time to speak with us today. It was great learning about your needs{{#if company}} at {{company}}{{/if}}.</p>
            <p>If you have any questions, feel free to reach out. We look forward to hearing from you!</p>
            <p>Best regards,<br>{{sender_name}}</p>
        </div>
        <div class="footer">
            <p>This is an automated follow-up email based on your recent conversation.</p>
        </div>
    </div>
</body>
</html>',
updated_at = CURRENT_TIMESTAMP
WHERE body_template LIKE '%{{summary}}%' 
   OR body_template LIKE '%{{next_steps}}%';

-- Log the migration
COMMENT ON TABLE user_email_settings IS 
    'User-configurable settings for automated follow-up emails after calls. Available variables: lead_name, lead_email, company, phone, agent_name, sender_name, call_duration, call_date, lead_status';
