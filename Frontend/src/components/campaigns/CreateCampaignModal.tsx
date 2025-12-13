import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Upload, X, FileText, CheckCircle, AlertCircle, Download, HelpCircle, Loader2, Phone, MessageSquare, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { authenticatedFetch, getAuthHeaders } from '@/utils/auth';
import { CampaignCreditEstimator } from '@/components/campaigns/CampaignCreditEstimator';
import { useCreditToasts } from '@/components/ui/ToastProvider';
import CampaignTimezoneSelectorCard from '@/components/campaigns/CampaignTimezoneSelectorCard';
import { detectBrowserTimezone } from '@/utils/timezone';
import { API_ENDPOINTS } from '@/config/api';
import * as XLSX from 'xlsx';

// Campaign type
type CampaignType = 'call' | 'whatsapp' | 'email';

// Phone number interface for dropdown (for Call campaigns)
interface PhoneNumber {
  id: string;
  name: string;
  phoneNumber: string;
  assignedToAgentId?: string | null;
  agentName?: string;
  isActive: boolean;
}

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
    default_value?: string;
    sample_value?: string;
  }>;
}

/**
 * Get current date in a specific timezone as YYYY-MM-DD
 */
function getDateInTimezone(timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date()); // Returns YYYY-MM-DD format
}

interface CreateCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  preSelectedContacts?: string[]; // For bulk call button integration
}

interface CsvUploadResult {
  campaignId: string;
  totalRows: number;
  contactsCreated: number;
  contactsSkipped: number;
  invalidRows: number;
  skippedContacts?: Array<{
    row: number;
    phone: string;
    reason: string;
  }>;
}

