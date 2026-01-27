import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import CustomerConversionModal from "./CustomerConversionModal";
import InteractionDetailsModal from './InteractionDetailsModal';
import CreateCampaignModal from "@/components/campaigns/CreateCampaignModal";
import {
  Search,
  Download,
  MessageSquare,
  Phone,
  Calendar,
  Mail,
  UserPlus,
  CalendarDays,
  Building2,
  ArrowLeft,
  Loader2,
  X,
  Megaphone,
  ChevronRight,
  Filter,
  Check,
  ChevronDown,
  Plus,
  User as UserIcon,
  Pencil,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useNavigation } from "@/contexts/NavigationContext";
import { ContactDisplay } from "@/components/contacts/ContactDisplay";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiService } from "@/services/apiService";
import { useToast } from "@/hooks/use-toast";
import { useLeadStages } from "@/hooks/useLeadStages";
import { useAuth } from "@/contexts/AuthContext";
import { EditLeadModal, LeadIntelligenceData } from "@/components/leads/EditLeadModal";
import type { Lead } from "@/pages/Dashboard";
import type { LeadAnalyticsData } from "@/types/api";

// API interfaces
interface LeadGroup {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  leadType: 'inbound' | 'outbound';
  recentLeadTag: string;
  recentEngagementLevel?: string;
  recentIntentLevel?: string;
  recentBudgetConstraint?: string;
  recentTimelineUrgency?: string;
  recentFitAlignment?: string;
  escalatedToHuman: boolean;
  interactedAgents: string[];
  interactions: number;
  lastContact: string;
  followUpScheduled?: string;
  followUpStatus?: string;
  demoScheduled: string | null; // Now a datetime string
  meetingId?: string; // UUID of calendar_meetings record for rescheduling
  meetingLink?: string; // Google Meet link
  meetingAttendeeEmail?: string; // Email from existing meeting
  meetingTitle?: string; // Title from existing meeting
  meetingDescription?: string; // Description from existing meeting
  groupType: 'phone' | 'email' | 'individual';
  // Requirements from complete analysis - aggregated product/business requirements
  requirements?: string;
  // Custom CTA - call-to-action strings extracted from analysis
  customCta?: string;
  // Notes from contacts table
  contactNotes?: string;
  // Lead stage for pipeline tracking
  leadStage?: string;
  contactId?: string; // Contact ID for updating lead stage
  // Assigned team member
  assignedTo?: {
    id: string;
    name: string;
    role: string;
  } | null;
  // Chat summary from external server (Chat Agent)
  chatSummary?: string;
}

interface LeadTimelineEntry {
  id: string;
  leadName?: string;
  interactionAgent: string;
  interactionDate: string;
  platform?: string;
  callDirection?: string;
  hangupBy?: string;
  hangupReason?: string;
  companyName?: string;
  status: string;
  smartNotification?: string;
  duration?: string;
  engagementLevel?: string;
  intentLevel?: string;
  budgetConstraint?: string;
  timelineUrgency?: string;
  fitAlignment?: string;
  extractedEmail?: string;
  totalScore?: number;
  intentScore?: number;
  urgencyScore?: number;
  budgetScore?: number;
  fitScore?: number;
  engagementScore?: number;
  overallScore?: number;
  ctaPricingClicked?: boolean;
  ctaDemoClicked?: boolean;
  ctaFollowupClicked?: boolean;
  ctaSampleClicked?: boolean;
  ctaEscalatedToHuman?: boolean;
  demoBookDatetime?: string;
  followUpDate?: string;
  followUpRemark?: string;
  followUpStatus?: string;
  followUpCompleted?: boolean;
  followUpCallId?: string; // The call this follow-up is linked to
  // Requirements field - product/business requirements from call
  requirements?: string;
  // Custom CTA - call-to-action strings extracted from analysis
  customCta?: string;
  // Email-specific fields
  interactionType?: 'call' | 'email' | 'human_edit' | 'chat'; // Type of interaction
  emailSubject?: string; // Email subject
  emailStatus?: 'sent' | 'delivered' | 'opened' | 'failed'; // Email delivery status
  emailTo?: string; // Email recipient
  emailFrom?: string; // Email sender
  // Chat-specific fields (from Chat Agent Server extractions)
  inDetailSummary?: string; // Full summary from chat extraction
  conversationId?: string; // Conversation ID from chat
  messageCount?: number; // Number of messages in conversation
}

interface CreateFollowUpRequest {
  leadPhone?: string;
  leadEmail?: string;
  leadName?: string;
  followUpDate: string;
  remark?: string;
  callId?: string; // Link to specific call that triggered the follow-up
}

interface LeadIntelligenceProps {
  onOpenProfile: (contact: Lead) => void;
}

// Column filter interface
interface ColumnFilters {
  leadTag: string[];
  leadStage: string[];
  engagement: string[];
  intent: string[];
  budget: string[];
  urgency: string[];
  fit: string[];
  cta: string[];
}

// Excel-like Column Filter Component
interface ExcelFilterProps {
  title: string;
  options: string[];
  selectedValues: string[];
  onSelectionChange: (values: string[]) => void;
  showAllLabel?: string;
}

