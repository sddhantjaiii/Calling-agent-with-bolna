import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, RefreshCw, Search, X, Users, Phone, Mail, Building2, Filter, AlertCircle, Calendar, CheckCircle2, Link2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useChatLeads, type ChatLead, type ChatMessage, type MessageStatusResponse } from "@/hooks/useChatLeads";

// Helper to detect and parse meeting/action JSON messages
interface MeetingAction {
  action: string;
  name?: string;
  email?: string;
  title?: string;
  participants?: string[];
  meeting_time?: string;
  friendly_time?: string;
  meet_link?: string;
}

const tryParseMeetingJson = (text: string): MeetingAction | null => {
  try {
    // Check if message looks like JSON (starts with { and ends with })
    const trimmed = text.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = JSON.parse(trimmed);
      // Check if it has action field which indicates it's a meeting/action message
      if (parsed.action || parsed.meeting_time || parsed.title) {
        return parsed as MeetingAction;
      }
    }
    return null;
  } catch {
    return null;
  }
};

// Format meeting action into user-friendly display
const formatMeetingMessage = (meeting: MeetingAction): React.ReactNode => {
  return (
    <div className="space-y-2">
      <p className="text-sm italic opacity-80">Let me schedule that meeting for you...</p>
      
      <div className="flex items-center gap-2 text-emerald-400 font-medium">
        <CheckCircle2 className="w-4 h-4" />
        <span>Meeting confirmed!</span>
      </div>
      
      <div className="space-y-1 mt-2">
        {meeting.title && (
          <p className="text-sm font-medium">{meeting.title}</p>
        )}
        {(meeting.friendly_time || meeting.meeting_time) && (
          <p className="text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 opacity-70" />
            Meeting scheduled for {meeting.friendly_time || new Date(meeting.meeting_time!).toLocaleString()}
          </p>
        )}
        {meeting.meet_link && (
          <p className="text-sm flex items-center gap-2">
            <Link2 className="w-4 h-4 opacity-70" />
            Join here: <a href={meeting.meet_link} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80">{meeting.meet_link}</a>
          </p>
        )}
      </div>
      
      {meeting.email && (
        <p className="text-xs opacity-70 mt-2">You'll receive a calendar invite via email at {meeting.email}.</p>
      )}
    </div>
  );
};

// Render message content with special handling for meeting JSON and failed status
const renderMessageContent = (message: ChatMessage, theme: string): React.ReactNode => {
  const meetingData = tryParseMeetingJson(message.text);
  
  if (meetingData) {
    return formatMeetingMessage(meetingData);
  }
  
  return <p className="text-sm whitespace-pre-wrap">{message.text}</p>;
};

interface ChatLogsProps {
  // Props kept for backward compatibility but not used
  onIntervene?: () => void;
  isAdminIntervened?: boolean;
  onExit?: () => void;
}

