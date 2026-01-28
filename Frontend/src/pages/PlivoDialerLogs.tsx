import React, { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Play,
  FileText,
  Pause,
  Search,
  Volume2,
  Volume1,
  VolumeX,
  Filter,
  Check,
  Calendar,
  User,
  Phone,
  Loader2,
} from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import API_ENDPOINTS from "@/config/api";
import { authenticatedFetch } from "@/utils/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import CallTranscriptViewer from "@/components/call/CallTranscriptViewer";
import { DateRangePicker } from "@/components/common/DateRangePicker";
import { formatDateInUserTimezone } from "@/utils/timezone";
import apiService from "@/services/apiService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// --- Types ---
type PlivoCallLog = {
  id: string;
  from_phone_number: string;
  to_phone_number: string;
  status: string;
  status_updated_at: string | null;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  hangup_by: string | null;
  hangup_reason: string | null;
  plivo_call_uuid: string | null;
  created_at: string;
  updated_at: string;
  team_member_name: string | null;
  contact_id?: string | null;
  contact_name?: string | null;
  initiated_at?: string | null;
  recording_status?: string | null;
  recording_url?: string | null;
  recording_duration_seconds?: number | null;
  transcript_status?: string | null;
  transcript_updated_at?: string | null;
  lead_extraction_status?: string | null;
  lead_extraction_updated_at?: string | null;
  lead_individual_analysis?: unknown | null;
  lead_complete_analysis?: unknown | null;
};

// --- Helper Components ---

// Excel-like Column Filter Component matches the one in CallLogs.tsx
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

// --- Main Component ---

