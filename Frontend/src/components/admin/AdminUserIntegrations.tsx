import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Brain, Check, AlertCircle, ExternalLink, Loader2, RefreshCw, Search, Users } from 'lucide-react';
import { openaiPromptService, OpenAIPromptConfig } from '@/services/openaiPromptService';
import { User } from '@/types/api';

interface UserPromptManagementProps {
  className?: string;
}

export const AdminUserIntegrations: React.FC<UserPromptManagementProps> = ({ className }) => {
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState<'individual' | 'complete' | null>(null);
  const [config, setConfig] = useState<OpenAIPromptConfig | null>(null);
  
  const [individualPromptId, setIndividualPromptId] = useState('');
  const [completePromptId, setCompletePromptId] = useState('');
  
  const [individualValidation, setIndividualValidation] = useState<{
    status: 'idle' | 'valid' | 'invalid';
    message?: string;
  }>({ status: 'idle' });
  
  const [completeValidation, setCompleteValidation] = useState<{
    status: 'idle' | 'valid' | 'invalid';
    message?: string;
  }>({ status: 'idle' });

  // Load users on mount
  useEffect(() => {
    loadUsers();
  }, []);

  // Load config when user is selected
  useEffect(() => {
    if (selectedUserId) {
      loadUserConfig(selectedUserId);
    } else {
      setConfig(null);
      setIndividualPromptId('');
      setCompletePromptId('');
    }
  }, [selectedUserId]);

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/admin/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }
      
      const data = await response.json();
      if (data.success && data.data?.users) {
        setUsers(data.data.users);
      }
    } catch (error) {
      console.error('Failed to load users:', error);
      toast.error('Failed to load users list');
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadUserConfig = async (userId: string) => {
    try {
      setLoading(true);
      const data = await openaiPromptService.adminGetUserPrompts(userId);
      setConfig(data);
      setIndividualPromptId(data.openai_individual_prompt_id || '');
      setCompletePromptId(data.openai_complete_prompt_id || '');
      setSelectedUser(users.find(u => u.id === userId) || null);
    } catch (error) {
      console.error('Failed to load user prompt config:', error);
      toast.error('Failed to load user configuration');
    } finally {
      setLoading(false);
    }
  };

  const validatePrompt = async (promptId: string, type: 'individual' | 'complete') => {
    if (!promptId || !promptId.startsWith('pmpt_')) {
      const validation = {
        status: 'invalid' as const,
        message: 'Prompt ID must start with "pmpt_"',
      };
      
      if (type === 'individual') {
        setIndividualValidation(validation);
      } else {
        setCompleteValidation(validation);
      }
      return;
    }

    try {
      setValidating(type);
      const result = await openaiPromptService.validatePrompt(promptId);
      
      const validation = {
        status: result.valid ? ('valid' as const) : ('invalid' as const),
        message: result.valid 
          ? `Valid prompt (Model: ${result.details?.model || 'Unknown'})` 
          : result.error,
      };
      
      if (type === 'individual') {
        setIndividualValidation(validation);
      } else {
        setCompleteValidation(validation);
      }
      
      if (result.valid) {
        toast.success(`${type === 'individual' ? 'Individual' : 'Complete'} prompt validated successfully`);
      } else {
        toast.error(result.error || 'Validation failed');
      }
    } catch (error: any) {
      const validation = {
        status: 'invalid' as const,
        message: error.message || 'Failed to validate prompt',
      };
      
      if (type === 'individual') {
        setIndividualValidation(validation);
      } else {
        setCompleteValidation(validation);
      }
      
      toast.error('Failed to validate prompt');
    } finally {
      setValidating(null);
    }
  };

  const handleSave = async () => {
    if (!selectedUserId) {
      toast.error('Please select a user');
      return;
    }

    try {
      setSaving(true);
      
      await openaiPromptService.adminUpdateUserPrompts(selectedUserId, {
        openai_individual_prompt_id: individualPromptId || null,
        openai_complete_prompt_id: completePromptId || null,
      });
      
      toast.success(`Updated prompts for ${selectedUser?.name || 'user'}`);
      await loadUserConfig(selectedUserId); // Reload to get latest data
    } catch (error: any) {
      console.error('Failed to update prompts:', error);
      toast.error(error.message || 'Failed to update prompt configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setIndividualPromptId(config?.openai_individual_prompt_id || '');
    setCompletePromptId(config?.openai_complete_prompt_id || '');
    setIndividualValidation({ status: 'idle' });
    setCompleteValidation({ status: 'idle' });
  };

  const hasChanges = 
    individualPromptId !== (config?.openai_individual_prompt_id || '') ||
    completePromptId !== (config?.openai_complete_prompt_id || '');

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            User OpenAI Integration Management
          </CardTitle>
          <CardDescription>
            Configure OpenAI prompt IDs for individual users
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* User Selector */}
          <div className="space-y-2">
            <Label htmlFor="user-select">Select User</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger id="user-select">
                <SelectValue placeholder="Choose a user to manage..." />
              </SelectTrigger>
              <SelectContent>
                {loadingUsers ? (
                  <SelectItem value="loading" disabled>
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading users...
                    </div>
                  </SelectItem>
                ) : users.length === 0 ? (
                  <SelectItem value="none" disabled>No users found</SelectItem>
                ) : (
                  users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.email}) - {user.role}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Show configuration only when user is selected */}
          {selectedUserId && selectedUser && (
            <>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Selected User Info */}
                  <Alert>
                    <AlertDescription className="flex items-center gap-2">
                      <Search className="w-4 h-4" />
                      <div className="text-sm">
                        <strong>Managing prompts for:</strong> {selectedUser.name} ({selectedUser.email})
                      </div>
                    </AlertDescription>
                  </Alert>

                  {/* Individual Analysis Prompt */}
                  <div className="space-y-2">
                    <Label htmlFor="admin-individual-prompt">Individual Call Analysis Prompt ID</Label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Input
                          id="admin-individual-prompt"
                          placeholder={config?.system_defaults?.individual || 'pmpt_...'}
                          value={individualPromptId}
                          onChange={(e) => {
                            setIndividualPromptId(e.target.value);
                            setIndividualValidation({ status: 'idle' });
                          }}
                          disabled={saving}
                        />
                        {individualValidation.status !== 'idle' && (
                          <p className={`text-sm mt-1 flex items-center gap-1 ${
                            individualValidation.status === 'valid' ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {individualValidation.status === 'valid' ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <AlertCircle className="w-4 h-4" />
                            )}
                            {individualValidation.message}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => validatePrompt(individualPromptId, 'individual')}
                        disabled={!individualPromptId || validating !== null || saving}
                      >
                        {validating === 'individual' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Validate'
                        )}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Leave blank to use system default. Analyzes individual call transcripts.
                    </p>
                  </div>

                  {/* Complete Analysis Prompt */}
                  <div className="space-y-2">
                    <Label htmlFor="admin-complete-prompt">Complete Analysis Prompt ID</Label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Input
                          id="admin-complete-prompt"
                          placeholder={config?.system_defaults?.complete || 'pmpt_...'}
                          value={completePromptId}
                          onChange={(e) => {
                            setCompletePromptId(e.target.value);
                            setCompleteValidation({ status: 'idle' });
                          }}
                          disabled={saving}
                        />
                        {completeValidation.status !== 'idle' && (
                          <p className={`text-sm mt-1 flex items-center gap-1 ${
                            completeValidation.status === 'valid' ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {completeValidation.status === 'valid' ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <AlertCircle className="w-4 h-4" />
                            )}
                            {completeValidation.message}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => validatePrompt(completePromptId, 'complete')}
                        disabled={!completePromptId || validating !== null || saving}
                      >
                        {validating === 'complete' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Validate'
                        )}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Leave blank to use system default. Aggregates insights across all historical calls.
                    </p>
                  </div>

                  {/* System Defaults Info */}
                  {config?.system_defaults && (
                    <Alert>
                      <AlertDescription className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          <p className="font-medium mb-1">System Defaults (fallback):</p>
                          <ul className="space-y-1">
                            <li>
                              Individual: <code className="bg-muted px-1 py-0.5 rounded text-xs">
                                {config.system_defaults.individual || 'Not configured'}
                              </code>
                            </li>
                            <li>
                              Complete: <code className="bg-muted px-1 py-0.5 rounded text-xs">
                                {config.system_defaults.complete || 'Not configured'}
                              </code>
                            </li>
                          </ul>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-4">
                    <Button
                      onClick={handleSave}
                      disabled={!hasChanges || saving || validating !== null}
                      className="flex-1"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Configuration'
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleReset}
                      disabled={!hasChanges || saving}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Reset
                    </Button>
                  </div>

                  {/* Status Badge */}
                  {config && (
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <Badge variant={config.openai_individual_prompt_id ? 'default' : 'secondary'}>
                        {config.openai_individual_prompt_id ? 'Custom Individual' : 'Default Individual'}
                      </Badge>
                      <Badge variant={config.openai_complete_prompt_id ? 'default' : 'secondary'}>
                        {config.openai_complete_prompt_id ? 'Custom Complete' : 'Default Complete'}
                      </Badge>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Help Text */}
          <Alert className="mt-6">
            <Brain className="w-4 h-4" />
            <AlertDescription>
              <p className="font-medium mb-2">About Custom Prompts</p>
              <ul className="text-sm space-y-1">
                <li>• Individual prompts analyze single call transcripts</li>
                <li>• Complete prompts aggregate all historical calls for a contact</li>
                <li>• Empty fields fallback to system default prompts</li>
                <li>• Create prompts at{' '}
                  <a 
                    href="https://platform.openai.com/prompts" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    OpenAI Platform
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              </ul>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminUserIntegrations;
