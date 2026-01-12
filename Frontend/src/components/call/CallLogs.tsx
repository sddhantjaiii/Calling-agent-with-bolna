import { useState, useEffect, useRef } from "react";
import {
  Play,
  FileText,
  Phone,
  Pause,
  Search,
  Volume2,
  Volume1,
  VolumeX,
  Filter,
  X,
  Loader2,
  Check,
  PhoneCall,
} from "lucide-react";
import { CallSourceIndicator, getCallSourceFromData } from "@/components/call/CallSourceIndicator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import CallingModal from "@/components/call/CallingModal";
import CallTranscriptViewer from "@/components/call/CallTranscriptViewer";
import Pagination from "@/components/ui/pagination";
import LazyLoader from "@/components/ui/LazyLoader";
import { DateRangePicker } from "@/components/common/DateRangePicker";
import { useCalls } from "@/hooks/useCalls";
import { useNavigation } from "@/contexts/NavigationContext";
import type { Call, CallListOptions } from "@/types";
import { apiService } from "@/services/apiService";
import CreateCampaignModal from "@/components/campaigns/CreateCampaignModal";
import { Checkbox } from "@/components/ui/checkbox";

// Column filter interface for Excel-like filtering
interface ColumnFilters {
  agents: string[];
  campaigns: string[];
  status: string[];
  leadType: string[];
}

// Excel-like Column Filter Component for Call Logs
interface ExcelFilterProps {
  title: string;
  options: Array<{ value: string; label: string }>;
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

