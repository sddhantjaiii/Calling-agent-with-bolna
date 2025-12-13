import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { useToast } from '@/components/ui/use-toast';
import { Upload, X, Plus, Trash2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import whatsappTemplateService, {
  TemplateCategory,
  TemplateComponent,
  TemplateVariable,
  TemplateButton,
  ButtonType,
} from '@/services/whatsappTemplateService';

// Variable mapping options - shows friendly names in UI but uses DB column names for API
const VARIABLE_MAPPING_OPTIONS = [
  { label: 'Name', value: 'name' },
  { label: 'Phone Number', value: 'phoneNumber' },
  { label: 'Email', value: 'email' },
  { label: 'Company', value: 'company' },
  { label: 'City', value: 'city' },
  { label: 'Country', value: 'country' },
  { label: 'Business Context', value: 'businessContext' },
  { label: 'Notes', value: 'notes' },
  { label: 'Meeting Link', value: 'meetingLink' },
  { label: 'Meeting Details', value: 'meetingDetails' },
  { label: 'Custom Value', value: 'custom' },
];

const CATEGORY_OPTIONS: { label: string; value: TemplateCategory }[] = [
  { label: 'Marketing', value: 'MARKETING' },
  { label: 'Utility', value: 'UTILITY' },
  { label: 'Authentication', value: 'AUTHENTICATION' },
];

const LANGUAGE_OPTIONS = [
  { label: 'English', value: 'en' },
  { label: 'English (US)', value: 'en_US' },
  { label: 'English (UK)', value: 'en_GB' },
  { label: 'Hindi', value: 'hi' },
  { label: 'Spanish', value: 'es' },
];

interface WhatsAppPhoneNumber {
  id: string;
  user_id: string;
  platform: string;
  meta_phone_number_id: string;
  display_name: string;
}

interface VariableConfig {
  position: number;
  name: string;
  mapping: string;
  customValue: string;
  sampleValue: string;
}

interface ButtonConfig {
  type: ButtonType;
  text: string;
  url?: string;
  phone_number?: string;
}

interface CreateTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const CreateTemplateModal: React.FC<CreateTemplateModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { theme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('MARKETING');
  const [language, setLanguage] = useState('en');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  
  // Header state
  const [headerType, setHeaderType] = useState<'none' | 'text' | 'image' | 'video' | 'document'>('none');
  const [headerText, setHeaderText] = useState('');
  const [headerMediaFile, setHeaderMediaFile] = useState<File | null>(null);
  const [headerMediaPreview, setHeaderMediaPreview] = useState<string>('');
  
  // Body state
  const [bodyText, setBodyText] = useState('');
  const [variables, setVariables] = useState<VariableConfig[]>([]);
  
  // Footer state
  const [footerText, setFooterText] = useState('');
  
  // Buttons state
  const [buttons, setButtons] = useState<ButtonConfig[]>([]);
  
  // Phone numbers
  const [whatsappPhoneNumbers, setWhatsappPhoneNumbers] = useState<WhatsAppPhoneNumber[]>([]);
  const [isFetchingPhoneNumbers, setIsFetchingPhoneNumbers] = useState(false);
  
  // Variable mapping modal
  const [showVariableMapping, setShowVariableMapping] = useState(false);

  // Fetch WhatsApp phone numbers using correct API endpoint
  useEffect(() => {
    if (isOpen && user?.id) {
      fetchWhatsAppPhoneNumbers();
    }
  }, [isOpen, user?.id]);

  const fetchWhatsAppPhoneNumbers = async () => {
    if (!user?.id) return;
    
    setIsFetchingPhoneNumbers(true);
    try {
      // Use correct /api/v1/phone-numbers?user_id=xxx endpoint
      const phoneNumbers = await whatsappTemplateService.listPhoneNumbers(user.id);
      setWhatsappPhoneNumbers(phoneNumbers || []);
      if (phoneNumbers?.length > 0 && !phoneNumberId) {
        // Use 'id' field, not 'meta_phone_number_id'
        setPhoneNumberId(phoneNumbers[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch WhatsApp phone numbers:', error);
    } finally {
      setIsFetchingPhoneNumbers(false);
    }
  };

  // Parse variables from body text
  useEffect(() => {
    const regex = /\{\{(\d+)\}\}/g;
    const matches = [...bodyText.matchAll(regex)];
    const positions = [...new Set(matches.map(m => parseInt(m[1])))].sort((a, b) => a - b);
    
    // Update variables list
    const newVariables: VariableConfig[] = positions.map(pos => {
      const existing = variables.find(v => v.position === pos);
      return existing || {
        position: pos,
        name: `Variable ${pos}`,
        mapping: '',
        customValue: '',
        sampleValue: '',
      };
    });
    
    setVariables(newVariables);
  }, [bodyText]);

  // Handle media file selection
  const handleMediaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setHeaderMediaFile(file);
      
      // Create preview for images
      if (headerType === 'image' && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => setHeaderMediaPreview(e.target?.result as string);
        reader.readAsDataURL(file);
      } else {
        setHeaderMediaPreview(file.name);
      }
    }
  };

  // Update variable mapping
  const updateVariableMapping = (position: number, field: string, value: string) => {
    setVariables(prev => prev.map(v => 
      v.position === position ? { ...v, [field]: value } : v
    ));
  };

  // Add button
  const addButton = () => {
    if (buttons.length < 3) {
      setButtons(prev => [...prev, { type: 'QUICK_REPLY', text: '' }]);
    }
  };

  // Remove button
  const removeButton = (index: number) => {
    setButtons(prev => prev.filter((_, i) => i !== index));
  };

  // Update button
  const updateButton = (index: number, field: string, value: string) => {
    setButtons(prev => prev.map((btn, i) => 
      i === index ? { ...btn, [field]: value } : btn
    ));
  };

  // Create template mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      // Build components
      const components: TemplateComponent[] = [];
      
      // Header component
      if (headerType !== 'none') {
        const headerComponent: TemplateComponent = {
          type: 'HEADER',
          format: headerType.toUpperCase() as any,
        };
        if (headerType === 'text') {
          headerComponent.text = headerText;
        }
        components.push(headerComponent);
      }
      
      // Body component
      if (bodyText) {
        const bodyComponent: TemplateComponent = {
          type: 'BODY',
          text: bodyText,
        };
        
        // Add sample values for variables
        if (variables.length > 0) {
          bodyComponent.example = {
            body_text: [variables.map(v => v.sampleValue || 'sample')],
          };
        }
        
        components.push(bodyComponent);
      }
      
      // Footer component
      if (footerText) {
        components.push({
          type: 'FOOTER',
          text: footerText,
        });
      }
      
      // Buttons component
      if (buttons.length > 0) {
        components.push({
          type: 'BUTTONS',
          buttons: buttons.map(btn => ({
            type: btn.type,
            text: btn.text,
            ...(btn.url && { url: btn.url }),
            ...(btn.phone_number && { phone_number: btn.phone_number }),
          })),
        });
      }
      
      // Build variables
      const templateVariables: TemplateVariable[] = variables.map(v => ({
        variable_name: v.name,
        position: v.position,
        component_type: 'BODY',
        extraction_field: v.mapping !== 'custom' ? v.mapping : undefined,
        default_value: v.mapping === 'custom' ? v.customValue : undefined,
        sample_value: v.sampleValue,
      }));
      
      const templateData = {
        user_id: user?.id || '',
        phone_number_id: phoneNumberId,
        name,
        category,
        language,
        components,
        variables: templateVariables,
      };
      
      return whatsappTemplateService.createTemplate(templateData, headerMediaFile || undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      toast({
        title: 'Template Created',
        description: 'Your template has been created successfully',
      });
      resetForm();
      onSuccess?.();
      onClose();
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
    setName('');
    setCategory('MARKETING');
    setLanguage('en');
    setHeaderType('none');
    setHeaderText('');
    setHeaderMediaFile(null);
    setHeaderMediaPreview('');
    setBodyText('');
    setVariables([]);
    setFooterText('');
    setButtons([]);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const isFormValid = () => {
    return name.trim() && bodyText.trim() && phoneNumberId;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className={`max-w-2xl max-h-[90vh] overflow-y-auto ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white'}`}>
        <DialogHeader>
          <DialogTitle>Create WhatsApp Template</DialogTitle>
          <DialogDescription>
            Create a new message template for WhatsApp Business API
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                placeholder="my_template_name"
              />
              <p className="text-xs text-gray-500">Lowercase letters, numbers, and underscores only</p>
            </div>

            <div className="space-y-2">
              <Label>Phone Number *</Label>
              <Select value={phoneNumberId} onValueChange={setPhoneNumberId}>
                <SelectTrigger>
                  <SelectValue placeholder={isFetchingPhoneNumbers ? "Loading..." : "Select phone number"} />
                </SelectTrigger>
                <SelectContent>
                  {whatsappPhoneNumbers.map((pn) => (
                    <SelectItem key={pn.id} value={pn.id}>
                      {pn.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as TemplateCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Language *</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Header */}
          <div className="space-y-3">
            <Label>Header (Optional)</Label>
            <Select value={headerType} onValueChange={(v: any) => setHeaderType(v)}>
              <SelectTrigger>
                <SelectValue placeholder="No header" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Header</SelectItem>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="image">Image</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="document">Document</SelectItem>
              </SelectContent>
            </Select>

            {headerType === 'text' && (
              <Input
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                placeholder="Header text"
                maxLength={60}
              />
            )}

            {['image', 'video', 'document'].includes(headerType) && (
              <div className={`border-2 border-dashed rounded-lg p-4 ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}>
                {headerMediaPreview ? (
                  <div className="flex items-center justify-between">
                    {headerType === 'image' ? (
                      <img src={headerMediaPreview} alt="Preview" className="h-20 object-cover rounded" />
                    ) : (
                      <span className="text-sm">{headerMediaPreview}</span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setHeaderMediaFile(null);
                        setHeaderMediaPreview('');
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center">
                    <Upload className="w-8 h-8 text-gray-400 mb-2" />
                    <span className="text-sm text-gray-500">Click to upload {headerType}</span>
                    <input
                      type="file"
                      className="hidden"
                      accept={
                        headerType === 'image' ? 'image/jpeg,image/png' :
                        headerType === 'video' ? 'video/mp4' :
                        '.pdf,.doc,.docx'
                      }
                      onChange={handleMediaFileChange}
                    />
                  </label>
                )}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="space-y-3">
            <Label>Body Text *</Label>
            <Textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Hello {{1}}, your order {{2}} has been confirmed."
              rows={4}
              maxLength={1024}
            />
            <p className="text-xs text-gray-500">
              Use {'{{1}}'}, {'{{2}}'}, etc. for variables. Max 1024 characters.
            </p>

            {/* Variables Mapping */}
            {variables.length > 0 && (
              <div className={`rounded-lg p-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-sm font-medium">Variable Mapping</Label>
                  <Badge variant="secondary">{variables.length} variable(s)</Badge>
                </div>
                <div className="space-y-3">
                  {variables.map((variable) => (
                    <div key={variable.position} className="grid grid-cols-3 gap-2 items-center">
                      <div className="text-sm font-medium">{`{{${variable.position}}}`}</div>
                      <Select
                        value={variable.mapping}
                        onValueChange={(v) => updateVariableMapping(variable.position, 'mapping', v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select field" />
                        </SelectTrigger>
                        <SelectContent>
                          {VARIABLE_MAPPING_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {variable.mapping === 'custom' ? (
                        <Input
                          value={variable.customValue}
                          onChange={(e) => updateVariableMapping(variable.position, 'customValue', e.target.value)}
                          placeholder="Custom value"
                        />
                      ) : (
                        <Input
                          value={variable.sampleValue}
                          onChange={(e) => updateVariableMapping(variable.position, 'sampleValue', e.target.value)}
                          placeholder="Sample value"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="space-y-2">
            <Label>Footer (Optional)</Label>
            <Input
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="Footer text"
              maxLength={60}
            />
          </div>

          {/* Buttons */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Buttons (Optional)</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={addButton}
                disabled={buttons.length >= 3}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Button
              </Button>
            </div>

            {buttons.map((button, index) => (
              <div key={index} className={`rounded-lg p-3 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Select
                    value={button.type}
                    onValueChange={(v) => updateButton(index, 'type', v)}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="QUICK_REPLY">Quick Reply</SelectItem>
                      <SelectItem value="URL">URL</SelectItem>
                      <SelectItem value="PHONE_NUMBER">Phone Number</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={button.text}
                    onChange={(e) => updateButton(index, 'text', e.target.value)}
                    placeholder="Button text"
                    maxLength={25}
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeButton(index)}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
                
                {button.type === 'URL' && (
                  <Input
                    value={button.url || ''}
                    onChange={(e) => updateButton(index, 'url', e.target.value)}
                    placeholder="https://example.com"
                    className="mt-2"
                  />
                )}
                
                {button.type === 'PHONE_NUMBER' && (
                  <Input
                    value={button.phone_number || ''}
                    onChange={(e) => updateButton(index, 'phone_number', e.target.value)}
                    placeholder="+1234567890"
                    className="mt-2"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!isFormValid() || createMutation.isPending}
            style={{ backgroundColor: '#1A6262' }}
            className="text-white"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Template'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateTemplateModal;
