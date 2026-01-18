import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';

export interface EmailToken {
  token: string;
  label: string;
  description: string;
  category: 'contact' | 'company';
}

export const SUPPORTED_EMAIL_TOKENS: EmailToken[] = [
  {
    token: 'first_name',
    label: 'First Name',
    description: "Contact's first name",
    category: 'contact',
  },
  {
    token: 'last_name',
    label: 'Last Name',
    description: "Contact's last name",
    category: 'contact',
  },
  {
    token: 'name',
    label: 'Full Name',
    description: "Contact's full name",
    category: 'contact',
  },
  {
    token: 'email',
    label: 'Email',
    description: "Contact's email address",
    category: 'contact',
  },
  {
    token: 'phone_number',
    label: 'Phone Number',
    description: "Contact's phone number",
    category: 'contact',
  },
  {
    token: 'company',
    label: 'Company',
    description: "Contact's company name",
    category: 'company',
  },
  {
    token: 'city',
    label: 'City',
    description: "Contact's city",
    category: 'company',
  },
  {
    token: 'country',
    label: 'Country',
    description: "Contact's country",
    category: 'company',
  },
  {
    token: 'business_context',
    label: 'Business Context',
    description: "Contact's business context/notes",
    category: 'company',
  },
];

interface EmailTokenPickerProps {
  onInsertToken: (token: string) => void;
  disabled?: boolean;
}

export const EmailTokenPicker: React.FC<EmailTokenPickerProps> = ({
  onInsertToken,
  disabled = false,
}) => {
  const contactTokens = SUPPORTED_EMAIL_TOKENS.filter((t) => t.category === 'contact');
  const companyTokens = SUPPORTED_EMAIL_TOKENS.filter((t) => t.category === 'company');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="gap-1"
        >
          <Plus className="h-3 w-3" />
          Insert Token
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="max-h-96 overflow-y-auto">
          {/* Contact Tokens */}
          <div className="border-b p-3">
            <h4 className="mb-2 text-sm font-medium text-muted-foreground">
              Contact Information
            </h4>
            <div className="flex flex-wrap gap-2">
              {contactTokens.map((tokenInfo) => (
                <Button
                  key={tokenInfo.token}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto justify-start px-2 py-1 text-xs hover:bg-accent"
                  onClick={() => onInsertToken(tokenInfo.token)}
                >
                  <Badge variant="secondary" className="mr-1 font-mono text-[10px]">
                    {`{${tokenInfo.token}}`}
                  </Badge>
                  <span className="text-xs">{tokenInfo.label}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Company Tokens */}
          <div className="p-3">
            <h4 className="mb-2 text-sm font-medium text-muted-foreground">
              Company Information
            </h4>
            <div className="flex flex-wrap gap-2">
              {companyTokens.map((tokenInfo) => (
                <Button
                  key={tokenInfo.token}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto justify-start px-2 py-1 text-xs hover:bg-accent"
                  onClick={() => onInsertToken(tokenInfo.token)}
                >
                  <Badge variant="secondary" className="mr-1 font-mono text-[10px]">
                    {`{${tokenInfo.token}}`}
                  </Badge>
                  <span className="text-xs">{tokenInfo.label}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Help Text */}
          <div className="border-t bg-muted/50 p-3 text-xs text-muted-foreground">
            <p className="mb-1">
              <strong>Usage:</strong> Click to insert tokens like{' '}
              <code className="rounded bg-background px-1">{'{first_name}'}</code>
            </p>
            <p>
              <strong>Fallback:</strong> Add fallback text like{' '}
              <code className="rounded bg-background px-1">{'{first_name|Customer}'}</code>
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default EmailTokenPicker;