const ExcelColumnFilter = ({ title, options, selectedValues, onSelectionChange, showAllLabel = "All" }: ExcelFilterProps) => {
  const isAllSelected = selectedValues.length === 0;
  const hasActiveFilter = selectedValues.length > 0;

  const handleToggleAll = () => {
    onSelectionChange([]);
  };

  const handleToggleOption = (option: string) => {
    if (selectedValues.includes(option)) {
      onSelectionChange(selectedValues.filter(v => v !== option));
    } else {
      onSelectionChange([...selectedValues, option]);
    }
  };

  const handleSelectOnly = (option: string) => {
    onSelectionChange([option]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 hover:text-primary transition-colors">
          <span>{title}</span>
          <Filter className={`w-3 h-3 ${hasActiveFilter ? 'text-primary fill-primary/20' : 'text-muted-foreground'}`} />
          {hasActiveFilter && (
            <span className="ml-1 text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">
              {selectedValues.length}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48 max-h-80 overflow-y-auto">
        <DropdownMenuItem onClick={handleToggleAll} className="flex items-center gap-2">
          <div className={`w-4 h-4 border rounded flex items-center justify-center ${isAllSelected ? 'bg-primary border-primary' : 'border-input'}`}>
            {isAllSelected && <Check className="w-3 h-3 text-primary-foreground" />}
          </div>
          <span className="font-medium">{showAllLabel}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.map((option) => {
          const isSelected = selectedValues.includes(option);
          return (
            <DropdownMenuItem 
              key={option} 
              onClick={() => handleToggleOption(option)}
              className="flex items-center gap-2"
            >
              <div className={`w-4 h-4 border rounded flex items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'border-input'}`}>
                {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
              </div>
              <span>{option || '(Empty)'}</span>
            </DropdownMenuItem>
          );
        })}
        {selectedValues.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleToggleAll} className="text-muted-foreground">
              Clear filter
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const LeadIntelligence = ({ onOpenProfile }: LeadIntelligenceProps) => {
  const { theme } = useTheme();
  const { targetLeadIdentifier, clearTargetLeadId } = useNavigation();
  const { toast } = useToast();
  const { stages, bulkUpdateLeadStage, getStageColor, bulkUpdating } = useLeadStages();
  const { canEditLeads } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [isBulkLeadStageUpdating, setIsBulkLeadStageUpdating] = useState(false);
  
  // Column filters state (Excel-like multi-select)
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({
    leadTag: [],
    leadStage: [],
    engagement: [],
    intent: [],
    budget: [],
    urgency: [],
    fit: [],
    cta: [],
  });
  const [selectedContact, setSelectedContact] = useState<LeadGroup | null>(null);
  const [contacts, setContacts] = useState<LeadGroup[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [timeline, setTimeline] = useState<LeadTimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingStageId, setUpdatingStageId] = useState<string | null>(null);
  
  // Interaction details modal state
  const [isInteractionModalOpen, setIsInteractionModalOpen] = useState(false);
  const [selectedInteractionAnalytics, setSelectedInteractionAnalytics] = useState<LeadAnalyticsData | null>(null);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  // Follow-up scheduling state
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false);
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>(undefined);
  const [followUpRemark, setFollowUpRemark] = useState("");
  const [currentFollowUpContact, setCurrentFollowUpContact] = useState<LeadGroup | null>(null);
  const [currentFollowUpCallId, setCurrentFollowUpCallId] = useState<string | undefined>(undefined);
  const [followUpLoading, setFollowUpLoading] = useState(false);

  // Customer conversion modal state
  const [showConversionModal, setShowConversionModal] = useState(false);
  const [currentConversionContact, setCurrentConversionContact] = useState<LeadGroup | null>(null);
  const [conversionLoading, setConversionLoading] = useState(false);

  // Meeting scheduling modal state
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [currentMeetingContact, setCurrentMeetingContact] = useState<LeadGroup | null>(null);
  const [meetingDateTime, setMeetingDateTime] = useState<Date | undefined>();
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [isReschedule, setIsReschedule] = useState(false);
  const [meetingAttendeeEmail, setMeetingAttendeeEmail] = useState("");
  const [additionalInvites, setAdditionalInvites] = useState<string[]>([]);
  const [inviteInputValue, setInviteInputValue] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDescription, setMeetingDescription] = useState("");

  // Campaign creation modal state
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campaignContactIds, setCampaignContactIds] = useState<string[]>([]);

  // Edit Lead Intelligence modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingContact, setEditingContact] = useState<LeadGroup | null>(null);

  // Chat summaries state (from external Chat Agent Server)
  const [chatSummaries, setChatSummaries] = useState<Record<string, string>>({});
  const [chatSummariesLoading, setChatSummariesLoading] = useState(false);

  // Fetch chat summaries from external Chat Agent Server
  const fetchChatSummaries = async (contactsList: LeadGroup[]) => {
    try {
      // Get phone numbers from contacts that have phones
      const phoneNumbers = contactsList
        .filter(c => c.phone)
        .map(c => c.phone!)
        .filter(Boolean);

      if (phoneNumbers.length === 0) {
        return;
      }

      setChatSummariesLoading(true);
      
      const response = await apiService.getBatchExtractionSummaries(phoneNumbers);
      
      if (response.success && response.data) {
        setChatSummaries(response.data as Record<string, string>);
      }
    } catch (error) {
      // Silently fail - chat summaries are optional
      console.warn('Failed to fetch chat summaries:', error);
    } finally {
      setChatSummariesLoading(false);
    }
  };

  // API functions
  const fetchLeadIntelligence = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getLeadIntelligence();
      const contactsData = response.data || response as any;
      setContacts(contactsData);
      
      // Fetch chat summaries for all contacts in background
      fetchChatSummaries(contactsData);
    } catch (error) {
      console.error('Error fetching lead intelligence:', error);
      setError('Failed to load lead intelligence data');
    } finally {
      setLoading(false);
    }
  };

  // Fetch chat extractions and merge with call timeline
  const fetchChatExtractions = async (phone: string): Promise<LeadTimelineEntry[]> => {
    try {
      const response = await apiService.getFullExtractions(phone);
      
      if (response.success && response.data && response.data.length > 0) {
        // Convert chat extractions to timeline entries
        return response.data.map((extraction: any) => ({
          id: `chat_${extraction.extraction_id}`,
          leadName: extraction.name || undefined,
          interactionAgent: extraction.agent_name || 'Chat Agent',
          interactionDate: extraction.extracted_at,
          platform: extraction.platform || 'WhatsApp',
          status: extraction.lead_status_tag,
          smartNotification: extraction.smart_notification,
          engagementLevel: extraction.engagement_health,
          intentLevel: extraction.intent_level,
          budgetConstraint: extraction.budget_constraint,
          timelineUrgency: extraction.urgency_level,
          fitAlignment: extraction.fit_alignment,
          extractedEmail: extraction.email,
          totalScore: extraction.total_score,
          intentScore: extraction.intent_score,
          urgencyScore: extraction.urgency_score,
          budgetScore: extraction.budget_score,
          fitScore: extraction.fit_score,
          engagementScore: extraction.engagement_score,
          requirements: extraction.requirements,
          customCta: extraction.custom_cta,
          interactionType: 'chat' as const,
          inDetailSummary: extraction.in_detail_summary,
          conversationId: extraction.conversation_id,
          messageCount: extraction.message_count_at_extraction,
        }));
      }
      return [];
    } catch (error) {
      console.warn('Failed to fetch chat extractions:', error);
      return [];
    }
  };

  const fetchLeadTimeline = async (groupId: string) => {
    try {
      setTimelineLoading(true);
      
      // Fetch call timeline from main backend
      const response = await apiService.getLeadIntelligenceTimeline(groupId);
      const callTimeline = response.data || response as any;
      
      // Get the phone number from groupId if it's a phone-based group
      const [groupType, ...groupKeyParts] = groupId.split('_');
      const groupKey = groupKeyParts.join('_');
      
      // If this is a phone-based group, also fetch chat extractions
      if (groupType === 'phone' && groupKey) {
        const chatTimeline = await fetchChatExtractions(groupKey);
        
        // Merge and sort by date (most recent first)
        const mergedTimeline = [...callTimeline, ...chatTimeline].sort((a, b) => {
          const dateA = new Date(a.interactionDate).getTime();
          const dateB = new Date(b.interactionDate).getTime();
          return dateB - dateA;
        });
        
        setTimeline(mergedTimeline);
      } else {
        setTimeline(callTimeline);
      }
    } catch (error) {
      console.error('Error fetching lead timeline:', error);
      setTimeline([]);
    } finally {
      setTimelineLoading(false);
    }
  };

  const createFollowUp = async (followUpData: CreateFollowUpRequest) => {
    try {
      setFollowUpLoading(true);
      await apiService.createFollowUp(followUpData);
      // Refresh the lead intelligence data to get updated follow-up info
      await fetchLeadIntelligence();
    } catch (error) {
      console.error('Error creating follow-up:', error);
      throw error;
    } finally {
      setFollowUpLoading(false);
    }
  };

  // Load data on component mount
  useEffect(() => {
    fetchLeadIntelligence();
  }, []);

  // Auto-expand lead timeline when targetLeadIdentifier is provided (from notification click)
  useEffect(() => {
    console.log('LeadIntelligence effect triggered:', { 
      targetLeadIdentifier, 
      contactsCount: contacts.length, 
      selectedContact: selectedContact?.id,
      allContacts: contacts.map(c => ({ id: c.id, name: c.name, phone: c.phone, email: c.email }))
    });
    
    if (targetLeadIdentifier && contacts.length > 0 && !selectedContact) {
      console.log('Attempting to find contact with identifier:', targetLeadIdentifier);
      
      // Find contact by matching phone or email
      const targetContact = contacts.find((contact) => {
        // Match by phone number (normalize by removing spaces and special chars)
        if (targetLeadIdentifier.phone && contact.phone) {
          const normalizePhone = (phone: string) => phone.replace(/[\s\-\(\)]/g, '');
          if (normalizePhone(contact.phone) === normalizePhone(targetLeadIdentifier.phone)) {
            return true;
          }
        }
        
        // Match by email (case-insensitive)
        if (targetLeadIdentifier.email && contact.email) {
          if (contact.email.toLowerCase() === targetLeadIdentifier.email.toLowerCase()) {
            return true;
          }
        }
        
        return false;
      });
      
      if (targetContact) {
        console.log('✅ Found target contact! Opening timeline for:', targetContact.name, targetContact.id);
        // Open the contact and fetch its timeline
        setSelectedContact(targetContact);
        fetchLeadTimeline(targetContact.id);
        // Clear the targetLeadIdentifier after using it
        clearTargetLeadId();
      } else {
        console.error('❌ Target lead not found in contacts list. Searching for:', targetLeadIdentifier);
        console.log('Available contacts:', contacts.map(c => ({ 
          id: c.id, 
          name: c.name, 
          phone: c.phone, 
          email: c.email 
        })));
        // Clear the targetLeadIdentifier if lead not found
        clearTargetLeadId();
      }
    }
  }, [targetLeadIdentifier, contacts, selectedContact, clearTargetLeadId]);

  // Extract unique values for filter options
  const filterOptions = {
    leadTag: [...new Set(contacts.map(c => c.recentLeadTag).filter(Boolean))],
    leadStage: [...new Set(contacts.map(c => c.leadStage).filter(Boolean))],
    engagement: [...new Set(contacts.map(c => c.recentEngagementLevel).filter(Boolean))],
    intent: [...new Set(contacts.map(c => c.recentIntentLevel).filter(Boolean))],
    budget: [...new Set(contacts.map(c => c.recentBudgetConstraint).filter(Boolean))],
    urgency: [...new Set(contacts.map(c => c.recentTimelineUrgency).filter(Boolean))],
    fit: [...new Set(contacts.map(c => c.recentFitAlignment).filter(Boolean))],
    cta: [...new Set(contacts.flatMap(c => c.customCta ? c.customCta.split(',').map(s => s.trim()) : []).filter(Boolean))],
  };

  // Helper to update a specific column filter
  const updateColumnFilter = (column: keyof ColumnFilters, values: string[]) => {
    setColumnFilters(prev => ({ ...prev, [column]: values }));
  };

  // Check if any column filters are active
  const hasActiveColumnFilters = Object.values(columnFilters).some(arr => arr.length > 0);

  // Clear all column filters
  const clearAllColumnFilters = () => {
    setColumnFilters({
      leadTag: [],
      leadStage: [],
      engagement: [],
      intent: [],
      budget: [],
      urgency: [],
      fit: [],
      cta: [],
    });
  };

  const filteredContacts = contacts.filter((contact) => {
    const matchesSearch = contact.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    
    // Column filter matching
    const matchesLeadTagFilter = columnFilters.leadTag.length === 0 || 
      columnFilters.leadTag.includes(contact.recentLeadTag);
    const matchesLeadStageFilter = columnFilters.leadStage.length === 0 || 
      (contact.leadStage && columnFilters.leadStage.includes(contact.leadStage));
    const matchesEngagementFilter = columnFilters.engagement.length === 0 || 
      (contact.recentEngagementLevel && columnFilters.engagement.includes(contact.recentEngagementLevel));
    const matchesIntentFilter = columnFilters.intent.length === 0 || 
      (contact.recentIntentLevel && columnFilters.intent.includes(contact.recentIntentLevel));
    const matchesBudgetFilter = columnFilters.budget.length === 0 || 
      (contact.recentBudgetConstraint && columnFilters.budget.includes(contact.recentBudgetConstraint));
    const matchesUrgencyFilter = columnFilters.urgency.length === 0 || 
      (contact.recentTimelineUrgency && columnFilters.urgency.includes(contact.recentTimelineUrgency));
    const matchesFitFilter = columnFilters.fit.length === 0 || 
      (contact.recentFitAlignment && columnFilters.fit.includes(contact.recentFitAlignment));
    const matchesCtaFilter = columnFilters.cta.length === 0 || 
      (contact.customCta && columnFilters.cta.some(cta => contact.customCta?.toLowerCase().includes(cta.toLowerCase())));
    
    return matchesSearch && 
      matchesLeadTagFilter && matchesLeadStageFilter && matchesEngagementFilter && 
      matchesIntentFilter && matchesBudgetFilter && matchesUrgencyFilter && 
      matchesFitFilter && matchesCtaFilter;
  });

  const handleContactClick = async (contact: LeadGroup) => {
    setSelectedContact(contact);
    await fetchLeadTimeline(contact.id);
  };

  const handleBackToList = () => {
    setSelectedContact(null);
    setTimeline([]);
  };

  const handleInteractionClick = async (interactionId: string) => {
    console.log(`Interaction clicked: ${interactionId}`);
    setIsInteractionModalOpen(true);
    setIsAnalyticsLoading(true);
    setAnalyticsError(null);
    setSelectedInteractionAnalytics(null);

    try {
      // Assuming interactionId is the callId
      const response = await apiService.getCallAnalytics(interactionId);
      console.log('API Response:', response);

      if (response.data) {
        setSelectedInteractionAnalytics(response.data);
        console.log('Analytics data set:', response.data);
      } else {
        // Handle cases where response.data is null or undefined
        setSelectedInteractionAnalytics(response as any);
        console.log('Analytics data set (raw response):', response);
      }
    } catch (error: any) {
      console.error('Error fetching call analytics:', error);
      // Provide more user-friendly error messages for 404 errors
      if (error.message && (error.message.includes('404') || error.message.toLowerCase().includes('not found'))) {
        setAnalyticsError('Analytics data not found for this call');
      } else {
        setAnalyticsError(error.message || 'An unknown error occurred');
      }
    } finally {
      setIsAnalyticsLoading(false);
      console.log('Finished loading analytics.');
    }
  };

  // Follow-up scheduling functions
  const handleScheduleFollowUp = (contact: LeadGroup, callId?: string) => {
    setCurrentFollowUpContact(contact);
    setCurrentFollowUpCallId(callId);
    setFollowUpDate(undefined);
    setFollowUpRemark("");
    setShowFollowUpDialog(true);
  };

  const handleSaveFollowUp = async () => {
    if (followUpDate && currentFollowUpContact) {
      try {
        const followUpData: CreateFollowUpRequest = {
          leadPhone: currentFollowUpContact.phone,
          leadEmail: currentFollowUpContact.email,
          leadName: currentFollowUpContact.name,
          followUpDate: format(followUpDate, 'yyyy-MM-dd'),
          remark: followUpRemark || undefined,
          callId: currentFollowUpCallId // Link to specific call if provided
        };

        await createFollowUp(followUpData);
        
        // Refetch timeline if we're viewing a contact's timeline
        if (selectedContact) {
          await fetchLeadTimeline(selectedContact.id);
        }
        
        // Refetch main lead intelligence data as well
        await fetchLeadIntelligence();
        
        // Close dialog and reset state
        setShowFollowUpDialog(false);
        setFollowUpDate(undefined);
        setFollowUpRemark("");
        setCurrentFollowUpContact(null);
        setCurrentFollowUpCallId(undefined);
      } catch (error) {
        console.error('Failed to schedule follow-up:', error);
        // You might want to show a toast notification here
      }
    }
  };

  // Meeting scheduling functions
  const handleScheduleMeeting = (contact: LeadGroup, isRescheduling: boolean = false) => {
    console.log('🎯 handleScheduleMeeting called:', { 
      contact, 
      isRescheduling,
      contactFields: {
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        company: contact.company,
        groupType: contact.groupType,
        hasPhone: !!contact.phone,
        phoneValue: contact.phone,
        hasMeetingData: !!contact.meetingId
      }
    });
    setCurrentMeetingContact(contact);
    setIsReschedule(isRescheduling);
    setMeetingDateTime(contact.demoScheduled ? new Date(contact.demoScheduled) : undefined);
    
    // When rescheduling, use existing meeting data; otherwise use contact info
    if (isRescheduling && contact.meetingAttendeeEmail) {
      setMeetingAttendeeEmail(contact.meetingAttendeeEmail);
      setMeetingTitle(contact.meetingTitle || '');
      setMeetingDescription(contact.meetingDescription || '');
      console.log('📋 Pre-filled with existing meeting data:', {
        attendeeEmail: contact.meetingAttendeeEmail,
        title: contact.meetingTitle,
        description: contact.meetingDescription
      });
    } else {
      // New meeting - use contact email or empty
      setMeetingAttendeeEmail(contact.email || "");
      
      // Set default title
      const titleParts = [contact.name, contact.company, 'Demo'].filter(Boolean);
      setMeetingTitle(titleParts.join(' + '));
      
      // Set default description - will be replaced with "See you at [time]" in backend if not changed
      setMeetingDescription('');
      
      console.log('📝 Set default values for new meeting');
    }
    
    setAdditionalInvites([]);
    setInviteInputValue("");
    
    setShowMeetingModal(true);
    console.log('Modal state set to true');
  };

  // Email tag management functions
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleAddInvite = () => {
    const email = inviteInputValue.trim();
    if (!email) return;

    if (!validateEmail(email)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    if (additionalInvites.includes(email)) {
      toast({
        title: "Duplicate Email",
        description: "This email has already been added",
        variant: "destructive",
      });
      return;
    }

    setAdditionalInvites([...additionalInvites, email]);
    setInviteInputValue("");
  };

  const handleRemoveInvite = (emailToRemove: string) => {
    setAdditionalInvites(additionalInvites.filter(email => email !== emailToRemove));
  };

  const handleInviteKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddInvite();
    } else if (e.key === ',' && inviteInputValue.trim()) {
      e.preventDefault();
      handleAddInvite();
    }
  };

  const handleSaveMeeting = async () => {
    if (!meetingDateTime || !currentMeetingContact) {
      toast({
        title: "Error",
        description: "Please select a date and time for the meeting",
        variant: "destructive",
      });
      return;
    }

    setMeetingLoading(true);

    try {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        toast({
          title: "Error",
          description: "Authentication required. Please log in again.",
          variant: "destructive",
        });
        return;
      }

      if (isReschedule && currentMeetingContact.meetingId) {
        // Reschedule existing meeting
        const response = await fetch(
          `${import.meta.env.VITE_API_BASE_URL}/api/integrations/calendar/meetings/${currentMeetingContact.meetingId}/reschedule`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              newDateTime: meetingDateTime.toISOString(),
            }),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "Failed to reschedule meeting");
        }

        toast({
          title: "Success",
          description: "Meeting rescheduled successfully",
        });
      } else {
        // Schedule new meeting
        // Validate email
        if (!meetingAttendeeEmail) {
          toast({
            title: "Error",
            description: "Please enter an email address",
            variant: "destructive",
          });
          return;
        }

        // Only include leadAnalyticsId if it's a valid UUID (not a grouped ID like 'phone_xxx')
        const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentMeetingContact.id);
        
        console.log('🔍 Lead Analytics ID Validation:', {
          contactId: currentMeetingContact.id,
          isValidUUID,
          uuidPattern: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          willSendToBackend: isValidUUID
        });

        const requestBody: any = {
          attendeeEmail: meetingAttendeeEmail,
          attendeeName: currentMeetingContact.name,
          meetingDateTime: meetingDateTime.toISOString(),
          phoneNumber: currentMeetingContact.phone,
          leadName: currentMeetingContact.name,
          companyName: currentMeetingContact.company,
        };
        
        // Add custom title and description if provided
        if (meetingTitle.trim()) {
          requestBody.meetingTitle = meetingTitle.trim();
        }
        if (meetingDescription.trim()) {
          requestBody.meetingDescription = meetingDescription.trim();
        }
        
        // Add additional invites if provided
        if (additionalInvites.length > 0) {
          requestBody.additionalAttendees = additionalInvites;
        }
        
        // Only add leadAnalyticsId if it's a valid UUID
        if (isValidUUID) {
          requestBody.leadAnalyticsId = currentMeetingContact.id;
          console.log('✅ leadAnalyticsId included in request:', currentMeetingContact.id);
        } else {
          console.warn('⚠️ leadAnalyticsId NOT included - invalid UUID format (grouped record):', currentMeetingContact.id);
          if (requestBody.phoneNumber) {
            console.log('✅ phoneNumber included - backend will use phone-based lookup:', requestBody.phoneNumber);
            console.log('   Backend will find the most recent lead_analytics for this phone and update it');
          } else {
            console.error('❌ No phoneNumber either - demo_book_datetime will NOT be updated');
            console.error('   Meeting will be created but will NOT appear with scheduled date in Lead Intelligence');
          }
        }
        
        console.log('📤 Full request body being sent to backend:', requestBody);
        
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/integrations/calendar/meetings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(requestBody),
        });

        console.log('📥 Response status:', response.status);
        
        if (!response.ok) {
          const error = await response.json();
          console.error('❌ API Error:', error);
          throw new Error(error.message || "Failed to schedule meeting");
        }

        const responseData = await response.json();
        console.log('✅ Meeting created successfully:', responseData);
        console.log('📊 Check backend logs for demo_book_datetime update status');

        toast({
          title: "Success",
          description: "Meeting scheduled successfully",
        });
      }

      // Refetch timeline if we're viewing a contact's timeline
      if (selectedContact) {
        await fetchLeadTimeline(selectedContact.id);
      }

      // Refetch main lead intelligence data
      await fetchLeadIntelligence();

      // Close dialog and reset state
      setShowMeetingModal(false);
      setMeetingDateTime(undefined);
      setCurrentMeetingContact(null);
      setIsReschedule(false);
      setMeetingAttendeeEmail("");
      setAdditionalInvites([]);
      setInviteInputValue("");
      setMeetingTitle("");
      setMeetingDescription("");
    } catch (error) {
      console.error("Failed to schedule/reschedule meeting:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process meeting request",
        variant: "destructive",
      });
    } finally {
      setMeetingLoading(false);
    }
  };

  const getTagColor = (tag: string) => {
    switch (tag.toLowerCase()) {
      case "hot":
        return "border-red-500 text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-300";
      case "warm":
        return "border-yellow-500 text-yellow-700 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-300";
      case "cold":
        return "border-blue-500 text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-300";
      default:
        return "border-gray-500 text-gray-700 bg-gray-50 dark:bg-gray-950 dark:text-gray-300";
    }
  };

  const getEngagementColor = (level: string) => {
    switch (level.toLowerCase()) {
      case "high":
        return "border-green-500 text-green-700 bg-green-50 dark:bg-green-950 dark:text-green-300";
      case "medium":
        return "border-yellow-500 text-yellow-700 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-300";
      case "low":
        return "border-red-500 text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-300";
      default:
        return "border-gray-500 text-gray-700 bg-gray-50 dark:bg-gray-950 dark:text-gray-300";
    }
  };

  const getIntentColor = (level: string) => {
    switch (level.toLowerCase()) {
      case "high":
        return "border-purple-500 text-purple-700 bg-purple-50 dark:bg-purple-950 dark:text-purple-300";
      case "medium":
        return "border-indigo-500 text-indigo-700 bg-indigo-50 dark:bg-indigo-950 dark:text-indigo-300";
      case "low":
        return "border-gray-500 text-gray-700 bg-gray-50 dark:bg-gray-950 dark:text-gray-300";
      default:
        return "border-gray-500 text-gray-700 bg-gray-50 dark:bg-gray-950 dark:text-gray-300";
    }
  };

  const getBudgetColor = (constraint: string) => {
    switch (constraint.toLowerCase()) {
      case "low":
        return "border-green-500 text-green-700 bg-green-50 dark:bg-green-950 dark:text-green-300";
      case "medium":
        return "border-yellow-500 text-yellow-700 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-300";
      case "high":
        return "border-red-500 text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-300";
      default:
        return "border-gray-500 text-gray-700 bg-gray-50 dark:bg-gray-950 dark:text-gray-300";
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency.toLowerCase()) {
      case "urgent":
        return "border-red-500 text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-300";
      case "soon":
        return "border-orange-500 text-orange-700 bg-orange-50 dark:bg-orange-950 dark:text-orange-300";
      case "flexible":
        return "border-blue-500 text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-300";
      default:
        return "border-gray-500 text-gray-700 bg-gray-50 dark:bg-gray-950 dark:text-gray-300";
    }
  };

  const getFitColor = (fit: string) => {
    switch (fit.toLowerCase()) {
      case "excellent":
        return "border-green-500 text-green-700 bg-green-50 dark:bg-green-950 dark:text-green-300";
      case "good":
        return "border-lime-500 text-lime-700 bg-lime-50 dark:bg-lime-950 dark:text-lime-300";
      case "fair":
        return "border-yellow-500 text-yellow-700 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-300";
      case "poor":
        return "border-red-500 text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-300";
      default:
        return "border-gray-500 text-gray-700 bg-gray-50 dark:bg-gray-950 dark:text-gray-300";
    }
  };

  const handleSelectContact = (contactId: string, checked: boolean) => {
    if (checked) {
      setSelectedContacts((prev) => [...prev, contactId]);
    } else {
      setSelectedContacts((prev) => prev.filter((id) => id !== contactId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedContacts(filteredContacts.map((contact) => contact.id));
    } else {
      setSelectedContacts([]);
    }
  };

  const handleLeadStageChange = async (contact: LeadGroup, newStage: string) => {
    if (!contact.contactId) {
      toast({
        title: "Cannot update stage",
        description: "No contact associated with this lead",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setUpdatingStageId(contact.id);
      
      // Optimistically update the local state
      setContacts(prevContacts => 
        prevContacts.map(c => 
          c.id === contact.id 
            ? { ...c, leadStage: newStage }
            : c
        )
      );
      
      // Call API to update lead stage
      const result = await bulkUpdateLeadStage([contact.contactId], newStage);
      
      if (result !== null && result > 0) {
        toast({
          title: "Stage updated",
          description: `Lead stage changed to "${newStage}"`,
        });
      } else {
        // Revert on failure
        setContacts(prevContacts => 
          prevContacts.map(c => 
            c.id === contact.id 
              ? { ...c, leadStage: contact.leadStage }
              : c
          )
        );
        toast({
          title: "Failed to update stage",
          description: "Please try again",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error updating lead stage:', error);
      // Revert the optimistic update on error
      setContacts(prevContacts => 
        prevContacts.map(c => 
          c.id === contact.id 
            ? { ...c, leadStage: contact.leadStage }
            : c
        )
      );
      toast({
        title: "Error",
        description: "Failed to update lead stage",
        variant: "destructive",
      });
    } finally {
      setUpdatingStageId(null);
    }
  };

  const handleToggleFollowUpStatus = async (contact: LeadGroup, completed: boolean) => {
    try {
      const status = completed ? 'completed' : 'scheduled';
      
      // Optimistically update the local state first for immediate UI feedback
      setContacts(prevContacts => 
        prevContacts.map(c => 
          c.id === contact.id 
            ? { ...c, followUpStatus: status }
            : c
        )
      );
      
      // Call API to update follow-up status
      await apiService.updateFollowUpStatus({
        leadPhone: contact.phone,
        leadEmail: contact.email,
        status: status
      });
      
      // No need to refresh the entire component - state is already updated
    } catch (error) {
      console.error('Error updating follow-up status:', error);
      
      // Revert the optimistic update on error
      setContacts(prevContacts => 
        prevContacts.map(c => 
          c.id === contact.id 
            ? { ...c, followUpStatus: contact.followUpStatus }
            : c
        )
      );
    }
  };

  const handleScheduleDemo = async (contact: LeadGroup) => {
    try {
      // Call API to schedule demo
      const demoDate = new Date();
      demoDate.setDate(demoDate.getDate() + 7); // Schedule for next week as default
      
      await apiService.scheduleDemo({
        contactId: contact.id,
        demoDate: demoDate.toISOString(),
        leadPhone: contact.phone,
        leadEmail: contact.email
      });
      
      // Refresh the lead intelligence data
      await fetchLeadIntelligence();
    } catch (error) {
      console.error('Error scheduling demo:', error);
    }
  };

  const handleConvertToCustomer = async (contact: LeadGroup) => {
    setCurrentConversionContact(contact);
    setShowConversionModal(true);
  };

  const handleConfirmConversion = async (customerData: {
    name: string;
    email: string;
    phone: string;
    company: string;
    status: string;
    assignedSalesRep: string;
    notes: string;
  }) => {
    if (!currentConversionContact) return;

    setConversionLoading(true);
    try {
      // Call API to convert lead to customer
      await apiService.convertToCustomer(
        {
          id: currentConversionContact.id,
          name: currentConversionContact.name,
          email: currentConversionContact.email,
          phone: currentConversionContact.phone,
          company: currentConversionContact.company,
          source: 'Lead Intelligence'
        },
        customerData
      );
      
      // Close modal
      setShowConversionModal(false);
      setCurrentConversionContact(null);
      
      // Refresh the lead intelligence data to remove converted customer
      await fetchLeadIntelligence();
    } catch (error) {
      console.error('Error converting to customer:', error);
    } finally {
      setConversionLoading(false);
    }
  };

  // Handle creating campaign from selected leads
  const handleCreateCampaignFromLeads = async () => {
    if (selectedContacts.length === 0) {
      toast({
        title: "No leads selected",
        description: "Please select at least one lead to create a campaign",
        variant: "destructive",
      });
      return;
    }

    // Get phone numbers from selected leads and create/get contacts
    const leadsWithPhones = filteredContacts
      .filter(c => selectedContacts.includes(c.id) && c.phone)
      .map(c => ({
        id: c.id,
        phone: c.phone!,
        name: c.name,
        email: c.email,
        company: c.company
      }));

    if (leadsWithPhones.length === 0) {
      toast({
        title: "No callable leads",
        description: "Selected leads must have phone numbers to create a campaign",
        variant: "destructive",
      });
      return;
    }

    try {
      // Create contacts from leads or get existing contact IDs
      const response = await apiService.createContactsFromLeads(leadsWithPhones);
      const contactIds = response.data?.contactIds || (response as any).contactIds;
      if (contactIds && contactIds.length > 0) {
        setCampaignContactIds(contactIds);
        setShowCampaignModal(true);
      } else {
        toast({
          title: "Error",
          description: "Failed to prepare leads for campaign",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error preparing leads for campaign:', error);
      toast({
        title: "Error",
        description: "Failed to prepare leads for campaign",
        variant: "destructive",
      });
    }
  };

  const handleCampaignModalClose = () => {
    setShowCampaignModal(false);
    setCampaignContactIds([]);
    setSelectedContacts([]);
    // Refresh lead intelligence data
    fetchLeadIntelligence();
  };

  // Handle bulk lead stage change
  const handleBulkLeadStageChange = async (newStage: string | null) => {
    if (selectedContacts.length === 0) {
      toast({
        title: "No leads selected",
        description: "Please select at least one lead to update",
        variant: "destructive",
      });
      return;
    }

    // Get contact IDs for selected leads
    const contactIdsToUpdate = filteredContacts
      .filter(c => selectedContacts.includes(c.id) && c.contactId)
      .map(c => c.contactId!);

    if (contactIdsToUpdate.length === 0) {
      toast({
        title: "No contacts to update",
        description: "Selected leads don't have associated contacts",
        variant: "destructive",
      });
      return;
    }

    setIsBulkLeadStageUpdating(true);
    try {
      const result = await bulkUpdateLeadStage(contactIdsToUpdate, newStage);
      
      if (result !== null && result > 0) {
        // Optimistically update local state
        setContacts(prevContacts => 
          prevContacts.map(c => 
            selectedContacts.includes(c.id)
              ? { ...c, leadStage: newStage || undefined }
              : c
          )
        );
        
        toast({
          title: "Success",
          description: `Updated lead stage for ${result} lead(s) to "${newStage || 'Unassigned'}"`,
        });
        
        // Clear selection after successful update
        setSelectedContacts([]);
      } else {
        toast({
          title: "Error",
          description: "Failed to update lead stage",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error bulk updating lead stage:', error);
      toast({
        title: "Error",
        description: "Failed to update lead stage",
        variant: "destructive",
      });
    } finally {
      setIsBulkLeadStageUpdating(false);
    }
  };

  if (selectedContact) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleBackToList}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to List</span>
            </Button>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {selectedContact.name}
              </h2>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {selectedContact.email && (
                  <div className="flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {selectedContact.email}
                  </div>
                )}
                {selectedContact.phone ? (
                  <div className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {selectedContact.phone}
                  </div>
                ) : selectedContact.groupType === 'individual' && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      Internet
                    </span>
                  </div>
                )}
                {selectedContact.company && (
                  <div className="flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    {selectedContact.company}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Interaction Timeline</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[500px]">
              <table className="w-full caption-bottom text-sm">
                <thead className="sticky top-0 z-20 bg-background [&_tr]:border-b">
                  <tr className="bg-background border-b">
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Name</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Date & Time</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Agent</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Platform</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Call Type</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Hangup By</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Lead Status</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Smart Summary</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Duration</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Analytics</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">CTAs</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Requirements</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">CTA</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Email</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Follow-up</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {timelineLoading ? (
                    <tr className="border-b transition-colors hover:bg-muted/50">
                      <td colSpan={15} className="p-4 align-middle text-center py-8">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Loading timeline...</span>
                        </div>
                      </td>
                    </tr>
                  ) : timeline.length === 0 ? (
                    <tr className="border-b transition-colors hover:bg-muted/50">
                      <td colSpan={15} className="p-4 align-middle text-center py-8 text-muted-foreground">
                        No interaction history found
                      </td>
                    </tr>
                  ) : (
                    timeline.map((interaction) => (
                      <tr 
                        key={interaction.id}
                        className={`border-b transition-colors ${
                          interaction.interactionType === 'human_edit'
                            ? 'bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20 dark:hover:bg-purple-900/30'
                            : interaction.interactionType === 'chat'
                            ? 'bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/30 cursor-default'
                            : 'hover:bg-muted/50 hover:bg-muted-foreground/10 cursor-pointer'
                        }`}
                        onClick={() => interaction.interactionType !== 'human_edit' && interaction.interactionType !== 'chat' && handleInteractionClick(interaction.id)}
                      >
                        {/* Name Column - Show extracted name to see what AI captured */}
                        <td className="p-4 align-middle text-foreground font-medium">
                          {interaction.leadName || "Anonymous"}
                        </td>
                        
                        {/* Date & Time Column - IST */}
                        <td className="p-4 align-middle text-foreground">
                          <div className="text-xs space-y-0.5">
                            <div>{new Date(interaction.interactionDate).toLocaleDateString('en-IN', { 
                              timeZone: 'Asia/Kolkata',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}</div>
                            <div className="text-muted-foreground">
                              {new Date(interaction.interactionDate).toLocaleTimeString('en-IN', {
                                timeZone: 'Asia/Kolkata',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false
                              })}
                            </div>
                          </div>
                        </td>
                        
                        {/* Agent Column */}
                        <td className="p-4 align-middle text-foreground">
                          {interaction.interactionAgent}
                        </td>
                        
                        {/* Platform Column */}
                        <td className="p-4 align-middle text-foreground">
                          {interaction.interactionType === 'human_edit' ? (
                            <div className="flex items-center gap-1.5">
                              <Pencil className="w-4 h-4 text-purple-600" />
                              <span className="text-purple-700 dark:text-purple-400 font-medium">Manual Edit</span>
                            </div>
                          ) : interaction.interactionType === 'email' ? (
                            <div className="flex items-center gap-1.5">
                              <Mail className="w-4 h-4 text-blue-600" />
                              <span>Email</span>
                            </div>
                          ) : interaction.interactionType === 'chat' ? (
                            <div className="flex items-center gap-1.5">
                              <MessageSquare className="w-4 h-4 text-green-600" />
                              <span className="text-green-700 dark:text-green-400">{interaction.platform || 'Chat'}</span>
                            </div>
                          ) : (
                            interaction.platform || "—"
                          )}
                        </td>
                        
                        {/* Call Type (Inbound/Outbound) or Email Status */}
                        <td className="p-4 align-middle text-foreground">
                          {interaction.interactionType === 'human_edit' ? (
                            <Badge
                              variant="outline"
                              className="bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400"
                            >
                              Updated
                            </Badge>
                          ) : interaction.interactionType === 'chat' ? (
                            <Badge
                              variant="outline"
                              className="bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400"
                            >
                              {interaction.messageCount ? `${interaction.messageCount} msgs` : 'Chat'}
                            </Badge>
                          ) : interaction.interactionType === 'email' ? (
                            <Badge
                              variant="outline"
                              className={
                                interaction.emailStatus === 'opened'
                                  ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400'
                                  : interaction.emailStatus === 'delivered'
                                  ? 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400'
                                  : interaction.emailStatus === 'failed'
                                  ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400'
                                  : 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-900/30 dark:text-gray-400'
                              }
                            >
                              {interaction.emailStatus || 'sent'}
                            </Badge>
                          ) : (
                            interaction.callDirection || "—"
                          )}
                        </td>
                        
                        {/* Hangup By with Reason - Compact */}
                        <td className="p-4 align-middle">
                          {interaction.hangupBy ? (
                            <div className="text-xs space-y-0.5">
                              <div className="capitalize">
                                {interaction.hangupBy}
                              </div>
                              {interaction.hangupReason && (
                                <div className="text-muted-foreground">
                                  {interaction.hangupReason}
                                </div>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        
                        {/* Lead Status - ONLY place with badges/colors */}
                        <td className="p-4 align-middle">
                          <Badge
                            variant="outline"
                            className={getTagColor(interaction.status)}
                          >
                            {interaction.status}
                          </Badge>
                        </td>
                        
                        {/* Smart Summary or Email Subject */}
                        <td className="p-4 align-middle text-foreground max-w-xs">
                          <div className="text-xs truncate" title={
                            interaction.interactionType === 'email' 
                              ? interaction.emailSubject 
                              : interaction.interactionType === 'chat'
                              ? interaction.inDetailSummary || interaction.smartNotification
                              : interaction.smartNotification || ''
                          }>
                            {interaction.interactionType === 'human_edit'
                              ? <span className="text-purple-600 dark:text-purple-400">Manual intelligence update</span>
                              : interaction.interactionType === 'email' 
                              ? (interaction.emailSubject || "—")
                              : interaction.interactionType === 'chat'
                              ? (interaction.inDetailSummary || interaction.smartNotification || "—")
                              : (interaction.smartNotification || "—")
                            }
                          </div>
                        </td>
                        
                        {/* Duration */}
                        <td className="p-4 align-middle text-foreground text-xs">
                          {interaction.interactionType === 'email' || interaction.interactionType === 'human_edit' ? '—' : (interaction.duration || "—")}
                        </td>
                        
                        {/* Analytics - Each on new line */}
                        <td className="p-4 align-middle text-xs min-w-[150px]">
                          <div className="space-y-1">
                            {interaction.intentLevel && (
                              <div><span className="text-muted-foreground">Intent:</span> {interaction.intentLevel}</div>
                            )}
                            {interaction.timelineUrgency && (
                              <div><span className="text-muted-foreground">Urgency:</span> {interaction.timelineUrgency}</div>
                            )}
                            {interaction.budgetConstraint && (
                              <div><span className="text-muted-foreground">Budget:</span> {interaction.budgetConstraint}</div>
                            )}
                            {(!interaction.intentLevel && !interaction.timelineUrgency && !interaction.budgetConstraint) && "—"}
                          </div>
                        </td>
                        {/* CTAs - Compact inline */}
                        <td className="p-4 align-middle text-xs">
                          <div className="space-y-0.5">
                            {interaction.ctaPricingClicked && <div>Pricing</div>}
                            {interaction.ctaDemoClicked && <div>Demo</div>}
                            {interaction.ctaFollowupClicked && <div>Follow-up</div>}
                            {interaction.ctaSampleClicked && <div>Sample</div>}
                            {interaction.ctaEscalatedToHuman && <div>Escalated</div>}
                            {(!interaction.ctaPricingClicked && !interaction.ctaDemoClicked && !interaction.ctaFollowupClicked && !interaction.ctaSampleClicked && !interaction.ctaEscalatedToHuman) && "—"}
                          </div>
                        </td>
                        
                        {/* Requirements - Expandable text */}
                        <td className="p-4 align-middle text-xs text-foreground max-w-[200px]" onClick={(e) => e.stopPropagation()}>
                          {interaction.requirements ? (
                            <details className="cursor-pointer group">
                              <summary className="list-none flex items-center gap-1 hover:text-primary">
                                <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                                <span className="truncate max-w-[150px]" title={interaction.requirements}>
                                  {interaction.requirements.length > 50 
                                    ? interaction.requirements.substring(0, 50) + '...' 
                                    : interaction.requirements}
                                </span>
                              </summary>
                              <div className="mt-2 p-2 bg-muted/50 rounded text-xs whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                                {interaction.requirements}
                              </div>
                            </details>
                          ) : (
                            "—"
                          )}
                        </td>
                        
                        {/* CTA - Custom call-to-action as comma-separated badges */}
                        <td className="p-4 align-middle text-xs">
                          {interaction.customCta ? (
                            <div className="flex flex-wrap gap-1">
                              {interaction.customCta.split(',').map((cta, idx) => (
                                <Badge 
                                  key={idx} 
                                  variant="secondary" 
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {cta.trim()}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        
                        {/* Email - Show extracted email to see what AI captured */}
                        <td className="p-4 align-middle text-xs text-foreground">
                          {interaction.extractedEmail || "—"}
                        </td>
                        {/* Follow-up - Simple text */}
                        <td className="p-4 align-middle" onClick={(e) => e.stopPropagation()}>
                          {interaction.followUpDate ? (
                            <div className="text-xs space-y-0.5">
                              <div className={`font-medium ${interaction.followUpCompleted ? "text-green-700 dark:text-green-400" : "text-blue-700 dark:text-blue-400"}`}>
                                {interaction.followUpCompleted ? "Completed" : "Scheduled"}
                              </div>
                              <div className="text-muted-foreground">
                                {new Date(interaction.followUpDate).toLocaleDateString('en-IN', { 
                                  timeZone: 'Asia/Kolkata',
                                  month: 'short',
                                  day: 'numeric'
                                })}
                              </div>
                              {interaction.followUpRemark && (
                                <div className="text-muted-foreground truncate max-w-[120px]" title={interaction.followUpRemark}>
                                  {interaction.followUpRemark}
                                </div>
                              )}
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs px-2 border-blue-500 text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-950"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (selectedContact) {
                                  handleScheduleFollowUp(selectedContact, interaction.id);
                                }
                              }}
                            >
                              Schedule
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <InteractionDetailsModal
          isOpen={isInteractionModalOpen}
          onClose={() => setIsInteractionModalOpen(false)}
          analytics={selectedInteractionAnalytics}
          isLoading={isAnalyticsLoading}
          error={analyticsError}
        />

        {/* Follow-up Scheduling Dialog - Available in timeline view */}
        <Dialog open={showFollowUpDialog} onOpenChange={setShowFollowUpDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Schedule Follow-up</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {currentFollowUpContact && (
                <div className="text-sm text-muted-foreground">
                  Scheduling follow-up for: <strong>{currentFollowUpContact.name}</strong>
                  {currentFollowUpCallId && (
                    <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      📎 This follow-up will be linked to a specific call
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="followup-date">Follow-up Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !followUpDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {followUpDate ? format(followUpDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={followUpDate}
                      onSelect={setFollowUpDate}
                      disabled={(date) => date < new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="followup-remark">Remark (Optional)</Label>
                <Textarea
                  id="followup-remark"
                  placeholder="Add a note about this follow-up..."
                  value={followUpRemark}
                  onChange={(e) => setFollowUpRemark(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowFollowUpDialog(false)}
                  disabled={followUpLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveFollowUp}
                  disabled={!followUpDate || followUpLoading}
                >
                  {followUpLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Scheduling...
                    </>
                  ) : (
                    'Schedule Follow-up'
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading lead intelligence...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={fetchLeadIntelligence}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 h-full flex flex-col">
      {/* Header with title only */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h1 className="text-2xl font-bold">Lead Intelligence</h1>
      </div>

      {/* Search bar and controls */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search contacts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-64"
          />
        </div>
        <div className="flex items-center space-x-2">
          {selectedContacts.length > 0 && (
            <>
              {/* Bulk Lead Stage Change */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  Change Stage:
                </span>
                <Select
                  onValueChange={(value) => handleBulkLeadStageChange(value === 'unassigned' ? null : value)}
                  disabled={isBulkLeadStageUpdating}
                >
                  <SelectTrigger className="w-[160px] h-9">
                    <SelectValue placeholder={isBulkLeadStageUpdating ? "Updating..." : "Select stage"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {stages.map((stage) => (
                      <SelectItem key={stage.name} value={stage.name}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: stage.color }}
                          />
                          {stage.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button 
                onClick={handleCreateCampaignFromLeads}
                className="bg-[#1A6262] hover:bg-[#155050] text-white"
              >
                <Megaphone className="w-4 h-4 mr-2" />
                Create Campaign ({selectedContacts.length})
              </Button>
            </>
          )}
          {hasActiveColumnFilters && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={clearAllColumnFilters}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4 mr-1" />
              Clear Filters
            </Button>
          )}
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Active filter summary */}
      {hasActiveColumnFilters && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-shrink-0">
          <Filter className="w-4 h-4" />
          <span>Active filters:</span>
          {columnFilters.leadTag.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              Tag: {columnFilters.leadTag.join(', ')}
            </Badge>
          )}
          {columnFilters.leadStage.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              Stage: {columnFilters.leadStage.join(', ')}
            </Badge>
          )}
          {columnFilters.engagement.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              Engagement: {columnFilters.engagement.join(', ')}
            </Badge>
          )}
          {columnFilters.intent.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              Intent: {columnFilters.intent.join(', ')}
            </Badge>
          )}
          {columnFilters.budget.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              Budget: {columnFilters.budget.join(', ')}
            </Badge>
          )}
          {columnFilters.urgency.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              Urgency: {columnFilters.urgency.join(', ')}
            </Badge>
          )}
          {columnFilters.fit.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              Fit: {columnFilters.fit.join(', ')}
            </Badge>
          )}
          {columnFilters.cta.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              CTA: {columnFilters.cta.join(', ')}
            </Badge>
          )}
          <span className="text-xs">({filteredContacts.length} results)</span>
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-auto invisible-scrollbar flex-1 min-h-0 bg-background">
        <table className="w-full min-w-[1400px] caption-bottom text-sm">
          <thead className="sticky top-0 z-20 bg-background [&_tr]:border-b">
            <tr className="bg-background border-b">
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground sticky left-0 z-30 bg-background pl-4 pr-6 whitespace-nowrap">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={
                      selectedContacts.length === filteredContacts.length &&
                      filteredContacts.length > 0
                    }
                    onCheckedChange={handleSelectAll}
                  />
                  <span>Contact</span>
                </div>
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">
                <ExcelColumnFilter
                  title="Lead Stage"
                  options={filterOptions.leadStage.length > 0 ? filterOptions.leadStage : stages.map(s => s.name)}
                  selectedValues={columnFilters.leadStage}
                  onSelectionChange={(values) => updateColumnFilter('leadStage', values)}
                  showAllLabel="All Stages"
                />
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Lead Type</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">
                <ExcelColumnFilter
                  title="Lead Tag"
                  options={filterOptions.leadTag.length > 0 ? filterOptions.leadTag : ['Hot', 'Warm', 'Cold']}
                  selectedValues={columnFilters.leadTag}
                  onSelectionChange={(values) => updateColumnFilter('leadTag', values)}
                  showAllLabel="All Tags"
                />
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">
                <ExcelColumnFilter
                  title="Engagement"
                  options={filterOptions.engagement.length > 0 ? filterOptions.engagement : ['High', 'Medium', 'Low']}
                  selectedValues={columnFilters.engagement}
                  onSelectionChange={(values) => updateColumnFilter('engagement', values)}
                  showAllLabel="All Levels"
                />
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">
                <ExcelColumnFilter
                  title="Intent"
                  options={filterOptions.intent.length > 0 ? filterOptions.intent : ['High', 'Medium', 'Low']}
                  selectedValues={columnFilters.intent}
                  onSelectionChange={(values) => updateColumnFilter('intent', values)}
                  showAllLabel="All Levels"
                />
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">
                <ExcelColumnFilter
                  title="Budget"
                  options={filterOptions.budget.length > 0 ? filterOptions.budget : ['Low', 'Medium', 'High']}
                  selectedValues={columnFilters.budget}
                  onSelectionChange={(values) => updateColumnFilter('budget', values)}
                  showAllLabel="All"
                />
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">
                <ExcelColumnFilter
                  title="Urgency"
                  options={filterOptions.urgency.length > 0 ? filterOptions.urgency : ['Urgent', 'Soon', 'Flexible']}
                  selectedValues={columnFilters.urgency}
                  onSelectionChange={(values) => updateColumnFilter('urgency', values)}
                  showAllLabel="All"
                />
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">
                <ExcelColumnFilter
                  title="Fit"
                  options={filterOptions.fit.length > 0 ? filterOptions.fit : ['Excellent', 'Good', 'Fair', 'Poor']}
                  selectedValues={columnFilters.fit}
                  onSelectionChange={(values) => updateColumnFilter('fit', values)}
                  showAllLabel="All"
                />
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">
                <div className="flex items-center gap-1">
                  <span>Summary</span>
                  {chatSummariesLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                </div>
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Requirements</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">
                <ExcelColumnFilter
                  title="CTA"
                  options={filterOptions.cta}
                  selectedValues={columnFilters.cta}
                  onSelectionChange={(values) => updateColumnFilter('cta', values)}
                  showAllLabel="All CTAs"
                />
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Notes</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Escalated</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">No. of Interactions</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Interacted Agents</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Assigned To</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Last Interaction</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Follow-up Date</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Follow-up Status</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Demo Scheduled</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Actions</th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {filteredContacts.map((contact) => (
              <tr
                key={contact.id}
                id={`lead-card-${contact.id}`}
                className="cursor-pointer hover:bg-muted/50 transition-all border-b"
                onClick={() => handleContactClick(contact)}
              >
                <td
                  onClick={(e) => e.stopPropagation()}
                  className="p-4 align-middle sticky left-0 z-10 bg-background pl-4 pr-6"
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedContacts.includes(contact.id)}
                      onCheckedChange={(checked) =>
                        handleSelectContact(contact.id, checked as boolean)
                      }
                    />
                    <div className="py-1">
                      <div 
                        className="font-medium text-foreground underline cursor-pointer hover:text-primary transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleContactClick(contact);
                        }}
                      >
                        {contact.name}
                      </div>
                      <div className="space-y-1 mt-1">
                    {contact.email && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Mail className="w-3 h-3" />
                        {contact.email}
                      </div>
                    )}
                    {contact.phone && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground whitespace-nowrap">
                        <Phone className="w-3 h-3" />
                        {contact.phone}
                      </div>
                    )}
                    {contact.company && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Building2 className="w-3 h-3" />
                        {contact.company}
                      </div>
                    )}
                      </div>
                    </div>
                  </div>
                </td>
                {/* Lead Stage dropdown */}
                <td className="p-4 align-middle" onClick={(e) => e.stopPropagation()}>
                  {contact.contactId ? (
                    <Select
                      value={contact.leadStage || ""}
                      onValueChange={(value) => handleLeadStageChange(contact, value)}
                      disabled={updatingStageId === contact.id}
                    >
                      <SelectTrigger className="w-[160px] h-8">
                        <SelectValue placeholder="Select stage">
                          {contact.leadStage ? (
                            <div className="flex items-center gap-2 min-w-0">
                              <div 
                                className="w-2 h-2 rounded-full flex-shrink-0" 
                                style={{ backgroundColor: getStageColor(contact.leadStage) }}
                              />
                              <span className="truncate">{contact.leadStage}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Select stage</span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map((stage) => (
                          <SelectItem key={stage.name} value={stage.name}>
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-2 h-2 rounded-full flex-shrink-0" 
                                style={{ backgroundColor: stage.color }}
                              />
                              {stage.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </td>
                <td className="p-4 align-middle">
                  <Badge variant="outline" className="capitalize">
                    {contact.leadType}
                  </Badge>
                </td>
                <td className="p-4 align-middle">
                  <Badge variant="outline" className={getTagColor(contact.recentLeadTag)}>
                    {contact.recentLeadTag}
                  </Badge>
                </td>
                <td className="p-4 align-middle">
                  {contact.recentEngagementLevel ? (
                    <Badge variant="outline" className={getEngagementColor(contact.recentEngagementLevel)}>
                      {contact.recentEngagementLevel}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className="p-4 align-middle">
                  {contact.recentIntentLevel ? (
                    <Badge variant="outline" className={getIntentColor(contact.recentIntentLevel)}>
                      {contact.recentIntentLevel}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className="p-4 align-middle">
                  {contact.recentBudgetConstraint ? (
                    <Badge variant="outline" className={getBudgetColor(contact.recentBudgetConstraint)}>
                      {contact.recentBudgetConstraint}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className="p-4 align-middle">
                  {contact.recentTimelineUrgency ? (
                    <Badge variant="outline" className={getUrgencyColor(contact.recentTimelineUrgency)}>
                      {contact.recentTimelineUrgency}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className="p-4 align-middle">
                  {contact.recentFitAlignment ? (
                    <Badge variant="outline" className={getFitColor(contact.recentFitAlignment)}>
                      {contact.recentFitAlignment}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                {/* Summary column - from Chat Agent Server */}
                <td className="p-4 align-middle text-xs text-foreground max-w-[280px]" onClick={(e) => e.stopPropagation()}>
                  {(() => {
                    // Get summary from chat summaries using phone number
                    const summary = contact.phone ? (chatSummaries[contact.phone] as any)?.in_detail_summary : null;
                    if (summary) {
                      return (
                        <details className="cursor-pointer group">
                          <summary className="list-none flex items-center gap-1 hover:text-primary">
                            <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                            <span className="truncate max-w-[230px]" title={summary}>
                              {summary.length > 80
                                ? summary.substring(0, 80) + '...'
                                : summary}
                            </span>
                          </summary>
                          <div className="mt-2 p-2 bg-muted/50 rounded text-xs whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                            {summary}
                          </div>
                        </details>
                      );
                    }
                    return chatSummariesLoading ? (
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Loading...
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    );
                  })()}
                </td>
                <td className="p-4 align-middle text-xs text-foreground max-w-[240px]" onClick={(e) => e.stopPropagation()}>
                  {contact.requirements ? (
                    <details className="cursor-pointer group">
                      <summary className="list-none flex items-center gap-1 hover:text-primary">
                        <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                        <span className="truncate max-w-[190px]" title={contact.requirements}>
                          {contact.requirements.length > 60
                            ? contact.requirements.substring(0, 60) + '...'
                            : contact.requirements}
                        </span>
                      </summary>
                      <div className="mt-2 p-2 bg-muted/50 rounded text-xs whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                        {contact.requirements}
                      </div>
                    </details>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                {/* CTA - Custom call-to-action as comma-separated badges */}
                <td className="p-4 align-middle text-xs">
                  {contact.customCta ? (
                    <div className="flex flex-wrap gap-1">
                      {contact.customCta.split(',').map((cta, idx) => (
                        <Badge 
                          key={idx} 
                          variant="secondary" 
                          className="text-[10px] px-1.5 py-0"
                        >
                          {cta.trim()}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                {/* Notes */}
                <td className="p-4 align-middle text-xs text-foreground max-w-[200px]" onClick={(e) => e.stopPropagation()}>
                  {contact.contactNotes ? (
                    <details className="cursor-pointer group">
                      <summary className="list-none flex items-center gap-1 hover:text-primary">
                        <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                        <span className="truncate max-w-[160px]" title={contact.contactNotes}>
                          {contact.contactNotes.length > 50
                            ? contact.contactNotes.substring(0, 50) + '...'
                            : contact.contactNotes}
                        </span>
                      </summary>
                      <div className="mt-2 p-2 bg-muted/50 rounded text-xs whitespace-pre-wrap max-h-[150px] overflow-y-auto">
                        {contact.contactNotes}
                      </div>
                    </details>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className="p-4 align-middle">
                  <Badge
                    variant={contact.escalatedToHuman ? "destructive" : "secondary"}
                  >
                    {contact.escalatedToHuman ? "Yes" : "No"}
                  </Badge>
                </td>
                <td className="p-4 align-middle text-foreground">
                  {contact.interactions}
                </td>
                <td className="p-4 align-middle text-foreground">
                  {contact.interactedAgents.join(', ')}
                </td>
                <td className="p-4 align-middle text-foreground">
                  {contact.assignedTo ? (
                    <div className="flex items-center gap-2">
                      <UserIcon className="w-3 h-3 text-muted-foreground" />
                      <span>{contact.assignedTo.name}</span>
                      <Badge variant="outline" className="text-xs capitalize">
                        {contact.assignedTo.role}
                      </Badge>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className="p-4 align-middle text-foreground">
                  {new Date(contact.lastContact).toLocaleDateString('en-US', { 
                    timeZone: 'UTC',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </td>
                <td className="p-4 align-middle" onClick={(e) => e.stopPropagation()}>
                  {contact.followUpScheduled ? (
                    <div className="text-sm space-y-1">
                      <div className={`font-medium ${contact.followUpStatus === 'completed' ? "text-green-700 dark:text-green-400" : "text-blue-700 dark:text-blue-400"}`}>
                        {contact.followUpStatus === 'completed' ? "Completed" : "Scheduled"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(contact.followUpScheduled).toLocaleDateString('en-IN', { 
                          timeZone: 'Asia/Kolkata',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="p-4 align-middle" onClick={(e) => e.stopPropagation()}>
                  {contact.followUpScheduled ? (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={contact.followUpStatus === 'completed'}
                        onCheckedChange={(checked) =>
                          handleToggleFollowUpStatus(contact, checked)
                        }
                        className={cn(
                          "h-5 w-9 data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-gray-200 dark:data-[state=unchecked]:bg-gray-700",
                          contact.followUpStatus === 'completed' && "data-[state=checked]:bg-green-600"
                        )}
                      />
                      <span className={cn(
                        "text-xs font-medium",
                        contact.followUpStatus === 'completed' 
                          ? 'text-green-700 dark:text-green-400' 
                          : 'text-gray-600 dark:text-gray-400'
                      )}>
                        {contact.followUpStatus === 'completed' ? 'Done' : 'Pending'}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className="p-4 align-middle" onClick={(e) => e.stopPropagation()}>
                  {contact.demoScheduled ? (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleScheduleMeeting(contact, true)}
                        className="flex items-center gap-2"
                      >
                        <CalendarDays className="w-4 h-4 text-blue-600" />
                        <div className="text-left">
                          <div className="text-xs font-medium">
                            {new Date(contact.demoScheduled).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(contact.demoScheduled).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>
                      </Button>
                      {contact.meetingLink && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => window.open(contact.meetingLink, '_blank')}
                          className="flex items-center gap-1 bg-green-600 hover:bg-green-700"
                          title="Join Google Meet"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M15 8v8H5V8h10m0-2H5c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-3.5l4 4v-11l-4 4V8c0-1.1-.9-2-2-2z"/>
                          </svg>
                          Join
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleScheduleMeeting(contact, false)}
                      className="flex items-center gap-1 text-muted-foreground hover:text-blue-600"
                    >
                      <Calendar className="w-4 h-4" />
                      <span className="text-xs">Schedule</span>
                    </Button>
                  )}
                </td>
                <td className="p-4 align-middle" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    {canEditLeads() && contact.phone && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingContact(contact);
                          setShowEditModal(true);
                        }}
                        className="h-8 px-2"
                        title="Add Interaction"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleConvertToCustomer(contact)}
                      className="h-8 px-3 text-xs"
                    >
                      <UserPlus className="w-3 h-3 mr-1" />
                      Convert
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredContacts.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No contacts found matching your criteria.
          </div>
        )}
      </div>

      {/* Customer Conversion Modal */}
      <CustomerConversionModal
        open={showConversionModal}
        onClose={() => {
          setShowConversionModal(false);
          setCurrentConversionContact(null);
        }}
        onConfirm={handleConfirmConversion}
        lead={currentConversionContact}
        loading={conversionLoading}
      />

      <InteractionDetailsModal
        isOpen={isInteractionModalOpen}
        onClose={() => setIsInteractionModalOpen(false)}
        analytics={selectedInteractionAnalytics}
        isLoading={isAnalyticsLoading}
        error={analyticsError}
      />

      {/* Meeting Scheduling/Rescheduling Dialog */}
      <Dialog open={showMeetingModal} onOpenChange={setShowMeetingModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isReschedule ? "Reschedule Meeting" : "Schedule Meeting"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {currentMeetingContact && (
              <div className="text-sm text-muted-foreground">
                {isReschedule ? "Rescheduling" : "Scheduling"} meeting for:{" "}
                <strong>{currentMeetingContact.name}</strong>
              </div>
            )}

            {/* Meeting Title Field */}
            <div className="space-y-2">
              <Label htmlFor="meeting-title">Meeting Title *</Label>
              <Input
                id="meeting-title"
                type="text"
                placeholder="Enter meeting title"
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                required
              />
            </div>

            {/* Meeting Description Field */}
            <div className="space-y-2">
              <Label htmlFor="meeting-description">
                Meeting Description (Optional)
              </Label>
              <Textarea
                id="meeting-description"
                placeholder="Enter meeting description (leave empty for default)"
                value={meetingDescription}
                onChange={(e) => setMeetingDescription(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use default: "See you at [meeting time]"
              </p>
            </div>

            {/* Attendee Email Field (Editable) */}
            <div className="space-y-2">
              <Label htmlFor="attendee-email">Attendee Email *</Label>
              <Input
                id="attendee-email"
                type="email"
                placeholder="Enter attendee email"
                value={meetingAttendeeEmail}
                onChange={(e) => setMeetingAttendeeEmail(e.target.value)}
                required
              />
            </div>

            {/* Additional Invites Field with Tag Input */}
            <div className="space-y-2">
              <Label htmlFor="additional-invites">
                Additional Invites (Optional)
              </Label>
              
              {/* Display added email tags */}
              {additionalInvites.length > 0 && (
                <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-muted/20">
                  {additionalInvites.map((email, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="px-2 py-1 text-sm flex items-center gap-1 group hover:bg-secondary/80 transition-colors"
                    >
                      <span className="max-w-[200px] truncate">{email}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveInvite(email)}
                        className="ml-1 hover:text-destructive transition-colors"
                        aria-label={`Remove ${email}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Input for adding new emails */}
              <div className="flex gap-2">
                <Input
                  id="additional-invites"
                  type="email"
                  placeholder="Enter email and press Enter or comma"
                  value={inviteInputValue}
                  onChange={(e) => setInviteInputValue(e.target.value)}
                  onKeyDown={handleInviteKeyDown}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddInvite}
                  disabled={!inviteInputValue.trim()}
                >
                  Add
                </Button>
              </div>
              
              <p className="text-xs text-muted-foreground">
                Press Enter or comma to add multiple emails. Click X to remove.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="meeting-date">Meeting Date & Time</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !meetingDateTime && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {meetingDateTime
                      ? format(meetingDateTime, "PPP 'at' p")
                      : "Pick a date and time"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={meetingDateTime}
                    onSelect={(date) => {
                      if (date) {
                        // Set default time to 10:00 AM if no time is set
                        const newDate = meetingDateTime
                          ? new Date(date)
                          : new Date(date.setHours(10, 0, 0, 0));
                        if (meetingDateTime) {
                          newDate.setHours(
                            meetingDateTime.getHours(),
                            meetingDateTime.getMinutes()
                          );
                        }
                        setMeetingDateTime(newDate);
                      }
                    }}
                    disabled={(date) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      return date < today;
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Time Picker */}
            {meetingDateTime && (
              <div className="space-y-2">
                <Label>Meeting Time</Label>
                <div className="flex gap-2">
                  <Select
                    value={meetingDateTime.getHours().toString()}
                    onValueChange={(value) => {
                      const newDate = new Date(meetingDateTime);
                      newDate.setHours(parseInt(value));
                      setMeetingDateTime(newDate);
                    }}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue placeholder="Hour" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {i.toString().padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="flex items-center">:</span>
                  <Select
                    value={meetingDateTime.getMinutes().toString()}
                    onValueChange={(value) => {
                      const newDate = new Date(meetingDateTime);
                      newDate.setMinutes(parseInt(value));
                      setMeetingDateTime(newDate);
                    }}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue placeholder="Minute" />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 15, 30, 45].map((minute) => (
                        <SelectItem key={minute} value={minute.toString()}>
                          {minute.toString().padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowMeetingModal(false)}
                disabled={meetingLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveMeeting}
                disabled={!meetingDateTime || meetingLoading}
              >
                {meetingLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {isReschedule ? "Rescheduling..." : "Scheduling..."}
                  </>
                ) : (
                  <>{isReschedule ? "Reschedule Meeting" : "Schedule Meeting"}</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Campaign Creation Modal */}
      <CreateCampaignModal
        isOpen={showCampaignModal}
        onClose={handleCampaignModalClose}
        preSelectedContacts={campaignContactIds}
      />

      {/* Edit Lead Intelligence Modal */}
      {editingContact && (
        <EditLeadModal
          open={showEditModal}
          onOpenChange={(open) => {
            setShowEditModal(open);
            if (!open) setEditingContact(null);
          }}
          phoneNumber={editingContact.phone || ''}
          leadName={editingContact.name}
          currentData={{
            intent_level: editingContact.recentIntentLevel || 'Medium',
            urgency_level: editingContact.recentTimelineUrgency || 'Medium',
            budget_constraint: editingContact.recentBudgetConstraint || 'Medium',
            fit_alignment: editingContact.recentFitAlignment || 'Medium',
            engagement_health: editingContact.recentEngagementLevel || 'Medium',
            lead_status_tag: editingContact.recentLeadTag || 'Cold',
            custom_cta: editingContact.customCta || '',
            requirements: editingContact.requirements || '',
            contact_notes: editingContact.contactNotes || '',
            assigned_to: null,
          }}
          onSave={() => {
            setShowEditModal(false);
            setEditingContact(null);
            fetchLeadIntelligence();
          }}
        />
      )}
    </div>
  );
};

export default LeadIntelligence;