import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ValidatedInput, ValidatedTextarea } from '@/components/ui/ValidatedInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAdmin } from '@/contexts/AdminContext';
import { adminApiService } from '@/services/adminApiService';
import { Bot, Users, Save, X, ExternalLink } from 'lucide-react';

interface AdminRegisterAgentProps {
  onAgentRegistered?: () => void;
  preselectedUserId?: string;
}

export default function AdminRegisterAgent({ onAgentRegistered, preselectedUserId }: AdminRegisterAgentProps) {
  const { user: adminUser, isLoading: adminLoading, error: adminError } = useAdmin();
  
  const [formData, setFormData] = useState({
    bolnaAgentId: '',
    name: '',
    description: '',
    userId: preselectedUserId || '',
  });

  const [users, setUsers] = useState<Array<{ id: string; email: string; name: string }>>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  // Load users for assignment
  useEffect(() => {
    const loadUsers = async () => {
      try {
        setIsLoadingUsers(true);
        const usersResponse = await adminApiService.getUsers({ limit: 1000 });

        if (usersResponse?.data) {
          let usersData: any[] = [];
          const responseData = usersResponse.data as any;
          
          if (responseData.users && Array.isArray(responseData.users)) {
            usersData = responseData.users;
          } else if (responseData.items && Array.isArray(responseData.items)) {
            usersData = responseData.items;
          } else if (Array.isArray(responseData)) {
            usersData = responseData;
          } else if (responseData.data && Array.isArray(responseData.data)) {
            usersData = responseData.data;
          }
          
          setUsers(usersData.map((user: any) => ({
            id: user.id,
            email: user.email,
            name: user.name || user.email
          })));
        }
      } catch (error: any) {
        console.error('Failed to load users:', error);
        toast.error('Failed to load users', {
          description: error.message || 'An error occurred while loading users'
        });
      } finally {
        setIsLoadingUsers(false);
      }
    };

    loadUsers();
  }, []);

  const handleFieldChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setTouchedFields(prev => ({ ...prev, [field]: true }));
    
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const { [field]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const handleInputChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    handleFieldChange(field, e.target.value);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.bolnaAgentId || formData.bolnaAgentId.trim() === '') {
      newErrors.bolnaAgentId = 'Bolna Agent ID is required';
    } else if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(formData.bolnaAgentId.trim())) {
      newErrors.bolnaAgentId = 'Invalid Agent ID format (must be a UUID)';
    }

    if (!formData.name || formData.name.trim() === '') {
      newErrors.name = 'Agent name is required';
    }

    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationErrors = validateForm();
    setErrors(validationErrors);
    setTouchedFields({
      bolnaAgentId: true,
      name: true,
      description: true,
      userId: true,
    });

    if (Object.keys(validationErrors).length > 0) {
      toast.error('Please fix the validation errors');
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare agent data
      const agentData = {
        bolna_agent_id: formData.bolnaAgentId.trim(),
        name: formData.name.trim(),
        description: formData.description.trim(),
        agent_type: 'call', // Default to call agent
        is_active: true,
      };

      // Handle user assignment
      const assignToUserId = formData.userId !== 'unassigned' ? formData.userId : undefined;

      console.log('Registering agent with Bolna ID:', { agentData, assignToUserId });
      
      const response = await adminApiService.createAgent({
        ...agentData,
        assignToUserId
      });
      
      if (response.success) {
        toast.success('Agent registered successfully', {
          description: `${agentData.name} has been registered ${assignToUserId ? 'and assigned to user' : 'and is available for assignment'}.`
        });
        
        // Reset form
        setFormData({
          bolnaAgentId: '',
          name: '',
          description: '',
          userId: preselectedUserId || '',
        });
        setErrors({});
        setTouchedFields({});
        
        onAgentRegistered?.();
      } else {
        throw new Error(response.error?.message || 'Failed to register agent');
      }
    } catch (error: any) {
      console.error('Agent registration error:', error);
      toast.error('Failed to register agent', {
        description: error.message || 'An unexpected error occurred'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingUsers || adminLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Register Existing Bolna Agent
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-sm text-muted-foreground">
                {adminLoading ? 'Loading admin information...' : 'Loading users...'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (adminError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Register Existing Bolna Agent
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <p className="text-sm text-destructive mb-2">Admin access error</p>
              <p className="text-xs text-muted-foreground">{adminError}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Register Existing Bolna Agent
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-2">
          Register an agent that you've already created in the{' '}
          <a 
            href="https://app.bolna.ai" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            Bolna Dashboard
            <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Bolna Agent ID */}
          <div className="space-y-2">
            <ValidatedInput
              label="Bolna Agent ID"
              name="bolnaAgentId"
              value={formData.bolnaAgentId}
              onChange={handleInputChange('bolnaAgentId')}
              error={errors.bolnaAgentId}
              touched={touchedFields.bolnaAgentId}
              placeholder="e.g., 123e4567-e89b-12d3-a456-426614174000"
              description="Copy the agent ID from your Bolna dashboard"
              required
            />
          </div>

          {/* Agent Name */}
          <div className="space-y-2">
            <ValidatedInput
              label="Agent Name"
              name="name"
              value={formData.name}
              onChange={handleInputChange('name')}
              error={errors.name}
              touched={touchedFields.name}
              placeholder="Enter a friendly name for this agent"
              description="This name will be used in your dashboard"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <ValidatedTextarea
              label="Description (Optional)"
              name="description"
              value={formData.description}
              onChange={handleInputChange('description')}
              error={errors.description}
              touched={touchedFields.description}
              placeholder="Describe what this agent does"
              rows={3}
            />
          </div>

          {/* User Assignment */}
          <div className="space-y-2">
            <Label htmlFor="user-select">Assign to User (Optional)</Label>
            <Select 
              value={formData.userId || 'unassigned'} 
              onValueChange={(value) => handleFieldChange('userId', value === 'unassigned' ? '' : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a user (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">No assignment (admin managed)</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span>{user.name} ({user.email})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFormData({
                  bolnaAgentId: '',
                  name: '',
                  description: '',
                  userId: preselectedUserId || '',
                });
                setErrors({});
                setTouchedFields({});
              }}
              disabled={isSubmitting}
            >
              <X className="h-4 w-4 mr-2" />
              Clear
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  Registering...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Register Agent
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
