import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Eye } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { authenticatedFetch } from '@/utils/auth';
import { API_ENDPOINTS } from '@/config/api';

interface Contact {
  id: string;
  name: string;
  email: string;
  phone_number?: string;
  company?: string;
  city?: string;
  country?: string;
  business_context?: string;
}

interface EmailPreviewProps {
  subject: string;
  body: string;
  selectedContactIds: string[];
}

/**
 * Extract first name from full name
 */
function extractFirstName(fullName: string | null | undefined): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || '';
}

/**
 * Extract last name from full name
 */
function extractLastName(fullName: string | null | undefined): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return '';
  return parts.slice(1).join(' ');
}

/**
 * Replace tokens in text with contact data
 */
function replaceTokens(text: string, contact: Contact): string {
  if (!text) return '';

  const tokenMap: Record<string, string> = {
    first_name: extractFirstName(contact.name),
    last_name: extractLastName(contact.name),
    name: contact.name || '',
    email: contact.email || '',
    phone_number: contact.phone_number || '',
    company: contact.company || '',
    city: contact.city || '',
    country: contact.country || '',
    business_context: contact.business_context || '',
  };

  // Replace {token|fallback} or {token}
  return text.replace(/\{([a-z_]+)(?:\|([^}]+))?\}/g, (match, token, fallback) => {
    const value = tokenMap[token];
    if (value && value.trim()) {
      return value;
    }
    return fallback || match; // Return fallback or original token if no value
  });
}

export const EmailPreview: React.FC<EmailPreviewProps> = ({
  subject,
  body,
  selectedContactIds,
}) => {
  const [selectedContactId, setSelectedContactId] = useState<string>('');

  // Fetch contacts
  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ['contacts-for-preview', selectedContactIds],
    queryFn: async () => {
      if (!selectedContactIds || selectedContactIds.length === 0) {
        return [];
      }

      const response = await authenticatedFetch(
        `${API_ENDPOINTS.CONTACTS}?ids=${selectedContactIds.join(',')}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch contacts');
      }
      const data = await response.json();
      return data.data || [];
    },
    enabled: selectedContactIds && selectedContactIds.length > 0,
  });

  // Auto-select first contact
  React.useEffect(() => {
    if (contacts && contacts.length > 0 && !selectedContactId) {
      setSelectedContactId(contacts[0].id);
    }
  }, [contacts, selectedContactId]);

  // Get selected contact
  const selectedContact = useMemo(() => {
    return contacts?.find((c) => c.id === selectedContactId);
  }, [contacts, selectedContactId]);

  // Generate preview
  const preview = useMemo(() => {
    if (!selectedContact) {
      return { subject: '', body: '' };
    }

    return {
      subject: replaceTokens(subject, selectedContact),
      body: replaceTokens(body, selectedContact),
    };
  }, [subject, body, selectedContact]);

  // Extract tokens
  const tokensInSubject = useMemo(() => {
    const matches = subject.match(/\{([a-z_]+)(?:\|([^}]+))?\}/g);
    return matches || [];
  }, [subject]);

  const tokensInBody = useMemo(() => {
    const matches = body.match(/\{([a-z_]+)(?:\|([^}]+))?\}/g);
    return matches || [];
  }, [body]);

  const allTokens = useMemo(() => {
    return [...new Set([...tokensInSubject, ...tokensInBody])];
  }, [tokensInSubject, tokensInBody]);

  if (!contacts || contacts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4" />
            Live Preview
          </CardTitle>
          <CardDescription>
            Select contacts to see how personalization will look
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No contacts selected. Choose recipients to preview personalized content.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye className="h-4 w-4" />
          Live Preview
        </CardTitle>
        <CardDescription>
          See how the email will look for each recipient
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Contact Selector */}
        <div>
          <label className="mb-2 block text-sm font-medium">
            Preview as Contact:
          </label>
          <Select value={selectedContactId} onValueChange={setSelectedContactId}>
            <SelectTrigger>
              <SelectValue placeholder="Select contact" />
            </SelectTrigger>
            <SelectContent>
              {contacts.map((contact) => (
                <SelectItem key={contact.id} value={contact.id}>
                  {contact.name || contact.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tokens Used */}
        {allTokens.length > 0 && (
          <div>
            <label className="mb-2 block text-sm font-medium">Tokens Used:</label>
            <div className="flex flex-wrap gap-1">
              {allTokens.map((token) => (
                <Badge key={token} variant="secondary" className="font-mono text-xs">
                  {token}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Email Preview */}
        <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
          {/* Subject Line */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Subject:
            </label>
            <p className="text-sm font-semibold">
              {preview.subject || '(Empty subject)'}
            </p>
          </div>

          {/* Divider */}
          <div className="border-t" />

          {/* Body */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Body:
            </label>
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: preview.body || '(Empty body)' }}
            />
          </div>
        </div>

        {/* Contact Info */}
        {selectedContact && (
          <div className="text-xs text-muted-foreground">
            <p>
              <strong>Preview Data:</strong> {selectedContact.name} ({selectedContact.email})
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EmailPreview;
