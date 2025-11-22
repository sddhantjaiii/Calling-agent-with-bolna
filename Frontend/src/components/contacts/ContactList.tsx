import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Phone,
  MessageSquare,
  Mail,
  Search,
  Filter,
  Plus,
  Upload,
  MoreHorizontal,
  Edit,
  Trash2,
  PhoneCall,
  Loader2,
  PhoneIncoming,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useContacts } from '@/hooks/useContacts';
import { useToast } from '@/components/ui/use-toast';
import DeleteContactDialog from './DeleteContactDialog';
import BulkContactUpload from './BulkContactUpload';
import { CallAgentModal } from './CallAgentModal';
import CreateCampaignModal from '@/components/campaigns/CreateCampaignModal';
import type { Contact, ContactsListOptions } from '@/types';

interface ContactListProps {
  onContactSelect?: (contact: Contact) => void;
  onContactEdit?: (contact: Contact) => void;
  onContactCreate?: () => void;
  useLazyLoading?: boolean;
  initialPageSize?: number;
  enableInfiniteScroll?: boolean;
}

// Constants
const ITEMS_PER_BATCH = 100; // Load 100 contacts per batch
const LOAD_TRIGGER_OFFSET = 10; // Trigger next load when within 10 items of end

export const ContactList: React.FC<ContactListProps> = ({
  onContactSelect,
  onContactEdit,
  onContactCreate,
  useLazyLoading = false,
  initialPageSize = 100,
  enableInfiniteScroll = true,
}) => {
  const { toast } = useToast();
  
  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'phone_number' | 'created_at'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentOffset, setCurrentOffset] = useState(0);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [allLoadedContacts, setAllLoadedContacts] = useState<Contact[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'auto_created' | 'linked_to_calls'>('all');
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // New filters
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedLastStatus, setSelectedLastStatus] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedOriginalStatus, setSelectedOriginalStatus] = useState<string>('all');
  
  // Bulk selection state
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [campaignPreselectedContacts, setCampaignPreselectedContacts] = useState<string[]>([]);

  // Debug modal state
  useEffect(() => {
    console.log('📊 Campaign Modal State:', {
      isOpen: isCampaignModalOpen,
      preSelectedContacts: campaignPreselectedContacts,
    });
  }, [isCampaignModalOpen, campaignPreselectedContacts]);

  // Refs
  const lastLoadedOffsetRef = useRef<number>(-1); // Track last loaded offset
  const observerRef = useRef<IntersectionObserver | null>(null);
  const triggerElementRef = useRef<HTMLDivElement | null>(null);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentOffset(0); // Reset to first batch
      setAllLoadedContacts([]); // Clear loaded contacts
      lastLoadedOffsetRef.current = -1; // Reset tracker
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Prepare options for useContacts hook
  const contactsOptions: ContactsListOptions = {
    search: debouncedSearchTerm,
    sortBy,
    sortOrder,
    limit: ITEMS_PER_BATCH,
    offset: currentOffset,
  };

  // Fetch contacts
  const {
    contacts,
    pagination,
    loading,
    error,
    deleting,
    refreshContacts,
    deleteContact,
    clearError,
  } = useContacts(contactsOptions);

  // Determine if there are more contacts to load
  const hasMore = pagination?.hasMore ?? false;
  const totalContacts = pagination?.total ?? 0;

  // Handle infinite scroll vs traditional pagination
  const displayContacts = enableInfiniteScroll ? allLoadedContacts : contacts;

  // Apply filter
  const filteredContacts = displayContacts.filter(contact => {
    if (filterType === 'auto_created' && !contact.isAutoCreated) return false;
    if (filterType === 'linked_to_calls' && contact.linkedCallId == null) return false;
    
    // Tag filter
    if (selectedTags.length > 0) {
      const contactTags = contact.tags || [];
      const hasMatchingTag = selectedTags.some(tag => contactTags.includes(tag));
      if (!hasMatchingTag) return false;
    }
    
    // Last Status filter
    if (selectedLastStatus !== 'all' && contact.lastCallStatus !== selectedLastStatus) {
      return false;
    }
    
    // Source filter
    if (selectedSource !== 'all') {
      if (selectedSource === 'webhook' && contact.autoCreationSource !== 'webhook') return false;
      if (selectedSource === 'manual' && contact.autoCreationSource !== 'manual') return false;
      if (selectedSource === 'bulk_upload' && contact.autoCreationSource !== 'bulk_upload') return false;
    }
    
    // Original Status filter
    if (selectedOriginalStatus !== 'all' && contact.originalStatus !== selectedOriginalStatus) {
      return false;
    }
    
    return true;
  });

  // Update accumulated contacts when new batch arrives
  useEffect(() => {
    if (!enableInfiniteScroll) return;
    
    // Skip if no contacts or empty result when we already have contacts loaded
    if (contacts.length === 0) {
      if (allLoadedContacts.length > 0) {
        console.log('⏭️ Skipping empty batch - keeping existing contacts');
      }
      return;
    }

    // Skip if we've already processed this offset
    if (lastLoadedOffsetRef.current === currentOffset) {
      console.log('⏭️ Batch already processed:', currentOffset);
      return;
    }

    if (currentOffset === 0) {
      // Initial load
      console.log('✅ Initial batch loaded:', contacts.length);
      setAllLoadedContacts(contacts);
      lastLoadedOffsetRef.current = 0;
      setIsLoadingMore(false);
    } else {
      // Append new batch
      setAllLoadedContacts(prev => {
        const existingIds = new Set(prev.map(c => c.id));
        const newContacts = contacts.filter(c => !existingIds.has(c.id));
        
        if (newContacts.length > 0) {
          console.log('➕ Appending batch:', {
            previous: prev.length,
            new: newContacts.length,
            total: prev.length + newContacts.length,
          });
          lastLoadedOffsetRef.current = currentOffset;
          setIsLoadingMore(false);
          return [...prev, ...newContacts];
        }
        
        setIsLoadingMore(false);
        return prev;
      });
    }
  }, [contacts, currentOffset, enableInfiniteScroll, allLoadedContacts.length]);

  // Load more contacts
  const loadMoreContacts = useCallback(() => {
    if (!enableInfiniteScroll || isLoadingMore || !hasMore || loading) return;
    
    const nextOffset = currentOffset + ITEMS_PER_BATCH;
    console.log('🔄 Loading next batch:', {
      currentOffset,
      nextOffset,
      currentLoaded: allLoadedContacts.length,
    });
    
    setIsLoadingMore(true);
    setCurrentOffset(nextOffset);
  }, [currentOffset, isLoadingMore, hasMore, loading, enableInfiniteScroll, allLoadedContacts.length]);

  // Setup Intersection Observer for trigger element
  useEffect(() => {
    if (!enableInfiniteScroll || !triggerElementRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          console.log('👀 Trigger element visible - loading more');
          loadMoreContacts();
        }
      },
      {
        root: null,
        rootMargin: '200px',
        threshold: 0,
      }
    );

    observerRef.current.observe(triggerElementRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [enableInfiniteScroll, loadMoreContacts]);

  // Handlers
  const handleDeleteClick = (contact: Contact) => {
    setContactToDelete(contact);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!contactToDelete) return;

    const success = await deleteContact(contactToDelete.id);
    if (success) {
      toast({
        title: 'Success',
        description: 'Contact deleted successfully',
      });
      setIsDeleteDialogOpen(false);
      setContactToDelete(null);
      refreshContacts(contactsOptions);
    } else {
      toast({
        title: 'Error',
        description: 'Failed to delete contact',
        variant: 'destructive',
      });
    }
  };

  const handleBulkUploadSuccess = () => {
    refreshContacts(contactsOptions);
    toast({
      title: 'Success',
      description: 'Contacts uploaded successfully',
    });
  };

  const handleCallClick = (contact: Contact) => {
    setSelectedContact(contact);
    setIsAgentModalOpen(true);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = filteredContacts.map(c => c.id);
      setSelectedContactIds(new Set(allIds));
    } else {
      setSelectedContactIds(new Set());
    }
  };

  const handleSelectContact = (contactId: string, checked: boolean) => {
    const newSet = new Set(selectedContactIds);
    if (checked) {
      newSet.add(contactId);
    } else {
      newSet.delete(contactId);
    }
    setSelectedContactIds(newSet);
  };

  const handleCreateCampaign = () => {
    console.log('🎯 Create Campaign clicked');
    const selected = Array.from(selectedContactIds);
    console.log('📋 Selected contacts:', selected);
    if (selected.length === 0) {
      toast({
        title: 'No contacts selected',
        description: 'Please select at least one contact',
        variant: 'destructive',
      });
      return;
    }
    console.log('✅ Setting campaign modal open with contacts:', selected);
    setCampaignPreselectedContacts(selected);
    setIsCampaignModalOpen(true);
  };

  const handleSortChange = (newSortBy: 'name' | 'phone_number' | 'created_at') => {
    if (sortBy === newSortBy) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('asc');
    }
  };

  // Helper: Map source to display name
  const getSourceLabel = (source?: string) => {
    if (source === 'webhook') return 'Inbound Call';
    if (source === 'manual') return 'Manual Entry';
    if (source === 'bulk_upload') return 'Excel Upload';
    return '-';
  };

  // Helper: Get all unique tags from contacts
  const allUniqueTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    displayContacts.forEach(contact => {
      (contact.tags || []).forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [displayContacts]);

  // Helper: Get all unique statuses
  const allUniqueStatuses = React.useMemo(() => {
    const statusSet = new Set<string>();
    displayContacts.forEach(contact => {
      if (contact.lastCallStatus) statusSet.add(contact.lastCallStatus);
    });
    return Array.from(statusSet).sort();
  }, [displayContacts]);

  // Calculate trigger position (10 items before end)
  const triggerPosition = Math.max(0, filteredContacts.length - LOAD_TRIGGER_OFFSET);

  return (
    <div className="h-full flex flex-col">
      <Card className="flex-1 flex flex-col overflow-hidden">
        {/* Fixed Header */}
        <CardHeader className="flex-shrink-0 border-b">
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Contacts ({totalContacts})</CardTitle>
            <div className="flex gap-2">
              {selectedContactIds.size > 0 && (
                <Button
                  onClick={handleCreateCampaign}
                  variant="default"
                  size="sm"
                >
                  Create Campaign ({selectedContactIds.size})
                </Button>
              )}
              <Button
                onClick={() => setIsBulkUploadOpen(true)}
                variant="outline"
                size="sm"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload CSV
              </Button>
              <Button
                onClick={onContactCreate}
                size="sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Contact
              </Button>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="space-y-3">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search contacts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select
                value={filterType}
                onValueChange={(value: any) => setFilterType(value)}
              >
                <SelectTrigger className="w-48">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Contacts</SelectItem>
                  <SelectItem value="auto_created">Auto Created</SelectItem>
                  <SelectItem value="linked_to_calls">Linked to Calls</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Additional Filters Row */}
            <div className="flex gap-2 flex-wrap">
              {/* Tags Filter */}
              <Select
                value={selectedTags.length > 0 ? 'custom' : 'all'}
                onValueChange={(value) => {
                  if (value === 'all') setSelectedTags([]);
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Tags" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tags</SelectItem>
                  {allUniqueTags.map((tag) => (
                    <div key={tag} className="px-2 py-1.5 hover:bg-gray-100 cursor-pointer flex items-center gap-2">
                      <Checkbox
                        checked={selectedTags.includes(tag)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedTags([...selectedTags, tag]);
                          } else {
                            setSelectedTags(selectedTags.filter(t => t !== tag));
                          }
                        }}
                      />
                      <span className="text-sm">#{tag}</span>
                    </div>
                  ))}
                </SelectContent>
              </Select>

              {/* Last Status Filter */}
              <Select
                value={selectedLastStatus}
                onValueChange={setSelectedLastStatus}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {allUniqueStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Source Filter */}
              <Select
                value={selectedSource}
                onValueChange={setSelectedSource}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="webhook">Inbound Call</SelectItem>
                  <SelectItem value="manual">Manual Entry</SelectItem>
                  <SelectItem value="bulk_upload">Excel Upload</SelectItem>
                </SelectContent>
              </Select>

              {/* Original Status Filter */}
              <Select
                value={selectedOriginalStatus}
                onValueChange={setSelectedOriginalStatus}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Original Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Original Status</SelectItem>
                  <SelectItem value="outbound">Outbound</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                  <SelectItem value="callback_received">Callback Received</SelectItem>
                  <SelectItem value="not_contacted">Not Contacted</SelectItem>
                </SelectContent>
              </Select>

              {/* Clear Filters Button */}
              {(selectedTags.length > 0 || selectedLastStatus !== 'all' || selectedSource !== 'all' || selectedOriginalStatus !== 'all') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedTags([]);
                    setSelectedLastStatus('all');
                    setSelectedSource('all');
                    setSelectedOriginalStatus('all');
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Scrollable Content Area */}
        <CardContent className="flex-1 overflow-hidden p-0 relative">
          {/* Loading overlay for initial load */}
          {loading && allLoadedContacts.length === 0 && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-20 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                <p>Loading contacts...</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && allLoadedContacts.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Card className="m-4">
                <CardContent className="pt-6">
                  <p className="text-red-500 mb-4">{error}</p>
                  <Button onClick={() => refreshContacts(contactsOptions)}>
                    Retry
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Contacts Table with Scrollable Body */}
          <div className="h-full overflow-auto">
            <table className="w-full">
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr className="border-b" style={{ backgroundColor: 'hsl(var(--background))' }}>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-12" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>
                    <Checkbox
                      checked={selectedContactIds.size === filteredContacts.length && filteredContacts.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>
                    Name
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>
                    Phone
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>Email</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>Company</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>Source</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>Tags</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>Last Contact</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>Call Attempted</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>Last Status</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>Original Status</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>
                    Created
                  </th>
                  <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((contact, index) => {
                  // Place trigger element near the end
                  const isTriggerPosition = index === triggerPosition;
                  
                  return (
                    <React.Fragment key={contact.id}>
                      <tr className="border-b transition-colors hover:bg-muted/50">
                        <td className="p-4 align-middle">
                          <Checkbox
                            checked={selectedContactIds.has(contact.id)}
                            onCheckedChange={(checked) => handleSelectContact(contact.id, checked as boolean)}
                          />
                        </td>
                        <td className="p-4 align-middle">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{contact.name}</span>
                            {contact.isAutoCreated && contact.autoCreationSource === 'webhook' && (
                              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                <PhoneIncoming className="w-3 h-3" />
                                Inbound Call
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-4 align-middle">{contact.phoneNumber}</td>
                        <td className="p-4 align-middle">{contact.email || '-'}</td>
                        <td className="p-4 align-middle">{contact.company || '-'}</td>
                        <td className="p-4 align-middle">
                          <span className="text-sm">{getSourceLabel(contact.autoCreationSource)}</span>
                        </td>
                        <td className="p-4 align-middle">
                          {contact.tags && contact.tags.length > 0 ? (
                            <div className="flex flex-wrap gap-1" title={contact.tags.map(t => `#${t}`).join(', ')}>
                              {contact.tags.slice(0, 2).map((tag, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs bg-blue-50 text-blue-700">
                                  #{tag}
                                </Badge>
                              ))}
                              {contact.tags.length > 2 && (
                                <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
                                  +{contact.tags.length - 2} more
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="p-4 align-middle">
                          {contact.lastContactAt ? (
                            <span className="text-sm">
                              {new Date(contact.lastContactAt).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="p-4 align-middle">
                          {(contact.callAttemptedBusy || 0) > 0 || (contact.callAttemptedNoAnswer || 0) > 0 ? (
                            <span className="text-sm">
                              Busy: {contact.callAttemptedBusy || 0}, No Answer: {contact.callAttemptedNoAnswer || 0}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="p-4 align-middle">
                          {contact.lastCallStatus ? (
                            <Badge 
                              variant="outline" 
                              className={
                                contact.lastCallStatus === 'completed' ? 'bg-green-50 text-green-700 border-green-500 border-2' :
                                contact.lastCallStatus.toLowerCase().includes('not') || contact.lastCallStatus.toLowerCase().includes('answer') ? 'bg-yellow-50 text-yellow-700 border-yellow-500 border-2' :
                                contact.lastCallStatus === 'busy' ? 'bg-red-50 text-red-700 border-red-500 border-2' :
                                contact.lastCallStatus === 'in-progress' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                contact.lastCallStatus === 'ringing' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                contact.lastCallStatus === 'call-disconnected' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                contact.lastCallStatus === 'initiated' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                'bg-gray-50 text-gray-700 border-gray-200'
                              }
                            >
                              {contact.lastCallStatus}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-slate-50 text-slate-400 border-slate-200">
                              Not contacted
                            </Badge>
                          )}
                        </td>
                        <td className="p-4 align-middle">
                          {contact.originalStatus ? (
                            <span className="text-sm capitalize">{contact.originalStatus}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="p-4 align-middle">
                          {new Date(contact.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-4 align-middle text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleCallClick(contact)}
                            >
                              <PhoneCall className="w-4 h-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => onContactSelect?.(contact)}>
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onContactEdit?.(contact)}>
                                  <Edit className="w-4 h-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDeleteClick(contact)}
                                  className="text-red-600"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                      {/* Trigger element for loading more */}
                      {isTriggerPosition && enableInfiniteScroll && (
                        <tr>
                          <td colSpan={13}>
                            <div ref={triggerElementRef} className="h-1" />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* Loading More Indicator */}
            {isLoadingMore && (
              <div className="flex justify-center items-center p-4 gap-2 border-t">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Loading more contacts...</span>
              </div>
            )}

            {/* End of List Message */}
            {!hasMore && allLoadedContacts.length > 0 && (
              <div className="text-center p-4 text-gray-500 border-t">
                All {allLoadedContacts.length} contacts loaded
              </div>
            )}

            {/* Empty State */}
            {filteredContacts.length === 0 && !loading && (
              <div className="text-center p-8">
                <p className="text-gray-500">No contacts found</p>
                {searchTerm && (
                  <Button
                    variant="link"
                    onClick={() => setSearchTerm('')}
                    className="mt-2"
                  >
                    Clear search
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      <DeleteContactDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        contact={contactToDelete}
        isDeleting={deleting}
      />

      <BulkContactUpload
        isOpen={isBulkUploadOpen}
        onOpenChange={setIsBulkUploadOpen}
        onUploadComplete={handleBulkUploadSuccess}
      />

      {selectedContact && (
        <CallAgentModal
          open={isAgentModalOpen}
          onClose={() => setIsAgentModalOpen(false)}
          contact={selectedContact}
        />
      )}

      <CreateCampaignModal
        isOpen={isCampaignModalOpen}
        onClose={() => setIsCampaignModalOpen(false)}
        preSelectedContacts={campaignPreselectedContacts}
      />
    </div>
  );
};

export default ContactList;
