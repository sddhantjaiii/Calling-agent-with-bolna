import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Trash2, Edit, Eye, Mail } from 'lucide-react';
import emailTemplateService from '@/services/emailTemplateService';
import { EmailTemplate, UpdateEmailTemplateRequest } from '@/types/emailTemplate';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const EmailTemplates: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Form state for create/edit
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    subject: '',
    body_html: '',
    body_text: '',
    category: 'general'
  });

  // Fetch templates
  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['email-templates', categoryFilter],
    queryFn: async () => {
      const params = categoryFilter !== 'all' ? { category: categoryFilter } : undefined;
      return emailTemplateService.listTemplates(params);
    },
  });

  const templates = templatesData?.templates || [];

  // Create template mutation
  const createMutation = useMutation({
    mutationFn: emailTemplateService.createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast({
        title: 'Template Created',
        description: 'Email template has been created successfully',
      });
      setIsCreateModalOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Update template mutation
  const updateMutation = useMutation({
    mutationFn: ({ templateId, data }: { templateId: string; data: UpdateEmailTemplateRequest }) =>
      emailTemplateService.updateTemplate(templateId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast({
        title: 'Template Updated',
        description: 'Email template has been updated successfully',
      });
      setIsEditModalOpen(false);
      setSelectedTemplate(null);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete template mutation
  const deleteMutation = useMutation({
    mutationFn: emailTemplateService.deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast({
        title: 'Template Deleted',
        description: 'Email template has been deleted successfully',
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

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      subject: '',
      body_html: '',
      body_text: '',
      category: 'general'
    });
  };

  const handleCreate = () => {
    createMutation.mutate(formData);
  };

  const handleEdit = () => {
    if (!selectedTemplate) return;
    updateMutation.mutate({
      templateId: selectedTemplate.id,
      data: formData
    });
  };

  const openEditModal = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || '',
      subject: template.subject,
      body_html: template.body_html || '',
      body_text: template.body_text || '',
      category: template.category
    });
    setIsEditModalOpen(true);
  };

  const openViewModal = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    setIsViewModalOpen(true);
  };

  const getStatusBadge = (isActive: boolean) => {
    if (isActive) {
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
          Active
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="bg-gray-100 text-gray-800 border-gray-200">
        Inactive
      </Badge>
    );
  };

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      general: 'bg-blue-100 text-blue-800 border-blue-200',
      followup: 'bg-purple-100 text-purple-800 border-purple-200',
      welcome: 'bg-green-100 text-green-800 border-green-200',
      reminder: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    };

    return (
      <Badge variant="secondary" className={colors[category] || colors.general}>
        {category}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Email Templates
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Create and manage email templates for auto-engagement flows
              </p>
            </div>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </div>

          {/* Filters */}
          <div className="flex gap-4">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="followup">Follow-up</SelectItem>
                <SelectItem value="welcome">Welcome</SelectItem>
                <SelectItem value="reminder">Reminder</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Templates Grid */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading templates...</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow">
            <Mail className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No templates found
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Get started by creating your first email template
            </p>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <div
                key={template.id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow p-6"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      {template.name}
                    </h3>
                    <div className="flex gap-2 mb-2">
                      {getCategoryBadge(template.category)}
                      {getStatusBadge(template.is_active)}
                    </div>
                  </div>
                </div>

                {template.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                    {template.description}
                  </p>
                )}

                <div className="mb-4">
                  <p className="text-xs text-gray-500 dark:text-gray-500 mb-1">Subject:</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-1">
                    {template.subject}
                  </p>
                </div>

                {template.variables.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 dark:text-gray-500 mb-2">Variables:</p>
                    <div className="flex flex-wrap gap-1">
                      {template.variables.map((variable) => (
                        <Badge
                          key={variable}
                          variant="outline"
                          className="text-xs"
                        >
                          {`{{${variable}}}`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openViewModal(template)}
                    className="flex-1"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditModal(template)}
                    className="flex-1"
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDeleteConfirmId(template.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        <Dialog open={isCreateModalOpen || isEditModalOpen} onOpenChange={(open) => {
          if (!open) {
            setIsCreateModalOpen(false);
            setIsEditModalOpen(false);
            setSelectedTemplate(null);
            resetForm();
          }
        }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {isEditModalOpen ? 'Edit Email Template' : 'Create Email Template'}
              </DialogTitle>
              <DialogDescription>
                {isEditModalOpen
                  ? 'Update the email template details below'
                  : 'Create a new email template for auto-engagement flows'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="name">Template Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Welcome Email"
                />
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="followup">Follow-up</SelectItem>
                    <SelectItem value="welcome">Welcome</SelectItem>
                    <SelectItem value="reminder">Reminder</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this template"
                  rows={2}
                />
              </div>

              <div>
                <Label htmlFor="subject">Email Subject *</Label>
                <Input
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="e.g., Welcome to {{company}}, {{name}}!"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use {`{{variable}}`} for dynamic content (e.g., {`{{name}}, {{email}}, {{company}}`})
                </p>
              </div>

              <div>
                <Label htmlFor="body_html">Email Body (HTML)</Label>
                <Textarea
                  id="body_html"
                  value={formData.body_html}
                  onChange={(e) => setFormData({ ...formData, body_html: e.target.value })}
                  placeholder="<p>Hello {{name}},</p><p>Welcome to our platform!</p>"
                  rows={8}
                  className="font-mono text-sm"
                />
              </div>

              <div>
                <Label htmlFor="body_text">Email Body (Plain Text)</Label>
                <Textarea
                  id="body_text"
                  value={formData.body_text}
                  onChange={(e) => setFormData({ ...formData, body_text: e.target.value })}
                  placeholder="Hello {{name}},\n\nWelcome to our platform!"
                  rows={6}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setIsEditModalOpen(false);
                  setSelectedTemplate(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={isEditModalOpen ? handleEdit : handleCreate}
                disabled={!formData.name || !formData.subject}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {isEditModalOpen ? 'Update' : 'Create'} Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Modal */}
        <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedTemplate?.name}</DialogTitle>
              <DialogDescription>
                {selectedTemplate?.description || 'Email template details'}
              </DialogDescription>
            </DialogHeader>

            {selectedTemplate && (
              <div className="space-y-4 py-4">
                <div>
                  <Label>Category</Label>
                  <div className="mt-1">{getCategoryBadge(selectedTemplate.category)}</div>
                </div>

                <div>
                  <Label>Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedTemplate.is_active)}</div>
                </div>

                <div>
                  <Label>Subject</Label>
                  <p className="mt-1 text-sm text-gray-900 dark:text-white">
                    {selectedTemplate.subject}
                  </p>
                </div>

                {selectedTemplate.variables.length > 0 && (
                  <div>
                    <Label>Variables</Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {selectedTemplate.variables.map((variable) => (
                        <Badge key={variable} variant="outline">
                          {`{{${variable}}}`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTemplate.body_html && (
                  <div>
                    <Label>HTML Body</Label>
                    <div className="mt-1 p-4 bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 max-h-64 overflow-y-auto">
                      <pre className="text-xs whitespace-pre-wrap font-mono">
                        {selectedTemplate.body_html}
                      </pre>
                    </div>
                  </div>
                )}

                {selectedTemplate.body_text && (
                  <div>
                    <Label>Plain Text Body</Label>
                    <div className="mt-1 p-4 bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 max-h-64 overflow-y-auto">
                      <pre className="text-sm whitespace-pre-wrap">
                        {selectedTemplate.body_text}
                      </pre>
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Created: {new Date(selectedTemplate.created_at).toLocaleDateString()}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Email Template</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this email template? This action cannot be undone.
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
    </div>
  );
};

export default EmailTemplates;
