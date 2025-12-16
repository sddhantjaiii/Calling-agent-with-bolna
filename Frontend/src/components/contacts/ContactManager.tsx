import React, { useState } from 'react';
import ContactList from './ContactList';
import ContactDetails from './ContactDetails';
import ContactForm from './ContactForm';
import PipelineView from './PipelineView';
import { useContacts } from '@/hooks/useContacts';
import { useToast } from '@/components/ui/use-toast';
import { useSuccessFeedback } from '@/contexts/SuccessFeedbackContext';
import { confirmationPresets } from '@/hooks/useConfirmation';
import { Button } from '@/components/ui/button';
import { LayoutGrid, Kanban } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Contact } from '@/types';

type ViewMode = 'list' | 'pipeline' | 'details' | 'form';
type DisplayMode = 'table' | 'pipeline';

export const ContactManager: React.FC = () => {
  const { toast } = useToast();
  const { deleteContact } = useContacts();
  const { showSuccess, confirm } = useSuccessFeedback();
  
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('table');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const handleContactSelect = (contact: Contact) => {
    setSelectedContact(contact);
    setViewMode('details');
  };

  const handleContactEdit = (contact: Contact) => {
    setEditingContact(contact);
    setIsFormOpen(true);
  };

  const handleContactCreate = () => {
    setEditingContact(null);
    setIsFormOpen(true);
  };

  const handleContactDelete = async (contact: Contact) => {
    const confirmed = await confirm(confirmationPresets.deleteContact(contact.name));
    if (confirmed) {
      const success = await deleteContact(contact.id);
      if (success) {
        showSuccess.contact.deleted(contact.name, {
          description: 'Contact has been removed from your list',
          action: {
            label: 'Undo',
            onClick: () => {
              // Could implement undo functionality here
              toast({
                title: 'Undo functionality coming soon',
                description: 'We are working on adding undo capabilities.',
              });
            },
          },
        });
        
        // If we're viewing the deleted contact, go back to list
        if (selectedContact?.id === contact.id) {
          setSelectedContact(null);
          setViewMode('list');
        }
      }
    }
  };

  const handleBackToList = () => {
    setSelectedContact(null);
    setViewMode('list');
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingContact(null);
  };

  const handleFormSuccess = (contact: Contact) => {
    // If we were editing a contact and we're currently viewing it, update the view
    if (editingContact && selectedContact?.id === editingContact.id) {
      setSelectedContact(contact);
    }
  };

  const renderContent = () => {
    switch (viewMode) {
      case 'details':
        if (!selectedContact) {
          setViewMode('list');
          return null;
        }
        return (
          <ContactDetails
            contact={selectedContact}
            onBack={handleBackToList}
            onEdit={handleContactEdit}
            onDelete={handleContactDelete}
          />
        );
      
      case 'list':
      default:
        // Show either table or pipeline based on displayMode
        if (displayMode === 'pipeline') {
          return (
            <div className="h-full flex flex-col">
              {/* View Toggle Header */}
              <div className="flex-shrink-0 px-6 py-3 border-b bg-background flex items-center justify-end gap-2">
                <div className="flex items-center rounded-lg border bg-muted p-1">
                  <Button
                    variant={displayMode === 'table' ? 'secondary' : 'ghost'}
                    size="sm"
                    className={cn(
                      'h-8 px-3',
                      displayMode === 'table' && 'shadow-sm'
                    )}
                    onClick={() => setDisplayMode('table')}
                  >
                    <LayoutGrid className="h-4 w-4 mr-2" />
                    Table
                  </Button>
                  <Button
                    variant={displayMode === 'pipeline' ? 'secondary' : 'ghost'}
                    size="sm"
                    className={cn(
                      'h-8 px-3',
                      displayMode === 'pipeline' && 'shadow-sm'
                    )}
                    onClick={() => setDisplayMode('pipeline')}
                  >
                    <Kanban className="h-4 w-4 mr-2" />
                    Pipeline
                  </Button>
                </div>
              </div>
              
              {/* Pipeline View */}
              <div className="flex-1 overflow-hidden">
                <PipelineView
                  onContactSelect={handleContactSelect}
                  onContactEdit={handleContactEdit}
                />
              </div>
            </div>
          );
        }
        
        return (
          <div className="h-full flex flex-col">
            {/* Table View - toggle is inside ContactList header */}
            <div className="flex-1 overflow-hidden">
              <ContactList
                onContactSelect={handleContactSelect}
                onContactEdit={handleContactEdit}
                onContactCreate={handleContactCreate}
                enableInfiniteScroll={true}
                initialPageSize={20}
                displayMode={displayMode}
                onDisplayModeChange={setDisplayMode}
              />
            </div>
          </div>
        );
    }
  };

  return (
    <div className="h-full">
      {renderContent()}
      
      <ContactForm
        isOpen={isFormOpen}
        onClose={handleFormClose}
        contact={editingContact}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
};

export default ContactManager;