  const handleToggleOption = (value: string) => {
    if (selectedValues.includes(value)) {
      onSelectionChange(selectedValues.filter(v => v !== value));
    } else {
      onSelectionChange([...selectedValues, value]);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={`flex items-center gap-1.5 px-2.5 py-1.5 h-9 rounded-md border text-sm transition-colors ${hasActiveFilter ? 'border-primary/50 bg-primary/10 text-primary' : 'border-input bg-background hover:bg-accent hover:text-accent-foreground'}`}>
          <Filter className={`w-3.5 h-3.5 ${hasActiveFilter ? 'text-primary' : 'text-muted-foreground'}`} />
          <span>{title}</span>
          {hasActiveFilter && (
            <span className="text-[10px] bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center font-medium">
              {selectedValues.length}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48 max-h-72 overflow-y-auto">
        <DropdownMenuItem onClick={handleToggleAll} className="flex items-center gap-2 text-sm">
          <div className={`w-3.5 h-3.5 border rounded flex items-center justify-center ${isAllSelected ? 'bg-primary border-primary' : 'border-input'}`}>
            {isAllSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
          </div>
          <span className="font-medium">{showAllLabel}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.map((option) => {
          const isSelected = selectedValues.includes(option.value);
          return (
            <DropdownMenuItem 
              key={option.value} 
              onClick={() => handleToggleOption(option.value)}
              className="flex items-center gap-2 text-sm"
            >
              <div className={`w-3.5 h-3.5 border rounded flex items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'border-input'}`}>
                {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
              </div>
              <span>{option.label}</span>
            </DropdownMenuItem>
          );
        })}
        {selectedValues.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleToggleAll} className="text-muted-foreground text-sm">
              Clear filter
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

interface CallLogsProps {
  activeTab: string;
  activeSubTab: string;
  useLazyLoading?: boolean;
  initialPageSize?: number;
  selectedAgents?: string[];
  selectedCampaign?: string | null;
  onOpenProfile?: (lead: any) => void;
  // Filter control props
  agents?: Array<{ id: string; name: string }>;
  campaigns?: Array<{ id: string; name: string }>;
  onAgentFilterChange?: (agentIds: string[]) => void;
  onCampaignFilterChange?: (campaignId: string | null) => void;
}

const CallLogs: React.FC<CallLogsProps> = ({
  activeTab,
  activeSubTab,
  useLazyLoading = false,
  initialPageSize = 10,
  selectedAgents,
  selectedCampaign = null,
  onOpenProfile,
  agents = [],
  campaigns = [],
  onAgentFilterChange,
  onCampaignFilterChange,
}) => {
  const { theme } = useTheme();
  const { toast } = useToast();
  const { navigateToLeadIntelligence } = useNavigation();
  const [showTranscript, setShowTranscript] = useState(false);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [showCallingModal, setShowCallingModal] = useState(false);
  const [currentCallLead, setCurrentCallLead] = useState<{
    name: string;
    phone: string;
  } | null>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null); // This will now hold the call ID of the playing audio
  const [isAudioLoading, setIsAudioLoading] = useState<string | null>(null); // Track loading state by call ID
  const audioRef = useRef<HTMLAudioElement | null>(null); // Ref to control the audio element
  const [forceUpdate, setForceUpdate] = useState(0); // Used to force re-render for progress bar
  const objectUrlRef = useRef<string | null>(null); // To keep track of the blob URL for cleanup
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showVolumeControl, setShowVolumeControl] = useState(false);

  // Multi-selection state for campaign creation
  const [selectedCallIds, setSelectedCallIds] = useState<Set<string>>(new Set());
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [isFetchingContacts, setIsFetchingContacts] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<'createdAt' | 'durationSeconds' | 'contactName'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [selectedCallSource, setSelectedCallSource] = useState<string>("");
  
  // Column filters state (Excel-like multi-select)
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({
    agents: [],
    campaigns: [],
    status: [],
    leadType: [],
  });
  
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [allLoadedCalls, setAllLoadedCalls] = useState<Call[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasReachedEnd, setHasReachedEnd] = useState(false);
  const audioProgressRef = useRef<{ [key: string]: { current: number; total: number } }>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const ITEMS_PER_PAGE = initialPageSize || 30; // Default to 30 for infinite scroll
  const SCROLL_THRESHOLD = 10; // Trigger load when 10 items from bottom

  // Helper to update a specific column filter
  const updateColumnFilter = (column: keyof ColumnFilters, values: string[]) => {
    setColumnFilters(prev => ({ ...prev, [column]: values }));
  };

  // Check if any column filters are active
  const hasActiveColumnFilters = Object.values(columnFilters).some(arr => arr.length > 0);

  // Handle individual call selection
  const handleCallSelect = (callId: string) => {
    setSelectedCallIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(callId)) {
        newSet.delete(callId);
      } else {
        newSet.add(callId);
      }
      return newSet;
    });
  };

  // Fetch existing contacts by phone numbers
  const fetchContactsByPhoneNumbers = async (phoneNumbers: string[]): Promise<string[]> => {
    try {
      setIsFetchingContacts(true);
      // Fetch contacts with matching phone numbers
      const response = await apiService.get('/api/contacts', {
        params: {
          limit: 1000, // Large limit to get all matching contacts
        },
      });
      
      if (response.contacts) {
        // Match contacts by phone number
        const matchedContactIds: string[] = [];
        const selectedPhones = new Set(phoneNumbers);
        
        response.contacts.forEach((contact: any) => {
          if (selectedPhones.has(contact.phone_number)) {
            matchedContactIds.push(contact.id);
          }
        });
        
        return matchedContactIds;
      }
      return [];
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch existing contacts. Creating campaign without contact linking.',
        variant: 'destructive',
      });
      return [];
    } finally {
      setIsFetchingContacts(false);
    }
  };

  // Handle create campaign from selected calls
  const handleCreateCampaign = async (selectedCalls: Call[]) => {
    if (selectedCallIds.size === 0) {
      toast({
        title: 'No Calls Selected',
        description: 'Please select at least one call to create a campaign.',
        variant: 'destructive',
      });
      return;
    }

    // Get unique phone numbers from selected calls
    const phoneNumbers = Array.from(new Set(selectedCalls.map(call => call.phoneNumber)));
    
    // Fetch existing contacts that match these phone numbers
    const contactIds = await fetchContactsByPhoneNumbers(phoneNumbers);
    
    if (contactIds.length === 0) {
      toast({
        title: 'No Contacts Found',
        description: `No existing contacts found for ${phoneNumbers.length} phone number(s). Please create contacts first from the Contacts page.`,
        variant: 'destructive',
      });
      return;
    }

    if (contactIds.length < phoneNumbers.length) {
      toast({
        title: 'Partial Match',
        description: `Found ${contactIds.length} out of ${phoneNumbers.length} phone numbers in your contacts. Only matched contacts will be added to the campaign.`,
      });
    }
    
    setSelectedContactIds(contactIds);
    setIsCreatingCampaign(true);
  };

  // Clear selection when filters change
  useEffect(() => {
    setSelectedCallIds(new Set());
  }, [columnFilters, startDate, endDate, debouncedSearchTerm]);

  // Clear all column filters
  const clearAllColumnFilters = () => {
    setColumnFilters({
      agents: [],
      campaigns: [],
      status: [],
      leadType: [],
    });
    // Also notify parent components if needed
    if (onAgentFilterChange) {
      onAgentFilterChange([]);
    }
    if (onCampaignFilterChange) {
      onCampaignFilterChange(null);
    }
  };

  // Debounce search term and reset pagination
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      // Reset infinite scroll state when search changes
      setCurrentPage(1);
      setHasReachedEnd(false);
      // Only clear allLoadedCalls if search term actually changed
      if (searchTerm !== debouncedSearchTerm) {
        setAllLoadedCalls([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
    setHasReachedEnd(false);
    // Don't immediately clear allLoadedCalls - let the data effect handle it
  }, [selectedCallSource, columnFilters, startDate, endDate, sortBy, sortOrder, selectedAgents]);

  // Sync columnFilters with parent props
  useEffect(() => {
    if (selectedAgents && selectedAgents.length > 0 && columnFilters.agents.length === 0) {
      setColumnFilters(prev => ({ ...prev, agents: selectedAgents }));
    }
    if (selectedCampaign && columnFilters.campaigns.length === 0) {
      setColumnFilters(prev => ({ ...prev, campaigns: [selectedCampaign] }));
    }
  }, [selectedAgents, selectedCampaign]);

  // Map camelCase to snake_case for backend - Updated for duration_seconds
  const sortByMapping: Record<string, string> = {
    'createdAt': 'created_at',
    'durationSeconds': 'duration_seconds',
    'contactName': 'contact_name'
  };

  // Prepare options for the hook with server-side filtering
  const callsOptions: CallListOptions = {
    limit: ITEMS_PER_PAGE,
    offset: (currentPage - 1) * ITEMS_PER_PAGE,
    sortBy: sortByMapping[sortBy] as 'created_at' | 'duration_seconds' | 'total_score' | 'contact_name' | 'phone_number',
    sortOrder,
    // Add server-side search and filtering
    search: debouncedSearchTerm || undefined,
    agentNames: columnFilters.agents.length > 0 ? columnFilters.agents : (selectedAgents && selectedAgents.length > 0 ? selectedAgents : undefined),
    campaignId: columnFilters.campaigns.length > 0 ? columnFilters.campaigns[0] : (selectedCampaign || undefined),
    status: columnFilters.status.length > 0 ? columnFilters.status : undefined, // Server-side filtering for status (multiple)
    leadType: columnFilters.leadType.length > 0 ? columnFilters.leadType[0] as 'inbound' | 'outbound' : undefined,
    startDate: startDate ? startDate.toISOString() : undefined,
    endDate: endDate ? endDate.toISOString() : undefined,
  };

  const {
    calls,
    pagination,
    loading,
    error,
    refreshCalls,
    loadCall,
    loadTranscript,
  } = useCalls(callsOptions);

  // For infinite scroll, always use accumulated calls
  const displayCalls = useLazyLoading ? allLoadedCalls : calls;

  // Calculate pagination info
  const totalCalls = pagination?.total || 0;
  const totalPages = Math.ceil(totalCalls / ITEMS_PER_PAGE);
  const hasMore = pagination?.hasMore || false;

  // All filtering is now done server-side
  const filteredCalls = displayCalls;

  // Get unique phone numbers from selected calls
  const getSelectedPhoneNumbers = (): string[] => {
    const selectedCalls = filteredCalls.filter(call => selectedCallIds.has(call.id));
    const phoneNumbers = selectedCalls.map(call => call.phoneNumber);
    // Deduplicate phone numbers (if same number has multiple call logs)
    return Array.from(new Set(phoneNumbers));
  };

  // Check if all visible calls are selected
  const isAllVisibleSelected = filteredCalls.length > 0 && filteredCalls.every(call => selectedCallIds.has(call.id));

  // Handle select all (respects current filters)
  const handleSelectAll = () => {
    if (isAllVisibleSelected) {
      // Deselect all visible
      setSelectedCallIds(prev => {
        const newSet = new Set(prev);
        filteredCalls.forEach(call => newSet.delete(call.id));
        return newSet;
      });
    } else {
      // Select all visible
      setSelectedCallIds(prev => {
        const newSet = new Set(prev);
        filteredCalls.forEach(call => newSet.add(call.id));
        return newSet;
      });
    }
  };
  

  // Update accumulated calls for infinite scroll
  useEffect(() => {
    if (useLazyLoading) {
      if (currentPage === 1) {
        // Reset for new search or first load - always set the calls, even if empty
        console.log('📞 Call Data Debug:', {
          callsCount: calls.length,
          firstCall: calls[0],
          hasCampaignName: calls[0]?.campaignName,
          campaignId: calls[0]?.campaignId
        });
        setAllLoadedCalls(calls);
        setHasReachedEnd(!hasMore && calls.length === 0);
      } else if (calls.length > 0) {
        // Append new calls only if we have data
        setAllLoadedCalls(prev => {
          const existingIds = new Set(prev.map(c => c.id));
          const newCalls = calls.filter(c => !existingIds.has(c.id));
          const updated = [...prev, ...newCalls];
          
          // Check if we've reached the end
          if (!hasMore) {
            setHasReachedEnd(true);
          }
          
          return updated;
        });
      }
    }
  }, [calls, currentPage, useLazyLoading, hasMore]);

  // Reset isLoadingMore when loading state changes
  useEffect(() => {
    if (!loading && isLoadingMore) {
      setIsLoadingMore(false);
    }
  }, [loading, isLoadingMore]);

  // Infinite scroll detection with basic debounce
  useEffect(() => {
    if (!useLazyLoading || !scrollContainerRef.current) return;

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        const container = scrollContainerRef.current;
        if (!container || hasReachedEnd || loading || isLoadingMore) return;

        const { scrollTop, scrollHeight, clientHeight } = container;
        const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
        
        // Trigger when we're 90% down the list (approximately 10 items from bottom)
        if (scrollPercentage > 0.9 && hasMore) {
          handleLoadMore();
        }
      });
    };

    const container = scrollContainerRef.current;
    container.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      container.removeEventListener('scroll', handleScroll as any);
    };
  }, [useLazyLoading, hasReachedEnd, loading, isLoadingMore, hasMore]);

  // Auto-load next page if content doesn't fill the viewport
  useEffect(() => {
    if (!useLazyLoading) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    // If we have items but the scroll doesn't need to scroll and there's more, load more
    const needsMore = container.scrollHeight <= container.clientHeight + 16; // small buffer
    if (filteredCalls.length > 0 && hasMore && !loading && !isLoadingMore && !hasReachedEnd && needsMore) {
      handleLoadMore();
    }
  }, [filteredCalls.length, hasMore, loading, isLoadingMore, hasReachedEnd, useLazyLoading]);


  const handleShowTranscript = async (call: Call) => {
    try {
      const transcript = await loadTranscript(call.id);
      setSelectedCall({ ...call, transcript });
      setShowTranscript(true);
    } catch (error) {
      toast({
        title: 'Error loading transcript',
        description: 'Failed to load call transcript. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleLoadMore = () => {
    if (useLazyLoading && hasMore && !loading && !isLoadingMore && !hasReachedEnd) {
      setIsLoadingMore(true);
      setCurrentPage(prev => prev + 1);
    }
  };

  const handleSortChange = (newSortBy: typeof sortBy) => {
    if (newSortBy === sortBy) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(newSortBy);
      setSortOrder('DESC');
    }
    // Reset infinite scroll state - but let the data effect handle clearing
    setCurrentPage(1);
    setHasReachedEnd(false);
  };

  const handleCloseTranscript = () => {
    setShowTranscript(false);
    setSelectedCall(null);
  };

  const handleCall = (leadName: string, phone: string) => {
    setCurrentCallLead({ name: leadName, phone });
    setShowCallingModal(true);
  };

  const handlePlayAudio = async (callId: string) => {
    // Case 1: The user is clicking the play/pause button for the currently active audio
    if (playingAudio === callId && audioRef.current) {
      if (audioRef.current.paused) {
        await audioRef.current.play();
      } else {
        audioRef.current.pause();
      }
      setForceUpdate(prev => prev + 1); // Force re-render to update play/pause icon
      return;
    }

    // Case 2: The user is playing a new audio. First, stop any currently playing audio.
    if (audioRef.current) {
      handleCloseAudio();
    }
      
      try {
        setIsAudioLoading(callId);
        setPlayingAudio(callId); // Set playing state immediately for better UX
        
        // Get the recording URL directly from the API
        const audioUrl = await apiService.getCallAudioBlob(callId);
        
        // Validate the URL
        if (!audioUrl || typeof audioUrl !== 'string') {
          throw new Error('Invalid recording URL received');
        }

        // Twilio URLs are now proxied through backend with authentication
        // No need to block them anymore

        console.log('Playing audio from URL:', audioUrl); // Debug log
        objectUrlRef.current = audioUrl; // Store the URL for reference

        // Create audio element WITHOUT crossOrigin to avoid CORS preflight
        // The S3 bucket is publicly accessible, so we don't need CORS
        audioRef.current = new Audio(audioUrl);
        // DO NOT set crossOrigin - this triggers CORS checks
        setIsAudioLoading(null); // Clear loading state

        // Initialize progress for the new audio
        audioProgressRef.current[callId] = { current: 0, total: 0 };

        // Update total duration when metadata is loaded
        audioRef.current.onloadedmetadata = () => {
          if (audioRef.current) {
            audioProgressRef.current[callId] = {
              ...audioProgressRef.current[callId],
              total: audioRef.current.duration,
            };
            setForceUpdate(prev => prev + 1); // Force re-render to show duration
          }
        };

        // Update current time as audio plays
        audioRef.current.ontimeupdate = () => {
          if (audioRef.current) {
            audioProgressRef.current[callId] = {
              ...audioProgressRef.current[callId],
              current: audioRef.current.currentTime,
            };
            setForceUpdate(prev => prev + 1); // Force re-render for progress bar
          }
        };
        
        // Event listener to clear the playing state when audio finishes
        audioRef.current.onended = () => {
          setPlayingAudio(null);
          if (audioRef.current) {
            // Reset progress on end
            audioProgressRef.current[callId].current = 0;
            setForceUpdate(prev => prev + 1);
          }
        };

        await audioRef.current.play();

      } catch (err) {
        console.error("Error playing audio:", err);
        setIsAudioLoading(null);
        toast({
          title: 'Error playing audio',
          description: err instanceof Error ? err.message : 'Could not play the audio for this call.',
          variant: 'destructive',
        });
        setPlayingAudio(null); // Reset state on error
      }
  };

  // Effect to pause audio when navigating away from the logs sub-tab
  useEffect(() => {
    const isLogsSubTabActive = activeSubTab === 'logs';
    
    if (!isLogsSubTabActive && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setForceUpdate(prev => prev + 1); // Update UI to show paused state
    }
  }, [activeSubTab]);


  // Effect to clean up everything when the component unmounts
  useEffect(() => {
    // Return a cleanup function
    return () => {
      handleCloseAudio();
    };
  }, []); // Empty dependency array means this runs only on mount and unmount


  // Effect to handle browser tab visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setForceUpdate(prev => prev + 1);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const handleCloseAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPlayingAudio(null);
    setIsAudioLoading(null);
    // No need to revoke URL since we're using the S3 URL directly
    objectUrlRef.current = null;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement, MouseEvent>, callId: string) => {
    if (audioRef.current && audioProgressRef.current[callId]?.total > 0) {
      const progressBar = e.currentTarget;
      const rect = progressBar.getBoundingClientRect();
      const x = e.clientX - rect.left; // x position within the element.
      const width = progressBar.offsetWidth;
      const duration = audioProgressRef.current[callId].total;
      const newTime = (x / width) * duration;
      audioRef.current.currentTime = newTime;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
      audioRef.current.muted = newVolume === 0;
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      const newMuted = !audioRef.current.muted;
      setIsMuted(newMuted);
      audioRef.current.muted = newMuted;
      if (!newMuted && volume === 0) {
        setVolume(0.5); // Restore to a sensible volume
        audioRef.current.volume = 0.5;
      }
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) {
      return "00:00";
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(
      2,
      "0"
    )}`;
  };

  const getStatusColor = (call: Call) => {
    // Use callLifecycleStatus if available, otherwise fall back to status
    const lifecycleStatus = call.callLifecycleStatus || call.status;
    
    switch (lifecycleStatus?.toLowerCase()) {
      case "completed":
        return "bg-green-500";
      case "in-progress":
      case "ringing":
        return "bg-blue-500";
      case "failed":
      case "call-disconnected":
      case "busy":
      case "no-answer":
        return "bg-red-500";
      case "cancelled":
      case "initiated":
        return "bg-gray-500";
      default:
        return "bg-gray-500";
    }
  };

  const getDisplayStatus = (call: Call) => {
    // Use callLifecycleStatus if available, otherwise fall back to status
    const lifecycleStatus = call.callLifecycleStatus || call.status;
    
    // Map lifecycle status to user-friendly text
    switch (lifecycleStatus?.toLowerCase()) {
      case "call-disconnected":
        return "Disconnected";
      case "in-progress":
        return "In Progress";
      case "no-answer":
        return "No Answer";
      case "busy":
        return "Busy";
      default:
        return lifecycleStatus?.charAt(0).toUpperCase() + lifecycleStatus?.slice(1) || "Unknown";
    }
  };

  const isCallFailed = (call: Call) => {
    const lifecycleStatus = call.callLifecycleStatus || call.status;
    const failedStatuses = ['failed', 'busy', 'no-answer', 'cancelled'];
    return failedStatuses.includes(lifecycleStatus?.toLowerCase() || '');
  };

  // Normalize hangupBy to user-friendly display
  const getDisplayHangupBy = (call: Call) => {
    const hangupBy = call.hangupBy?.toLowerCase() || '';
    const hangupReason = call.hangupReason?.toLowerCase() || '';
    
    // If hangupBy is Plivo/Bolna or hangupReason mentions agent/bolna ending, show "Agent"
    if (hangupBy === 'plivo' || hangupBy === 'bolna' || hangupBy === 'system') {
      // Check hangupReason for more context
      if (hangupReason.includes('end of input') || hangupReason.includes('agent') || hangupReason.includes('bolna')) {
        return 'Agent';
      }
      return 'Agent';
    }
    // User/customer hung up
    if (hangupBy === 'user' || hangupBy === 'customer' || hangupBy === 'caller') {
      return 'User';
    }
    // Default: capitalize the original value
    return call.hangupBy ? call.hangupBy.charAt(0).toUpperCase() + call.hangupBy.slice(1) : '';
  };


  // Handle error state
  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={() => refreshCalls()}>
            Try Again
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <div className="p-4 space-y-3">
        {/* Compact Header + Search Row */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {/* Select All Checkbox */}
            <Checkbox
              checked={isAllVisibleSelected}
              onCheckedChange={handleSelectAll}
              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              aria-label="Select all visible calls"
            />
            <h2 className={`text-xl font-bold whitespace-nowrap ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
              Call Logs
            </h2>
          </div>
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${theme === "dark" ? "text-slate-400" : "text-gray-500"}`} />
            <Input
              type="text"
              placeholder="Search contacts, phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <div className="text-xs text-gray-500 ml-auto whitespace-nowrap flex items-center gap-2">
            {selectedCallIds.size > 0 && (
              <span className="text-primary font-medium">
                {selectedCallIds.size} selected
              </span>
            )}
            {loading ? 'Loading...' : (
              useLazyLoading 
                ? `${filteredCalls.length}${totalCalls > 0 ? ` / ${totalCalls}` : ''} calls`
                : `${filteredCalls.length} / ${totalCalls} calls`
            )}
          </div>
        </div>

        {/* Compact Filter Row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Agent Filter */}
          {agents.length > 0 && (
            <ExcelColumnFilter
              title="Agents"
              options={agents.map(agent => ({ value: agent.name, label: agent.name }))}
              selectedValues={columnFilters.agents}
              onSelectionChange={(values) => {
                updateColumnFilter('agents', values);
                if (onAgentFilterChange) {
                  onAgentFilterChange(values);
                }
              }}
              showAllLabel="All Agents"
            />
          )}

          {/* Campaign Filter */}
          {campaigns.length > 0 && (
            <ExcelColumnFilter
              title="Campaigns"
              options={campaigns.map(campaign => ({ value: campaign.id, label: campaign.name }))}
              selectedValues={columnFilters.campaigns}
              onSelectionChange={(values) => {
                updateColumnFilter('campaigns', values);
                if (onCampaignFilterChange) {
                  onCampaignFilterChange(values.length > 0 ? values[0] : null);
                }
              }}
              showAllLabel="All Campaigns"
            />
          )}

          {/* Call Type Filter */}
          <ExcelColumnFilter
            title="Type"
            options={[
              { value: 'inbound', label: 'Inbound' },
              { value: 'outbound', label: 'Outbound' },
            ]}
            selectedValues={columnFilters.leadType}
            onSelectionChange={(values) => updateColumnFilter('leadType', values)}
            showAllLabel="All Types"
          />

          {/* Status Filter */}
          <ExcelColumnFilter
            title="Status"
            options={[
              { value: 'completed', label: 'Completed' },
              { value: 'in-progress', label: 'In Progress' },
              { value: 'call-disconnected', label: 'Call Disconnected' },
              { value: 'ringing', label: 'Ringing' },
              { value: 'initiated', label: 'Initiated' },
              { value: 'failed', label: 'Failed' },
              { value: 'busy', label: 'Busy' },
              { value: 'no-answer', label: 'No Answer' },
            ]}
            selectedValues={columnFilters.status}
            onSelectionChange={(values) => updateColumnFilter('status', values)}
            showAllLabel="All Status"
          />

          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onDateChange={(start, end) => {
              setStartDate(start);
              setEndDate(end);
            }}
            placeholder="Date range"
          />

          <div className="flex items-center gap-1 ml-auto">
            <Select value={sortBy} onValueChange={(newVal) => handleSortChange(newVal as any)}>
              <SelectTrigger className="w-32 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Latest</SelectItem>
                <SelectItem value="durationSeconds">Duration</SelectItem>
                <SelectItem value="contactName">Contact</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="icon"
              onClick={() => setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC')}
              className="w-9 h-9 flex-shrink-0"
            >
              {sortOrder === 'ASC' ? '↑' : '↓'}
            </Button>

            {hasActiveColumnFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllColumnFilters}
                className="h-9 text-xs text-muted-foreground hover:text-destructive"
              >
                <X className="w-3 h-3 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Active Filters (only when filters are applied) */}
        {hasActiveColumnFilters && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {columnFilters.agents.length > 0 && (
              <Badge variant="secondary" className="text-xs py-0.5">
                {columnFilters.agents.join(', ')}
                <button onClick={() => updateColumnFilter('agents', [])} className="ml-1 hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
            {columnFilters.campaigns.length > 0 && (
              <Badge variant="secondary" className="text-xs py-0.5">
                {columnFilters.campaigns.map(id => campaigns.find(c => c.id === id)?.name || id).join(', ')}
                <button onClick={() => updateColumnFilter('campaigns', [])} className="ml-1 hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
            {columnFilters.leadType.length > 0 && (
              <Badge variant="secondary" className="text-xs py-0.5">
                {columnFilters.leadType.join(', ')}
                <button onClick={() => updateColumnFilter('leadType', [])} className="ml-1 hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
            {columnFilters.status.length > 0 && (
              <Badge variant="secondary" className="text-xs py-0.5">
                {columnFilters.status.join(', ')}
                <button onClick={() => updateColumnFilter('status', [])} className="ml-1 hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
          </div>
        )}

        {/* Call Log Cards */}
        <div 
          ref={scrollContainerRef}
          className="space-y-4 max-h-[70vh] overflow-y-auto"
        >
          {loading && filteredCalls.length === 0 ? (
            // Loading skeleton
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className={`p-4 animate-pulse ${theme === "dark"
                ? "bg-slate-800/50 border-slate-700"
                : "bg-white border-gray-200"
                }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="h-10 w-10 bg-muted rounded-full"></div>
                    <div>
                      <div className="h-5 bg-muted rounded w-32 mb-1"></div>
                      <div className="h-4 bg-muted rounded w-24"></div>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <div className="h-8 bg-muted rounded w-24"></div>
                    <div className="h-8 bg-muted rounded w-20"></div>
                  </div>
                </div>
              </Card>
            ))
          ) : filteredCalls.length === 0 ? (
            <Card className="p-12 text-center">
              <div className="text-gray-400 mb-4">
                <Phone className="w-12 h-12 mx-auto mb-4" />
                <h3 className="text-lg font-medium dark:text-gray-200 text-gray-900 mb-2">
                  No calls found
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  {searchTerm
                    ? `No calls match your filters.`
                    : 'No calls have been made yet.'}
                </p>
              </div>
            </Card>
          ) : (
            filteredCalls.map((call) => (
              <Card
                key={call.id}
                className={`overflow-hidden transition-all duration-200 hover:shadow-md ${theme === "dark"
                  ? "bg-slate-900/70 border-slate-800 hover:border-slate-600"
                  : "bg-white border-gray-200 hover:border-gray-300"
                  } ${selectedCallIds.has(call.id) ? 'ring-2 ring-primary ring-offset-2' : ''}`}
              >
                {/* Main Content Row */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    {/* Selection Checkbox */}
                    <div className="flex-shrink-0 pt-3">
                      <Checkbox
                        checked={selectedCallIds.has(call.id)}
                        onCheckedChange={() => handleCallSelect(call.id)}
                        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        aria-label={`Select call from ${call.contactName || 'Unknown'}`}
                      />
                    </div>
                    {/* Left: Avatar + Contact Info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Avatar with status indicator */}
                      <div className="relative flex-shrink-0">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg ${
                          call.leadType === 'inbound' 
                            ? 'bg-blue-600' 
                            : 'bg-emerald-600'
                        }`}>
                          {call.contactName?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        {/* Status dot */}
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 ${theme === 'dark' ? 'border-slate-900' : 'border-white'} ${getStatusColor(call)}`}></span>
                      </div>

                      {/* Contact Details */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3
                            className={`font-semibold text-base cursor-pointer hover:text-emerald-600 transition-colors truncate ${theme === "dark" ? "text-white" : "text-gray-900"}`}
                            onClick={() => navigateToLeadIntelligence({ phone: call.phoneNumber })}
                          >
                            {call.contactName || 'Unknown Contact'}
                          </h3>
                          {/* Call Type Badge */}
                          <Badge 
                            variant="secondary"
                            className={`text-[10px] px-1.5 py-0 h-5 font-medium ${
                              call.leadType === 'inbound' 
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            }`}
                          >
                            {call.leadType === 'inbound' ? '↓ In' : '↑ Out'}
                          </Badge>
                        </div>
                        <p className={`text-sm font-medium ${theme === "dark" ? "text-slate-400" : "text-gray-500"}`}>
                          {call.phoneNumber}
                        </p>
                        {/* Quick Info Row */}
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          {call.campaignName && (
                            <span className="inline-flex items-center text-xs text-emerald-600 dark:text-emerald-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                              {call.campaignName}
                            </span>
                          )}
                          <span className={`text-xs ${theme === "dark" ? "text-slate-500" : "text-gray-400"}`}>
                            {call.createdAt ? (
                              <>
                                {new Date(call.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                {' • '}
                                {new Date(call.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}
                              </>
                            ) : '—'}
                          </span>
                          {call.agentName && (
                            <span className={`text-xs ${theme === "dark" ? "text-slate-500" : "text-gray-400"}`}>
                              • {call.agentName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Center: Call Stats */}
                    <div className="hidden md:flex items-center gap-6 flex-shrink-0">
                      {/* Status */}
                      <div className="text-center min-w-[70px]">
                        <p className={`text-[10px] uppercase tracking-wider mb-0.5 ${theme === "dark" ? "text-slate-500" : "text-gray-400"}`}>Status</p>
                        <p className={`text-sm font-medium ${
                          getStatusColor(call) === 'bg-green-500' ? 'text-green-600 dark:text-green-400' :
                          getStatusColor(call) === 'bg-red-500' ? 'text-red-600 dark:text-red-400' :
                          getStatusColor(call) === 'bg-blue-500' ? 'text-blue-600 dark:text-blue-400' :
                          'text-gray-600 dark:text-gray-400'
                        }`}>
                          {getDisplayStatus(call)}
                        </p>
                      </div>
                      {/* Duration */}
                      <div className="text-center min-w-[60px]">
                        <p className={`text-[10px] uppercase tracking-wider mb-0.5 ${theme === "dark" ? "text-slate-500" : "text-gray-400"}`}>Duration</p>
                        <p className={`text-sm font-mono font-medium ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                          {(() => {
                            if (call.durationSeconds && !isNaN(call.durationSeconds)) {
                              const mins = Math.floor(call.durationSeconds / 60);
                              const secs = call.durationSeconds % 60;
                              return `${mins}:${String(secs).padStart(2, '0')}`;
                            }
                            return '0:00';
                          })()}
                        </p>
                      </div>
                      {/* Hung Up By */}
                      {call.hangupBy && (
                        <div className="text-center min-w-[70px]">
                          <p className={`text-[10px] uppercase tracking-wider mb-0.5 ${theme === "dark" ? "text-slate-500" : "text-gray-400"}`}>Ended By</p>
                          <p className={`text-sm font-medium ${theme === "dark" ? "text-slate-300" : "text-gray-600"}`}>
                            {getDisplayHangupBy(call)}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!isCallFailed(call) ? (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleShowTranscript(call)}
                                className="h-9 w-9"
                              >
                                <FileText className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>View Transcript</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="default"
                                size="icon"
                                onClick={() => handlePlayAudio(call.id)}
                                className="h-9 w-9 text-white"
                                style={{ backgroundColor: '#1A6262' }}
                              >
                                <Play className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Play Recording</TooltipContent>
                          </Tooltip>
                        </>
                      ) : (
                        <Badge variant="outline" className="text-xs text-gray-500 border-gray-300 dark:border-gray-600">
                          No Recording
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Mobile: Quick Stats Row */}
                  <div className="flex md:hidden items-center gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${getStatusColor(call)}`}></span>
                      <span className={`text-xs font-medium ${theme === "dark" ? "text-slate-300" : "text-gray-600"}`}>
                        {getDisplayStatus(call)}
                      </span>
                    </div>
                    <span className={`text-xs font-mono ${theme === "dark" ? "text-slate-400" : "text-gray-500"}`}>
                      {(() => {
                        if (call.durationSeconds && !isNaN(call.durationSeconds)) {
                          const mins = Math.floor(call.durationSeconds / 60);
                          const secs = call.durationSeconds % 60;
                          return `${mins}:${String(secs).padStart(2, '0')}`;
                        }
                        return '0:00';
                      })()}
                    </span>
                    {call.hangupBy && (
                      <span className={`text-xs ${theme === "dark" ? "text-slate-500" : "text-gray-400"}`}>
                        • Ended by {getDisplayHangupBy(call)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Audio Player Section (only shows when playing) */}
                {(playingAudio === call.id || isAudioLoading === call.id) && (
                  <div className={`px-4 py-3 border-t ${theme === 'dark' ? 'bg-slate-950/50 border-slate-800' : 'bg-gray-50 border-gray-100'}`}>
                    <div className="flex items-center gap-4">
                      {isAudioLoading === call.id ? (
                        <div className="flex items-center justify-center w-full h-10">
                          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                          <span className="ml-3 text-sm text-slate-400">Loading audio...</span>
                        </div>
                      ) : (
                        <>
                          {/* Play/Pause button */}
                          <button
                            onClick={() => handlePlayAudio(call.id)}
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-all duration-200 hover:scale-105 shadow-md flex-shrink-0 ${audioRef.current?.paused ? '' : 'bg-slate-600 hover:bg-slate-500'}`}
                            style={{ backgroundColor: audioRef.current?.paused ? '#1A6262' : undefined }}
                          >
                            {audioRef.current?.paused ? <Play className="w-5 h-5 ml-0.5" /> : <Pause className="w-5 h-5" />}
                          </button>

                          {/* Progress bar and time */}
                          <div className="flex items-center gap-3 flex-1">
                            <div
                              className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 cursor-pointer"
                              onClick={(e) => handleSeek(e, call.id)}
                            >
                              <div
                                className="h-1.5 rounded-full transition-all"
                                style={{ 
                                  backgroundColor: '#1A6262',
                                  width: `${((audioProgressRef.current[call.id]?.current || 0) / (audioProgressRef.current[call.id]?.total || 1)) * 100}%` 
                                }}
                              ></div>
                            </div>
                            <div className="text-xs font-mono text-gray-500 dark:text-gray-400 min-w-[90px] text-right">
                              {formatTime(audioProgressRef.current[call.id]?.current || 0)} / {
                                (() => {
                                  if (call.durationSeconds && !isNaN(call.durationSeconds)) {
                                    const mins = Math.floor(call.durationSeconds / 60);
                                    const secs = call.durationSeconds % 60;
                                    return `${mins}:${String(secs).padStart(2, '0')}`;
                                  }
                                  if (audioProgressRef.current[call.id]?.total > 0) {
                                    return formatTime(audioProgressRef.current[call.id].total);
                                  }
                                  return '0:00';
                                })()
                              }
                            </div>
                          </div>
                          
                          {/* Volume Control */}
                          <div
                            className="flex items-center gap-2 flex-shrink-0"
                            onMouseEnter={() => setShowVolumeControl(true)}
                            onMouseLeave={() => setShowVolumeControl(false)}
                          >
                            <button onClick={toggleMute} className="p-1.5 rounded-full transition-colors duration-200 hover:bg-slate-100 dark:hover:bg-slate-700">
                              {isMuted || volume === 0 ? (
                                <VolumeX className="w-4 h-4 text-slate-400" />
                              ) : volume < 0.5 ? (
                                <Volume1 className="w-4 h-4 text-slate-400" />
                              ) : (
                                <Volume2 className="w-4 h-4 text-slate-400" />
                              )}
                            </button>

                            <div className={`transition-all duration-300 overflow-hidden ${
                              showVolumeControl ? 'w-20 opacity-100' : 'w-0 opacity-0'
                            }`}>
                              <input
                                type="range"
                                min="0" 
                                max="1" 
                                step="0.05"
                                value={isMuted ? 0 : volume}
                                onChange={handleVolumeChange}
                                className="w-full h-1 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer"
                                style={{ accentColor: '#1A6262' }}
                              />
                            </div>
                          </div>

                          {/* Close Button */}
                          <button
                            onClick={handleCloseAudio}
                            className="p-1.5 rounded-full transition-colors duration-200 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-200 flex-shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            ))
          )}
          
          {/* End of list message - inside scroll container */}
          {useLazyLoading && hasReachedEnd && filteredCalls.length > 0 && (
            <p className="text-xs text-gray-400 text-center pt-4 pb-2">
              You've reached the end of the call logs ({filteredCalls.length} total calls)
            </p>
          )}
        </div>

        {/* Pagination or Infinite Scroll Loading */}
        {filteredCalls.length > 0 && (
          useLazyLoading ? (
            <>
              {(isLoadingMore || loading) && (
                <div className="flex items-center justify-center space-x-2 py-3">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm text-gray-500">
                    {currentPage === 1 ? 'Loading calls...' : 'Loading more calls...'}
                  </span>
                </div>
              )}
              {hasMore && !hasReachedEnd && !loading && !isLoadingMore && filteredCalls.length > 0 && (
                <LazyLoader
                  hasMore={hasMore}
                  loading={isLoadingMore}
                  onLoadMore={handleLoadMore}
                  threshold={200}
                />
              )}
            </>
          ) : (
            totalPages > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalCalls}
                itemsPerPage={ITEMS_PER_PAGE}
                onPageChange={handlePageChange}
                loading={loading}
              />
            )
          )
        )}

        {/* Transcript Modal */}
        {selectedCall && (
          <CallTranscriptViewer
            callId={selectedCall.id}
            isOpen={showTranscript}
            onClose={handleCloseTranscript}
            call={selectedCall}
          />
        )}

        {/* Floating Action Button - Create Campaign */}
        {selectedCallIds.size > 0 && (
          <div className="fixed bottom-8 right-8 z-50">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="lg"
                    onClick={handleCreateCampaign}
                    disabled={isFetchingContacts}
                    className="h-14 px-6 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 bg-primary hover:bg-primary/90 text-white"
                  >
                    {isFetchingContacts ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Fetching...
                      </>
                    ) : (
                      <>
                        <PhoneCall className="w-5 h-5 mr-2" />
                        Create Campaign ({selectedCallIds.size})
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p>Create a campaign from {selectedCallIds.size} selected call{selectedCallIds.size !== 1 ? 's' : ''}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {getSelectedPhoneNumbers().length} unique phone number{getSelectedPhoneNumbers().length !== 1 ? 's' : ''}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>

      {/* Calling Modal, moved outside of the main div for correct JSX structure */}
      <CallingModal
        isOpen={showCallingModal}
        onClose={() => setShowCallingModal(false)}
        leadName={currentCallLead?.name}
        leadPhone={currentCallLead?.phone}
      />

      {/* Create Campaign Modal */}
      <CreateCampaignModal
        isOpen={isCreatingCampaign}
        onClose={() => {
          setIsCreatingCampaign(false);
          setSelectedContactIds([]);
          setSelectedCallIds(new Set()); // Clear selection after campaign creation
        }}
        preSelectedContacts={selectedContactIds}
      />
    </TooltipProvider>
  );
};

export default CallLogs;