const CreateCampaignModal: React.FC<CreateCampaignModalProps> = ({
  isOpen,
  onClose,
  preSelectedContacts = [],
}) => {
  const { theme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { user } = useAuth();
  
  // Campaign type state
  const [campaignType, setCampaignType] = useState<CampaignType>('call');
  
  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [firstCallTime, setFirstCallTime] = useState('09:00');
  const [lastCallTime, setLastCallTime] = useState('17:00');
  const [startDate, setStartDate] = useState(''); // Will be set after fetching timezone
  const [endDate, setEndDate] = useState('');
  const [nextAction, setNextAction] = useState('call');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<CsvUploadResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedContactCount, setParsedContactCount] = useState(0);
  
  // Phone number selection states (for Call campaigns)
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [selectedPhoneNumberId, setSelectedPhoneNumberId] = useState<string>('');
  const [isFetchingPhoneNumbers, setIsFetchingPhoneNumbers] = useState(false);
  
  // WhatsApp-specific states
  const [whatsappPhoneNumbers, setWhatsappPhoneNumbers] = useState<WhatsAppPhoneNumber[]>([]);
  const [selectedWhatsAppPhoneNumberId, setSelectedWhatsAppPhoneNumberId] = useState<string>('');
  const [isFetchingWhatsAppPhoneNumbers, setIsFetchingWhatsAppPhoneNumbers] = useState(false);
  const [whatsappTemplates, setWhatsappTemplates] = useState<WhatsAppTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [isFetchingTemplates, setIsFetchingTemplates] = useState(false);
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});
  const [sendImmediately, setSendImmediately] = useState(true);
  const [scheduledAt, setScheduledAt] = useState<string>('');
  
  // Email-specific states
  const [emailSubject, setEmailSubject] = useState<string>('');
  const [emailBody, setEmailBody] = useState<string>('');
  const [emailAttachments, setEmailAttachments] = useState<Array<{
    filename: string;
    content: string; // base64
    contentType: string;
    size: number;
  }>>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  
  // Gmail connection state for email campaigns
  const [gmailStatus, setGmailStatus] = useState<{
    connected: boolean;
    hasGmailScope: boolean;
    requiresReconnect?: boolean;
    email?: string;
    message?: string;
    loading: boolean;
  }>({
    connected: false,
    hasGmailScope: false,
    loading: true,
  });
  
  // Timezone states
  const [useCustomTimezone, setUseCustomTimezone] = useState(false);
  const [campaignTimezone, setCampaignTimezone] = useState<string>('');
  const [userTimezone, setUserTimezone] = useState<string>('');
  
  // Retry configuration states
  const [maxRetries, setMaxRetries] = useState(0);
  const [retryIntervalMinutes, setRetryIntervalMinutes] = useState(60);
  const [isCustomInterval, setIsCustomInterval] = useState(false);
  
  // Credit estimation states
  const [showEstimator, setShowEstimator] = useState(false);
  const [estimatedContactCount, setEstimatedContactCount] = useState(0);
  const [pendingCampaignData, setPendingCampaignData] = useState<any>(null);
  
  // Updated credits toast hook signature (remove non-existent showCreditInsufficient)
  const { showInsufficientCreditsToast } = useCreditToasts();
  
  // WhatsApp service URL
  const WHATSAPP_SERVICE_URL = import.meta.env.VITE_WHATSAPP_SERVICE_URL || 'http://localhost:4000';

  // Fetch agents for selection (only for Call campaigns)
  const { data: agentsData } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const response = await authenticatedFetch('/api/agents');
      if (!response.ok) throw new Error('Failed to fetch agents');
      return response.json();
    },
    enabled: campaignType === 'call',
  });

  const agents = (agentsData?.data || []).filter(
    (agent: any) => agent.type === 'CallAgent' || agent.agent_type === 'call'
  );

  // Fetch user profile for timezone and set initial date
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const response = await authenticatedFetch('/api/users/profile');
        if (response.ok) {
          const data = await response.json();
          const profileTimezone = data.user?.timezone || detectBrowserTimezone();
          setUserTimezone(profileTimezone);
          // Set start date to today in user's timezone
          setStartDate(getDateInTimezone(profileTimezone));
        } else {
          const browserTz = detectBrowserTimezone();
          setUserTimezone(browserTz);
          setStartDate(getDateInTimezone(browserTz));
        }
      } catch (error) {
        console.error('Failed to fetch user profile:', error);
        const browserTz = detectBrowserTimezone();
        setUserTimezone(browserTz);
        setStartDate(getDateInTimezone(browserTz));
      }
    };
    
    if (isOpen) {
      fetchUserProfile();
      fetchPhoneNumbers();
    }
  }, [isOpen]);

  // Fetch phone numbers for selection
  const fetchPhoneNumbers = async () => {
    setIsFetchingPhoneNumbers(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(API_ENDPOINTS.PHONE_NUMBERS.LIST, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch phone numbers');
      }

      const data = await response.json();
      
      // Handle response format
      let phoneNumbersList: PhoneNumber[] = [];
      if (data.success && Array.isArray(data.data)) {
        phoneNumbersList = data.data.map((pn: any) => ({
          id: pn.id,
          name: pn.name,
          phoneNumber: pn.phone_number || pn.phoneNumber,
          assignedToAgentId: pn.assigned_to_agent_id || pn.assignedToAgentId,
          agentName: pn.agent_name || pn.agentName,
          isActive: pn.is_active !== false,
        }));
      } else if (Array.isArray(data)) {
        phoneNumbersList = data.map((pn: any) => ({
          id: pn.id,
          name: pn.name,
          phoneNumber: pn.phone_number || pn.phoneNumber,
          assignedToAgentId: pn.assigned_to_agent_id || pn.assignedToAgentId,
          agentName: pn.agent_name || pn.agentName,
          isActive: pn.is_active !== false,
        }));
      }

      // Filter only active phone numbers
      const activePhoneNumbers = phoneNumbersList.filter(pn => pn.isActive);
      setPhoneNumbers(activePhoneNumbers);

      // Auto-select first phone number if available
      if (activePhoneNumbers.length > 0 && !selectedPhoneNumberId) {
        setSelectedPhoneNumberId(activePhoneNumbers[0].id);
      }
    } catch (error) {
      console.error('Error fetching phone numbers:', error);
      toast({
        title: 'Warning',
        description: 'Failed to load phone numbers. You can still create the campaign.',
        variant: 'default',
      });
    } finally {
      setIsFetchingPhoneNumbers(false);
    }
  };

  // Check Gmail connection status for email campaigns
  const checkGmailStatus = async () => {
    setGmailStatus(prev => ({ ...prev, loading: true }));
    try {
      const response = await authenticatedFetch('/api/integrations/gmail/status');
      const data = await response.json();
      
      if (data.success) {
        setGmailStatus({
          connected: data.data.connected,
          hasGmailScope: data.data.hasGmailScope,
          requiresReconnect: data.data.requiresReconnect,
          email: data.data.email,
          message: data.data.message,
          loading: false,
        });
      } else {
        setGmailStatus({
          connected: false,
          hasGmailScope: false,
          loading: false,
        });
      }
    } catch (error) {
      console.error('Failed to check Gmail status:', error);
      setGmailStatus({
        connected: false,
        hasGmailScope: false,
        loading: false,
      });
    }
  };

  // Fetch Gmail status when email campaign is selected
  useEffect(() => {
    if (campaignType === 'email' && isOpen) {
      checkGmailStatus();
    }
  }, [campaignType, isOpen]);

  // Fetch WhatsApp phone numbers from external service
  const fetchWhatsAppPhoneNumbers = async () => {
    if (!user?.id) return;
    
    setIsFetchingWhatsAppPhoneNumbers(true);
    try {
      const response = await fetch(`${WHATSAPP_SERVICE_URL}/api/v1/phone-numbers?user_id=${user.id}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch WhatsApp phone numbers');
      }

      const data = await response.json();
      // Handle response format: { success: true, data: [...] }
      const phoneNumbersList = data.data || data.phoneNumbers || data.phone_numbers || [];
      setWhatsappPhoneNumbers(phoneNumbersList);

      // Auto-select first phone number if available
      if (phoneNumbersList.length > 0 && !selectedWhatsAppPhoneNumberId) {
        setSelectedWhatsAppPhoneNumberId(phoneNumbersList[0].id);
      }
    } catch (error) {
      console.error('Error fetching WhatsApp phone numbers:', error);
      toast({
        title: 'Warning',
        description: 'Failed to load WhatsApp phone numbers. Please check the WhatsApp service.',
        variant: 'default',
      });
    } finally {
      setIsFetchingWhatsAppPhoneNumbers(false);
    }
  };

  // Fetch WhatsApp templates when phone number is selected
  const fetchWhatsAppTemplates = async (phoneNumberId: string) => {
    if (!phoneNumberId) return;
    
    setIsFetchingTemplates(true);
    setWhatsappTemplates([]);
    setSelectedTemplateId('');
    setTemplateVariables({});
    
    try {
      const response = await fetch(`${WHATSAPP_SERVICE_URL}/api/v1/templates?phone_number_id=${phoneNumberId}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch templates');
      }

      const data = await response.json();
      // Handle response format: { success: true, data: [...] }
      const templatesList = data.data || data.templates || [];
      setWhatsappTemplates(templatesList);

      // Auto-select first template if available
      if (templatesList.length > 0) {
        setSelectedTemplateId(templatesList[0].template_id);
        // Initialize variables for the template
        const vars: Record<string, string> = {};
        templatesList[0].variables?.forEach((v: any) => {
          vars[v.variable_name] = v.default_value || '';
        });
        setTemplateVariables(vars);
      }
    } catch (error: any) {
      console.error('Error fetching WhatsApp templates:', error);
      toast({
        title: 'Warning',
        description: error.message || 'Failed to load templates for this phone number.',
        variant: 'default',
      });
    } finally {
      setIsFetchingTemplates(false);
    }
  };

  // Effect to fetch WhatsApp phone numbers when campaign type changes to WhatsApp
  useEffect(() => {
    if (isOpen && campaignType === 'whatsapp' && user?.id) {
      fetchWhatsAppPhoneNumbers();
    }
  }, [isOpen, campaignType, user?.id]);

  // Effect to fetch templates when WhatsApp phone number changes
  useEffect(() => {
    if (selectedWhatsAppPhoneNumberId && campaignType === 'whatsapp') {
      fetchWhatsAppTemplates(selectedWhatsAppPhoneNumberId);
    }
  }, [selectedWhatsAppPhoneNumberId, campaignType]);

  // Handle template selection
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = whatsappTemplates.find(t => t.template_id === templateId);
    if (template) {
      const vars: Record<string, string> = {};
      template.variables?.forEach((v) => {
        vars[v.variable_name] = v.default_value || '';
      });
      setTemplateVariables(vars);
    }
  };

  // Create campaign mutation (for contact-based campaigns)
  const createMutation = useMutation({
    mutationFn: async (data: { 
      name: string; 
      agent_id: string; 
      phone_number_id?: string;
      contact_ids: string[];
      first_call_time: string;
      last_call_time: string;
      start_date: string;
      end_date?: string;
      next_action: string;
    }) => {
      const response = await authenticatedFetch('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || 'Failed to create campaign');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast({
        title: 'Campaign Created',
        description: 'Campaign has been created successfully',
      });
      setShowEstimator(false);
      setPendingCampaignData(null);
      setEstimatedContactCount(0);
      setIsUploading(false);
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      setShowEstimator(false);
      setIsUploading(false);
    },
  });

  // CSV upload mutation
  const uploadCsvMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await authenticatedFetch('/api/campaigns/upload-csv', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        // Try to parse error JSON; fallback to text
        let errMsg = 'Failed to upload file';
        try {
          const error = await response.json();
          errMsg = error.message || error.error || errMsg;
        } catch {
          const text = await response.text();
          if (text) errMsg = text;
        }
        throw new Error(errMsg);
      }
      return response.json();
    },
    onSuccess: (data: CsvUploadResult) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setUploadResult(data);
      toast({
        title: 'Campaign Created from CSV',
        description: `Created campaign with ${data.totalRows} contacts`,
      });
      setShowEstimator(false);
      setPendingCampaignData(null);
      setEstimatedContactCount(0);
      setIsUploading(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'CSV Upload Error',
        description: error.message,
        variant: 'destructive',
      });
      setShowEstimator(false);
      setIsUploading(false);
    },
  });

  // WhatsApp campaign mutation (for creating WhatsApp campaigns via external service)
  const whatsappCampaignMutation = useMutation({
    mutationFn: async (data: {
      campaign_name: string;
      phone_number_id: string;
      template_id: string;
      recipients: Array<{ phone_number: string; variables?: Record<string, string> }>;
      schedule?: string;
    }) => {
      const response = await fetch(`${WHATSAPP_SERVICE_URL}/api/v1/campaign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user?.id,
          ...data,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || 'Failed to create WhatsApp campaign');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'WhatsApp Campaign Created',
        description: `Campaign "${name}" has been created with ${data.totalRecipients || 'your'} contacts`,
      });
      setShowEstimator(false);
      setPendingCampaignData(null);
      setEstimatedContactCount(0);
      setIsUploading(false);
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      setShowEstimator(false);
      setIsUploading(false);
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!(/\.(csv|xlsx|xls)$/i).test(file.name)) {
        toast({
          title: 'Invalid File',
          description: 'Please select an Excel (.xlsx/.xls) or CSV (.csv) file',
          variant: 'destructive',
        });
        return;
      }
      
      // Parse file to count valid contacts
      try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array', raw: false });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as any[][];
        
        if (jsonData.length < 2) {
          setParsedContactCount(0);
        } else {
          // Get headers
          const headers = jsonData[0].map((h: any) => 
            h?.toString().toLowerCase().trim().replace(/\s+/g, '_')
          );
          
          // Find phone column index
          const phoneIndex = headers.findIndex((h: string) => 
            ['phone', 'phone_number', 'mobile', 'cell', 'phonenumber'].includes(h)
          );
          
          if (phoneIndex === -1) {
            toast({
              title: 'Invalid Template',
              description: 'Phone number column not found in the file',
              variant: 'destructive',
            });
            return;
          }
          
          // Count valid contacts (skip header, count rows with valid phone numbers)
          let validCount = 0;
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            
            // Skip empty rows
            if (!row || row.length === 0) continue;
            const hasContent = row.some((cell: any) => cell && cell.toString().trim() !== '');
            if (!hasContent) continue;
            
            // Check if phone number is valid
            const phone = row[phoneIndex];
            if (!phone) continue;
            
            const phoneStr = phone.toString().trim();
            const cleanPhone = phoneStr.replace(/\s+/g, '');
            
            // Skip rows without digits (instruction rows won't have phone numbers)
            if (!cleanPhone || !/\d/.test(cleanPhone)) continue;
            
            const digitCount = (cleanPhone.match(/\d/g) || []).length;
            if (digitCount < 10) continue;
            
            validCount++;
          }
          
          setParsedContactCount(validCount);
        }
      } catch (error) {
        console.error('Error parsing file:', error);
        toast({
          title: 'Parse Error',
          description: 'Failed to parse the file. Please ensure it\'s a valid Excel or CSV file.',
          variant: 'destructive',
        });
        return;
      }
      
      setCsvFile(file);
      setUploadResult(null);
    }
  };

  const handleRemoveFile = () => {
    setCsvFile(null);
    setParsedContactCount(0);
    setUploadResult(null);
  };

  // Handle email attachment upload
  const handleAttachmentSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingAttachment(true);
    try {
      const newAttachments: typeof emailAttachments = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Check file size (10MB limit)
        if (file.size > 10 * 1024 * 1024) {
          toast({
            title: 'File Too Large',
            description: `${file.name} exceeds 10MB limit`,
            variant: 'destructive',
          });
          continue;
        }

        // Convert to base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // Remove data URL prefix
            const base64Data = result.split(',')[1];
            resolve(base64Data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        newAttachments.push({
          filename: file.name,
          content: base64,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
        });
      }

      setEmailAttachments([...emailAttachments, ...newAttachments]);
      
      toast({
        title: 'Attachments Added',
        description: `${newAttachments.length} file(s) added successfully`,
      });
    } catch (error) {
      console.error('Error uploading attachments:', error);
      toast({
        title: 'Upload Failed',
        description: 'Failed to upload attachments. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingAttachment(false);
      // Reset file input
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setEmailAttachments(emailAttachments.filter((_, i) => i !== index));
  };

  const handleDownloadTemplate = async () => {
    try {
      // Use backend template endpoint (same as contacts)
      const response = await authenticatedFetch('/api/campaigns/template');
      
      if (!response.ok) {
        throw new Error('Failed to download template');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'campaign_contacts_template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: 'Template Downloaded',
        description: 'Excel template downloaded successfully. Phone numbers are pre-formatted to prevent Excel errors.',
      });
    } catch (error) {
      console.error('Failed to download campaign template:', error);
      toast({
        title: 'Download Failed',
        description: 'Failed to download template. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Campaign name is required',
        variant: 'destructive',
      });
      return;
    }

    // Validation for Call campaigns
    if (campaignType === 'call') {
      if (!agentId) {
        toast({
          title: 'Validation Error',
          description: 'Please select an agent',
          variant: 'destructive',
        });
        return;
      }
    }

    // Validation for WhatsApp campaigns
    if (campaignType === 'whatsapp') {
      if (!selectedWhatsAppPhoneNumberId) {
        toast({
          title: 'Validation Error',
          description: 'Please select a WhatsApp phone number',
          variant: 'destructive',
        });
        return;
      }
      if (!selectedTemplateId) {
        toast({
          title: 'Validation Error',
          description: 'Please select a message template',
          variant: 'destructive',
        });
        return;
      }
    }

    // Validation for Email campaigns
    if (campaignType === 'email') {
      // Check Gmail connection first
      if (!gmailStatus.connected || !gmailStatus.hasGmailScope) {
        toast({
          title: 'Gmail Not Connected',
          description: gmailStatus.requiresReconnect 
            ? 'Please reconnect Google in Settings > Integrations to enable email sending.'
            : 'Please connect your Gmail account in Settings > Integrations to send emails.',
          variant: 'destructive',
        });
        return;
      }
      
      if (!emailSubject.trim()) {
        toast({
          title: 'Validation Error',
          description: 'Email subject is required',
          variant: 'destructive',
        });
        return;
      }
      if (!emailBody.trim()) {
        toast({
          title: 'Validation Error',
          description: 'Email message is required',
          variant: 'destructive',
        });
        return;
      }
    }

    // Calculate contact count and show credit estimator
    let contactCount = 0;
    let campaignData: any = null;
    
    // Determine which timezone to use
    const effectiveTimezone = useCustomTimezone ? campaignTimezone : userTimezone;

    if (campaignType === 'whatsapp') {
      // WhatsApp campaign handling
      if (csvFile) {
        contactCount = parsedContactCount;
        campaignData = {
          type: 'whatsapp-csv',
          campaign_name: name,
          phone_number_id: selectedWhatsAppPhoneNumberId,
          template_id: selectedTemplateId,
          template_variables: templateVariables,
          csvFile,
          schedule: !sendImmediately && scheduledAt ? scheduledAt : undefined,
        };
      } else if (preSelectedContacts.length > 0) {
        contactCount = preSelectedContacts.length;
        campaignData = {
          type: 'whatsapp-contacts',
          campaign_name: name,
          phone_number_id: selectedWhatsAppPhoneNumberId,
          template_id: selectedTemplateId,
          template_variables: templateVariables,
          contact_ids: preSelectedContacts,
          schedule: !sendImmediately && scheduledAt ? scheduledAt : undefined,
        };
      } else {
        toast({
          title: 'Validation Error',
          description: 'Please upload a CSV file or select contacts',
          variant: 'destructive',
        });
        return;
      }
    } else if (campaignType === 'email') {
      // Email campaign handling
      if (csvFile) {
        contactCount = parsedContactCount;
        campaignData = {
          type: 'email-csv',
          campaign_name: name,
          subject: emailSubject,
          body: emailBody,
          csvFile,
          schedule: !sendImmediately && scheduledAt ? scheduledAt : undefined,
          attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
        };
      } else if (preSelectedContacts.length > 0) {
        contactCount = preSelectedContacts.length;
        campaignData = {
          type: 'email-contacts',
          campaign_name: name,
          subject: emailSubject,
          body: emailBody,
          contact_ids: preSelectedContacts,
          schedule: !sendImmediately && scheduledAt ? scheduledAt : undefined,
          attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
        };
      } else {
        toast({
          title: 'Validation Error',
          description: 'Please upload a CSV file or select contacts',
          variant: 'destructive',
        });
        return;
      }
    } else {
      // Call campaign handling (existing logic)
      if (csvFile) {
        // Use the parsed contact count from file analysis
        contactCount = parsedContactCount;
        campaignData = {
          type: 'csv',
          name,
          agent_id: agentId,
          first_call_time: firstCallTime,
          last_call_time: lastCallTime,
          start_date: startDate,
          end_date: endDate || undefined,
          next_action: nextAction,
          csvFile,
          use_custom_timezone: useCustomTimezone,
          campaign_timezone: effectiveTimezone,
          max_retries: maxRetries,
          retry_interval_minutes: retryIntervalMinutes,
          phone_number_id: selectedPhoneNumberId || undefined,
        };
      } else if (preSelectedContacts.length > 0) {
        contactCount = preSelectedContacts.length;
        campaignData = {
          type: 'contacts',
          name,
          agent_id: agentId,
          phone_number_id: selectedPhoneNumberId || undefined,
          contact_ids: preSelectedContacts,
          first_call_time: firstCallTime,
          last_call_time: lastCallTime,
          start_date: startDate,
          end_date: endDate || undefined,
          next_action: nextAction,
          use_custom_timezone: useCustomTimezone,
          campaign_timezone: effectiveTimezone,
          max_retries: maxRetries,
          retry_interval_minutes: retryIntervalMinutes,
        };
      } else {
        toast({
          title: 'Validation Error',
          description: 'Please upload a CSV file or select contacts',
          variant: 'destructive',
        });
        return;
      }
    }

    // Store data and show credit estimator
    setEstimatedContactCount(contactCount);
    setPendingCampaignData(campaignData);
    setShowEstimator(true);
  };

  // New function to handle confirmed campaign creation
  const handleEstimatorConfirm = async () => {
    if (!pendingCampaignData) return;

    try {
      // Handle WhatsApp campaigns
      if (pendingCampaignData.type === 'whatsapp-csv' || pendingCampaignData.type === 'whatsapp-contacts') {
        setIsUploading(true);
        
        // For WhatsApp campaigns, we need to get phone numbers from contacts or CSV
        // For now, we'll send the campaign data - the backend will handle the phone number extraction
        let recipients: Array<{ phone_number: string; variables?: Record<string, string> }> = [];
        
        if (pendingCampaignData.type === 'whatsapp-contacts' && pendingCampaignData.contact_ids) {
          // We need to fetch contact details to get phone numbers
          // For pre-selected contacts, we'll pass the contact_ids and let the service fetch them
          // Or we can fetch them here. For simplicity, let's assume the external service can handle contact_ids
          // Actually, we need phone numbers, so let's fetch the contacts first
          try {
            const response = await authenticatedFetch('/api/contacts');
            if (response.ok) {
              const contactsData = await response.json();
              const allContacts = contactsData.data || contactsData.contacts || contactsData || [];
              const selectedContacts = allContacts.filter((c: any) => 
                pendingCampaignData.contact_ids.includes(c.id)
              );
              recipients = selectedContacts.map((c: any) => ({
                phone_number: c.phone || c.phone_number || c.phoneNumber,
                variables: pendingCampaignData.template_variables || {},
              }));
            }
          } catch (err) {
            console.error('Failed to fetch contacts for WhatsApp campaign:', err);
            toast({
              title: 'Error',
              description: 'Failed to fetch contact details',
              variant: 'destructive',
            });
            setIsUploading(false);
            return;
          }
        } else if (pendingCampaignData.type === 'whatsapp-csv' && pendingCampaignData.csvFile) {
          // Parse CSV to get phone numbers
          try {
            const arrayBuffer = await pendingCampaignData.csvFile.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array', raw: false });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as any[][];
            
            if (jsonData.length >= 2) {
              const headers = jsonData[0].map((h: any) => 
                h?.toString().toLowerCase().trim().replace(/\s+/g, '_')
              );
              const phoneIndex = headers.findIndex((h: string) => 
                ['phone', 'phone_number', 'mobile', 'cell', 'phonenumber'].includes(h)
              );
              
              if (phoneIndex !== -1) {
                for (let i = 1; i < jsonData.length; i++) {
                  const row = jsonData[i];
                  const phone = row[phoneIndex]?.toString().trim();
                  if (phone) {
                    recipients.push({
                      phone_number: phone,
                      variables: pendingCampaignData.template_variables || {},
                    });
                  }
                }
              }
            }
          } catch (err) {
            console.error('Failed to parse CSV for WhatsApp campaign:', err);
            toast({
              title: 'Error',
              description: 'Failed to parse CSV file',
              variant: 'destructive',
            });
            setIsUploading(false);
            return;
          }
        }

        if (recipients.length === 0) {
          toast({
            title: 'Error',
            description: 'No valid recipients found',
            variant: 'destructive',
          });
          setIsUploading(false);
          return;
        }

        whatsappCampaignMutation.mutate({
          campaign_name: pendingCampaignData.campaign_name,
          phone_number_id: pendingCampaignData.phone_number_id,
          template_id: pendingCampaignData.template_id,
          recipients,
          schedule: pendingCampaignData.schedule,
        });
      } else if (pendingCampaignData.type === 'email-contacts') {
        // Handle email campaign with contacts
        setIsUploading(true);
        const response = await authenticatedFetch('/api/email-campaigns', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            campaign_name: pendingCampaignData.campaign_name,
            subject: pendingCampaignData.subject,
            body: pendingCampaignData.body,
            contact_ids: pendingCampaignData.contact_ids,
            schedule: pendingCampaignData.schedule,
            attachments: pendingCampaignData.attachments,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to create email campaign');
        }

        const result = await response.json();
        queryClient.invalidateQueries({ queryKey: ['campaigns'] });
        
        toast({
          title: 'Email Campaign Created',
          description: `Email campaign created successfully with ${pendingCampaignData.contact_ids.length} recipients`,
        });
        
        setShowEstimator(false);
        setPendingCampaignData(null);
        setEstimatedContactCount(0);
        setIsUploading(false);
        handleClose();
      } else if (pendingCampaignData.type === 'csv') {
        // Handle CSV upload for call campaigns
        setIsUploading(true);
        const formData = new FormData();
        // Use field name 'file' to match backend upload middleware
        formData.append('file', pendingCampaignData.csvFile);
        formData.append('name', pendingCampaignData.name);
        formData.append('agent_id', pendingCampaignData.agent_id);
        formData.append('first_call_time', pendingCampaignData.first_call_time);
        formData.append('last_call_time', pendingCampaignData.last_call_time);
        formData.append('start_date', pendingCampaignData.start_date);
        formData.append('next_action', pendingCampaignData.next_action);
        if (pendingCampaignData.end_date) {
          formData.append('end_date', pendingCampaignData.end_date);
        }
        if (pendingCampaignData.use_custom_timezone) {
          formData.append('use_custom_timezone', 'true');
          formData.append('campaign_timezone', pendingCampaignData.campaign_timezone);
        }
        // Add retry configuration
        formData.append('max_retries', pendingCampaignData.max_retries.toString());
        formData.append('retry_interval_minutes', pendingCampaignData.retry_interval_minutes.toString());
        
        // Add phone number ID if selected
        if (pendingCampaignData.phone_number_id) {
          formData.append('phone_number_id', pendingCampaignData.phone_number_id);
        }
        
        uploadCsvMutation.mutate(formData);
      } else {
        // Handle contact-based call campaign
        createMutation.mutate(pendingCampaignData);
      }
      
      setShowEstimator(false);
    } catch (error: any) {
      if (error.message.includes('insufficient credits')) {
        showInsufficientCreditsToast(0, 0);
      }
      setShowEstimator(false);
    }
  };

  const handleEstimatorCancel = () => {
    setShowEstimator(false);
    setPendingCampaignData(null);
    setEstimatedContactCount(0);
    setIsUploading(false);
  };

  const handleClose = () => {
    setCampaignType('call');
    setName('');
    setAgentId('');
    setSelectedPhoneNumberId('');
    setFirstCallTime('09:00');
    setLastCallTime('17:00');
    // Reset to today's date in user's timezone
    setStartDate(userTimezone ? getDateInTimezone(userTimezone) : getDateInTimezone(detectBrowserTimezone()));
    setEndDate('');
    setNextAction('call');
    setCsvFile(null);
    setUploadResult(null);
    setIsUploading(false);
    setShowEstimator(false);
    setPendingCampaignData(null);
    setEstimatedContactCount(0);
    setMaxRetries(0);
    setRetryIntervalMinutes(60);
    // Reset WhatsApp-specific states
    setSelectedWhatsAppPhoneNumberId('');
    setWhatsappPhoneNumbers([]);
    setWhatsappTemplates([]);
    setSelectedTemplateId('');
    setTemplateVariables({});
    setSendImmediately(true);
    setScheduledAt('');
    // Reset email-specific states
    setEmailSubject('');
    setEmailBody('');
    setEmailAttachments([]);
    onClose();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className={`max-w-2xl ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
          <DialogHeader>
            <DialogTitle>Create New Campaign</DialogTitle>
            <DialogDescription>
              Create a new {campaignType === 'email' ? 'email' : campaignType === 'whatsapp' ? 'WhatsApp messaging' : 'calling'} campaign by uploading a CSV file or selecting contacts
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 thin-scrollbar">
          
          {/* Campaign Type Selection */}
          <div>
            <Label>Campaign Type *</Label>
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                variant={campaignType === 'call' ? 'default' : 'outline'}
                className={`flex-1 ${campaignType === 'call' ? '' : ''}`}
                onClick={() => setCampaignType('call')}
              >
                <Phone className="w-4 h-4 mr-2" />
                Call Campaign
              </Button>
              <Button
                type="button"
                variant={campaignType === 'whatsapp' ? 'default' : 'outline'}
                className={`flex-1 ${campaignType === 'whatsapp' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                onClick={() => setCampaignType('whatsapp')}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                WhatsApp
              </Button>
              <Button
                type="button"
                variant={campaignType === 'email' ? 'default' : 'outline'}
                className={`flex-1 ${campaignType === 'email' ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                onClick={() => setCampaignType('email')}
              >
                <Mail className="w-4 h-4 mr-2" />
                Email
              </Button>
            </div>
          </div>
          
          {/* Campaign Name */}
          <div>
            <Label htmlFor="name">Campaign Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Q4 Outreach Campaign"
              className="mt-1"
            />
          </div>

          {/* Agent Selection - Only for Call campaigns */}
          {campaignType === 'call' && (
            <div>
              <Label htmlFor="agent">Select Agent *</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose a calling agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent: any) => (
                    <SelectItem key={agent.id} value={agent.id.toString()}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* WhatsApp Phone Number Selection - Only for WhatsApp campaigns */}
          {campaignType === 'whatsapp' && (
            <div>
              <Label htmlFor="whatsappPhoneNumber" className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-green-600" />
                WhatsApp Phone Number *
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="w-4 h-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Select the WhatsApp Business phone number that will be used to send messages.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <Select 
                value={selectedWhatsAppPhoneNumberId} 
                onValueChange={setSelectedWhatsAppPhoneNumberId}
                disabled={isFetchingWhatsAppPhoneNumbers}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={
                    isFetchingWhatsAppPhoneNumbers 
                      ? "Loading phone numbers..." 
                      : whatsappPhoneNumbers.length === 0 
                        ? "No WhatsApp numbers available" 
                        : "Select WhatsApp number"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {whatsappPhoneNumbers.map((pn) => (
                    <SelectItem key={pn.id} value={pn.id}>
                      {pn.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* WhatsApp Template Selection - Only for WhatsApp campaigns */}
          {campaignType === 'whatsapp' && selectedWhatsAppPhoneNumberId && (
            <div>
              <Label htmlFor="whatsappTemplate" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Message Template *
              </Label>
              <Select 
                value={selectedTemplateId} 
                onValueChange={handleTemplateSelect}
                disabled={isFetchingTemplates}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={
                    isFetchingTemplates 
                      ? "Loading templates..." 
                      : whatsappTemplates.length === 0 
                        ? "No templates available" 
                        : "Select a template"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {whatsappTemplates.map((template) => (
                    <SelectItem key={template.template_id} value={template.template_id}>
                      {template.name} ({template.language})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Template Variables - Only for WhatsApp campaigns with selected template */}
          {campaignType === 'whatsapp' && selectedTemplateId && (
            <>
              {/* Template Preview */}
              {(() => {
                const selectedTemplate = whatsappTemplates.find(t => t.template_id === selectedTemplateId);
                if (selectedTemplate?.components?.body?.text) {
                  let previewText = selectedTemplate.components.body.text;
                  // Replace variables with their values
                  Object.entries(templateVariables).forEach(([key, value]) => {
                    previewText = previewText.replace(
                      new RegExp(`{{${key}}}`, 'g'),
                      value || `{{${key}}}`
                    );
                  });
                  return (
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <Label className="text-xs text-green-700 dark:text-green-400 mb-1 block">Message Preview</Label>
                      <p className="text-sm text-green-800 dark:text-green-300 whitespace-pre-wrap">{previewText}</p>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Variable inputs */}
              {Object.keys(templateVariables).length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Template Variables (Optional - will use defaults if empty)</Label>
                  {Object.entries(templateVariables).map(([varName, value]) => (
                    <div key={varName}>
                      <Label htmlFor={`var-${varName}`} className="text-xs">{varName}</Label>
                      <Input
                        id={`var-${varName}`}
                        value={value}
                        onChange={(e) => setTemplateVariables(prev => ({
                          ...prev,
                          [varName]: e.target.value
                        }))}
                        placeholder={`Enter ${varName}`}
                        className="mt-1"
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Email Campaign Fields - Only for Email campaigns */}
          {campaignType === 'email' && (
            <>
              {/* Gmail Connection Status Banner */}
              {gmailStatus.loading ? (
                <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg border flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Checking Gmail connection...</span>
                </div>
              ) : !gmailStatus.connected || !gmailStatus.hasGmailScope ? (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                        {gmailStatus.requiresReconnect
                          ? 'Reconnect Google to send emails'
                          : 'Gmail not connected'}
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        {gmailStatus.requiresReconnect
                          ? 'Your Google connection needs to be updated to include email sending permission.'
                          : 'Connect your Gmail account in Settings > Integrations to send email campaigns.'}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.location.href = '/dashboard?tab=integrations'}
                    className="whitespace-nowrap flex-shrink-0 ml-4"
                  >
                    Go to Integrations
                  </Button>
                </div>
              ) : (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-green-700 dark:text-green-300">
                    Emails will be sent from {gmailStatus.email}
                  </span>
                </div>
              )}

              <div>
                <Label htmlFor="emailSubject">Email Subject *</Label>
                <Input
                  id="emailSubject"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Enter email subject line"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="emailBody">Email Message *</Label>
                <Textarea
                  id="emailBody"
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  placeholder="Type your email message here..."
                  className="mt-1 min-h-[150px] resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Tip: Keep your message clear and personalized for better engagement
                </p>
              </div>

              {/* Email Attachments */}
              <div className="space-y-2">
                <Label>Attachments (Optional)</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    id="emailAttachmentInput"
                    multiple
                    onChange={handleAttachmentSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('emailAttachmentInput')?.click()}
                    disabled={isUploadingAttachment}
                    className="flex items-center gap-2"
                  >
                    {isUploadingAttachment ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    Add Attachments
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Max 10MB per file
                  </p>
                </div>

                {/* Attachments List */}
                {emailAttachments.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {emailAttachments.map((attachment, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 bg-muted rounded-md"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <FileText className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {attachment.filename}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(attachment.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveAttachment(index)}
                          className="flex-shrink-0 ml-2"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* WhatsApp Schedule Option */}
          {campaignType === 'whatsapp' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="sendImmediately" className="flex items-center gap-2">
                  Send Immediately
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="w-4 h-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>When enabled, messages will be sent as soon as the campaign is created. Disable to schedule for a specific time.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Switch
                  id="sendImmediately"
                  checked={sendImmediately}
                  onCheckedChange={setSendImmediately}
                />
              </div>
              
              {!sendImmediately && (
                <div>
                  <Label htmlFor="scheduledAt">Schedule Date & Time *</Label>
                  <Input
                    id="scheduledAt"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="mt-1"
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Call Campaign Phone Number Selection - Only for Call campaigns */}
          {campaignType === 'call' && (
            <div>
              <Label htmlFor="phoneNumber" className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Caller Phone Number
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="w-4 h-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Select the phone number that will be used to make outbound calls for this campaign. If not selected, the agent's assigned phone or any available number will be used.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
            </Label>
            {isFetchingPhoneNumbers ? (
              <div className="flex items-center justify-center p-3 border rounded-md mt-1">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">Loading phone numbers...</span>
              </div>
            ) : phoneNumbers.length === 0 ? (
              <div className={`p-3 border rounded-md mt-1 text-sm ${theme === 'dark' ? 'bg-yellow-950/20 border-yellow-800 text-yellow-200' : 'bg-yellow-50 border-yellow-200 text-yellow-800'}`}>
                No phone numbers available. The agent's assigned phone number or system default will be used.
              </div>
            ) : (
              <Select value={selectedPhoneNumberId} onValueChange={setSelectedPhoneNumberId}>
                <SelectTrigger id="phoneNumber" className="mt-1">
                  <SelectValue placeholder="Choose a phone number (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {phoneNumbers.map((phone) => {
                    // Find the agent name for this phone number
                    const assignedAgent = phone.assignedToAgentId 
                      ? agents.find((a: any) => a.id === phone.assignedToAgentId)
                      : null;
                    
                    return (
                      <SelectItem key={phone.id} value={phone.id}>
                        <span className="font-medium">{phone.phoneNumber}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {phone.name}
                          {assignedAgent 
                            ? ` • Linked to ${assignedAgent.name}` 
                            : ' • Not linked to any agent'}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>
          )}

          {/* Call Time Window - Only for Call campaigns */}
          {campaignType === 'call' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstCallTime">First Call Time *</Label>
              <Input
                id="firstCallTime"
                type="time"
                value={firstCallTime}
                onChange={(e) => setFirstCallTime(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="lastCallTime">Last Call Time *</Label>
              <Input
                id="lastCallTime"
                type="time"
                value={lastCallTime}
                onChange={(e) => setLastCallTime(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          )}

          {/* Date Range - Only for Call campaigns */}
          {campaignType === 'call' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startDate">Start Date *</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="endDate">End Date (Optional)</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="mt-1"
              />
            </div>
          </div>
          )}

          {/* Next Action - Only for Call campaigns */}
          {campaignType === 'call' && (
          <div>
            <Label htmlFor="nextAction">Next Action *</Label>
            <Select value={nextAction} onValueChange={setNextAction}>
              <SelectTrigger id="nextAction" className="mt-1">
                <SelectValue placeholder="Select next action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="call">Call</SelectItem>
                <SelectItem value="message">Message</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
          )}

          {/* Retry Configuration - Only for Call campaigns */}
          {campaignType === 'call' && (
          <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex items-center gap-2 mb-3">
              <Label className="text-base font-medium">Auto-Retry for Not Connected Leads</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="w-4 h-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>If a call ends with &quot;no answer&quot; or &quot;busy&quot;, the system will automatically retry calling that lead after the specified interval, up to the maximum number of retries.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="maxRetries">Number of Retries</Label>
                <Select value={maxRetries.toString()} onValueChange={(val) => setMaxRetries(parseInt(val))}>
                  <SelectTrigger id="maxRetries" className="mt-1">
                    <SelectValue placeholder="Select retries" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">No retries</SelectItem>
                    <SelectItem value="1">1 retry</SelectItem>
                    <SelectItem value="2">2 retries</SelectItem>
                    <SelectItem value="3">3 retries</SelectItem>
                    <SelectItem value="4">4 retries</SelectItem>
                    <SelectItem value="5">5 retries</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="retryInterval">Retry Interval (Minutes)</Label>
                <div className="flex gap-2">
                  <Select 
                    value={isCustomInterval ? "custom" : retryIntervalMinutes.toString()} 
                    onValueChange={(val) => {
                      if (val === "custom") {
                        setIsCustomInterval(true);
                      } else {
                        setIsCustomInterval(false);
                        setRetryIntervalMinutes(parseInt(val));
                      }
                    }}
                    disabled={maxRetries === 0}
                  >
                    <SelectTrigger id="retryInterval" className="mt-1 flex-1">
                      <SelectValue placeholder="Select interval" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
                      <SelectItem value="180">3 hours</SelectItem>
                      <SelectItem value="240">4 hours</SelectItem>
                      <SelectItem value="360">6 hours</SelectItem>
                      <SelectItem value="720">12 hours</SelectItem>
                      <SelectItem value="1440">24 hours</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {isCustomInterval && (
                    <Input
                      type="number"
                      value={retryIntervalMinutes}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val)) {
                          setRetryIntervalMinutes(val);
                        } else {
                          setRetryIntervalMinutes(0);
                        }
                      }}
                      className="mt-1 w-24"
                      min={1}
                      max={1440}
                      placeholder="Mins"
                    />
                  )}
                </div>
              </div>
            </div>
            {maxRetries > 0 && (
              <p className="text-sm text-muted-foreground mt-2">
                Leads that don&apos;t connect will be retried up to {maxRetries} time{maxRetries > 1 ? 's' : ''} with {retryIntervalMinutes >= 60 ? `${retryIntervalMinutes / 60} hour${retryIntervalMinutes >= 120 ? 's' : ''}` : `${retryIntervalMinutes} minutes`} between each attempt. Retries will respect campaign time windows.
              </p>
            )}
          </div>
          )}

          {/* Timezone Settings - Only for Call campaigns */}
          {campaignType === 'call' && (
          <CampaignTimezoneSelectorCard
            userTimezone={userTimezone}
            campaignTimezone={campaignTimezone}
            useCustomTimezone={useCustomTimezone}
            onChange={({ useCustomTimezone, campaignTimezone }) => {
              setUseCustomTimezone(useCustomTimezone);
              setCampaignTimezone(campaignTimezone || '');
            }}
          />
          )}

          {/* File Upload Section */}
          {preSelectedContacts.length === 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Upload Contacts (Excel/CSV)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Template
                </Button>
              </div>
              <div
                className={`mt-2 border-2 border-dashed rounded-lg p-6 text-center ${
                  theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-300 bg-gray-50'
                }`}
              >
                {!csvFile ? (
                  <>
                    <Upload className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                    <p className="mb-2">Drop your Excel or CSV file here or click to browse</p>
                    <p className="text-sm text-gray-500 mb-4">
                      Supports .xlsx, .xls, and .csv files. Only phone_number is required.
                    </p>
                    <Input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="csv-upload"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('csv-upload')?.click()}
                    >
                      Select File
                    </Button>
                  </>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <FileText className="w-8 h-8 mr-3 text-blue-500" />
                      <div className="text-left">
                        <p className="font-medium">{csvFile.name}</p>
                        <p className="text-sm text-gray-500">
                          {(csvFile.size / 1024).toFixed(2)} KB
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveFile}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pre-selected Contacts Info */}
          {preSelectedContacts.length > 0 && (
            <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-blue-50'}`}>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                <span className="font-medium">
                  {preSelectedContacts.length} contacts selected
                </span>
              </div>
            </div>
          )}

          {/* Upload Result */}
          {uploadResult && (
            <div className={`p-4 rounded-lg space-y-2 ${theme === 'dark' ? 'bg-gray-800' : 'bg-green-50'}`}>
              <div className="flex items-center font-medium text-green-600">
                <CheckCircle className="w-5 h-5 mr-2" />
                Campaign Created Successfully!
              </div>
              <div className="text-sm space-y-1">
                <p>Total rows processed: {uploadResult.totalRows}</p>
                <p>New contacts created: {uploadResult.contactsCreated}</p>
                {uploadResult.contactsSkipped > 0 && (
                  <p className="text-yellow-600">
                    Contacts skipped (already exist): {uploadResult.contactsSkipped}
                  </p>
                )}
                {uploadResult.invalidRows > 0 && (
                  <p className="text-red-600">
                    Invalid rows: {uploadResult.invalidRows}
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              {uploadResult ? 'Close' : 'Cancel'}
            </Button>
            {!uploadResult && (
              <Button
                type="submit"
                disabled={createMutation.isPending || isUploading}
                style={{ backgroundColor: '#1A6262' }}
                className="text-white"
              >
                {isUploading ? 'Creating...' : 'Create Campaign'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    {/* Credit Estimator Dialog */}
    <Dialog open={showEstimator} onOpenChange={handleEstimatorCancel}>
      <DialogContent className={`max-w-2xl ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
        <DialogHeader>
          <DialogTitle>
            {campaignType === 'email' ? 'Confirm Email Campaign' : 'Campaign Cost Estimate'}
          </DialogTitle>
          <DialogDescription>
            {campaignType === 'email' 
              ? `Confirm sending emails to ${estimatedContactCount} contact${estimatedContactCount > 1 ? 's' : ''}`
              : 'Review the estimated cost for your campaign before proceeding'
            }
          </DialogDescription>
        </DialogHeader>
        
        {campaignType === 'email' ? (
          <div className="py-6">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-full">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">Total Recipients</p>
                  <p className="text-sm text-muted-foreground">{estimatedContactCount} email{estimatedContactCount > 1 ? 's' : ''} will be sent</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{estimatedContactCount}</p>
                <p className="text-xs text-muted-foreground">contact{estimatedContactCount > 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
        ) : (
          <CampaignCreditEstimator
            contactCount={estimatedContactCount}
            campaignType={campaignType}
            showDetailedBreakdown={true}
            estimateOnly={false}
          />
        )}
        
        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={handleEstimatorCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleEstimatorConfirm}
            disabled={createMutation.isPending || isUploading}
            style={{ backgroundColor: '#1A6262' }}
            className="text-white"
          >
            {isUploading || createMutation.isPending ? 'Creating...' : 'Confirm & Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  );
};

export default CreateCampaignModal;
