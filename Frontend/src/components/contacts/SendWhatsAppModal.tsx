import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MessageSquare, Loader2, Send, Phone } from 'lucide-react';
import { API_ENDPOINTS } from '@/config/api';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Contact } from '@/types/api';

// WhatsApp Phone Number from external service
interface WhatsAppPhoneNumber {
  id: string;
  user_id: string;
  platform: string;
  meta_phone_number_id: string;
  display_name: string;
}

// WhatsApp Template from external service
interface WhatsAppTemplate {
  template_id: string;
  name: string;
  category: string;
  language: string;
  components: {
    body?: {
      text: string;
    };
    header?: {
      text?: string;
    };
  };
  variables: Array<{
    position: number;
    variable_name: string;
    dashboard_mapping?: string; // Dashboard's identifier for this variable (e.g., "name", "email", "meetingLink")
    default_value?: string;
    sample_value?: string;
  }>;
}

/**
 * Format a date/time string for display
 */
function formatMeetingDateTime(dateTimeStr: string | undefined): string {
  if (!dateTimeStr) return '';
  try {
    const date = new Date(dateTimeStr);
    return date.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return dateTimeStr;
  }
}

function formatMeetingDate(dateTimeStr: string | undefined): string {
  if (!dateTimeStr) return '';
  try {
    const date = new Date(dateTimeStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return dateTimeStr;
  }
}

function formatMeetingTime(dateTimeStr: string | undefined): string {
  if (!dateTimeStr) return '';
  try {
    const date = new Date(dateTimeStr);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return dateTimeStr;
  }
}

/**
 * Resolve a variable value from contact data using dashboard_mapping
 * Dashboard is the source of truth for all variable resolution.
 * If mapping not found or value is empty, returns empty string (pass empty to API).
 */
function resolveVariableFromContact(
  dashboardMapping: string | undefined,
  contact: Contact | null,
  meetingData?: { meetingLink?: string; meetingTime?: string; meetingDate?: string; meetingDateTime?: string; meetingDetails?: string }
): string {
  if (!dashboardMapping || !contact) return '';

  // Handle contact fields (from contacts table)
  const contactFieldMap: Record<string, string | undefined> = {
    'name': contact.name,
    'phone_number': (contact as any).phone_number || (contact as any).phone || contact.phoneNumber,
    'email': contact.email,
    'company': contact.company,
    'city': (contact as any).city,
    'country': (contact as any).country,
    'business_context': (contact as any).business_context || (contact as any).businessContext,
    'notes': contact.notes,
    'tags': Array.isArray((contact as any).tags) ? (contact as any).tags.join(', ') : (contact as any).tags,
  };

  // Handle meeting fields from contact (from calendar_meetings JOIN in API)
  // Fields come as meeting_link, meeting_start_time, etc.
  const contactAny = contact as any;
  const meetingLink = contactAny.meeting_link || contactAny.meetingLink || meetingData?.meetingLink;
  const meetingStartTime = contactAny.meeting_start_time || contactAny.meetingStartTime;
  const meetingTitle = contactAny.meeting_title || contactAny.meetingTitle || meetingData?.meetingDetails;
  
  const meetingFieldMap: Record<string, string | undefined> = {
    'meetingLink': meetingLink,
    'meeting_link': meetingLink,
    'meetingTime': formatMeetingTime(meetingStartTime) || meetingData?.meetingTime,
    'meeting_time': formatMeetingTime(meetingStartTime) || meetingData?.meetingTime,
    'meetingDate': formatMeetingDate(meetingStartTime) || meetingData?.meetingDate,
    'meeting_date': formatMeetingDate(meetingStartTime) || meetingData?.meetingDate,
    'meetingDateTime': formatMeetingDateTime(meetingStartTime) || meetingData?.meetingDateTime,
    'meeting_datetime': formatMeetingDateTime(meetingStartTime) || meetingData?.meetingDateTime,
    'meetingDetails': meetingTitle,
    'meeting_details': meetingTitle,
    'meetingTitle': meetingTitle,
    'meeting_title': meetingTitle,
  };

  // Check contact fields first
  if (dashboardMapping in contactFieldMap) {
    return contactFieldMap[dashboardMapping] || '';
  }

  // Check meeting fields
  if (dashboardMapping in meetingFieldMap) {
    return meetingFieldMap[dashboardMapping] || '';
  }

  // No mapping found
  return '';
}

interface SendWhatsAppModalProps {
  open: boolean;
  contact: Contact | null;
  onClose: () => void;
  onMessageSent?: (messageId: string) => void;
}

export function SendWhatsAppModal({
  open,
  contact,
  onClose,
  onMessageSent,
}: SendWhatsAppModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  // State
  const [phoneNumbers, setPhoneNumbers] = useState<WhatsAppPhoneNumber[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [selectedPhoneNumberId, setSelectedPhoneNumberId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  
  // Loading states
  const [isFetchingPhoneNumbers, setIsFetchingPhoneNumbers] = useState(false);
  const [isFetchingTemplates, setIsFetchingTemplates] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Get contact phone number
  const contactPhone = contact 
    ? ((contact as any).phone || (contact as any).phone_number || contact.phoneNumber) 
    : '';

  // Fetch phone numbers when modal opens
  useEffect(() => {
    if (open && user?.id) {
      fetchPhoneNumbers();
    }
  }, [open, user?.id]);

  // Fetch templates when phone number is selected
  useEffect(() => {
    if (selectedPhoneNumberId) {
      fetchTemplates(selectedPhoneNumberId);
    } else {
      setTemplates([]);
      setSelectedTemplateId('');
    }
  }, [selectedPhoneNumberId]);

  // Reset variable values when template changes - use dashboard_mapping for auto-fill
  useEffect(() => {
    if (selectedTemplateId) {
      const template = templates.find(t => t.template_id === selectedTemplateId);
      if (template?.variables) {
        const initialValues: Record<string, string> = {};
        template.variables.forEach(v => {
          const position = v.position.toString();
          
          // Priority 1: Use dashboard_mapping to auto-fill from contact data
          if (v.dashboard_mapping) {
            const resolvedValue = resolveVariableFromContact(v.dashboard_mapping, contact);
            if (resolvedValue) {
              initialValues[position] = resolvedValue;
              return;
            }
          }
          
          // Priority 2: Use default_value if dashboard_mapping didn't resolve
          if (v.default_value) {
            initialValues[position] = v.default_value;
            return;
          }
          
          // Priority 3: Pass empty string (don't use sample_value - that's just for preview)
          initialValues[position] = '';
        });
        setVariableValues(initialValues);
      }
    } else {
      setVariableValues({});
    }
  }, [selectedTemplateId, templates, contact]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setPhoneNumbers([]);
      setTemplates([]);
      setSelectedPhoneNumberId('');
      setSelectedTemplateId('');
      setVariableValues({});
    }
  }, [open]);

  const fetchPhoneNumbers = async () => {
    if (!user?.id) return;

    setIsFetchingPhoneNumbers(true);
    try {
      // Filter by platform=whatsapp since templates are only for WhatsApp
      const response = await fetch(API_ENDPOINTS.WHATSAPP.WHATSAPP_PHONE_NUMBERS(user.id));
      
      if (!response.ok) {
        throw new Error('Failed to fetch WhatsApp phone numbers');
      }

      const data = await response.json();
      
      if (data.success && Array.isArray(data.data)) {
        setPhoneNumbers(data.data);
        // Auto-select first phone number if available
        if (data.data.length > 0) {
          setSelectedPhoneNumberId(data.data[0].id);
        }
      } else {
        setPhoneNumbers([]);
      }
    } catch (error) {
      console.error('Error fetching WhatsApp phone numbers:', error);
      toast({
        title: 'Error',
        description: 'Failed to load WhatsApp phone numbers. Please check if the service is running.',
        variant: 'destructive',
      });
    } finally {
      setIsFetchingPhoneNumbers(false);
    }
  };

  const fetchTemplates = async (phoneNumberId: string) => {
    setIsFetchingTemplates(true);
    try {
      const response = await fetch(API_ENDPOINTS.WHATSAPP.TEMPLATES(phoneNumberId));
      
      if (!response.ok) {
        throw new Error('Failed to fetch WhatsApp templates');
      }

      const data = await response.json();
      
      if (data.success && Array.isArray(data.data)) {
        setTemplates(data.data);
        // Auto-select first template if available
        if (data.data.length > 0) {
          setSelectedTemplateId(data.data[0].template_id);
        }
      } else {
        setTemplates([]);
      }
    } catch (error) {
      console.error('Error fetching WhatsApp templates:', error);
      toast({
        title: 'Error',
        description: 'Failed to load WhatsApp templates.',
        variant: 'destructive',
      });
    } finally {
      setIsFetchingTemplates(false);
    }
  };

  const handleVariableChange = (position: string, value: string) => {
    setVariableValues(prev => ({
      ...prev,
      [position]: value,
    }));
  };

  const handleSendMessage = async () => {
    if (!contact || !selectedPhoneNumberId || !selectedTemplateId) {
      toast({
        title: 'Missing information',
        description: 'Please select a phone number and template.',
        variant: 'destructive',
      });
      return;
    }

    if (!contactPhone) {
      toast({
        title: 'Missing phone number',
        description: 'Contact does not have a phone number.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch(API_ENDPOINTS.WHATSAPP.SEND, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone_number_id: selectedPhoneNumberId,
          template_id: selectedTemplateId,
          contact: {
            phone: contactPhone,
            name: contact.name || undefined,
            email: contact.email || undefined,
            company: contact.company || undefined,
          },
          variables: variableValues,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      toast({
        title: 'Message sent',
        description: `WhatsApp message sent to ${contact.name} (${contactPhone})`,
      });

      onMessageSent?.(data.data?.message_id);
      onClose();
    } catch (error: any) {
      console.error('Error sending WhatsApp message:', error);
      toast({
        title: 'Failed to send message',
        description: error.message || 'An error occurred while sending the message.',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const selectedTemplate = templates.find(t => t.template_id === selectedTemplateId);
  const selectedPhone = phoneNumbers.find(p => p.id === selectedPhoneNumberId);

  // Friendly names for dashboard_mapping values
  const friendlyMappingNames: Record<string, string> = {
    'name': 'Contact Name',
    'phone_number': 'Phone Number',
    'email': 'Email',
    'company': 'Company',
    'city': 'City',
    'country': 'Country',
    'business_context': 'Business Context',
    'notes': 'Notes',
    'tags': 'Tags',
    'meetingLink': 'Meeting Link',
    'meetingTime': 'Meeting Time',
    'meetingDate': 'Meeting Date',
    'meetingDateTime': 'Meeting Date & Time',
    'meetingDetails': 'Meeting Details',
  };

  // Get preview of template with variables filled in - show actual values that will be sent
  const getTemplatePreview = () => {
    if (!selectedTemplate?.components?.body?.text) return '';
    
    let preview = selectedTemplate.components.body.text;
    
    // Replace each variable position with the actual resolved value or descriptive placeholder
    selectedTemplate.variables?.forEach(v => {
      const position = v.position.toString();
      const currentValue = variableValues[position];
      
      let displayValue = '';
      if (currentValue && currentValue.trim()) {
        // User has entered/auto-filled a value
        displayValue = currentValue;
      } else if (v.default_value) {
        displayValue = v.default_value;
      } else {
        // Show what it would map to
        displayValue = `[${v.variable_name}]`;
      }
      
      preview = preview.replace(`{{${position}}}`, displayValue);
    });
    
    return preview;
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-600" />
            Send WhatsApp Message
          </DialogTitle>
          <DialogDescription>
            Send a WhatsApp template message to {contact?.name || 'the contact'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Contact Info */}
          <div className="p-3 border rounded-md bg-muted/50">
            <Label className="text-xs text-muted-foreground">Sending to</Label>
            <div className="flex items-center gap-2 mt-1">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{contact?.name}</span>
              <span className="text-muted-foreground">({contactPhone})</span>
            </div>
          </div>

          {/* Phone Number Selection */}
          <div className="space-y-2">
            <Label htmlFor="phone-number">WhatsApp Business Number</Label>
            {isFetchingPhoneNumbers ? (
              <div className="flex items-center gap-2 p-3 border rounded-md">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Loading phone numbers...</span>
              </div>
            ) : phoneNumbers.length === 0 ? (
              <div className="p-3 border rounded-md bg-yellow-50 dark:bg-yellow-950/20 text-sm text-yellow-700 dark:text-yellow-300">
                No WhatsApp phone numbers configured. Please contact administrator.
              </div>
            ) : (
              <Select
                value={selectedPhoneNumberId}
                onValueChange={setSelectedPhoneNumberId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a phone number" />
                </SelectTrigger>
                <SelectContent>
                  {phoneNumbers.map((phone) => (
                    <SelectItem key={phone.id} value={phone.id}>
                      {phone.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Template Selection */}
          <div className="space-y-2">
            <Label htmlFor="template">Message Template</Label>
            {isFetchingTemplates ? (
              <div className="flex items-center gap-2 p-3 border rounded-md">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Loading templates...</span>
              </div>
            ) : !selectedPhoneNumberId ? (
              <div className="p-3 border rounded-md text-sm text-muted-foreground">
                Select a phone number first
              </div>
            ) : templates.length === 0 ? (
              <div className="p-3 border rounded-md bg-yellow-50 dark:bg-yellow-950/20 text-sm text-yellow-700 dark:text-yellow-300">
                No approved templates found for this phone number.
              </div>
            ) : (
              <Select
                value={selectedTemplateId}
                onValueChange={setSelectedTemplateId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.template_id} value={template.template_id}>
                      <div className="flex flex-col">
                        <span>{template.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {template.category} • {template.language}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Template Variables with Mapping Info */}
          {selectedTemplate?.variables && selectedTemplate.variables.length > 0 && (
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                Template Variables
                <span className="text-xs text-muted-foreground font-normal">(auto-filled from contact)</span>
              </Label>
              {selectedTemplate.variables.map((variable) => {
                const mapping = variable.dashboard_mapping;
                const mappingLabel = mapping ? friendlyMappingNames[mapping] || mapping : null;
                const currentValue = variableValues[variable.position.toString()] || '';
                const isAutoFilled = mappingLabel && currentValue && currentValue.trim() !== '';
                
                return (
                  <div key={variable.position} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs font-medium">
                        {variable.variable_name}
                      </Label>
                      {mappingLabel && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          isAutoFilled 
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}>
                          → {mappingLabel}
                        </span>
                      )}
                      {isAutoFilled && (
                        <span className="text-[10px] text-green-600 dark:text-green-400">✓ auto-filled</span>
                      )}
                    </div>
                    <Input
                      value={currentValue}
                      onChange={(e) => handleVariableChange(variable.position.toString(), e.target.value)}
                      placeholder={
                        mappingLabel 
                          ? `From ${mappingLabel}` 
                          : variable.default_value || `Enter ${variable.variable_name}`
                      }
                      className={isAutoFilled ? 'border-green-300 dark:border-green-700' : ''}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Template Preview */}
          {selectedTemplate && (
            <div className="space-y-2">
              <Label>Message Preview</Label>
              <div className="p-3 border rounded-md bg-green-50 dark:bg-green-950/20 text-sm whitespace-pre-wrap text-green-800 dark:text-green-300">
                {getTemplatePreview() || 'No message body'}
              </div>
            </div>
          )}

          {/* Credits Info */}
          <div className="p-3 border rounded-md bg-blue-50 dark:bg-blue-950/20 text-sm">
            <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">
              WhatsApp Message
            </p>
            <p className="text-blue-700 dark:text-blue-300">
              This will send a template message via WhatsApp. 1 credit will be deducted.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSendMessage}
            disabled={
              isSending || 
              !selectedPhoneNumberId || 
              !selectedTemplateId || 
              phoneNumbers.length === 0 || 
              templates.length === 0
            }
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Message
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SendWhatsAppModal;
