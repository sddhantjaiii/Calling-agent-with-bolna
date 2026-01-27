import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  Settings2,
  Check,
  X,
  LayoutGrid,
  Kanban,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { LeadStageDropdown } from '@/components/LeadStageDropdown';
import { useContacts } from '@/hooks/useContacts';
import { useLeadStages } from '@/hooks/useLeadStages';
import { useToast } from '@/components/ui/use-toast';
import DeleteContactDialog from './DeleteContactDialog';
import BulkContactUpload from './BulkContactUpload';
import { LeadStageCustomizer } from './LeadStageCustomizer';
import { CallAgentModal } from './CallAgentModal';
import { SendWhatsAppModal } from './SendWhatsAppModal';
import { SendEmailModal } from './SendEmailModal';
import CreateCampaignModal from '@/components/campaigns/CreateCampaignModal';
import type { Contact, ContactsListOptions } from '@/types';
import { cn } from '@/lib/utils';

// Column filter interface for Excel-like filtering
interface ColumnFilters {
  tags: string[];
  lastStatus: string[];
  callType: string[];
  source: string[];
  city: string[];
  country: string[];
  leadStage: string[];
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 hover:text-primary transition-colors font-medium text-muted-foreground">
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

type DisplayMode = 'table' | 'pipeline';

interface ContactListProps {
  onContactSelect?: (contact: Contact) => void;
  onContactEdit?: (contact: Contact) => void;
  onContactCreate?: () => void;
  useLazyLoading?: boolean;
  initialPageSize?: number;
  enableInfiniteScroll?: boolean;
  displayMode?: DisplayMode;
  onDisplayModeChange?: (mode: DisplayMode) => void;
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
  displayMode,
  onDisplayModeChange,
}) => {
  const { toast } = useToast();
  const { stages, bulkUpdateLeadStage, bulkUpdating } = useLeadStages();
  
  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'phone_number' | 'created_at'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentOffset, setCurrentOffset] = useState(0);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [isLeadStageCustomizerOpen, setIsLeadStageCustomizerOpen] = useState(false);
  const [allLoadedContacts, setAllLoadedContacts] = useState<Contact[]>([]);
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isBulkLeadStageUpdating, setIsBulkLeadStageUpdating] = useState(false);
  
  // New column filters state (Excel-like multi-select)
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({
    tags: [],
    lastStatus: [],
    callType: [],
    source: [],
    city: [],
    country: [],
    leadStage: [],
  });
  const [editingNotes, setEditingNotes] = useState<{ contactId: string; notes: string } | null>(null);
  const [editingNotesPopover, setEditingNotesPopover] = useState<{ contactId: string; notes: string } | null>(null);
  const [editingBusinessContext, setEditingBusinessContext] = useState<{ contactId: string; businessContext: string } | null>(null);
  
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

  // Apply filter - with null safety check
  const filteredContacts = displayContacts.filter(contact => {
    // Skip null/undefined contacts
    if (!contact || !contact.id) return false;
    
    // Tag filter (multi-select)
    if (columnFilters.tags.length > 0) {
      const contactTags = contact.tags || [];
      const hasMatchingTag = columnFilters.tags.some(tag => contactTags.includes(tag));
      if (!hasMatchingTag) return false;
    }
    
    // Last Status filter (multi-select)
    if (columnFilters.lastStatus.length > 0) {
      if (!contact.lastCallStatus || !columnFilters.lastStatus.includes(contact.lastCallStatus)) {
        return false;
      }
    }
    
    // Call Type filter (multi-select)
    if (columnFilters.callType.length > 0) {
      if (!contact.callType || !columnFilters.callType.includes(contact.callType)) {
        return false;
      }
    }
    
    // Source filter (multi-select)
    if (columnFilters.source.length > 0) {
      const contactSource = contact.autoCreationSource || (contact.isAutoCreated ? 'webhook' : 'manual');
      if (!columnFilters.source.includes(contactSource)) {
        return false;
      }
    }
    
    // City filter (multi-select)
    if (columnFilters.city.length > 0) {
      if (!contact.city || !columnFilters.city.includes(contact.city)) {
        return false;
      }
    }
    
    // Country filter (multi-select)
    if (columnFilters.country.length > 0) {
      if (!contact.country || !columnFilters.country.includes(contact.country)) {
        return false;
      }
    }
    
    // Lead Stage filter (multi-select)
    if (columnFilters.leadStage.length > 0) {
      if (!contact.leadStage || !columnFilters.leadStage.includes(contact.leadStage)) {
        return false;
      }
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
      // Initial load - filter out any null contacts
      const validContacts = contacts.filter(c => c != null && c.id);
      console.log('✅ Initial batch loaded:', validContacts.length);
      setAllLoadedContacts(validContacts);
      lastLoadedOffsetRef.current = 0;
      setIsLoadingMore(false);
    } else {
      // Append new batch
      setAllLoadedContacts(prev => {
        const validPrev = prev.filter(c => c != null && c.id);
        const existingIds = new Set(validPrev.map(c => c.id));
        const newContacts = contacts.filter(c => c != null && c.id && !existingIds.has(c.id));
        
        if (newContacts.length > 0) {
          console.log('➕ Appending batch:', {
            previous: validPrev.length,
            new: newContacts.length,
            total: validPrev.length + newContacts.length,
          });
          lastLoadedOffsetRef.current = currentOffset;
          setIsLoadingMore(false);
          return [...validPrev, ...newContacts];
        }
        
        setIsLoadingMore(false);
        return validPrev;
      });
    }
  }, [contacts, currentOffset, enableInfiniteScroll, allLoadedContacts.length]);

  // Sync updated contacts from query cache to local state
  // This handles the case when contacts are edited and the query refetches
  useEffect(() => {
    if (!enableInfiniteScroll || allLoadedContacts.length === 0 || contacts.length === 0) return;
    
    // Check if any existing contact has been updated (different data than what's in allLoadedContacts)
    setAllLoadedContacts(prev => {
      let hasChanges = false;
      const updated = prev.map(existingContact => {
        // Find the matching contact in the fresh data
        const freshContact = contacts.find(c => c.id === existingContact.id);
        if (freshContact && JSON.stringify(freshContact) !== JSON.stringify(existingContact)) {
          hasChanges = true;
          return freshContact;
        }
        return existingContact;
      });
      
      return hasChanges ? updated : prev;
    });
  }, [contacts, enableInfiniteScroll]);

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
          prev.filter(c => c != null).map(contact => 
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

  const handleNotesPopoverSave = async (contactId: string, notes: string) => {
    try {
      await updateContact(contactId, { notes });
      
      // Update local state immediately for infinite scroll
      if (enableInfiniteScroll) {
        setAllLoadedContacts(prev => 
          prev.filter(c => c != null).map(contact => 
            contact.id === contactId 
              ? { ...contact, notes, updatedAt: new Date().toISOString() }
              : contact
          )
        );
      }
      
      setEditingNotesPopover(null);
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

  const handleBusinessContextSave = async (contactId: string, businessContext: string) => {
    try {
      await updateContact(contactId, { businessContext });
      
      // Update local state immediately for infinite scroll
      if (enableInfiniteScroll) {
        setAllLoadedContacts(prev => 
          prev.filter(c => c != null).map(contact => 
            contact.id === contactId 
              ? { ...contact, businessContext, updatedAt: new Date().toISOString() }
              : contact
          )
        );
      }
      
      setEditingBusinessContext(null);
      toast({
        title: 'Success',
        description: 'Business context updated successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update business context',
        variant: 'destructive',
      });
    }
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

  const handleBulkLeadStageChange = async (newStage: string | null) => {
    const selected = Array.from(selectedContactIds);
    if (selected.length === 0) {
      toast({
        title: 'No contacts selected',
        description: 'Please select at least one contact',
        variant: 'destructive',
      });
      return;
    }

    setIsBulkLeadStageUpdating(true);
    try {
      const result = await bulkUpdateLeadStage(selected, newStage);
      
      if (result !== null && result > 0) {
        // Update local state immediately for infinite scroll
        if (enableInfiniteScroll) {
          setAllLoadedContacts(prev => 
            prev.filter(c => c != null).map(contact => 
              selected.includes(contact.id)
                ? { ...contact, leadStage: newStage || undefined, updatedAt: new Date().toISOString() }
                : contact
            )
          );
        }
        
        toast({
          title: 'Success',
          description: `Updated lead stage for ${result} contact(s) to "${newStage || 'Unassigned'}"`,
        });
        
        // Clear selection after successful update
        setSelectedContactIds(new Set());
        
        // Refresh to get updated data
        refreshContacts(contactsOptions);
      } else {
        toast({
          title: 'Error',
          description: 'Failed to update lead stage',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error bulk updating lead stage:', error);
      toast({
        title: 'Error',
        description: 'Failed to update lead stage',
        variant: 'destructive',
      });
    } finally {
      setIsBulkLeadStageUpdating(false);
    }
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
    if (contact.autoCreationSource) {
      // Handle known system sources
      if (contact.autoCreationSource === 'webhook') return 'Inbound Call';
      if (contact.autoCreationSource === 'bulk_upload') return 'Excel Upload';
      if (contact.autoCreationSource === 'manual') return 'Manual Entry';
      if (contact.autoCreationSource === 'n8n_webhook') return 'n8n Webhook';
      // For custom sources (e.g., 'TradeIndia', 'Zapier', etc.), display as-is
      return contact.autoCreationSource;
    }
    
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

  // Helper: Get all unique sources
  const allUniqueSources = React.useMemo(() => {
    const sourceSet = new Set<string>();
    displayContacts.forEach(contact => {
      const source = contact.autoCreationSource || (contact.isAutoCreated ? 'webhook' : 'manual');
      sourceSet.add(source);
    });
    return Array.from(sourceSet).sort();
  }, [displayContacts]);

  // Helper: Get all unique lead stages
  const allUniqueLeadStages = React.useMemo(() => {
    const stageSet = new Set<string>();
    displayContacts.forEach(contact => {
      if (contact.leadStage) stageSet.add(contact.leadStage);
    });
    return Array.from(stageSet).sort();
  }, [displayContacts]);

  // Helper to update a specific column filter
  const updateColumnFilter = (column: keyof ColumnFilters, values: string[]) => {
    setColumnFilters(prev => ({ ...prev, [column]: values }));
  };

  // Check if any column filters are active
  const hasActiveColumnFilters = Object.values(columnFilters).some(arr => arr.length > 0);

  // Clear all column filters
  const clearAllColumnFilters = () => {
    setColumnFilters({
      tags: [],
      lastStatus: [],
      callType: [],
      source: [],
      city: [],
      country: [],
      leadStage: [],
    });
  };

  // Calculate trigger position (10 items before end)
  const triggerPosition = Math.max(0, filteredContacts.length - LOAD_TRIGGER_OFFSET);

  return (
    <div className="h-full flex flex-col">
      <Card className="flex-1 flex flex-col overflow-hidden">
        {/* Fixed Header - All on single line */}
        <CardHeader className="flex-shrink-0 border-b py-3">
          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            {displayMode && onDisplayModeChange && (
              <div className="flex items-center rounded-lg border bg-muted p-1">
                <Button
                  variant={displayMode === 'table' ? 'secondary' : 'ghost'}
                  size="sm"
                  className={cn(
                    'h-7 px-2',
                    displayMode === 'table' && 'shadow-sm'
                  )}
                  onClick={() => onDisplayModeChange('table')}
                >
                  <LayoutGrid className="h-4 w-4 mr-1" />
                  Table
                </Button>
                <Button
                  variant={displayMode === 'pipeline' ? 'secondary' : 'ghost'}
                  size="sm"
                  className={cn(
                    'h-7 px-2',
                    displayMode === 'pipeline' && 'shadow-sm'
                  )}
                  onClick={() => onDisplayModeChange('pipeline')}
                >
                  <Kanban className="h-4 w-4 mr-1" />
                  Pipeline
                </Button>
              </div>
            )}

            {/* Title */}
            <CardTitle className="text-base whitespace-nowrap">Contacts ({totalContacts})</CardTitle>

            {/* Search Input */}
            <div className="relative flex-1 min-w-[150px] max-w-[300px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search contacts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-9"
              />
            </div>

            {/* Clear All Column Filters Button */}
            {hasActiveColumnFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearAllColumnFilters}
                className="h-9"
              >
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Action Buttons */}
            {selectedContactIds.size > 0 && (
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
                  onClick={handleCreateCampaign}
                  variant="default"
                  size="sm"
                >
                  Create Campaign ({selectedContactIds.size})
                </Button>
              </>
            )}
            <Button
              onClick={() => setIsLeadStageCustomizerOpen(true)}
              variant="outline"
              size="sm"
            >
              <Settings2 className="w-4 h-4 mr-1" />
              Lead Stages
            </Button>
            <Button
              onClick={() => setIsBulkUploadOpen(true)}
              variant="outline"
              size="sm"
            >
              <Upload className="w-4 h-4 mr-1" />
              Upload CSV
            </Button>
            <Button
              onClick={onContactCreate}
              size="sm"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Contact
            </Button>
          </div>

          {/* Active Column Filters Summary - only shown when filters are active */}
          {hasActiveColumnFilters && (
            <div className="flex flex-wrap gap-2 items-center mt-2 pt-2 border-t">
              <span className="text-sm text-muted-foreground">Active filters:</span>
              {columnFilters.tags.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  Tags: {columnFilters.tags.join(', ')}
                  <button onClick={() => updateColumnFilter('tags', [])} className="ml-1 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {columnFilters.lastStatus.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  Status: {columnFilters.lastStatus.join(', ')}
                  <button onClick={() => updateColumnFilter('lastStatus', [])} className="ml-1 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {columnFilters.callType.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  Call Type: {columnFilters.callType.join(', ')}
                  <button onClick={() => updateColumnFilter('callType', [])} className="ml-1 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {columnFilters.source.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  Source: {columnFilters.source.join(', ')}
                  <button onClick={() => updateColumnFilter('source', [])} className="ml-1 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {columnFilters.city.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  City: {columnFilters.city.join(', ')}
                  <button onClick={() => updateColumnFilter('city', [])} className="ml-1 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {columnFilters.country.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  Country: {columnFilters.country.join(', ')}
                  <button onClick={() => updateColumnFilter('country', [])} className="ml-1 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {columnFilters.leadStage.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  Lead Stage: {columnFilters.leadStage.join(', ')}
                  <button onClick={() => updateColumnFilter('leadStage', [])} className="ml-1 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
            </div>
          )}
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
              <thead className="sticky top-0 z-20 bg-background">
                <tr className="border-b bg-background">
                  <th
                    className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-12 bg-background sticky left-0 z-30"
                  >
                    <Checkbox
                      checked={selectedContactIds.size === filteredContacts.length && filteredContacts.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </th>
                  <th
                    className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background min-w-[220px] sticky left-[48px] z-30"
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
                    className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background min-w-[180px] sticky left-[268px] z-30"
                  >
                    Contact Details
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">
                    <ExcelColumnFilter
                      title="Call Type"
                      options={allUniqueCallTypes}
                      selectedValues={columnFilters.callType}
                      onSelectionChange={(values) => updateColumnFilter('callType', values)}
                      showAllLabel="All Call Types"
                    />
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">
                    <ExcelColumnFilter
                      title="Last Status"
                      options={allUniqueStatuses}
                      selectedValues={columnFilters.lastStatus}
                      onSelectionChange={(values) => updateColumnFilter('lastStatus', values)}
                      showAllLabel="All Status"
                    />
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">
                    <ExcelColumnFilter
                      title="Lead Stage"
                      options={allUniqueLeadStages}
                      selectedValues={columnFilters.leadStage}
                      onSelectionChange={(values) => updateColumnFilter('leadStage', values)}
                      showAllLabel="All Stages"
                    />
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground min-w-[200px] bg-background">Notes</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">
                    <ExcelColumnFilter
                      title="Source"
                      options={allUniqueSources}
                      selectedValues={columnFilters.source}
                      onSelectionChange={(values) => updateColumnFilter('source', values)}
                      showAllLabel="All Sources"
                    />
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">
                    <ExcelColumnFilter
                      title="Tags"
                      options={allUniqueTags}
                      selectedValues={columnFilters.tags}
                      onSelectionChange={(values) => updateColumnFilter('tags', values)}
                      showAllLabel="All Tags"
                    />
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-1 hover:text-primary transition-colors font-medium text-muted-foreground">
                          <span>Location</span>
                          <Filter className={`w-3 h-3 ${(columnFilters.city.length > 0 || columnFilters.country.length > 0) ? 'text-primary fill-primary/20' : 'text-muted-foreground'}`} />
                          {(columnFilters.city.length > 0 || columnFilters.country.length > 0) && (
                            <span className="ml-1 text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">
                              {columnFilters.city.length + columnFilters.country.length}
                            </span>
                          )}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        {allUniqueCities.length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">Cities</div>
                            {allUniqueCities.map((city) => {
                              const isSelected = columnFilters.city.includes(city);
                              return (
                                <DropdownMenuItem 
                                  key={`city-${city}`} 
                                  onClick={() => {
                                    if (isSelected) {
                                      updateColumnFilter('city', columnFilters.city.filter(v => v !== city));
                                    } else {
                                      updateColumnFilter('city', [...columnFilters.city, city]);
                                    }
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  <div className={`w-4 h-4 border rounded flex items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'border-input'}`}>
                                    {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                                  </div>
                                  <span>{city}</span>
                                </DropdownMenuItem>
                              );
                            })}
                            <DropdownMenuSeparator />
                          </>
                        )}
                        {allUniqueCountries.length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">Countries</div>
                            {allUniqueCountries.map((country) => {
                              const isSelected = columnFilters.country.includes(country);
                              return (
                                <DropdownMenuItem 
                                  key={`country-${country}`} 
                                  onClick={() => {
                                    if (isSelected) {
                                      updateColumnFilter('country', columnFilters.country.filter(v => v !== country));
                                    } else {
                                      updateColumnFilter('country', [...columnFilters.country, country]);
                                    }
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  <div className={`w-4 h-4 border rounded flex items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'border-input'}`}>
                                    {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                                  </div>
                                  <span>{country}</span>
                                </DropdownMenuItem>
                              );
                            })}
                          </>
                        )}
                        {(columnFilters.city.length > 0 || columnFilters.country.length > 0) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => {
                                updateColumnFilter('city', []);
                                updateColumnFilter('country', []);
                              }} 
                              className="text-muted-foreground"
                            >
                              Clear location filter
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground min-w-[150px] bg-background">Business Context</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Last Contact</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">Call Attempted</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground bg-background">
                    Created
                  </th>
                  <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground bg-background">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((contact, index) => {
                  // Safety check - skip null contacts
                  if (!contact || !contact.id) return null;
                  
                  // Place trigger element near the end
                  const isTriggerPosition = index === triggerPosition;
                  
                  return (
                    <React.Fragment key={contact.id}>
                      <tr className="border-b transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td
                          className="p-4 align-middle bg-background sticky left-0 z-10"
                        >
                          <Checkbox
                            checked={selectedContactIds.has(contact.id)}
                            onCheckedChange={(checked) => handleSelectContact(contact.id, checked as boolean)}
                          />
                        </td>
                        <td
                          className="p-4 align-middle bg-background min-w-[220px] sticky left-[48px] z-10"
                        >
                          <div>
                            <div 
                              className="font-medium text-foreground cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                              onClick={() => onContactSelect?.(contact)}
                              title="Click to view contact details"
                            >
                              {contact.name}
                            </div>
                            {contact.company && (
                              <div className="text-xs text-muted-foreground mt-0.5">{contact.company}</div>
                            )}
                          </div>
                        </td>
                        <td
                          className="p-4 align-middle bg-background min-w-[180px] sticky left-[268px] z-10"
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
                        <td className="p-4 align-middle">
                          <LeadStageDropdown
                            value={contact.leadStage}
                            onChange={(newStage) => {
                              updateContact(contact.id, { leadStage: newStage });
                            }}
                            size="sm"
                            showManageOption={false}
                          />
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
                            contact.notes && contact.notes.length > 0 ? (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <div
                                    className="text-sm cursor-pointer hover:text-blue-600 transition-colors max-w-[180px] truncate"
                                    title="Click to view/edit notes"
                                  >
                                    {(contact.notes?.length ?? 0) > 50 ? `${contact.notes?.substring(0, 50)}...` : contact.notes}
                                  </div>
                                </PopoverTrigger>
                                <PopoverContent className="w-80 max-h-[400px] overflow-y-auto">
                                  <div className="space-y-3">
                                    <h4 className="font-semibold text-sm">Notes</h4>
                                    {editingNotesPopover?.contactId === contact.id ? (
                                      <>
                                        <Textarea
                                          value={editingNotesPopover.notes}
                                          onChange={(e) => setEditingNotesPopover({ contactId: contact.id, notes: e.target.value })}
                                          className="min-h-[120px] text-sm"
                                          placeholder="Enter notes..."
                                          autoFocus
                                        />
                                        <div className="flex justify-end gap-2">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setEditingNotesPopover(null)}
                                          >
                                            Cancel
                                          </Button>
                                          <Button
                                            size="sm"
                                            onClick={() => handleNotesPopoverSave(contact.id, editingNotesPopover.notes)}
                                          >
                                            Save
                                          </Button>
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <p className="text-sm whitespace-pre-wrap break-words bg-muted/50 p-3 rounded-md">{contact.notes}</p>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="w-full"
                                          onClick={() => setEditingNotesPopover({ contactId: contact.id, notes: contact.notes || '' })}
                                        >
                                          Edit Notes
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            ) : (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <div
                                    className="text-sm cursor-pointer hover:text-blue-600 transition-colors"
                                    title="Click to add notes"
                                  >
                                    <span className="text-gray-400">Click to add notes...</span>
                                  </div>
                                </PopoverTrigger>
                                <PopoverContent className="w-80">
                                  <div className="space-y-3">
                                    <h4 className="font-semibold text-sm">Add Notes</h4>
                                    <Textarea
                                      value={editingNotesPopover?.contactId === contact.id ? editingNotesPopover.notes : ''}
                                      onChange={(e) => setEditingNotesPopover({ contactId: contact.id, notes: e.target.value })}
                                      className="min-h-[120px] text-sm"
                                      placeholder="Enter notes..."
                                      autoFocus
                                      onFocus={() => {
                                        if (editingNotesPopover?.contactId !== contact.id) {
                                          setEditingNotesPopover({ contactId: contact.id, notes: '' });
                                        }
                                      }}
                                    />
                                    <div className="flex justify-end gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setEditingNotesPopover(null)}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={() => handleNotesPopoverSave(contact.id, editingNotesPopover?.notes || '')}
                                        disabled={!editingNotesPopover?.notes?.trim()}
                                      >
                                        Save
                                      </Button>
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )
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
                          {contact.businessContext && contact.businessContext.length > 0 ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <div
                                  className="text-sm cursor-pointer hover:text-blue-600 transition-colors max-w-[140px] truncate"
                                  title="Click to view/edit business context"
                                >
                                  {(contact.businessContext?.length ?? 0) > 50 ? `${contact.businessContext?.substring(0, 50)}...` : contact.businessContext}
                                </div>
                              </PopoverTrigger>
                              <PopoverContent className="w-80 max-h-[400px] overflow-y-auto">
                                <div className="space-y-3">
                                  <h4 className="font-semibold text-sm">Business Context</h4>
                                  {editingBusinessContext?.contactId === contact.id ? (
                                    <>
                                      <Textarea
                                        value={editingBusinessContext.businessContext}
                                        onChange={(e) => setEditingBusinessContext({ contactId: contact.id, businessContext: e.target.value })}
                                        className="min-h-[120px] text-sm"
                                        placeholder="Enter business context..."
                                        autoFocus
                                      />
                                      <div className="flex justify-end gap-2">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => setEditingBusinessContext(null)}
                                        >
                                          Cancel
                                        </Button>
                                        <Button
                                          size="sm"
                                          onClick={() => handleBusinessContextSave(contact.id, editingBusinessContext.businessContext)}
                                        >
                                          Save
                                        </Button>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <p className="text-sm whitespace-pre-wrap break-words bg-muted/50 p-3 rounded-md">{contact.businessContext}</p>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="w-full"
                                        onClick={() => setEditingBusinessContext({ contactId: contact.id, businessContext: contact.businessContext || '' })}
                                      >
                                        Edit Business Context
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <Popover>
                              <PopoverTrigger asChild>
                                <div
                                  className="text-sm cursor-pointer hover:text-blue-600 transition-colors"
                                  title="Click to add business context"
                                >
                                  <span className="text-gray-400">-</span>
                                </div>
                              </PopoverTrigger>
                              <PopoverContent className="w-80">
                                <div className="space-y-3">
                                  <h4 className="font-semibold text-sm">Add Business Context</h4>
                                  <Textarea
                                    value={editingBusinessContext?.contactId === contact.id ? editingBusinessContext.businessContext : ''}
                                    onChange={(e) => setEditingBusinessContext({ contactId: contact.id, businessContext: e.target.value })}
                                    className="min-h-[120px] text-sm"
                                    placeholder="Enter business context (industry, sector, etc.)..."
                                    autoFocus
                                    onFocus={() => {
                                      if (editingBusinessContext?.contactId !== contact.id) {
                                        setEditingBusinessContext({ contactId: contact.id, businessContext: '' });
                                      }
                                    }}
                                  />
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setEditingBusinessContext(null)}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() => handleBusinessContextSave(contact.id, editingBusinessContext?.businessContext || '')}
                                      disabled={!editingBusinessContext?.businessContext?.trim()}
                                    >
                                      Save
                                    </Button>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
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

      <LeadStageCustomizer
        open={isLeadStageCustomizerOpen}
        onOpenChange={setIsLeadStageCustomizerOpen}
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
