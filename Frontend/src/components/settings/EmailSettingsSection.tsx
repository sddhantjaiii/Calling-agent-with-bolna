import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useTheme } from '@/components/theme/ThemeProvider';
import { toast } from 'sonner';
import {
  Mail,
  Send,
  Eye,
  Settings2,
  AlertCircle,
  CheckCircle,
  Loader2,
  RefreshCw,
  Code,
  FileText,
  Timer,
  Filter,
  Sparkles,
  HelpCircle,
  Wand2,
  Palette,
} from 'lucide-react';

// Types
interface EmailSettings {
  id: string;
  user_id: string;
  auto_send_enabled: boolean;
  openai_followup_email_prompt_id?: string;
  subject_template: string;
  body_template: string;
  send_conditions: string[];
  lead_status_filters: string[];
  skip_if_no_email: boolean;
  send_delay_minutes: number;
  max_retries_before_send: number;
  created_at: string;
  updated_at: string;
}

interface TemplateVariable {
  name: string;
  description: string;
  example: string;
}

interface EmailPreview {
  subject: string;
  html: string;
  text: string;
}

const DEFAULT_SUBJECT = 'Follow-up: Great speaking with you, {{lead_name}}!';

/**
 * Email Settings Component for user follow-up email configuration
 */
const EmailSettingsSection = () => {
  const { theme } = useTheme();
  
  // State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [validatingPrompt, setValidatingPrompt] = useState(false);
  const [promptValidation, setPromptValidation] = useState<{
    status: 'idle' | 'valid' | 'invalid';
    message?: string;
  }>({ status: 'idle' });

  // AI Template Generator State
  const [generatingTemplate, setGeneratingTemplate] = useState(false);
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateTone, setTemplateTone] = useState<'professional' | 'friendly' | 'casual'>('professional');
  const [brandColor, setBrandColor] = useState('#4f46e5');
  const [companyName, setCompanyName] = useState('');

  // Form state
  const [autoSendEnabled, setAutoSendEnabled] = useState(false);
  const [promptId, setPromptId] = useState('');
  const [subjectTemplate, setSubjectTemplate] = useState(DEFAULT_SUBJECT);
  const [bodyTemplate, setBodyTemplate] = useState('');
  const [sendConditions, setSendConditions] = useState<string[]>(['completed']);
  const [leadStatusFilters, setLeadStatusFilters] = useState<string[]>(['any']);
  const [skipIfNoEmail, setSkipIfNoEmail] = useState(true);
  const [sendDelayMinutes, setSendDelayMinutes] = useState(0);
  const [maxRetriesBeforeSend, setMaxRetriesBeforeSend] = useState(3);

  // Available options
  const availableSendConditions = [
    { value: 'completed', label: 'Call Completed', description: 'Send after successful call' },
    { value: 'busy', label: 'Busy', description: 'Send when lead was busy' },
    { value: 'no_answer', label: 'No Answer', description: 'Send when there was no answer' },
    { value: 'voicemail', label: 'Voicemail', description: 'Send after leaving voicemail' },
    { value: 'after_retries', label: 'After Max Retries', description: 'Send after all retry attempts' },
  ];

  const availableLeadFilters = [
    { value: 'any', label: 'Any Status', description: 'Send to all leads' },
    { value: 'hot', label: 'Hot Leads', description: 'Only send to hot leads' },
    { value: 'warm', label: 'Warm Leads', description: 'Only send to warm leads' },
    { value: 'cold', label: 'Cold Leads', description: 'Only send to cold leads' },
  ];

  // Load settings on mount
  useEffect(() => {
    loadSettings();
    loadVariables();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/email-settings`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const s = data.data as EmailSettings;
        setSettings(s);
        setAutoSendEnabled(s.auto_send_enabled);
        setPromptId(s.openai_followup_email_prompt_id || '');
        setSubjectTemplate(s.subject_template || DEFAULT_SUBJECT);
        setBodyTemplate(s.body_template || '');
        setSendConditions(s.send_conditions || ['completed']);
        setLeadStatusFilters(s.lead_status_filters || ['any']);
        setSkipIfNoEmail(s.skip_if_no_email);
        setSendDelayMinutes(s.send_delay_minutes || 0);
        setMaxRetriesBeforeSend(s.max_retries_before_send || 3);
      }
    } catch (error) {
      console.error('Failed to load email settings:', error);
      toast.error('Failed to load email settings');
    } finally {
      setLoading(false);
    }
  };

  const loadVariables = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/email-settings/variables`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setVariables(data.data || []);
      }
    } catch (error) {
      console.error('Failed to load variables:', error);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('auth_token');
      
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/email-settings`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            auto_send_enabled: autoSendEnabled,
            openai_followup_email_prompt_id: promptId || null,
            subject_template: subjectTemplate,
            body_template: bodyTemplate,
            send_conditions: sendConditions,
            lead_status_filters: leadStatusFilters,
            skip_if_no_email: skipIfNoEmail,
            send_delay_minutes: sendDelayMinutes,
            max_retries_before_send: maxRetriesBeforeSend,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSettings(data.data);
        toast.success('Email settings saved successfully');
      } else {
        const error = await response.json();
        toast.error(error.error?.message || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save email settings');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAutoSend = async (enabled: boolean) => {
    setAutoSendEnabled(enabled);
    
    try {
      const token = localStorage.getItem('auth_token');
      
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/email-settings/toggle`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ enabled }),
        }
      );

      if (response.ok) {
        toast.success(`Auto-send ${enabled ? 'enabled' : 'disabled'}`);
      } else {
        setAutoSendEnabled(!enabled); // Revert on error
        toast.error('Failed to update auto-send setting');
      }
    } catch (error) {
      setAutoSendEnabled(!enabled);
      toast.error('Failed to update auto-send setting');
    }
  };

  const handlePreview = async () => {
    try {
      setLoadingPreview(true);
      const token = localStorage.getItem('auth_token');
      
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/email-settings/preview`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}), // Use default sample data
        }
      );

      if (response.ok) {
        const data = await response.json();
        setPreview(data.data);
        setShowPreview(true);
      } else {
        toast.error('Failed to generate preview');
      }
    } catch (error) {
      console.error('Failed to preview:', error);
      toast.error('Failed to generate preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  // OpenAI prompt ID validation pattern (must start with "pmpt_")
  const isValidPromptIdFormat = (id: string): boolean => {
    return id.startsWith('pmpt_');
  };

  const handleValidatePrompt = async () => {
    if (!promptId || !isValidPromptIdFormat(promptId)) {
      setPromptValidation({
        status: 'invalid',
        message: 'Prompt ID must start with "pmpt_"',
      });
      return;
    }

    try {
      setValidatingPrompt(true);
      const token = localStorage.getItem('auth_token');
      
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/email-settings/validate-prompt`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prompt_id: promptId }),
        }
      );

      const data = await response.json();
      
      if (data.data?.valid) {
        setPromptValidation({ status: 'valid', message: 'Valid prompt ID' });
        toast.success('Prompt validated successfully');
      } else {
        setPromptValidation({
          status: 'invalid',
          message: data.data?.error || 'Invalid prompt ID',
        });
        toast.error(data.data?.error || 'Invalid prompt ID');
      }
    } catch (error) {
      setPromptValidation({ status: 'invalid', message: 'Validation failed' });
      toast.error('Failed to validate prompt');
    } finally {
      setValidatingPrompt(false);
    }
  };

  const handleResetTemplate = async (type: 'subject' | 'body' | 'both') => {
    try {
      const token = localStorage.getItem('auth_token');
      
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/email-settings/reset-template`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ type }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const s = data.data as EmailSettings;
        
        if (type === 'subject' || type === 'both') {
          setSubjectTemplate(s.subject_template);
        }
        if (type === 'body' || type === 'both') {
          setBodyTemplate(s.body_template);
        }
        
        toast.success('Template reset to default');
      } else {
        toast.error('Failed to reset template');
      }
    } catch (error) {
      toast.error('Failed to reset template');
    }
  };

  const handleGenerateTemplate = async () => {
    if (!templateDescription || templateDescription.trim().length < 10) {
      toast.error('Please describe your email in at least 10 characters');
      return;
    }

    try {
      setGeneratingTemplate(true);
      const token = localStorage.getItem('auth_token');
      
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/email-settings/generate-template`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            description: templateDescription,
            tone: templateTone,
            brandColor: brandColor,
            companyName: companyName || undefined
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSubjectTemplate(data.data.subject_template);
        setBodyTemplate(data.data.body_template);
        toast.success('Template generated successfully! Review and save to apply.');
      } else {
        const error = await response.json();
        toast.error(error.error?.message || 'Failed to generate template');
      }
    } catch (error) {
      console.error('Failed to generate template:', error);
      toast.error('Failed to generate template');
    } finally {
      setGeneratingTemplate(false);
    }
  };

  const handleConditionChange = (condition: string, checked: boolean) => {
    if (checked) {
      setSendConditions([...sendConditions, condition]);
    } else {
      setSendConditions(sendConditions.filter(c => c !== condition));
    }
  };

  const handleFilterChange = (filter: string) => {
    if (filter === 'any') {
      setLeadStatusFilters(['any']);
    } else {
      const newFilters = leadStatusFilters.filter(f => f !== 'any');
      if (leadStatusFilters.includes(filter)) {
        const filtered = newFilters.filter(f => f !== filter);
        setLeadStatusFilters(filtered.length === 0 ? ['any'] : filtered);
      } else {
        setLeadStatusFilters([...newFilters, filter]);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Toggle */}
      <div className={`p-6 rounded-lg border ${
        theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      }`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-4">
            <div className={`p-3 rounded-lg ${
              theme === 'dark' ? 'bg-indigo-900/30' : 'bg-indigo-100'
            }`}>
              <Mail className={`w-8 h-8 ${
                theme === 'dark' ? 'text-indigo-400' : 'text-indigo-600'
              }`} />
            </div>
            <div>
              <h3 className={`font-semibold text-lg mb-1 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                Follow-up Email Settings
              </h3>
              <p className={`text-sm ${
                theme === 'dark' ? 'text-slate-400' : 'text-gray-600'
              }`}>
                Automatically send personalized follow-up emails after calls
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <span className={`text-sm ${
              theme === 'dark' ? 'text-slate-400' : 'text-gray-600'
            }`}>
              {autoSendEnabled ? 'Enabled' : 'Disabled'}
            </span>
            <Switch
              checked={autoSendEnabled}
              onCheckedChange={handleToggleAutoSend}
            />
          </div>
        </div>

        {autoSendEnabled && (
          <Alert className="mt-4 border-green-500/50 bg-green-500/10">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <AlertDescription className="text-green-600 dark:text-green-400">
              Auto-send is active. Follow-up emails will be sent based on your configured conditions.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Settings Tabs */}
      <Tabs defaultValue="conditions" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="conditions" className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Conditions</span>
          </TabsTrigger>
          <TabsTrigger value="template" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Template</span>
          </TabsTrigger>
          <TabsTrigger value="personalization" className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">AI</span>
          </TabsTrigger>
          <TabsTrigger value="timing" className="flex items-center gap-2">
            <Timer className="w-4 h-4" />
            <span className="hidden sm:inline">Timing</span>
          </TabsTrigger>
        </TabsList>

        {/* Conditions Tab */}
        <TabsContent value="conditions">
          <Card>
            <CardHeader>
              <CardTitle>When to Send Emails</CardTitle>
              <CardDescription>
                Configure which call outcomes and lead statuses trigger follow-up emails
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Send Conditions */}
              <div className="space-y-3">
                <Label>Call Outcome Conditions</Label>
                <p className={`text-sm ${
                  theme === 'dark' ? 'text-slate-400' : 'text-gray-500'
                }`}>
                  Select when follow-up emails should be sent
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {availableSendConditions.map((condition) => (
                    <div
                      key={condition.value}
                      className={`flex items-start space-x-3 p-3 rounded-lg border ${
                        theme === 'dark'
                          ? 'border-gray-700 bg-gray-800/50'
                          : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <Checkbox
                        id={`condition-${condition.value}`}
                        checked={sendConditions.includes(condition.value)}
                        onCheckedChange={(checked) => 
                          handleConditionChange(condition.value, checked as boolean)
                        }
                      />
                      <div className="space-y-1">
                        <label
                          htmlFor={`condition-${condition.value}`}
                          className={`text-sm font-medium cursor-pointer ${
                            theme === 'dark' ? 'text-white' : 'text-gray-900'
                          }`}
                        >
                          {condition.label}
                        </label>
                        <p className={`text-xs ${
                          theme === 'dark' ? 'text-slate-500' : 'text-gray-500'
                        }`}>
                          {condition.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Lead Status Filters */}
              <div className="space-y-3">
                <Label>Lead Status Filter</Label>
                <p className={`text-sm ${
                  theme === 'dark' ? 'text-slate-400' : 'text-gray-500'
                }`}>
                  Only send emails to leads matching these statuses
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableLeadFilters.map((filter) => (
                    <Badge
                      key={filter.value}
                      variant={leadStatusFilters.includes(filter.value) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => handleFilterChange(filter.value)}
                    >
                      {filter.label}
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Skip if no email */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Skip if No Email</Label>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-slate-400' : 'text-gray-500'
                  }`}>
                    Don't attempt to send if contact has no email address
                  </p>
                </div>
                <Switch
                  checked={skipIfNoEmail}
                  onCheckedChange={setSkipIfNoEmail}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Template Tab */}
        <TabsContent value="template">
          {/* AI Template Generator Card */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-indigo-500" />
                AI Template Generator
              </CardTitle>
              <CardDescription>
                Describe what you want and let AI create a professional email template for you
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Description Input */}
              <div className="space-y-2">
                <Label>Describe your follow-up email</Label>
                <Textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  placeholder="Example: A warm follow-up email thanking the lead for their time, mentioning our AI calling solution can help automate their outreach, and inviting them to schedule a demo..."
                  rows={3}
                  className="resize-none"
                />
                <p className={`text-xs ${
                  theme === 'dark' ? 'text-slate-500' : 'text-gray-500'
                }`}>
                  Be specific about what you want to include. The AI will use appropriate variables automatically.
                </p>
              </div>

              {/* Options Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Tone Selector */}
                <div className="space-y-2">
                  <Label>Tone</Label>
                  <Select
                    value={templateTone}
                    onValueChange={(value: 'professional' | 'friendly' | 'casual') => setTemplateTone(value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">
                        <span className="flex items-center gap-2">
                          💼 Professional
                        </span>
                      </SelectItem>
                      <SelectItem value="friendly">
                        <span className="flex items-center gap-2">
                          😊 Friendly
                        </span>
                      </SelectItem>
                      <SelectItem value="casual">
                        <span className="flex items-center gap-2">
                          🎉 Casual
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Brand Color */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Palette className="w-4 h-4" />
                    Brand Color
                  </Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer border-0"
                    />
                    <Input
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      placeholder="#4f46e5"
                      className="flex-1"
                    />
                  </div>
                </div>

                {/* Company Name */}
                <div className="space-y-2">
                  <Label>Company Name (optional)</Label>
                  <Input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Your company name"
                  />
                </div>
              </div>

              {/* Generate Button */}
              <Button
                onClick={handleGenerateTemplate}
                disabled={generatingTemplate || !templateDescription.trim()}
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
              >
                {generatingTemplate ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating Template...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Template with AI
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Template Editor Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Email Template</CardTitle>
                  <CardDescription>
                    Edit the generated template or create your own
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleResetTemplate('both')}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Reset to Default
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreview}
                    disabled={loadingPreview}
                  >
                    {loadingPreview ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Eye className="w-4 h-4 mr-2" />
                    )}
                    Preview
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Subject Line */}
              <div className="space-y-2">
                <Label>Subject Line</Label>
                <Input
                  value={subjectTemplate}
                  onChange={(e) => setSubjectTemplate(e.target.value)}
                  placeholder="Follow-up: Great speaking with you, {{lead_name}}!"
                />
                <p className={`text-xs ${
                  theme === 'dark' ? 'text-slate-500' : 'text-gray-500'
                }`}>
                  Use variables like {'{{lead_name}}'}, {'{{company}}'} for personalization
                </p>
              </div>

              {/* Body Template */}
              <div className="space-y-2">
                <Label>Email Body (HTML)</Label>
                <Textarea
                  value={bodyTemplate}
                  onChange={(e) => setBodyTemplate(e.target.value)}
                  placeholder="Enter your HTML email template..."
                  rows={15}
                  className="font-mono text-sm"
                />
              </div>

              {/* Available Variables */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Code className="w-4 h-4" />
                  <Label>Available Template Variables</Label>
                </div>
                <div className={`p-4 rounded-lg ${
                  theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'
                }`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {variables.map((v) => (
                      <div key={v.name} className="space-y-1">
                        <code className={`text-xs px-2 py-1 rounded ${
                          theme === 'dark' ? 'bg-gray-700 text-indigo-300' : 'bg-gray-200 text-indigo-600'
                        }`}>
                          {`{{${v.name}}}`}
                        </code>
                        <p className={`text-xs ${
                          theme === 'dark' ? 'text-slate-400' : 'text-gray-600'
                        }`}>
                          {v.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Personalization Tab */}
        <TabsContent value="personalization">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                AI-Powered Personalization
              </CardTitle>
              <CardDescription>
                Use OpenAI to generate personalized email content based on call transcripts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <HelpCircle className="w-4 h-4" />
                <AlertDescription>
                  Configure an OpenAI prompt ID to automatically generate personalized email content 
                  based on the call transcript. The AI will analyze the conversation and create 
                  a tailored follow-up message.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label>OpenAI Follow-up Email Prompt ID</Label>
                <div className="flex gap-2">
                  <Input
                    value={promptId}
                    onChange={(e) => {
                      setPromptId(e.target.value);
                      setPromptValidation({ status: 'idle' });
                    }}
                    placeholder="pmpt_..."
                  />
                  <Button
                    variant="outline"
                    onClick={handleValidatePrompt}
                    disabled={!promptId || validatingPrompt}
                  >
                    {validatingPrompt ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Validate'
                    )}
                  </Button>
                </div>
                {promptValidation.status !== 'idle' && (
                  <p className={`text-sm flex items-center gap-1 ${
                    promptValidation.status === 'valid' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {promptValidation.status === 'valid' ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <AlertCircle className="w-4 h-4" />
                    )}
                    {promptValidation.message}
                  </p>
                )}
                <p className={`text-xs ${
                  theme === 'dark' ? 'text-slate-500' : 'text-gray-500'
                }`}>
                  Create prompts at{' '}
                  <a
                    href="https://platform.openai.com/prompts"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-500 hover:underline"
                  >
                    OpenAI Platform
                  </a>
                  . Leave blank to use the template above without AI personalization.
                </p>
              </div>

              <Alert className="border-amber-500/50 bg-amber-500/10">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <AlertDescription className="text-amber-600 dark:text-amber-400">
                  When an OpenAI prompt is configured, the AI will generate personalized subject 
                  and body content. If generation fails, the template above will be used as fallback.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Timing Tab */}
        <TabsContent value="timing">
          <Card>
            <CardHeader>
              <CardTitle>Email Timing</CardTitle>
              <CardDescription>
                Configure when emails are sent after calls
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Send Delay (minutes)</Label>
                <div className="flex items-center gap-4">
                  <Input
                    type="number"
                    min={0}
                    max={1440}
                    value={sendDelayMinutes}
                    onChange={(e) => setSendDelayMinutes(parseInt(e.target.value) || 0)}
                    className="w-32"
                  />
                  <span className={`text-sm ${
                    theme === 'dark' ? 'text-slate-400' : 'text-gray-500'
                  }`}>
                    {sendDelayMinutes === 0 
                      ? 'Send immediately after call' 
                      : `Wait ${sendDelayMinutes} minute${sendDelayMinutes !== 1 ? 's' : ''} before sending`
                    }
                  </span>
                </div>
                <p className={`text-xs ${
                  theme === 'dark' ? 'text-slate-500' : 'text-gray-500'
                }`}>
                  Set to 0 for immediate sending. Max 1440 minutes (24 hours).
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Max Retries Before Send</Label>
                <p className={`text-sm ${
                  theme === 'dark' ? 'text-slate-400' : 'text-gray-500'
                }`}>
                  For the "After Max Retries" condition, send after this many retry attempts
                </p>
                <Select
                  value={maxRetriesBeforeSend.toString()}
                  onValueChange={(value) => setMaxRetriesBeforeSend(parseInt(value))}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <SelectItem key={n} value={n.toString()}>
                        {n} {n === 1 ? 'retry' : 'retries'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
            <DialogDescription>
              Preview of how the follow-up email will look with sample data
            </DialogDescription>
          </DialogHeader>
          
          {preview && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Subject Line</Label>
                <div className={`p-3 rounded-lg ${
                  theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'
                }`}>
                  {preview.subject}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Email Body</Label>
                <div className={`border rounded-lg overflow-hidden ${
                  theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
                }`}>
                  <iframe
                    srcDoc={preview.html}
                    className="w-full h-96 bg-white"
                    title="Email Preview"
                  />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmailSettingsSection;
