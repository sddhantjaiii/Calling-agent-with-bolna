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
  ArrowUpDown,
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
import { SendWhatsAppModal } from './SendWhatsAppModal';
import { SendEmailModal } from './SendEmailModal';
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
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // New filters
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedLastStatus, setSelectedLastStatus] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedCallType, setSelectedCallType] = useState<string>('all');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [editingNotes, setEditingNotes] = useState<{ contactId: string; notes: string } | null>(null);
  
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
    updateContact,
    clearError,
  } = useContacts(contactsOptions);

  // Determine if there are more contacts to load
  const hasMore = pagination?.hasMore ?? false;
  const totalContacts = pagination?.total ?? 0;

  // Reset pagination when total count changes (new contact added/deleted)
  const prevTotalRef = useRef<number>(totalContacts);
  useEffect(() => {
    if (prevTotalRef.current !== totalContacts && prevTotalRef.current > 0) {
      console.log('📊 Total contacts changed, resetting pagination:', {
        previous: prevTotalRef.current,
        current: totalContacts
      });
      setCurrentOffset(0);
      setAllLoadedContacts([]);
      lastLoadedOffsetRef.current = -1;
    }
    prevTotalRef.current = totalContacts;
  }, [totalContacts]);

  // Handle infinite scroll vs traditional pagination
  const displayContacts = enableInfiniteScroll ? allLoadedContacts : contacts;

  // Debug: Log first contact to check field names
  useEffect(() => {
    if (displayContacts.length > 0) {
      console.log('🔍 First contact sample:', {
        fullContact: displayContacts[0],
        autoCreationSource: displayContacts[0].autoCreationSource,
        hasAutoCreationSource: 'autoCreationSource' in displayContacts[0],
        keys: Object.keys(displayContacts[0])
      });
    }
  }, [displayContacts]);

  // Apply filter
  const filteredContacts = displayContacts.filter(contact => {
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
    
    // Call Type filter
    if (selectedCallType !== 'all' && contact.callType !== selectedCallType) {
      return false;
    }
    
    // City filter
    if (selectedCity !== 'all' && contact.city !== selectedCity) {
      return false;
    }
    
    // Country filter
    if (selectedCountry !== 'all' && contact.country !== selectedCountry) {
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

  const handleWhatsAppClick = (contact: Contact) => {
    setSelectedContact(contact);
    setIsWhatsAppModalOpen(true);
  };

  const handleEmailClick = (contact: Contact) => {
    setSelectedContact(contact);
    setIsEmailModalOpen(true);
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

  const handleNotesClick = (contact: Contact) => {
    setEditingNotes({ contactId: contact.id, notes: contact.notes || '' });
  };

  const handleNotesSave = async (contactId: string, notes: string) => {
    try {
      await updateContact(contactId, { notes });
      
      // Update local state immediately for infinite scroll
      if (enableInfiniteScroll) {
        setAllLoadedContacts(prev => 
          prev.map(contact => 
            contact.id === contactId 
              ? { ...contact, notes, updatedAt: new Date().toISOString() }
              : contact
          )
        );
      }
      
      setEditingNotes(null);
      toast({
        title: 'Success',
        description: 'Notes updated successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update notes',
        variant: 'destructive',
      });
    }
  };

  const handleNotesCancel = () => {
    setEditingNotes(null);
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
    // Reset pagination and loaded contacts to trigger fresh API call
    setCurrentOffset(0);
    setAllLoadedContacts([]);
    lastLoadedOffsetRef.current = -1;
  };

  // Helper: Map source to display name
  const getSourceLabel = (contact: Contact) => {
    // If auto_creation_source is explicitly set, use it
    if (contact.autoCreationSource === 'webhook') return 'Inbound Call';
    if (contact.autoCreationSource === 'bulk_upload') return 'Excel Upload';
    if (contact.autoCreationSource === 'manual') return 'Manual Entry';
    
    // If contact was auto-created (from inbound call) but source is null
    if (contact.isAutoCreated) return 'Inbound Call';
    
    // Otherwise, it was manually added through the UI
    return 'Manual Entry';
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

  // Helper: Get all unique call types
  const allUniqueCallTypes = React.useMemo(() => {
    const typeSet = new Set<string>();
    displayContacts.forEach(contact => {
      if (contact.callType) typeSet.add(contact.callType);
    });
    return Array.from(typeSet).sort();
  }, [displayContacts]);

  // Helper: Get all unique cities
  const allUniqueCities = React.useMemo(() => {
    const citySet = new Set<string>();
    displayContacts.forEach(contact => {
      if (contact.city) citySet.add(contact.city);
    });
    return Array.from(citySet).sort();
  }, [displayContacts]);

  // Helper: Get all unique countries
  const allUniqueCountries = React.useMemo(() => {
    const countrySet = new Set<string>();
    displayContacts.forEach(contact => {
      if (contact.country) countrySet.add(contact.country);
    });
    return Array.from(countrySet).sort();
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
            {/* Search and Filters in One Row */}
            <div className="flex gap-2 flex-wrap items-center">
              {/* Search Input */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search contacts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-9"
                />
              </div>

              {/* Tags Filter */}
              <Select
                value={selectedTags.length > 0 ? selectedTags[0] : 'all'}
                onValueChange={(value) => {
                  if (value === 'all') {
                    setSelectedTags([]);
                  } else {
                    setSelectedTags([value]);
                  }
                }}
              >
                <SelectTrigger className="w-36 h-9">
                  <SelectValue placeholder="Tags" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tags</SelectItem>
                  {allUniqueTags.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      #{tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Last Status Filter */}
              <Select
                value={selectedLastStatus}
                onValueChange={setSelectedLastStatus}
              >
                <SelectTrigger className="w-36 h-9">
                  <SelectValue placeholder="Status" />
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
                <SelectTrigger className="w-36 h-9">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="webhook">Inbound Call</SelectItem>
                  <SelectItem value="manual">Manual Entry</SelectItem>
                  <SelectItem value="bulk_upload">Excel Upload</SelectItem>
                </SelectContent>
              </Select>

              {/* Call Type Filter */}
              <Select
                value={selectedCallType}
                onValueChange={setSelectedCallType}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by Call Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Call Types</SelectItem>
                  {allUniqueCallTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* City Filter */}
              {allUniqueCities.length > 0 && (
                <Select
                  value={selectedCity}
                  onValueChange={setSelectedCity}
                >
                  <SelectTrigger className="w-36 h-9">
                    <SelectValue placeholder="City" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cities</SelectItem>
                    {allUniqueCities.map((city) => (
                      <SelectItem key={city} value={city}>
                        {city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Country Filter */}
              {allUniqueCountries.length > 0 && (
                <Select
                  value={selectedCountry}
                  onValueChange={setSelectedCountry}
                >
                  <SelectTrigger className="w-36 h-9">
                    <SelectValue placeholder="Country" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Countries</SelectItem>
                    {allUniqueCountries.map((country) => (
                      <SelectItem key={country} value={country}>
                        {country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Clear Filters Button */}
              {(selectedTags.length > 0 || selectedLastStatus !== 'all' || selectedSource !== 'all' || selectedCallType !== 'all' || selectedCity !== 'all' || selectedCountry !== 'all') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedTags([]);
                    setSelectedLastStatus('all');
                    setSelectedSource('all');
                    setSelectedCallType('all');
                    setSelectedCity('all');
                    setSelectedCountry('all');
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
            <table className="w-full min-w-max">
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr className="border-b" style={{ backgroundColor: 'hsl(var(--background))' }}>
                  <th
                    className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-12 bg-background"
                    style={{ position: 'sticky', left: 0, zIndex: 20 }}
                  >
                    <Checkbox
                      checked={selectedContactIds.size === filteredContacts.length && filteredContacts.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </th>
                  <th
                    className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background min-w-[220px]"
                    style={{ position: 'sticky', left: 48, zIndex: 20 }}
                  >
                    <button
                      onClick={() => handleSortChange('name')}
                      className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                    >
                      Lead
                      <ArrowUpDown className="w-4 h-4" />
                    </button>
                  </th>
                  <th
                    className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background min-w-[180px]"
                    style={{ position: 'sticky', left: 48 + 220, zIndex: 20 }}
                  >
                    Contact Details
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>Call Type</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>Last Status</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground min-w-[200px]" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>Notes</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>Source</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>Tags</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>Location</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground min-w-[150px]" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>Business Context</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>Last Contact</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" style={{ position: 'sticky', top: 0, backgroundColor: 'hsl(var(--background))' }}>Call Attempted</th>
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
                        <td
                          className="p-4 align-middle bg-background"
                          style={{ position: 'sticky', left: 0, zIndex: 10 }}
                        >
                          <Checkbox
                            checked={selectedContactIds.has(contact.id)}
                            onCheckedChange={(checked) => handleSelectContact(contact.id, checked as boolean)}
                          />
                        </td>
                        <td
                          className="p-4 align-middle bg-background min-w-[220px]"
                          style={{ position: 'sticky', left: 48, zIndex: 10 }}
                        >
                          <div>
                            <div className="font-medium text-foreground">{contact.name}</div>
                            {contact.company && (
                              <div className="text-xs text-muted-foreground mt-0.5">{contact.company}</div>
                            )}
                          </div>
                        </td>
                        <td
                          className="p-4 align-middle bg-background min-w-[180px]"
                          style={{ position: 'sticky', left: 48 + 220, zIndex: 10 }}
                        >
                          <div>
                            <div className="text-sm">{contact.phoneNumber}</div>
                            {contact.email && (
                              <div className="text-xs text-muted-foreground mt-0.5">{contact.email}</div>
                            )}
                          </div>
                        </td>
                        <td className="p-4 align-middle">
                          <Badge variant="outline" className="text-xs capitalize">
                            {contact.callType}
                          </Badge>
                        </td>
                        <td className="p-4 align-middle">
                          {contact.lastCallStatus ? (
                            <Badge 
                              variant="outline" 
                              className={
                                contact.lastCallStatus.toLowerCase() === 'completed' ? 'bg-green-50 text-green-700 border-green-500' :
                                contact.lastCallStatus.toLowerCase() === 'callback received' ? 'bg-purple-50 text-purple-700 border-purple-500' :
                                contact.lastCallStatus.toLowerCase().includes('not') || contact.lastCallStatus.toLowerCase().includes('answer') ? 'bg-yellow-50 text-yellow-700 border-yellow-500' :
                                contact.lastCallStatus.toLowerCase() === 'busy' ? 'bg-red-50 text-red-700 border-red-500' :
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
                        <td className="p-4 align-middle min-w-[200px]">
                          {editingNotes?.contactId === contact.id ? (
                            <div className="flex gap-1">
                              <Input
                                value={editingNotes.notes}
                                onChange={(e) => setEditingNotes({ contactId: contact.id, notes: e.target.value })}
                                className="text-sm h-8"
                                placeholder="Add notes..."
                                autoFocus
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2"
                                onClick={() => handleNotesSave(contact.id, editingNotes.notes)}
                              >
                                ✓
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2"
                                onClick={handleNotesCancel}
                              >
                                ✕
                              </Button>
                            </div>
                          ) : (
                            <div
                              className="text-sm cursor-pointer hover:text-blue-600 transition-colors"
                              onClick={() => handleNotesClick(contact)}
                              title="Click to edit notes"
                            >
                              {contact.notes || <span className="text-gray-400">Click to add notes...</span>}
                            </div>
                          )}
                        </td>
                        <td className="p-4 align-middle">
                          <Badge variant="outline" className="text-xs">
                            {getSourceLabel(contact)}
                          </Badge>
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
                          {contact.city || contact.country ? (
                            <div>
                              <span className="text-sm">{contact.city || '-'}</span>
                              {contact.country && (
                                <div className="text-xs text-muted-foreground">{contact.country}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="p-4 align-middle">
                          {contact.businessContext ? (
                            <span className="text-sm">{contact.businessContext}</span>
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
                          {new Date(contact.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-4 align-middle text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleCallClick(contact)}
                              title="Call"
                            >
                              <PhoneCall className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleWhatsAppClick(contact)}
                              title="Send WhatsApp Message"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEmailClick(contact)}
                              title="Send Email"
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            >
                              <Mail className="w-4 h-4" />
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
                                <DropdownMenuItem onClick={() => handleCallClick(contact)}>
                                  <PhoneCall className="w-4 h-4 mr-2" />
                                  Call
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleWhatsAppClick(contact)}>
                                  <MessageSquare className="w-4 h-4 mr-2 text-green-600" />
                                  Send WhatsApp
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleEmailClick(contact)}>
                                  <Mail className="w-4 h-4 mr-2 text-blue-600" />
                                  Send Email
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
                          <td colSpan={11}>
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

      {selectedContact && (
        <SendWhatsAppModal
          open={isWhatsAppModalOpen}
          onClose={() => setIsWhatsAppModalOpen(false)}
          contact={selectedContact}
          onMessageSent={() => {
            toast({
              title: 'Success',
              description: 'WhatsApp message sent successfully',
            });
          }}
        />
      )}

      {selectedContact && (
        <SendEmailModal
          open={isEmailModalOpen}
          onClose={() => setIsEmailModalOpen(false)}
          contact={selectedContact}
          onEmailSent={() => {
            toast({
              title: 'Success',
              description: 'Email sent successfully',
            });
          }}
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
