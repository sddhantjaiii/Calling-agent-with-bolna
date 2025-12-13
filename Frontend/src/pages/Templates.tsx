import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Trash2, Send, Eye, RefreshCw, MoreVertical } from 'lucide-react';
import CreateTemplateModal from '@/components/templates/CreateTemplateModal';
import TemplateDetailsModal from '@/components/templates/TemplateDetailsModal';
import whatsappTemplateService, { 
  Template, 
  TemplateStatus 
} from '@/services/whatsappTemplateService';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface WhatsAppPhoneNumber {
  id: string;
  user_id: string;
  platform: string;
  meta_phone_number_id: string;
  display_name: string;
}

const Templates: React.FC = () => {
  const { theme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [whatsappPhoneNumbers, setWhatsappPhoneNumbers] = useState<WhatsAppPhoneNumber[]>([]);
  const [selectedPhoneNumberId, setSelectedPhoneNumberId] = useState<string>('');

  // Fetch WhatsApp phone numbers using correct API endpoint
  useEffect(() => {
    const fetchPhoneNumbers = async () => {
      if (!user?.id) return;
      try {
        // Use correct /api/v1/phone-numbers?user_id=xxx endpoint
        const phoneNumbers = await whatsappTemplateService.listPhoneNumbers(user.id);
        setWhatsappPhoneNumbers(phoneNumbers || []);
        if (phoneNumbers?.length > 0 && !selectedPhoneNumberId) {
          // Use 'id' field, not 'meta_phone_number_id'
          setSelectedPhoneNumberId(phoneNumbers[0].id);
        }
      } catch (error) {
        console.error('Failed to fetch WhatsApp phone numbers:', error);
      }
    };
    fetchPhoneNumbers();
  }, [user?.id]);

  // Fetch templates - requires phone_number_id
  const { data: templatesData, isLoading, refetch } = useQuery({
    queryKey: ['whatsapp-templates', selectedPhoneNumberId, statusFilter],
    queryFn: async () => {
      if (!selectedPhoneNumberId) {
        return { templates: [], total: 0 };
      }
      const options: { phoneNumberId?: string; status?: TemplateStatus } = {
        phoneNumberId: selectedPhoneNumberId,
      };
      if (statusFilter !== 'all') {
        options.status = statusFilter as TemplateStatus;
      }
      return whatsappTemplateService.listTemplates(options);
    },
    enabled: !!selectedPhoneNumberId, // Only fetch when phone number is selected
  });

  const templates = templatesData?.templates || [];

  // Delete template mutation
  const deleteMutation = useMutation({
    mutationFn: async (templateId: string) => {
      return whatsappTemplateService.deleteTemplate(templateId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      toast({
        title: 'Template Deleted',
        description: 'Template has been deleted successfully',
      });
      setDeleteConfirmId(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Submit template for approval mutation
  const submitMutation = useMutation({
    mutationFn: async (templateId: string) => {
      return whatsappTemplateService.submitTemplate(templateId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      toast({
        title: 'Template Submitted',
        description: 'Template has been submitted for Meta approval',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Sync templates from Meta mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !selectedPhoneNumberId) {
        throw new Error('Please select a phone number to sync templates');
      }
      return whatsappTemplateService.syncTemplates(user.id, selectedPhoneNumberId);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      toast({
        title: 'Templates Synced',
        description: `Imported ${data.imported}, updated ${data.updated} templates from Meta`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Sync Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const getStatusBadge = (status: TemplateStatus) => {
    const variants: Record<TemplateStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline', color: string }> = {
      DRAFT: { variant: 'secondary', color: 'text-gray-600' },
      PENDING: { variant: 'outline', color: 'text-yellow-600' },
      APPROVED: { variant: 'default', color: 'text-green-600' },
      REJECTED: { variant: 'destructive', color: 'text-red-600' },
      PAUSED: { variant: 'outline', color: 'text-orange-600' },
      DISABLED: { variant: 'secondary', color: 'text-gray-500' },
    };
    
    const config = variants[status] || variants.DRAFT;
    
    return (
      <Badge variant={config.variant} className={config.color}>
        {status}
      </Badge>
    );
  };

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      MARKETING: 'bg-purple-100 text-purple-800',
      UTILITY: 'bg-blue-100 text-blue-800',
      AUTHENTICATION: 'bg-green-100 text-green-800',
    };
    
    return (
      <Badge variant="outline" className={colors[category] || 'bg-gray-100 text-gray-800'}>
        {category}
      </Badge>
    );
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getBodyText = (template: Template) => {
    // Handle components in different formats
    let components = template.components as any;
    
    // If string, parse it
    if (typeof components === 'string') {
      try {
        components = JSON.parse(components);
      } catch {
        return 'No body text';
      }
    }
    
    // If array format (e.g., [{type: 'BODY', text: '...'}])
    if (Array.isArray(components)) {
      const bodyComponent = components.find(c => c.type === 'BODY');
      return bodyComponent?.text || 'No body text';
    }
    
    // If object format (e.g., {body: {type: 'BODY', text: '...'}})
    if (components && typeof components === 'object') {
      // Try direct body key
      if (components.body?.text) {
        return components.body.text;
      }
      // Try BODY key
      if (components.BODY?.text) {
        return components.BODY.text;
      }
    }
    
    return 'No body text';
  };

  return (
    <div className={`h-full p-6 ${theme === 'dark' ? 'bg-black text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">WhatsApp Templates</h1>
          <p className={`mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Create and manage your WhatsApp message templates
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {/* Phone number selector for sync */}
          {whatsappPhoneNumbers.length > 0 && (
            <Select value={selectedPhoneNumberId} onValueChange={setSelectedPhoneNumberId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select phone" />
              </SelectTrigger>
              <SelectContent>
                {whatsappPhoneNumbers.map((pn) => (
                  <SelectItem key={pn.id} value={pn.id}>
                    {pn.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || !selectedPhoneNumberId}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            Sync from Meta
          </Button>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            style={{ backgroundColor: '#1A6262' }}
            className="text-white hover:opacity-90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Template
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-2">
        {['all', 'DRAFT', 'PENDING', 'APPROVED', 'REJECTED'].map((filter) => (
          <Button
            key={filter}
            size="sm"
            variant={statusFilter === filter ? 'default' : 'outline'}
            onClick={() => setStatusFilter(filter)}
            style={statusFilter === filter ? { backgroundColor: '#1A6262' } : {}}
          >
            {filter === 'all' ? 'All' : filter}
          </Button>
        ))}
      </div>

      {/* Template List */}
      <div className={`rounded-lg border ${theme === 'dark' ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white mx-auto"></div>
            <p className="mt-4">Loading templates...</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="p-8 text-center">
            <p className={`text-lg ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              No templates found. Create your first template to get started!
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Language</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${theme === 'dark' ? 'divide-gray-700' : 'divide-gray-200'}`}>
                {templates.map((template: Template) => (
                  <tr key={template.template_id} className={`${theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}`}>
                    {/* Name Column */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium">{template.name}</div>
                      <div className={`text-sm truncate max-w-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                        {getBodyText(template).substring(0, 50)}...
                      </div>
                    </td>
                    
                    {/* Category Column */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getCategoryBadge(template.category)}
                    </td>
                    
                    {/* Status Column */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {template.status ? getStatusBadge(template.status) : (
                        <Badge variant="outline" className="text-gray-500">SYNCED</Badge>
                      )}
                    </td>
                    
                    {/* Language Column */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {template.language || 'en'}
                    </td>
                    
                    {/* Created Date Column */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {formatDate(template.created_at)}
                    </td>
                    
                    {/* Actions Column */}
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedTemplate(template)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {template.status === 'DRAFT' && (
                              <DropdownMenuItem 
                                onClick={() => submitMutation.mutate(template.template_id)}
                                disabled={submitMutation.isPending}
                              >
                                <Send className="w-4 h-4 mr-2" />
                                Submit for Approval
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem 
                              onClick={() => setDeleteConfirmId(template.template_id)}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Template Modal */}
      <CreateTemplateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          refetch();
          setIsCreateModalOpen(false);
        }}
      />

      {/* Template Details Modal */}
      {selectedTemplate && (
        <TemplateDetailsModal
          template={selectedTemplate}
          isOpen={!!selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the template.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Templates;