export default function PlivoDialerLogs() {
  const { theme } = useTheme();
  
  // -- Data Loading --
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["dialer", "callLogs", "logs-page"],
    queryFn: async (): Promise<PlivoCallLog[]> => {
      const url = `${API_ENDPOINTS.PLIVO_DIALER.CALLS}?limit=200`;
      const resp = await authenticatedFetch(url);
      if (!resp.ok) {
        throw new Error(`Failed to load dialer logs (${resp.status})`);
      }
      const json = await resp.json();
      return (json?.data || []) as PlivoCallLog[];
    },
  });

  const [selectedTranscriptCallId, setSelectedTranscriptCallId] = useState<string | null>(null);
  const [selectedLeadCallId, setSelectedLeadCallId] = useState<string | null>(null);

  // -- Filter State --
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [columnFilters, setColumnFilters] = useState<{
    status: string[];
    teamMember: string[];
  }>({
    status: [],
    teamMember: [],
  });
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [sortBy, setSortBy] = useState<'created_at' | 'duration_seconds'>('created_at');

  // -- Audio State --
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioProgressRef = useRef<{ [key: string]: { current: number; total: number } }>({});
  const [forceUpdate, setForceUpdate] = useState(0); 
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showVolumeControl, setShowVolumeControl] = useState(false);

  // -- Lead Intelligence Query --
  const leadQuery = useQuery({
    queryKey: ["dialer", "callLogs", "lead-intelligence", selectedLeadCallId],
    enabled: !!selectedLeadCallId,
    queryFn: async () => {
      if (!selectedLeadCallId) return null;
      const resp = await apiService.getPlivoDialerLeadIntelligence(selectedLeadCallId);
      return (resp?.data || null) as any;
    },
  });

  // -- Helper Functions --

  function getBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
    const s = status.toLowerCase();
    // Successful calls
    if (s === "completed") return "secondary";
    // In progress
    if (s.includes("ring") || s.includes("progress") || s.includes("answer") || s === "initiated") return "default";
    // Failed/Error states
    if (s.includes("fail") || s.includes("error") || s === "rejected" || s === "invalid_number") return "destructive";
    // No answer / Busy states
    if (s === "busy" || s === "no_answer" || s === "not_answered") return "outline";
    return "outline";
  }

  function getStatusColor(status: string) {
    const s = status.toLowerCase();
    // Successful calls
    if (s === "completed") return "bg-emerald-500 border-emerald-500";
    // In progress
    if (s.includes("ring") || s.includes("progress") || s.includes("answer") || s === "initiated") return "bg-blue-500 border-blue-500";
    // Failed/Error states
    if (s.includes("fail") || s.includes("error") || s === "rejected" || s === "invalid_number") return "bg-red-500 border-red-500";
    // Busy state
    if (s === "busy") return "bg-yellow-500 border-yellow-500";
    // No answer states
    if (s === "no_answer" || s === "not_answered") return "bg-orange-500 border-orange-500";
    return "bg-gray-400 border-gray-400";
  }

  function getStatusLabel(status: string): string {
    const s = status.toLowerCase();
    // Map status codes to user-friendly labels
    const statusMap: Record<string, string> = {
      'completed': 'Completed',
      'busy': 'Busy',
      'no_answer': 'No Answer',
      'not_answered': 'Not Answered',
      'rejected': 'Rejected',
      'failed': 'Failed',
      'network_error': 'Network Error',
      'invalid_number': 'Invalid Number',
      'initiated': 'Initiated',
      'ringing': 'Ringing',
      'in_progress': 'In Progress',
      'answered': 'Answered'
    };
    return statusMap[s] || status;
  }

  function formatDuration(seconds: number | null) {
    if (!seconds && seconds !== 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  // -- Audio Handlers --

  const handleCloseAudio = () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = ""; // Clean up source
        audioRef.current = null;
      }
      setPlayingAudio(null);
      setIsAudioLoading(null);
    };

  const handlePlayAudio = async (callId: string, audioUrl: string | null) => {
    // 1. Toggle Play/Pause if same audio
    if (playingAudio === callId && audioRef.current) {
      if (audioRef.current.paused) {
        await audioRef.current.play();
      } else {
        audioRef.current.pause();
      }
      setForceUpdate(prev => prev + 1);
      return;
    }

    // 2. Play New Audio
    if (audioRef.current) {
      handleCloseAudio();
    }

    if (!audioUrl) return;

    try {
      setIsAudioLoading(callId);
      setPlayingAudio(callId);
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.volume = isMuted ? 0 : volume;

      audio.onloadedmetadata = () => {
        audioProgressRef.current[callId] = {
          current: 0,
          total: audio.duration,
        };
        setIsAudioLoading(null);
        setForceUpdate(prev => prev + 1);
        audio.play().catch(console.error);
      };

      audio.ontimeupdate = () => {
        audioProgressRef.current[callId] = {
          current: audio.currentTime,
          total: audio.duration,
        };
        setForceUpdate(prev => prev + 1);
      };

      audio.onended = () => {
        setPlayingAudio(null);
        setForceUpdate(prev => prev + 1);
      };

      audio.onerror = (e) => {
        console.error("Audio playback error", e);
        setIsAudioLoading(null);
        setPlayingAudio(null);
      };

    } catch (err) {
      console.error(err);
      setIsAudioLoading(null);
      setPlayingAudio(null);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>, callId: string) => {
    if (!audioRef.current || playingAudio !== callId) return;
    
    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.min(Math.max(x / rect.width, 0), 1);
    
    const newTime = percentage * (audioRef.current.duration || 0);
    audioRef.current.currentTime = newTime;
    
    // Update progress state immediately for responsiveness
    if (audioProgressRef.current[callId]) {
      audioProgressRef.current[callId].current = newTime;
      setForceUpdate(prev => prev + 1);
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
      setIsMuted(newVolume === 0);
    }
  };

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);


  // -- Filtering & Sorting --

  const filtered = useMemo(() => {
    let result = data || [];

    // 1. Text Search
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      result = result.filter((r) => {
        const haystack = [
          r.from_phone_number,
          r.to_phone_number,
          r.status,
          r.team_member_name || "",
          r.contact_name || "",
          r.plivo_call_uuid || "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      });
    }

    // 2. Date Range
    if (startDate) {
      result = result.filter(r => new Date(r.created_at) >= startDate);
    }
    if (endDate) {
      // Set to end of day
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      result = result.filter(r => new Date(r.created_at) <= end);
    }

    // 3. Status Filter
    if (columnFilters.status.length > 0) {
      result = result.filter(r => columnFilters.status.includes(r.status));
    }

    // 4. Team Member Filter
    if (columnFilters.teamMember.length > 0) {
      result = result.filter(r => 
        r.team_member_name && columnFilters.teamMember.includes(r.team_member_name)
      );
    }

    // 5. Sorting
    result.sort((a, b) => {
      let valA: any = a[sortBy];
      let valB: any = b[sortBy];

      if (sortBy === 'created_at') {
        valA = new Date(a.created_at).getTime();
        valB = new Date(b.created_at).getTime();
      }

      if (valA < valB) return sortOrder === 'ASC' ? -1 : 1;
      if (valA > valB) return sortOrder === 'ASC' ? 1 : -1;
      return 0;
    });

    return result;
  }, [data, search, startDate, endDate, columnFilters, sortBy, sortOrder]);


  // Unique lists for filters
  const uniqueStatuses = useMemo(() => {
    const statuses = new Set((data || []).map(r => r.status));
    return Array.from(statuses).map(s => ({ value: s, label: s }));
  }, [data]);

  const uniqueTeamMembers = useMemo(() => {
    const members = new Set((data || []).map(r => r.team_member_name).filter(Boolean) as string[]);
    return Array.from(members).map(m => ({ value: m, label: m }));
  }, [data]);


  return (
    <div className="p-6 space-y-6">
      {/* Header & Controls */}
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dialer Logs</h2>
          <p className="text-muted-foreground">
             Manual calls made efficiently.
          </p>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${theme === "dark" ? "text-slate-400" : "text-gray-500"}`} />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search phone, name, status..."
                className="pl-9 h-9"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
             {/* Date Range */}
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onDateChange={(start, end) => {
                setStartDate(start);
                setEndDate(end);
              }}
              placeholder="Filter by Date"
            />
            
            {/* Status Filter */}
            <ExcelColumnFilter
              title="Status"
              options={uniqueStatuses}
              selectedValues={columnFilters.status}
              onSelectionChange={(vals) => setColumnFilters(prev => ({ ...prev, status: vals }))}
            />

            {/* Team Member Filter */}
            {uniqueTeamMembers.length > 0 && (
              <ExcelColumnFilter
                title="Team Member"
                options={uniqueTeamMembers}
                selectedValues={columnFilters.teamMember}
                onSelectionChange={(vals) => setColumnFilters(prev => ({ ...prev, teamMember: vals }))}
              />
            )}
            
            <div className="ml-auto flex items-center gap-2">
               <Select value={sortBy} onValueChange={(v: any) => {
                  if (v === sortBy) {
                      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
                  } else {
                      setSortBy(v);
                      setSortOrder('DESC');
                  }
               }}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Date</SelectItem>
                  <SelectItem value="duration_seconds">Duration</SelectItem>
                </SelectContent>
              </Select>
              <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC')}
                  className="w-9 h-9"
                >
                  {sortOrder === 'ASC' ? '↑' : '↓'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                    Refresh
                </Button>
            </div>
          </div>
        </div>
      </div>


      {/* Main List */}
      <div className="space-y-4">
         {isLoading ? (
             <div className="space-y-4">
                 {[1,2,3].map(i => (
                    <Card key={i} className="p-4 h-24 animate-pulse bg-muted/50" />
                 ))}
             </div>
         ) : filtered.length === 0 ? (
            <Card className="p-12 text-center">
              <Phone className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium">No calls found</h3>
              <p className="text-muted-foreground">Try adjusting your filters.</p>
            </Card>
         ) : (
             filtered.map(call => (
                 <Card 
                  key={call.id} 
                  className={`overflow-hidden transition-all duration-200 hover:shadow-md ${
                      playingAudio === call.id ? 'ring-2 ring-primary ring-offset-1' : ''
                  }`}
                 >
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        
                         {/* Checkbox placement - kept layout but disabled checkbox as simpler version */}

                         {/* Left: Contact Info */}
                         <div className="flex items-center gap-3 min-w-0 flex-1">
                             {/* Avatar */}
                             <div className="relative flex-shrink-0">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg bg-indigo-600`}>
                                   {call.contact_name ? call.contact_name.charAt(0).toUpperCase() : (call.to_phone_number?.charAt(1) || 'U')}
                                </div>
                                <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900 ${getStatusColor(call.status)}`}></span>
                             </div>

                             <div className="min-w-0 flex-1">
                                <h3 className="font-semibold text-base truncate">
                                   {call.contact_name || "Unknown"}
                                </h3>
                                <p className="text-sm font-medium text-muted-foreground">
                                    {call.to_phone_number} <span className="text-xs ml-1 opacity-70">via {call.from_phone_number}</span>
                                </p>
                                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        {formatDateInUserTimezone(call.created_at)}
                                    </span>
                                    {call.team_member_name && (
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <User className="w-3 h-3" />
                                            {call.team_member_name}
                                        </span>
                                    )}
                                </div>
                             </div>
                         </div>

                         {/* Center: Stats (Desktop) */}
                         <div className="hidden md:flex items-center gap-8 flex-shrink-0">
                             <div className="text-center min-w-[80px]">
                                 <p className="text-[10px] uppercase tracking-wider mb-0.5 text-muted-foreground">Status</p>
                                 <Badge variant={getBadgeVariant(call.status)} className="text-[10px]">
                                   {getStatusLabel(call.status)}
                                 </Badge>
                             </div>
                             <div className="text-center min-w-[60px]">
                                 <p className="text-[10px] uppercase tracking-wider mb-0.5 text-muted-foreground">Duration</p>
                                 <p className="text-sm font-mono font-medium">
                                     {formatDuration(call.duration_seconds)}
                                 </p>
                             </div>
                             {call.hangup_by && (
                                 <div className="text-center min-w-[80px]">
                                     <p className="text-[10px] uppercase tracking-wider mb-0.5 text-muted-foreground">Ended By</p>
                                     <p className="text-sm font-medium text-muted-foreground capitalize">
                                         {call.hangup_by}
                                     </p>
                                 </div>
                             )}
                         </div>

                         {/* Right: Actions */}
                         <div className="flex items-center gap-2 flex-shrink-0">
                             {/* Transcript Button */}
                             <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setSelectedTranscriptCallId(call.id)}
                                            disabled={call.transcript_status !== "completed"}
                                            className="h-9 w-9"
                                        >
                                            <FileText className={`w-4 h-4 ${call.transcript_status === "completed" ? "text-primary" : "text-muted-foreground"}`} />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>View Transcript</TooltipContent>
                                </Tooltip>
                             </TooltipProvider>
                             
                              {/* Lead Intelligence Button */}
                              {/* Using generic icon for Lead Intel currently or maybe integrate it differently later */}
                              <TooltipProvider>
                                  <Tooltip>
                                      <TooltipTrigger asChild>
                                          <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => setSelectedLeadCallId(call.id)}
                                              disabled={call.lead_extraction_status !== "completed"}
                                               className="h-9 w-9"
                                          >
                                              <Search className={`w-4 h-4 ${call.lead_extraction_status === "completed" ? "text-blue-500" : "text-muted-foreground"}`} />
                                          </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Lead Intelligence</TooltipContent>
                                  </Tooltip>
                              </TooltipProvider>

                             {/* Play Button */}
                             {call.recording_url && (
                                 <TooltipProvider>
                                     <Tooltip>
                                         <TooltipTrigger asChild>
                                             <Button
                                                 size="icon"
                                                 variant={playingAudio === call.id ? "default" : "outline"}
                                                 className={`h-9 w-9 rounded-full ${playingAudio === call.id ? 'bg-[#1A6262] hover:bg-[#155050] text-white border-0' : 'bg-transparent'}`}
                                                 onClick={() => handlePlayAudio(call.id, call.recording_url || null)}
                                             >
                                                 {playingAudio === call.id && !audioRef.current?.paused ? (
                                                     <Pause className="w-4 h-4" />
                                                 ) : (
                                                     <Play className="w-4 h-4" />
                                                 )}
                                             </Button>
                                         </TooltipTrigger>
                                         <TooltipContent>Play Recording</TooltipContent>
                                     </Tooltip>
                                 </TooltipProvider>
                             )}
                         </div>

                      </div>

                      {/* Info Row Mobile */}
                      <div className="flex md:hidden items-center gap-4 mt-3 pt-3 border-t border-border">
                            <Badge variant={getBadgeVariant(call.status)} className="text-[10px]">
                              {getStatusLabel(call.status)}
                            </Badge>
                            <span className="text-xs font-mono text-muted-foreground">
                                {formatDuration(call.duration_seconds)}
                            </span>
                      </div>
                    </div>

                    {/* Audio Player Drawer */}
                    {(playingAudio === call.id || isAudioLoading === call.id) && (
                        <div className={`px-4 py-3 border-t ${theme === 'dark' ? 'bg-slate-950/50 border-slate-800' : 'bg-gray-50 border-gray-100'}`}>
                             <div className="flex items-center gap-4">
                                 {isAudioLoading === call.id ? (
                                     <div className="flex items-center justify-center w-full h-10 gap-3 text-muted-foreground">
                                         <Loader2 className="w-4 h-4 animate-spin" />
                                         <span className="text-sm">Loading Audio...</span>
                                     </div>
                                 ) : (
                                     <>
                                        <button
                                            onClick={() => handlePlayAudio(call.id, call.recording_url || null)}
                                            className="w-8 h-8 rounded-full flex items-center justify-center bg-[#1A6262] text-white hover:bg-[#155050] transition-colors shadow-sm flex-shrink-0"
                                        >
                                            {audioRef.current?.paused ? <Play className="w-4 h-4 pl-0.5" /> : <Pause className="w-4 h-4" />}
                                        </button>

                                        {/* Progress Bar */}
                                        <div className="flex items-center gap-3 flex-1">
                                            <div 
                                                className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 cursor-pointer relative"
                                                onClick={(e) => handleSeek(e, call.id)}
                                            >
                                                <div 
                                                    className="h-1.5 rounded-full bg-[#1A6262] absolute top-0 left-0 transition-all duration-100"
                                                    style={{ 
                                                        width: `${((audioProgressRef.current[call.id]?.current || 0) / (audioRef.current?.duration || 1)) * 100}%` 
                                                    }}
                                                />
                                            </div>
                                            <div className="text-xs font-mono text-muted-foreground min-w-[70px] text-right">
                                                {formatDuration(audioProgressRef.current[call.id]?.current || 0)} / {formatDuration((audioRef.current?.duration || call.duration_seconds || 0))}
                                            </div>
                                        </div>

                                        {/* Volume Control */}
                                         <div
                                            className="flex items-center gap-2 flex-shrink-0 group relative"
                                            onMouseEnter={() => setShowVolumeControl(true)}
                                            onMouseLeave={() => setShowVolumeControl(false)}
                                         >
                                            <button 
                                                onClick={toggleMute} 
                                                className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                            >
                                                {isMuted || volume === 0 ? (
                                                    <VolumeX className="w-4 h-4 text-muted-foreground" />
                                                ) : volume < 0.5 ? (
                                                    <Volume1 className="w-4 h-4 text-muted-foreground" />
                                                ) : (
                                                    <Volume2 className="w-4 h-4 text-muted-foreground" />
                                                )}
                                            </button>
                                            
                                            {/* Volume Slider Popover */}
                                            {showVolumeControl && (
                                                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pl-2 hidden group-hover:block z-10">
                                                    <div className="bg-popover border shadow-md rounded-md p-2 w-24">
                                                        <input
                                                            type="range"
                                                            min="0"
                                                            max="1"
                                                            step="0.05"
                                                            value={isMuted ? 0 : volume}
                                                            onChange={handleVolumeChange}
                                                            className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#1A6262]"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                         </div>
                                     </>
                                 )}
                             </div>
                        </div>
                    )}
                 </Card>
             ))
         )}
      </div>

      {/* Dialogs */}
      {selectedTranscriptCallId && (
        <CallTranscriptViewer
          callId={selectedTranscriptCallId}
          isOpen={true}
          onClose={() => setSelectedTranscriptCallId(null)}
          transcriptSource="dialer"
        />
      )}

      <Dialog open={!!selectedLeadCallId} onOpenChange={(open) => (!open ? setSelectedLeadCallId(null) : null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lead Intelligence</DialogTitle>
          </DialogHeader>
          
          {leadQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : leadQuery.isError ? (
            <div className="text-destructive text-center py-4">Failed to load data.</div>
          ) : !leadQuery.data ? (
            <div className="text-muted-foreground text-center py-4">No analysis available.</div>
          ) : (
             <div className="space-y-6">
                <div className="flex items-center gap-2">
                    <Badge variant={leadQuery.data.lead_extraction_status === "completed" ? "secondary" : "outline"}>
                        Status: {leadQuery.data.lead_extraction_status}
                    </Badge>
                     {leadQuery.data.lead_extraction_updated_at && (
                        <span className="text-xs text-muted-foreground">
                            Last Updated: {formatDateInUserTimezone(leadQuery.data.lead_extraction_updated_at)}
                        </span>
                    )}
                </div>

                 {leadQuery.data.lead_extraction_error && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-md text-sm">
                        {String(leadQuery.data.lead_extraction_error)}
                    </div>
                )}
                
                <div className="grid grid-cols-1 gap-4">
                    <Card>
                        <div className="p-3 border-b bg-muted/30 font-medium text-sm">Individual Analysis</div>
                        <div className="p-0">
                            <pre className="text-xs p-4 overflow-auto max-h-[300px] bg-slate-950 text-slate-50">
                                {JSON.stringify(leadQuery.data.lead_individual_analysis ?? {}, null, 2)}
                            </pre>
                        </div>
                    </Card>
                    <Card>
                        <div className="p-3 border-b bg-muted/30 font-medium text-sm">Complete Analysis</div>
                         <div className="p-0">
                            <pre className="text-xs p-4 overflow-auto max-h-[300px] bg-slate-950 text-slate-50">
                                {JSON.stringify(leadQuery.data.lead_complete_analysis ?? {}, null, 2)}
                            </pre>
                        </div>
                    </Card>
                </div>
             </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
