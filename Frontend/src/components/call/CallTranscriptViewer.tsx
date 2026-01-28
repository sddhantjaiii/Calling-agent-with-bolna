import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTheme } from '@/components/theme/ThemeProvider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Search,
  Download,
  Copy,
  Clock,
  User,
  Bot,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import apiService from '@/services/apiService';
import type { Transcript, Call } from '@/types';

interface CallTranscriptViewerProps {
  callId: string;
  isOpen: boolean;
  onClose: () => void;
  call?: Call;
  transcriptSource?: 'calls' | 'dialer';
}

interface TranscriptSegment {
  speaker: string;
  text: string;
  timestamp: number;
  confidence?: number;
}

interface SearchMatch {
  segmentIndex: number;
  matchStart: number;
  matchEnd: number;
  context: string;
}

const CallTranscriptViewer: React.FC<CallTranscriptViewerProps> = ({
  callId,
  isOpen,
  onClose,
  call,
  transcriptSource = 'calls',
}) => {
  const { theme } = useTheme();
  
  // State management
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [expandedSegments, setExpandedSegments] = useState<Set<number>>(new Set());
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [speakerFilter, setSpeakerFilter] = useState<string>('all');

  // Load transcript data
  useEffect(() => {
    if (isOpen && callId) {
      loadTranscript();
    }
  }, [isOpen, callId]);

  const loadTranscript = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = transcriptSource === 'dialer'
        ? await apiService.getPlivoDialerTranscript(callId)
        : await apiService.getCallTranscript(callId);
      if (response.success && response.data) {
        // Normalize backend shape (speaker_segments -> speakers, snake_case -> camelCase)
        const raw: any = response.data as any;
        const normalized = {
          id: raw.id,
          callId: raw.callId || raw.call_id,
          content: raw.content || '',
          speakers: (raw.speakers || raw.speaker_segments || []).map((s: any) => ({
            speaker: s.speaker,
            text: s.text || '',
            // Backend timestamps may be milliseconds; UI expects seconds. If value looks like ms, convert to s.
            timestamp: typeof s.timestamp === 'number' && s.timestamp > 10_000 ? Math.floor(s.timestamp / 1000) : (s.timestamp || 0),
            confidence: s.confidence,
          })),
          createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
          updatedAt: raw.updatedAt || raw.updated_at || raw.createdAt || raw.created_at || new Date().toISOString(),
        } as Transcript as any;
        setTranscript(normalized);
      } else {
        throw new Error(response.error?.message || 'Failed to load transcript');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load transcript';
      setError(errorMessage);
      console.error('Error loading transcript:', err);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Get unique speakers from transcript
  const speakers = useMemo(() => {
    if (!transcript?.speakers) return [];
    const uniqueSpeakers = Array.from(
      new Set(transcript.speakers.map(segment => segment.speaker))
    );
    return uniqueSpeakers.sort();
  }, [transcript]);

  // Filter segments based on speaker filter
  const filteredSegments = useMemo(() => {
    if (!transcript?.speakers) return [];
    if (speakerFilter === 'all') return transcript.speakers;
    return transcript.speakers.filter(segment => segment.speaker === speakerFilter);
  }, [transcript, speakerFilter]);

  // Search functionality
  useEffect(() => {
    if (!searchQuery.trim() || !transcript?.speakers) {
      setSearchMatches([]);
      setCurrentMatchIndex(0);
      return;
    }

    const query = searchQuery.toLowerCase();
    const matches: SearchMatch[] = [];

    filteredSegments.forEach((segment, index) => {
      const text = segment.text.toLowerCase();
      let searchIndex = 0;
      
      while (true) {
        const matchIndex = text.indexOf(query, searchIndex);
        if (matchIndex === -1) break;
        
        // Create context around the match
        const contextStart = Math.max(0, matchIndex - 50);
        const contextEnd = Math.min(text.length, matchIndex + query.length + 50);
        const context = segment.text.substring(contextStart, contextEnd);
        
        matches.push({
          segmentIndex: index,
          matchStart: matchIndex,
          matchEnd: matchIndex + query.length,
          context: contextStart > 0 ? '...' + context : context,
        });
        
        searchIndex = matchIndex + 1;
      }
    });

    setSearchMatches(matches);
    setCurrentMatchIndex(0);
  }, [searchQuery, filteredSegments]);

  // Format timestamp - handles various input formats
  const formatTimestamp = (timestamp: number | undefined | null): string => {
    if (timestamp === undefined || timestamp === null || isNaN(timestamp)) {
      return '';
    }
    // If timestamp looks like milliseconds (very large number), convert to seconds
    let seconds = timestamp;
    if (seconds > 86400) { // More than 24 hours in seconds, likely milliseconds
      seconds = Math.floor(seconds / 1000);
    }
    // Still too large? Probably an error, return empty
    if (seconds > 86400) {
      return '';
    }
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Get speaker icon
  const getSpeakerIcon = (speaker: string) => {
    const lowerSpeaker = speaker.toLowerCase();
    if (lowerSpeaker.includes('agent') || lowerSpeaker.includes('assistant')) {
      return <Bot className="w-4 h-4" />;
    }
    return <User className="w-4 h-4" />;
  };

  // Get speaker color
  const getSpeakerColor = (speaker: string) => {
    const lowerSpeaker = speaker.toLowerCase();
    if (lowerSpeaker.includes('agent') || lowerSpeaker.includes('assistant')) {
      return theme === 'dark' ? 'text-blue-400' : 'text-blue-600';
    }
    return theme === 'dark' ? 'text-green-400' : 'text-green-600';
  };

  // Highlight search matches in text
  const highlightSearchMatches = (text: string, segmentIndex: number) => {
    if (!searchQuery.trim()) return text;

    const matches = searchMatches.filter(match => match.segmentIndex === segmentIndex);
    if (matches.length === 0) return text;

    let highlightedText = text;
    let offset = 0;

    matches.forEach(match => {
      const beforeMatch = highlightedText.substring(0, match.matchStart + offset);
      const matchText = highlightedText.substring(
        match.matchStart + offset,
        match.matchEnd + offset
      );
      const afterMatch = highlightedText.substring(match.matchEnd + offset);

      const highlightClass = theme === 'dark' 
        ? 'bg-yellow-600/30 text-yellow-200' 
        : 'bg-yellow-200 text-yellow-800';

      highlightedText = beforeMatch + 
        `<mark class="${highlightClass} px-1 rounded">${matchText}</mark>` + 
        afterMatch;

      offset += `<mark class="${highlightClass} px-1 rounded"></mark>`.length - matchText.length;
    });

    return highlightedText;
  };

  // Navigation functions
  const navigateToMatch = (direction: 'next' | 'prev') => {
    if (searchMatches.length === 0) return;

    let newIndex;
    if (direction === 'next') {
      newIndex = (currentMatchIndex + 1) % searchMatches.length;
    } else {
      newIndex = currentMatchIndex === 0 ? searchMatches.length - 1 : currentMatchIndex - 1;
    }
    
    setCurrentMatchIndex(newIndex);
    
    // Scroll to the match
    const match = searchMatches[newIndex];
    const element = document.getElementById(`segment-${match.segmentIndex}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Copy transcript to clipboard
  const copyTranscript = async () => {
    if (!transcript?.speakers) return;

    const textContent = filteredSegments
      .map(segment => {
        const timestamp = showTimestamps ? `[${formatTimestamp(segment.timestamp)}] ` : '';
        return `${timestamp}${segment.speaker}: ${segment.text}`;
      })
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(textContent);
      toast.success('Transcript copied to clipboard');
    } catch (err) {
      toast.error('Failed to copy transcript');
    }
  };

  // Export transcript
  const exportTranscript = () => {
    if (!transcript?.speakers) return;

    const textContent = filteredSegments
      .map(segment => {
        const timestamp = showTimestamps ? `[${formatTimestamp(segment.timestamp)}] ` : '';
        return `${timestamp}${segment.speaker}: ${segment.text}`;
      })
      .join('\n\n');

    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${callId}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Transcript exported successfully');
  };

  // Toggle segment expansion
  const toggleSegmentExpansion = (index: number) => {
    const newExpanded = new Set(expandedSegments);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSegments(newExpanded);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`max-w-3xl h-[85vh] flex flex-col p-0 gap-0 ${
        theme === 'dark' 
          ? 'bg-slate-900 border-slate-800 text-slate-200' 
          : 'bg-white border-gray-200 text-gray-800'
      }`}>
        {/* Compact Header */}
        <div className={`px-4 py-3 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-lg flex-shrink-0 ${
              theme === "dark" ? "bg-emerald-700" : "bg-emerald-600"
            }`}>
              {call?.contactName?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold truncate">{call?.contactName || 'Unknown Contact'}</h2>
              <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>
                {call?.phoneNumber}
              </p>
            </div>
          </div>
          {/* Compact Badges Row */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="outline" className="text-xs py-0.5 px-2">
              <Clock className="w-3 h-3 mr-1" />
              {call?.durationSeconds ? formatTimestamp(call.durationSeconds) : '0:00'}
            </Badge>
            <Badge variant="outline" className="text-xs py-0.5 px-2">
              <Bot className="w-3 h-3 mr-1" />
              {call?.agentName || 'N/A'}
            </Badge>
            <Badge 
              variant="outline" 
              className={`text-xs py-0.5 px-2 ${
                call?.status === 'completed' 
                  ? 'border-green-500/50 text-green-600 dark:text-green-400' 
                  : ''
              }`}
            >
              {call?.status || 'N/A'}
            </Badge>
          </div>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin mr-3 text-slate-400" />
            <span className="text-slate-400">Loading transcript...</span>
          </div>
        )}

        {error && (
          <div className="flex-1 flex flex-col items-center justify-center p-4">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-red-500/50" />
              <h3 className="mt-2 text-lg font-medium">Failed to load transcript</h3>
              <p className={`mt-1 text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>{error}</p>
              <Button size="sm" onClick={loadTranscript} className="mt-4">
                Try Again
              </Button>
            </div>
          </div>
        )}

        {transcript && !loading && (
          <>
            {/* Compact Search & Controls */}
            <div className={`px-4 py-2 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'}`}>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search transcript..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                
                {searchMatches.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-400 mr-1">
                      {currentMatchIndex + 1}/{searchMatches.length}
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => navigateToMatch('prev')} className="w-7 h-7">
                      <ChevronUp className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => navigateToMatch('next')} className="w-7 h-7">
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </div>
                )}
                
                <div className="flex items-center gap-1 ml-auto">
                  <Button variant="ghost" size="sm" onClick={copyTranscript} className="h-8 px-2.5">
                    <Copy className="w-4 h-4 mr-1.5" /> Copy
                  </Button>
                  <Button variant="ghost" size="sm" onClick={exportTranscript} className="h-8 px-2.5">
                    <Download className="w-4 h-4 mr-1.5" /> Export
                  </Button>
                </div>
              </div>
            </div>

            {/* Transcript Content */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                {(!filteredSegments || filteredSegments.length === 0) ? (
                  <div className="text-center py-12 text-slate-400">
                    <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{speakerFilter === 'all' ? 'No transcript content available' : `No content for ${speakerFilter}`}</p>
                  </div>
                ) : (
                  filteredSegments.map((segment, index) => {
                    const isAgent = (segment.speaker || '').toLowerCase().includes('agent');
                    const isExpanded = expandedSegments.has(index);
                    const shouldTruncate = (segment.text || '').length > 300;
                    const displayText = shouldTruncate && !isExpanded ? (segment.text || '').substring(0, 300) + '...' : (segment.text || '');

                    return (
                      <div key={index} id={`segment-${index}`} className={`flex gap-2 ${isAgent ? 'justify-end' : 'justify-start'}`}>
                        {!isAgent && (
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 ${
                            theme === 'dark' ? 'bg-slate-600' : 'bg-slate-500'
                          }`}>
                            u
                          </div>
                        )}
                        <div className={`max-w-[75%] px-3 py-2 rounded-2xl ${
                          isAgent 
                            ? (theme === 'dark' ? 'bg-emerald-900/60 rounded-br-md' : 'bg-emerald-100 rounded-br-md') 
                            : (theme === 'dark' ? 'bg-slate-800 rounded-bl-md' : 'bg-gray-100 rounded-bl-md')
                        }`}>
                          <div className="flex items-center justify-between gap-3 mb-0.5">
                            <span className={`text-[11px] font-medium ${
                              isAgent 
                                ? (theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700') 
                                : (theme === 'dark' ? 'text-slate-400' : 'text-gray-600')
                            }`}>
                              {segment.speaker}
                            </span>
                            {showTimestamps && segment.timestamp !== undefined && formatTimestamp(segment.timestamp) && (
                              <span className={`text-[10px] ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`}>
                                {formatTimestamp(segment.timestamp)}
                              </span>
                            )}
                          </div>
                          <p 
                            className={`text-sm leading-relaxed ${theme === 'dark' ? 'text-slate-200' : 'text-gray-800'}`}
                            dangerouslySetInnerHTML={{ __html: highlightSearchMatches(displayText, index) }}
                          />
                          {shouldTruncate && (
                            <Button
                              variant="link"
                              size="sm"
                              onClick={() => toggleSegmentExpansion(index)}
                              className="p-0 h-auto text-xs mt-1"
                            >
                              {isExpanded ? 'Show less' : 'Show more'}
                            </Button>
                          )}
                        </div>
                        {isAgent && (
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 ${
                            theme === 'dark' ? 'bg-emerald-700' : 'bg-emerald-600'
                          }`}>
                            A
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CallTranscriptViewer;