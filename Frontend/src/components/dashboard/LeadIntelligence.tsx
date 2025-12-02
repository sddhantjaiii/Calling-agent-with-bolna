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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
} from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useNavigation } from "@/contexts/NavigationContext";
import { ContactDisplay } from "@/components/contacts/ContactDisplay";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiService } from "@/services/apiService";
import { useToast } from "@/hooks/use-toast";
import type { Lead, LeadAnalyticsData } from "@/pages/Dashboard";

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

const LeadIntelligence = ({ onOpenProfile }: LeadIntelligenceProps) => {
  const { theme } = useTheme();
  const { targetLeadIdentifier, clearTargetLeadId } = useNavigation();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [leadTypeFilter, setLeadTypeFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [selectedContact, setSelectedContact] = useState<LeadGroup | null>(null);
  const [contacts, setContacts] = useState<LeadGroup[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [timeline, setTimeline] = useState<LeadTimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
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

  // API functions
  const fetchLeadIntelligence = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getLeadIntelligence();
      setContacts(response.data || response as any);
    } catch (error) {
      console.error('Error fetching lead intelligence:', error);
      setError('Failed to load lead intelligence data');
    } finally {
      setLoading(false);
    }
  };

  const fetchLeadTimeline = async (groupId: string) => {
    try {
      setTimelineLoading(true);
      const response = await apiService.getLeadIntelligenceTimeline(groupId);
      setTimeline(response.data || response as any);
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

  const filteredContacts = contacts.filter((contact) => {
    const matchesSearch = contact.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesLeadType =
      leadTypeFilter === "all" || contact.leadType === leadTypeFilter;
    const matchesTag =
      tagFilter === "all" || contact.recentLeadTag === tagFilter;
    return matchesSearch && matchesLeadType && matchesTag;
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Call Type</TableHead>
                    <TableHead>Hangup By</TableHead>
                    <TableHead>Lead Status</TableHead>
                    <TableHead>Smart Summary</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Analytics</TableHead>
                    <TableHead>CTAs</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Follow-up</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timelineLoading ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-8">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Loading timeline...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : timeline.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                        No interaction history found
                      </TableCell>
                    </TableRow>
                  ) : (
                    timeline.map((interaction) => (
                      <TableRow 
                        key={interaction.id}
                        className="cursor-pointer hover:bg-muted-foreground/10"
                        onClick={() => handleInteractionClick(interaction.id)}
                      >
                        {/* Name Column - Show extracted name to see what AI captured */}
                        <TableCell className="text-foreground font-medium">
                          {interaction.leadName || "Anonymous"}
                        </TableCell>
                        
                        {/* Date & Time Column - IST */}
                        <TableCell className="text-foreground">
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
                        </TableCell>
                        
                        {/* Agent Column */}
                        <TableCell className="text-foreground">
                          {interaction.interactionAgent}
                        </TableCell>
                        
                        {/* Platform Column */}
                        <TableCell className="text-foreground">
                          {interaction.platform || "—"}
                        </TableCell>
                        
                        {/* Call Type (Inbound/Outbound) - Simple text */}
                        <TableCell className="text-foreground">
                          {interaction.callDirection || "—"}
                        </TableCell>
                        
                        {/* Hangup By with Reason - Compact */}
                        <TableCell>
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
                        </TableCell>
                        
                        {/* Lead Status - ONLY place with badges/colors */}
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={getTagColor(interaction.status)}
                          >
                            {interaction.status}
                          </Badge>
                        </TableCell>
                        
                        {/* Smart Summary */}
                        <TableCell className="text-foreground max-w-xs">
                          <div className="text-xs truncate" title={interaction.smartNotification || ''}>
                            {interaction.smartNotification || "—"}
                          </div>
                        </TableCell>
                        
                        {/* Duration */}
                        <TableCell className="text-foreground text-xs">
                          {interaction.duration || "—"}
                        </TableCell>
                        
                        {/* Analytics - Each on new line */}
                        <TableCell className="text-xs min-w-[150px]">
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
                        </TableCell>
                        {/* CTAs - Compact inline */}
                        <TableCell className="text-xs">
                          <div className="space-y-0.5">
                            {interaction.ctaPricingClicked && <div>Pricing</div>}
                            {interaction.ctaDemoClicked && <div>Demo</div>}
                            {interaction.ctaFollowupClicked && <div>Follow-up</div>}
                            {interaction.ctaSampleClicked && <div>Sample</div>}
                            {interaction.ctaEscalatedToHuman && <div>Escalated</div>}
                            {(!interaction.ctaPricingClicked && !interaction.ctaDemoClicked && !interaction.ctaFollowupClicked && !interaction.ctaSampleClicked && !interaction.ctaEscalatedToHuman) && "—"}
                          </div>
                        </TableCell>
                        
                        {/* Email - Show extracted email to see what AI captured */}
                        <TableCell className="text-xs text-foreground">
                          {interaction.extractedEmail || "—"}
                        </TableCell>
                        {/* Follow-up - Simple text */}
                        <TableCell onClick={(e) => e.stopPropagation()}>
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
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
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
          <Select value={leadTypeFilter} onValueChange={setLeadTypeFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Lead Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="inbound">Inbound</SelectItem>
              <SelectItem value="outbound">Outbound</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Lead Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tags</SelectItem>
              <SelectItem value="Hot">Hot</SelectItem>
              <SelectItem value="Warm">Warm</SelectItem>
              <SelectItem value="Cold">Cold</SelectItem>
            </SelectContent>
          </Select>
          {selectedContacts.length > 0 && (
            <Button 
              onClick={handleCreateCampaignFromLeads}
              className="bg-[#1A6262] hover:bg-[#155050] text-white"
            >
              <Megaphone className="w-4 h-4 mr-2" />
              Create Campaign ({selectedContacts.length})
            </Button>
          )}
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto invisible-scrollbar flex-1 min-h-0 bg-background">
        <Table className="min-w-[1400px]">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-20 bg-background pl-4 pr-6 whitespace-nowrap">
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
              </TableHead>
              <TableHead>Lead Type</TableHead>
              <TableHead>Recent Lead Tag</TableHead>
              <TableHead>Engagement</TableHead>
              <TableHead>Intent</TableHead>
              <TableHead>Budget Constraint</TableHead>
              <TableHead>Urgency</TableHead>
              <TableHead>Fit</TableHead>
              <TableHead>Escalated</TableHead>
              <TableHead>No. of Interactions</TableHead>
              <TableHead>Interacted Agents</TableHead>
              <TableHead>Last Interaction</TableHead>
              <TableHead>Follow-up Date</TableHead>
              <TableHead>Follow-up Status</TableHead>
              <TableHead>Demo Scheduled</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredContacts.map((contact) => (
              <TableRow
                key={contact.id}
                id={`lead-card-${contact.id}`}
                className="cursor-pointer hover:bg-muted/50 transition-all"
                onClick={() => handleContactClick(contact)}
              >
                <TableCell
                  onClick={(e) => e.stopPropagation()}
                  className="sticky left-0 z-10 bg-background pl-4 pr-6"
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedContacts.includes(contact.id)}
                      onCheckedChange={(checked) =>
                        handleSelectContact(contact.id, checked as boolean)
                      }
                    />
                    <div className="py-1">
                      <div className="font-medium text-foreground underline cursor-pointer">
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
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {contact.leadType}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={getTagColor(contact.recentLeadTag)}>
                    {contact.recentLeadTag}
                  </Badge>
                </TableCell>
                <TableCell>
                  {contact.recentEngagementLevel ? (
                    <Badge variant="outline" className={getEngagementColor(contact.recentEngagementLevel)}>
                      {contact.recentEngagementLevel}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {contact.recentIntentLevel ? (
                    <Badge variant="outline" className={getIntentColor(contact.recentIntentLevel)}>
                      {contact.recentIntentLevel}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {contact.recentBudgetConstraint ? (
                    <Badge variant="outline" className={getBudgetColor(contact.recentBudgetConstraint)}>
                      {contact.recentBudgetConstraint}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {contact.recentTimelineUrgency ? (
                    <Badge variant="outline" className={getUrgencyColor(contact.recentTimelineUrgency)}>
                      {contact.recentTimelineUrgency}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {contact.recentFitAlignment ? (
                    <Badge variant="outline" className={getFitColor(contact.recentFitAlignment)}>
                      {contact.recentFitAlignment}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={contact.escalatedToHuman ? "destructive" : "secondary"}
                  >
                    {contact.escalatedToHuman ? "Yes" : "No"}
                  </Badge>
                </TableCell>
                <TableCell className="text-foreground">
                  {contact.interactions}
                </TableCell>
                <TableCell className="text-foreground">
                  {contact.interactedAgents.join(', ')}
                </TableCell>
                <TableCell className="text-foreground">
                  {new Date(contact.lastContact).toLocaleDateString('en-US', { 
                    timeZone: 'UTC',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
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
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
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
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
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
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => handleConvertToCustomer(contact)}
                    className="h-8 px-3 text-xs"
                  >
                    <UserPlus className="w-3 h-3 mr-1" />
                    Convert
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
    </div>
  );
};

export default LeadIntelligence;