const ChatLogs = ({}: ChatLogsProps) => {
  const { theme } = useTheme();
  const [selectedLead, setSelectedLead] = useState<ChatLead | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isSearching, setIsSearching] = useState(false);
  
  // Failed message dialog state
  const [failedMessageDialog, setFailedMessageDialog] = useState<{
    open: boolean;
    messageId: string | null;
    loading: boolean;
    status: MessageStatusResponse | null;
    error: string | null;
  }>({
    open: false,
    messageId: null,
    loading: false,
    status: null,
    error: null,
  });
  
  const leadsContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const {
    leads,
    messages,
    loading,
    loadingMore,
    messagesLoading,
    error,
    pagination,
    debouncedSearch,
    loadMore,
    refresh,
    fetchMessages,
    clearMessages,
    fetchMessageStatus,
  } = useChatLeads();

  // Handler for clicking on failed message
  const handleFailedMessageClick = useCallback(async (messageId: string) => {
    setFailedMessageDialog({
      open: true,
      messageId,
      loading: true,
      status: null,
      error: null,
    });

    const status = await fetchMessageStatus(messageId);
    
    if (status) {
      setFailedMessageDialog(prev => ({
        ...prev,
        loading: false,
        status,
      }));
    } else {
      setFailedMessageDialog(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to fetch message details',
      }));
    }
  }, [fetchMessageStatus]);

  const closeFailedMessageDialog = () => {
    setFailedMessageDialog({
      open: false,
      messageId: null,
      loading: false,
      status: null,
      error: null,
    });
  };

  // Initial load
  useEffect(() => {
    debouncedSearch({}, 100);
  }, []);

  // Handle search and filter changes with debounce
  useEffect(() => {
    const filters: Record<string, string> = {};
    
    if (searchQuery.trim()) {
      filters.search = searchQuery.trim();
    }
    if (platformFilter !== "all") {
      filters.platform = platformFilter;
    }
    if (statusFilter !== "all") {
      filters.leadStatus = statusFilter;
    }
    
    setIsSearching(true);
    debouncedSearch(filters, 100);
    
    // Reset searching state after debounce
    const timer = setTimeout(() => {
      setIsSearching(false);
    }, 350);
    
    return () => clearTimeout(timer);
  }, [searchQuery, platformFilter, statusFilter, debouncedSearch]);

  // Scroll to bottom when messages load
  useEffect(() => {
    if (messages.length > 0 && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handle lead selection
  const handleLeadClick = useCallback((lead: ChatLead) => {
    if (selectedLead?.customer_phone === lead.customer_phone) {
      // Clicking same lead closes the panel
      setSelectedLead(null);
      clearMessages();
    } else {
      setSelectedLead(lead);
      fetchMessages(lead.customer_phone);
    }
  }, [selectedLead, fetchMessages, clearMessages]);

  // Handle infinite scroll
  const handleScroll = useCallback(() => {
    const container = leadsContainerRef.current;
    if (!container) return;
    
    const { scrollTop, scrollHeight, clientHeight } = container;
    const threshold = 100; // pixels from bottom
    
    if (scrollHeight - scrollTop - clientHeight < threshold) {
      loadMore();
    }
  }, [loadMore]);

  // Attach scroll listener
  useEffect(() => {
    const container = leadsContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // Close panel on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedLead) {
        setSelectedLead(null);
        clearMessages();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLead, clearMessages]);

  // Get platform badge color
  const getPlatformStyle = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'whatsapp':
        return 'bg-green-500 text-white';
      case 'instagram':
        return 'bg-purple-500 text-white';
      case 'webchat':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  // Get lead status badge style
  const getStatusStyle = (status: string | null) => {
    switch (status) {
      case 'Hot':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'Warm':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'Cold':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      default:
        return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  // Format time
  const formatTime = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  // Get avatar initials
  const getInitials = (name: string | null, phone: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return phone.slice(-2);
  };

  // Skeleton loader for leads
  const LeadSkeleton = () => (
    <div className="p-3 rounded-lg">
      <div className="flex items-start space-x-3">
        <Skeleton className={`w-10 h-10 rounded-full ${theme === "dark" ? "bg-slate-700" : "bg-gray-200"}`} />
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className={`h-4 w-24 ${theme === "dark" ? "bg-slate-700" : "bg-gray-200"}`} />
            <Skeleton className={`h-3 w-12 ${theme === "dark" ? "bg-slate-700" : "bg-gray-200"}`} />
          </div>
          <Skeleton className={`h-3 w-32 ${theme === "dark" ? "bg-slate-700" : "bg-gray-200"}`} />
          <Skeleton className={`h-3 w-full ${theme === "dark" ? "bg-slate-700" : "bg-gray-200"}`} />
          <div className="flex gap-1">
            <Skeleton className={`h-5 w-16 rounded ${theme === "dark" ? "bg-slate-700" : "bg-gray-200"}`} />
            <Skeleton className={`h-5 w-12 rounded ${theme === "dark" ? "bg-slate-700" : "bg-gray-200"}`} />
          </div>
        </div>
      </div>
    </div>
  );

  // Message skeleton
  const MessageSkeleton = ({ isAgent }: { isAgent: boolean }) => (
    <div className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
      <div className="space-y-2">
        {isAgent && <Skeleton className={`h-3 w-20 ${theme === "dark" ? "bg-slate-700" : "bg-gray-200"}`} />}
        <Skeleton className={`h-16 ${isAgent ? "w-64" : "w-48"} rounded-lg ${theme === "dark" ? "bg-slate-700" : "bg-gray-200"}`} />
        <Skeleton className={`h-2 w-16 ${theme === "dark" ? "bg-slate-700" : "bg-gray-200"}`} />
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-4 overflow-x-hidden" style={{ height: "calc(100vh - 120px)" }}>
      {/* Header Section - Matching CallLogs style */}
      <div className="flex items-center justify-between">
        <h2 className={`text-2xl font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
          Chat Logs
        </h2>
        <div className={`text-sm ${theme === "dark" ? "text-slate-400" : "text-gray-500"}`}>
          {loading ? 'Loading...' : `Showing ${leads.length} of ${pagination.total} leads${pagination.hasMore ? ' (scroll for more)' : ''}`}
        </div>
      </div>

      {/* Search and Filter Controls - Matching CallLogs style */}
      <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex flex-wrap items-center gap-4">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[250px]">
            <Search
              className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
                theme === "dark" ? "text-slate-400" : "text-gray-500"
              }`}
            />
            <Input
              type="text"
              placeholder="Search by name, phone, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`pl-10 ${
                theme === "dark"
                  ? "bg-slate-800 border-slate-700 text-white placeholder:text-slate-400"
                  : "bg-white border-gray-300 text-gray-900"
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${
                  theme === "dark" ? "text-slate-400 hover:text-white" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <Filter className={`w-4 h-4 ${theme === "dark" ? "text-slate-400" : "text-gray-500"}`} />
            
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger
                className={`w-[140px] ${
                  theme === "dark"
                    ? "bg-slate-800 border-slate-700 text-white"
                    : "bg-white border-gray-300"
                }`}
              >
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="webchat">Web Chat</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger
                className={`w-[130px] ${
                  theme === "dark"
                    ? "bg-slate-800 border-slate-700 text-white"
                    : "bg-white border-gray-300"
                }`}
              >
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Hot">🔥 Hot</SelectItem>
                <SelectItem value="Warm">🌡️ Warm</SelectItem>
                <SelectItem value="Cold">❄️ Cold</SelectItem>
              </SelectContent>
            </Select>

            <Button
              size="sm"
              variant="outline"
              onClick={refresh}
              disabled={loading}
              className={
                theme === "dark"
                  ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                  : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
              }
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className={`flex gap-6`} style={{ height: "calc(100% - 100px)" }}>
        {/* Leads List Section */}
        <div
          className={`${selectedLead ? 'w-2/5' : 'w-full'} transition-all duration-300 ${
            theme === "dark"
              ? "bg-slate-900/50 border-slate-800"
              : "bg-white border-gray-200"
          } border rounded-lg flex flex-col h-full`}
        >

        {/* Leads List */}
          <div 
            ref={leadsContainerRef}
            className="flex-1 overflow-y-auto"
          >
            {/* Skeleton loading during search/filter */}
            {(loading && leads.length === 0) || isSearching ? (
              <div className="p-2 space-y-2">
                {[...Array(6)].map((_, i) => (
                  <LeadSkeleton key={i} />
                ))}
              </div>
            ) : error && leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-4 text-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
                theme === "dark" ? "bg-red-900/30" : "bg-red-100"
              }`}>
                <X className={`w-8 h-8 ${theme === "dark" ? "text-red-400" : "text-red-500"}`} />
              </div>
              <h3 className={`text-lg font-semibold mb-2 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                Failed to load leads
              </h3>
              <p className={`text-sm mb-4 ${theme === "dark" ? "text-slate-400" : "text-gray-600"}`}>
                {error}
              </p>
              <Button onClick={refresh} variant="outline">
                Try Again
              </Button>
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-4 text-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
                theme === "dark" ? "bg-slate-700" : "bg-gray-200"
              }`}>
                <Users className={`w-8 h-8 ${theme === "dark" ? "text-slate-400" : "text-gray-500"}`} />
              </div>
              <h3 className={`text-lg font-semibold mb-2 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                No leads found
              </h3>
              <p className={theme === "dark" ? "text-slate-400" : "text-gray-600"}>
                {searchQuery || platformFilter !== "all" || statusFilter !== "all"
                  ? "Try adjusting your search or filters"
                  : "Leads will appear here when customers interact with your chat agents"}
              </p>
            </div>
          ) : (
              <div className="p-2 space-y-2">
                {leads.map((lead) => (
                  <div
                    key={lead.customer_phone}
                    onClick={() => handleLeadClick(lead)}
                    className={`p-3 rounded-lg cursor-pointer transition-all ${
                      selectedLead?.customer_phone === lead.customer_phone
                        ? theme === "dark"
                          ? "bg-slate-700 ring-2 ring-emerald-500"
                          : "bg-emerald-50 ring-2 ring-emerald-500"
                        : theme === "dark"
                        ? "bg-slate-800 hover:bg-slate-700"
                        : "bg-gray-50 hover:bg-gray-100"
                    }`}
                  >
                  <div className="flex items-start space-x-3">
                    {/* Avatar */}
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium flex-shrink-0 ${
                        lead.lead_status === 'Hot' ? 'bg-red-500' :
                        lead.lead_status === 'Warm' ? 'bg-yellow-500' :
                        lead.lead_status === 'Cold' ? 'bg-blue-500' :
                        theme === "dark" ? "bg-slate-600" : "bg-gray-500"
                      }`}
                    >
                      {getInitials(lead.name, lead.customer_phone)}
                    </div>
                    
                    {/* Lead Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h5
                          className={`font-medium truncate ${
                            theme === "dark" ? "text-white" : "text-gray-900"
                          }`}
                        >
                          {lead.name || lead.customer_phone}
                        </h5>
                        <span className={`text-xs flex-shrink-0 ${
                          theme === "dark" ? "text-slate-400" : "text-gray-500"
                        }`}>
                          {formatTime(lead.last_message_at)}
                        </span>
                      </div>
                      
                      {/* Phone and Email */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm truncate ${
                          theme === "dark" ? "text-slate-400" : "text-gray-600"
                        }`}>
                          {lead.customer_phone}
                        </span>
                      </div>
                      
                      {/* Last message preview */}
                      {lead.last_message_text && (
                        <p className={`text-sm truncate mb-2 ${
                          theme === "dark" ? "text-slate-500" : "text-gray-500"
                        }`}>
                          {lead.last_message_sender === 'agent' ? '🤖 ' : ''}
                          {lead.last_message_text}
                        </p>
                      )}
                      
                      {/* Badges Row */}
                      <div className="flex flex-wrap gap-1">
                        {lead.platforms.map((platform) => (
                          <Badge
                            key={platform}
                            variant="secondary"
                            className={`text-xs px-2 py-0 ${getPlatformStyle(platform)}`}
                          >
                            {platform}
                          </Badge>
                        ))}
                        {lead.lead_status && (
                          <Badge
                            variant="secondary"
                            className={`text-xs px-2 py-0 ${getStatusStyle(lead.lead_status)}`}
                          >
                            {lead.lead_status}
                          </Badge>
                        )}
                        <span className={`text-xs ${
                          theme === "dark" ? "text-slate-500" : "text-gray-400"
                        }`}>
                          {lead.total_messages} msgs
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Loading more indicator */}
                {loadingMore && (
                  <div className="p-2 space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <LeadSkeleton key={`loading-more-${i}`} />
                    ))}
                  </div>
                )}
              
              {/* End of list indicator */}
              {!pagination.hasMore && leads.length > 0 && (
                <div className={`text-center py-4 text-sm ${
                  theme === "dark" ? "text-slate-500" : "text-gray-400"
                }`}>
                  No more leads
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Messages Panel (Sliding from right) */}
      {selectedLead && (
        <div
          className={`flex-1 ${
            theme === "dark"
              ? "bg-slate-900/50 border-slate-800"
              : "bg-white border-gray-200"
          } border rounded-lg flex flex-col h-full animate-in slide-in-from-right-10 duration-300`}
        >
          {/* Chat Header */}
          <div
            className={`p-4 border-b flex items-center justify-between ${
              theme === "dark" ? "border-slate-700" : "border-gray-200"
            }`}
          >
            <div className="flex items-center space-x-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium ${
                  selectedLead.lead_status === 'Hot' ? 'bg-red-500' :
                  selectedLead.lead_status === 'Warm' ? 'bg-yellow-500' :
                  selectedLead.lead_status === 'Cold' ? 'bg-blue-500' :
                  theme === "dark" ? "bg-slate-600" : "bg-gray-500"
                }`}
              >
                {getInitials(selectedLead.name, selectedLead.customer_phone)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3
                    className={`font-medium ${
                      theme === "dark" ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {selectedLead.name || selectedLead.customer_phone}
                  </h3>
                  {selectedLead.lead_status && (
                    <Badge className={getStatusStyle(selectedLead.lead_status)}>
                      {selectedLead.lead_status}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className={`flex items-center gap-1 ${theme === "dark" ? "text-slate-400" : "text-gray-600"}`}>
                    <Phone className="w-3 h-3" />
                    {selectedLead.customer_phone}
                  </span>
                  {selectedLead.email && (
                    <span className={`flex items-center gap-1 ${theme === "dark" ? "text-slate-400" : "text-gray-600"}`}>
                      <Mail className="w-3 h-3" />
                      {selectedLead.email}
                    </span>
                  )}
                  {selectedLead.company && (
                    <span className={`flex items-center gap-1 ${theme === "dark" ? "text-slate-400" : "text-gray-600"}`}>
                      <Building2 className="w-3 h-3" />
                      {selectedLead.company}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelectedLead(null);
                clearMessages();
              }}
              className={theme === "dark" ? "text-slate-400 hover:text-white" : "text-gray-500 hover:text-gray-900"}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Messages */}
          <div className="flex-1 p-4 space-y-4 overflow-y-auto flex flex-col">
            {messagesLoading ? (
              <div className="space-y-4 flex-1">
                <MessageSkeleton isAgent={true} />
                <MessageSkeleton isAgent={false} />
                <MessageSkeleton isAgent={true} />
                <MessageSkeleton isAgent={false} />
                <MessageSkeleton isAgent={true} />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
                  theme === "dark" ? "bg-slate-700" : "bg-gray-200"
                }`}>
                  <MessageSquare className={`w-8 h-8 ${theme === "dark" ? "text-slate-400" : "text-gray-500"}`} />
                </div>
                <h3 className={`text-lg font-semibold mb-2 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                  No messages yet
                </h3>
                <p className={theme === "dark" ? "text-slate-400" : "text-gray-600"}>
                  Messages will appear here once the conversation starts
                </p>
              </div>
            ) : (
              <>
                {messages.map((message) => {
                  const isFailed = message.status === 'failed';
                  const isMeetingJson = tryParseMeetingJson(message.text) !== null;
                  const isTemplate = message.is_template === true;
                  
                  return (
                    <div
                      key={message.message_id}
                      className={`flex ${
                        message.sender === "agent" ? "justify-start" : "justify-end"
                      }`}
                    >
                      <div className="flex flex-col">
                        <div
                          className={`max-w-xs lg:max-w-md xl:max-w-lg px-4 py-2 rounded-lg ${
                            isFailed
                              ? "bg-red-900/50 border border-red-500/50 text-red-100"
                              : isTemplate
                                ? theme === "dark"
                                  ? "bg-amber-900/50 border border-amber-500/40 text-amber-50"
                                  : "bg-amber-50 border border-amber-300 text-amber-900"
                                : message.sender === "agent"
                                  ? isMeetingJson
                                    ? theme === "dark"
                                      ? "bg-emerald-900/50 border border-emerald-500/30 text-white"
                                      : "bg-emerald-100 border border-emerald-300 text-gray-900"
                                    : theme === "dark"
                                      ? "bg-slate-700 text-white"
                                      : "bg-gray-200 text-gray-900"
                                  : "bg-emerald-600 text-white"
                          }`}
                        >
                          {message.sender === "agent" && (
                            <p className={`text-xs mb-1 ${
                              isFailed ? "text-red-300" : isTemplate ? (theme === "dark" ? "text-amber-300" : "text-amber-600") : theme === "dark" ? "text-slate-400" : "text-gray-500"
                            }`}>
                              {isTemplate ? "📋" : "🤖"} {message.agent_name}
                            </p>
                          )}
                          
                          {/* Render message content - handles meeting JSON formatting */}
                          {renderMessageContent(message, theme)}
                          
                          <div className="flex items-center justify-between mt-1 gap-2">
                            <span className={`text-xs ${isFailed ? "text-red-300" : isTemplate ? (theme === "dark" ? "text-amber-300/70" : "text-amber-600/70") : "opacity-70"}`}>
                              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <div className="flex items-center gap-1">
                              {isTemplate && (
                                <Badge variant="outline" className={`text-xs ${
                                  theme === "dark" ? "border-amber-500/50 text-amber-300 bg-amber-900/30" : "border-amber-400 text-amber-700 bg-amber-100"
                                }`}>
                                  Template
                                </Badge>
                              )}
                              <Badge variant="outline" className={`text-xs ${isFailed ? "border-red-400 text-red-300" : isTemplate ? (theme === "dark" ? "border-amber-500/30 text-amber-300/70" : "border-amber-300 text-amber-600/70") : "opacity-70"}`}>
                                {message.platform}
                              </Badge>
                              {isFailed && (
                                <Badge 
                                  variant="destructive" 
                                  className="text-xs bg-red-600 text-white cursor-pointer hover:bg-red-700 transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFailedMessageClick(message.message_id);
                                  }}
                                >
                                  <AlertCircle className="w-3 h-3 mr-1" />
                                  Failed
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* Failed message indicator below the bubble - clickable */}
                        {isFailed && (
                          <button
                            onClick={() => handleFailedMessageClick(message.message_id)}
                            className={`flex items-center gap-1 mt-1 text-xs text-red-500 hover:text-red-400 transition-colors cursor-pointer ${
                              message.sender === "agent" ? "justify-start" : "justify-end"
                            }`}
                          >
                            <AlertCircle className="w-3 h-3" />
                            <span className="underline">Click to see why</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {/* Scroll anchor */}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Footer info */}
          <div className={`p-3 border-t text-center text-sm ${
            theme === "dark" ? "border-slate-700 text-slate-500" : "border-gray-200 text-gray-400"
          }`}>
            {selectedLead.total_messages} messages • {selectedLead.conversation_count} conversation{selectedLead.conversation_count !== 1 ? 's' : ''}
          </div>
        </div>
      )}
      </div>

      {/* Failed Message Details Dialog */}
      <Dialog open={failedMessageDialog.open} onOpenChange={(open) => !open && closeFailedMessageDialog()}>
        <DialogContent className={`max-w-md ${theme === "dark" ? "bg-slate-900 border-slate-700" : "bg-white"}`}>
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center gap-2 text-red-500 text-base">
              <AlertTriangle className="w-4 h-4" />
              Message Delivery Failed
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3">
            {failedMessageDialog.loading ? (
              <div className="flex flex-col items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                <p className={`mt-2 text-sm ${theme === "dark" ? "text-slate-400" : "text-gray-500"}`}>
                  Fetching failure details...
                </p>
              </div>
            ) : failedMessageDialog.error ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
                <p className="text-red-500 font-medium text-sm">{failedMessageDialog.error}</p>
              </div>
            ) : failedMessageDialog.status ? (
              <>
                {/* Failure Reason Box */}
                <div className="bg-red-950/50 border border-red-500/30 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-medium text-red-400 text-sm mb-0.5">Failure Reason</h4>
                      <p className={`text-xs ${theme === "dark" ? "text-red-200" : "text-red-700"}`}>
                        {failedMessageDialog.status.failure_reason || 
                         failedMessageDialog.status.delivery_status?.error_reason || 
                         'Unknown error - message delivery failed'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Message Details */}
                <div className={`rounded-lg p-3 ${theme === "dark" ? "bg-slate-800" : "bg-gray-100"}`}>
                  <h4 className={`font-medium mb-2 text-sm ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    Message Details
                  </h4>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className={theme === "dark" ? "text-slate-400" : "text-gray-500"}>Platform:</span>
                      <Badge variant="outline" className="capitalize text-xs h-5">{failedMessageDialog.status.platform}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className={theme === "dark" ? "text-slate-400" : "text-gray-500"}>Recipient:</span>
                      <span className={theme === "dark" ? "text-white" : "text-gray-900"}>{failedMessageDialog.status.customer_phone}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={theme === "dark" ? "text-slate-400" : "text-gray-500"}>Agent:</span>
                      <span className={theme === "dark" ? "text-white" : "text-gray-900"}>{failedMessageDialog.status.agent_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={theme === "dark" ? "text-slate-400" : "text-gray-500"}>Time:</span>
                      <span className={theme === "dark" ? "text-white" : "text-gray-900"}>
                        {new Date(failedMessageDialog.status.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Message Preview */}
                <div className={`rounded-lg p-3 ${theme === "dark" ? "bg-slate-800" : "bg-gray-100"}`}>
                  <h4 className={`font-medium mb-1 text-sm ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    Message Content
                  </h4>
                  <p className={`text-xs ${theme === "dark" ? "text-slate-300" : "text-gray-700"} whitespace-pre-wrap line-clamp-3`}>
                    {failedMessageDialog.status.text}
                  </p>
                </div>
              </>
            ) : null}
          </div>
          
          <div className="mt-3 flex justify-end">
            <Button 
              onClick={closeFailedMessageDialog}
              variant={theme === "dark" ? "outline" : "default"}
              size="sm"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatLogs;
