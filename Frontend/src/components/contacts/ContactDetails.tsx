import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Phone,
  MessageSquare,
  Mail,
  Building,
  Calendar,
  ArrowLeft,
  Edit,
  Trash2,
  FileText,
  PhoneIncoming,
  ExternalLink,
  Tag,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useContacts } from '@/hooks/useContacts';
import { useNavigation } from '@/contexts/NavigationContext';
import DeleteContactDialog from './DeleteContactDialog';
import { CallAgentModal } from './CallAgentModal';
import { SendWhatsAppModal } from './SendWhatsAppModal';
import { SendEmailModal } from './SendEmailModal';
import type { Contact } from '@/types';

interface ContactDetailsProps {
  contact: Contact;
  onBack: () => void;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
}

export const ContactDetails: React.FC<ContactDetailsProps> = ({
  contact,
  onBack,
  onEdit,
  onDelete,
}) => {
  const { toast } = useToast();
  const { deleting } = useContacts();
  const { navigateToLeadIntelligence } = useNavigation();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  const handleCall = () => {
    setIsCallModalOpen(true);
  };

  const handleMessage = () => {
    setIsWhatsAppModalOpen(true);
  };

  const handleEmail = () => {
    setIsEmailModalOpen(true);
  };

  const handleDeleteClick = () => {
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    setIsDeleteDialogOpen(false);
    onDelete(contact);
  };

  const handleDeleteCancel = () => {
    setIsDeleteDialogOpen(false);
  };

  const handleViewInteractionTimeline = () => {
    // Navigate to Lead Intelligence and auto-open this contact's timeline
    // The NavigationContext will handle setting targetLeadIdentifier
    // which triggers the useEffect in LeadIntelligence to auto-expand the timeline
    navigateToLeadIntelligence({ phone: contact.phoneNumber });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Contacts
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{contact.name}</h1>
              {contact.isAutoCreated && contact.autoCreationSource === 'webhook' && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <PhoneIncoming className="w-3 h-3" />
                  Inbound Call
                </Badge>
              )}
            </div>
            {contact.isAutoCreated && (
              <p className="text-sm text-muted-foreground mt-1">
                Auto created and linked to call
              </p>
            )}
            {contact.callLinkType === 'manually_linked' && (
              <p className="text-sm text-muted-foreground mt-1">
                Manually linked to call
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button onClick={handleCall} className="flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Call
          </Button>
          <Button variant="outline" onClick={handleMessage}>
            <MessageSquare className="w-4 h-4 mr-2" />
            WhatsApp
          </Button>
          <Button variant="outline" onClick={handleEmail}>
            <Mail className="w-4 h-4 mr-2" />
            Email
          </Button>
          <Button variant="outline" onClick={() => onEdit(contact)}>
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
          
          <Button 
            variant="outline" 
            className="text-red-600 hover:text-red-700"
            onClick={handleDeleteClick}
            disabled={deleting}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact Information */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-500">Name</label>
                  <p className="text-lg font-medium">{contact.name}</p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-500">Phone</label>
                  <p className="text-lg">{formatPhoneNumber(contact.phoneNumber)}</p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-500">Email</label>
                  <p className="text-lg">
                    {contact.email ? (
                      <a 
                        href={`mailto:${contact.email}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {contact.email}
                      </a>
                    ) : (
                      <span className="text-gray-400">No email provided</span>
                    )}
                  </p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-500">Company</label>
                  <p className="text-lg">
                    {contact.company ? (
                      <span className="flex items-center gap-2">
                        <Building className="w-4 h-4 text-gray-400" />
                        {contact.company}
                      </span>
                    ) : (
                      <span className="text-gray-400">No company provided</span>
                    )}
                  </p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-500">Location</label>
                  <p className="text-lg">
                    {contact.city || contact.country ? (
                      <span>
                        {contact.city || '-'}
                        {contact.country && (
                          <span className="text-sm text-muted-foreground ml-1">({contact.country})</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-400">No location provided</span>
                    )}
                  </p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-500">Business Context</label>
                  <p className="text-lg">
                    {contact.businessContext || <span className="text-gray-400">No business context provided</span>}
                  </p>
                </div>
              </div>

              {/* Tags Section */}
              {contact.tags && contact.tags.length > 0 && (
                <div className="space-y-2 pt-4 border-t">
                  <label className="text-sm font-medium text-gray-500 flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {contact.tags.map((tag, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {contact.notes && (
                <div className="space-y-2 pt-4 border-t">
                  <label className="text-sm font-medium text-gray-500">Notes</label>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
                    <p className="text-sm whitespace-pre-wrap">{contact.notes}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Interaction Timeline - Redirect to Lead Intelligence */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="w-4 h-4" />
                Interaction Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="py-4">
              <div className="space-y-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  View all calls, messages, and interactions with this contact.
                </p>
                <Button 
                  onClick={handleViewInteractionTimeline}
                  className="w-full gap-2"
                  variant="default"
                >
                  <ExternalLink className="w-4 h-4" />
                  View Full Timeline
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Contact Details */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-500">Contact ID</label>
                <p className="text-sm font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded">
                  {contact.id}
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-500">Added</label>
                <p className="text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  {formatDate(contact.createdAt)}
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-500">Last Updated</label>
                <p className="text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  {formatDate(contact.updatedAt)}
                </p>
              </div>

              {/* Auto-creation and call link information */}
              {(contact.isAutoCreated || contact.callLinkType !== 'not_linked') && (
                <div className="space-y-2 pt-4 border-t">
                  <label className="text-sm font-medium text-gray-500">Call Information</label>
                  <div className="space-y-2">
                    {contact.isAutoCreated && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            Auto-created from call
                          </Badge>
                          {contact.callCreatedAt && (
                            <span className="text-gray-500">
                              on {formatDate(contact.callCreatedAt)}
                            </span>
                          )}
                        </div>
                        {contact.autoCreationSource === 'webhook' && (
                          <div className="flex items-center gap-2 text-sm">
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 flex items-center gap-1">
                              <PhoneIncoming className="w-3 h-3" />
                              Created from inbound call
                            </Badge>
                          </div>
                        )}
                      </div>
                    )}
                    {contact.callLinkType === 'manually_linked' && (
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          Manually linked to call
                        </Badge>
                      </div>
                    )}
                    {contact.linkedCallId && (
                      <p className="text-xs text-gray-500 font-mono">
                        Call ID: {contact.linkedCallId}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteContactDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={handleDeleteCancel}
        contact={contact}
        onConfirm={handleDeleteConfirm}
        isDeleting={deleting}
      />

      {/* Call Modal */}
      <CallAgentModal
        open={isCallModalOpen}
        onClose={() => setIsCallModalOpen(false)}
        contact={contact}
        onCallInitiated={() => {
          toast({
            title: 'Call initiated',
            description: `Calling ${contact.name}...`,
          });
        }}
      />

      {/* WhatsApp Modal */}
      <SendWhatsAppModal
        open={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
        contact={contact}
        onMessageSent={() => {
          toast({
            title: 'Message sent',
            description: `WhatsApp message sent to ${contact.name}`,
          });
        }}
      />

      {/* Email Modal */}
      <SendEmailModal
        open={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        contact={contact}
        onEmailSent={() => {
          toast({
            title: 'Email sent',
            description: `Email sent to ${contact.name}`,
          });
        }}
      />
    </div>
  );
};

export default ContactDetails;