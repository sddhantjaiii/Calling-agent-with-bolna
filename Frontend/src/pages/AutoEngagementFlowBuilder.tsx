import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTheme } from '@/components/theme/ThemeProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAutoEngagementFlows, useAutoEngagementFlow } from '@/hooks/useAutoEngagement';
import { useAgents } from '@/hooks/useAgents';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import apiService from '@/services/apiService';
import { API_ENDPOINTS } from '@/config/api';
import type { CreateFlowRequest, ActionType, ConditionType, ConditionOperator } from '@/types/autoEngagement';

interface FormValues {
  name: string;
  description: string;
  priority: number;
  is_enabled: boolean;
  use_custom_business_hours: boolean;
  business_hours_start: string;
  business_hours_end: string;
  business_hours_timezone: string;
}

const AutoEngagementFlowBuilder: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isEditMode = !!id;

  const { flow, isLoading: isLoadingFlow } = useAutoEngagementFlow(id || null);
  const { createFlow, updateFlow, isCreating, isUpdating } = useAutoEngagementFlows();
  const { agents, loading: loadingAgents } = useAgents();

  // Fetch phone numbers for dropdown
  const { data: phoneNumbers = [] } = useQuery({
    queryKey: ['phone-numbers'],
    queryFn: async () => {
      const response = await apiService.get(API_ENDPOINTS.PHONE_NUMBERS.LIST);
      return response.data || [];
    },
  });

  const [triggerConditions, setTriggerConditions] = useState<Array<{
    condition_type: ConditionType;
    condition_operator: ConditionOperator;
    condition_value: string | null;
  }>>([]);

  const [actions, setActions] = useState<Array<{
    action_order: number;
    action_type: ActionType;
    action_config: any;
    condition_type?: string | null;
    condition_value?: string | null;
  }>>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      name: '',
      description: '',
      priority: 0,
      is_enabled: true,
      use_custom_business_hours: false,
      business_hours_start: '09:00',
      business_hours_end: '17:00',
      business_hours_timezone: 'America/New_York',
    },
  });

  const useCustomHours = watch('use_custom_business_hours');

  // Load flow data in edit mode
  useEffect(() => {
    if (flow) {
      setValue('name', flow.name);
      setValue('description', flow.description || '');
      setValue('priority', flow.priority);
      setValue('is_enabled', flow.is_enabled);
      setValue('use_custom_business_hours', flow.use_custom_business_hours);
      setValue('business_hours_start', flow.business_hours_start?.substring(0, 5) || '09:00');
      setValue('business_hours_end', flow.business_hours_end?.substring(0, 5) || '17:00');
      setValue('business_hours_timezone', flow.business_hours_timezone || 'America/New_York');
      
      if (flow.trigger_conditions) {
        setTriggerConditions(flow.trigger_conditions.map(c => ({
          condition_type: c.condition_type as ConditionType,
          condition_operator: c.condition_operator as ConditionOperator,
          condition_value: c.condition_value,
        })));
      }

      if (flow.actions) {
        setActions(flow.actions.map(a => ({
          action_order: a.action_order,
          action_type: a.action_type as ActionType,
          action_config: a.action_config,
          condition_type: a.condition_type,
          condition_value: a.condition_value,
        })));
      }
    }
  }, [flow, setValue]);

  const onSubmit = async (data: FormValues) => {
    try {
      if (isEditMode && id) {
        // Edit mode: Split into separate API calls
        // 1. Update base flow fields
        const baseFlowData = {
          name: data.name,
          description: data.description || undefined,
          priority: data.priority,
          is_enabled: data.is_enabled,
          use_custom_business_hours: data.use_custom_business_hours,
          business_hours_start: data.use_custom_business_hours ? data.business_hours_start : undefined,
          business_hours_end: data.use_custom_business_hours ? data.business_hours_end : undefined,
          business_hours_timezone: data.use_custom_business_hours ? data.business_hours_timezone : undefined,
        };
        await updateFlow({ id, data: baseFlowData });

        // 2. Update trigger conditions (uses separate endpoint)
        await updateTriggerConditions(id, triggerConditions);

        // 3. Update actions (uses separate endpoint)
        await updateActions(id, actions);

        toast.success('Flow updated successfully');
      } else {
        // Create mode: Use single endpoint with full data
        const flowData: CreateFlowRequest = {
          name: data.name,
          description: data.description || undefined,
          priority: data.priority,
          is_enabled: data.is_enabled,
          use_custom_business_hours: data.use_custom_business_hours,
          business_hours_start: data.use_custom_business_hours ? data.business_hours_start : undefined,
          business_hours_end: data.use_custom_business_hours ? data.business_hours_end : undefined,
          business_hours_timezone: data.use_custom_business_hours ? data.business_hours_timezone : undefined,
          trigger_conditions: triggerConditions,
          actions: actions,
        };
        await createFlow(flowData);
        toast.success('Flow created successfully');
      }

      navigate('/dashboard/auto-engagement');
    } catch (error) {
      console.error('Failed to save flow:', error);
      toast.error('Failed to save flow');
    }
  };

  const addTriggerCondition = () => {
    setTriggerConditions([
      ...triggerConditions,
      { condition_type: 'lead_source', condition_operator: 'equals', condition_value: '' },
    ]);
  };

  const removeTriggerCondition = (index: number) => {
    setTriggerConditions(triggerConditions.filter((_, i) => i !== index));
  };

  const addAction = () => {
    const nextOrder = actions.length > 0 ? Math.max(...actions.map(a => a.action_order)) + 1 : 1;
    setActions([
      ...actions,
      {
        action_order: nextOrder,
        action_type: 'ai_call',
        action_config: { agent_id: '', phone_number_id: '' },
      },
    ]);
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  if (isEditMode && isLoadingFlow) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading flow...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/dashboard/auto-engagement')}
          className="hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Flows
        </Button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card className="border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-2xl">{isEditMode ? 'Edit Flow' : 'Create New Flow'}</CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-400">
              Configure your automated engagement flow with triggers and actions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Flow Name *</Label>
                <Input
                  id="name"
                  {...register('name', { required: 'Flow name is required' })}
                  placeholder="e.g., IndiaMART Lead Follow-up"
                />
                {errors.name && (
                  <p className="text-sm text-red-500 mt-1">{errors.name.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  {...register('description')}
                  placeholder="Describe what this flow does..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="priority" className="text-sm font-medium">
                    Priority (0 = highest)
                  </Label>
                  <Input
                    id="priority"
                    type="number"
                    min={0}
                    {...register('priority', { valueAsNumber: true })}
                    className="mt-1"
                  />
                </div>

                <div className="flex items-center space-x-2 pt-7">
                  <Switch
                    id="is_enabled"
                    checked={watch('is_enabled')}
                    onCheckedChange={(checked) => setValue('is_enabled', checked)}
                  />
                  <Label htmlFor="is_enabled" className="cursor-pointer text-sm font-medium">
                    Enabled
                  </Label>
                </div>
              </div>
            </div>

            {/* Business Hours */}
            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-2">
                <Switch
                  id="use_custom_business_hours"
                  checked={watch('use_custom_business_hours')}
                  onCheckedChange={(checked) => setValue('use_custom_business_hours', checked)}
                />
                <Label htmlFor="use_custom_business_hours" className="cursor-pointer">
                  Use Custom Business Hours
                </Label>
              </div>

              {useCustomHours && (
                <div className="grid grid-cols-3 gap-4 pl-6">
                  <div>
                    <Label htmlFor="business_hours_start">Start Time</Label>
                    <Input
                      id="business_hours_start"
                      type="time"
                      {...register('business_hours_start')}
                    />
                  </div>
                  <div>
                    <Label htmlFor="business_hours_end">End Time</Label>
                    <Input
                      id="business_hours_end"
                      type="time"
                      {...register('business_hours_end')}
                    />
                  </div>
                  <div>
                    <Label htmlFor="business_hours_timezone">Timezone</Label>
                    <Select
                      value={watch('business_hours_timezone')}
                      onValueChange={(value) => setValue('business_hours_timezone', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="America/New_York">Eastern Time</SelectItem>
                        <SelectItem value="America/Chicago">Central Time</SelectItem>
                        <SelectItem value="America/Denver">Mountain Time</SelectItem>
                        <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                        <SelectItem value="Asia/Kolkata">India (IST)</SelectItem>
                        <SelectItem value="UTC">UTC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* Trigger Conditions */}
            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-lg font-semibold">Trigger Conditions</Label>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Define when this flow should be triggered
                  </p>
                </div>
                <Button 
                  type="button" 
                  size="sm" 
                  onClick={addTriggerCondition}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Condition
                </Button>
              </div>

              {triggerConditions.length === 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    No conditions = matches all contacts
                  </p>
                </div>
              )}

              {triggerConditions.map((condition, index) => (
                <Card key={index} className="border-gray-200 dark:border-gray-700">
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <Label>Type</Label>
                        <Select
                          value={condition.condition_type}
                          onValueChange={(value) => {
                            const updated = [...triggerConditions];
                            updated[index].condition_type = value as ConditionType;
                            setTriggerConditions(updated);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lead_source">Lead Source</SelectItem>
                            <SelectItem value="entry_type">Entry Type</SelectItem>
                            <SelectItem value="custom_field">Custom Field</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Operator</Label>
                        <Select
                          value={condition.condition_operator}
                          onValueChange={(value) => {
                            const updated = [...triggerConditions];
                            updated[index].condition_operator = value as ConditionOperator;
                            setTriggerConditions(updated);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equals">Equals</SelectItem>
                            <SelectItem value="not_equals">Not Equals</SelectItem>
                            <SelectItem value="contains">Contains</SelectItem>
                            <SelectItem value="any">Any</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Value</Label>
                        <Input
                          value={condition.condition_value || ''}
                          onChange={(e) => {
                            const updated = [...triggerConditions];
                            updated[index].condition_value = e.target.value;
                            setTriggerConditions(updated);
                          }}
                          placeholder="e.g., IndiaMART"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => removeTriggerCondition(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Actions */}
            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-lg font-semibold">Actions (executed in order)</Label>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Define the sequence of actions to perform
                  </p>
                </div>
                <Button 
                  type="button" 
                  size="sm" 
                  onClick={addAction}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Action
                </Button>
              </div>

              {actions.length === 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Add at least one action to execute when conditions match
                  </p>
                </div>
              )}

              {actions
                .sort((a, b) => a.action_order - b.action_order)
                .map((action, index) => (
                  <Card key={index} className="border-gray-200 dark:border-gray-700">
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-base px-3 py-1">
                              Step {action.action_order}
                            </Badge>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeAction(index)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div>
                          <Label>Action Type</Label>
                          <Select
                            value={action.action_type}
                            onValueChange={(value) => {
                              const updated = [...actions];
                              updated[index].action_type = value as ActionType;
                              // Reset config based on type
                              if (value === 'ai_call') {
                                updated[index].action_config = { agent_id: '', phone_number_id: '' };
                              } else if (value === 'wait') {
                                updated[index].action_config = { duration_minutes: 30 };
                              }
                              setActions(updated);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ai_call">AI Call</SelectItem>
                              <SelectItem value="whatsapp_message">WhatsApp Message</SelectItem>
                              <SelectItem value="email">Email</SelectItem>
                              <SelectItem value="wait">Wait</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* AI Call Config */}
                        {action.action_type === 'ai_call' && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>Agent</Label>
                              <Select
                                value={action.action_config.agent_id || ''}
                                onValueChange={(value) => {
                                  const updated = [...actions];
                                  updated[index].action_config.agent_id = value;
                                  setActions(updated);
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select agent" />
                                </SelectTrigger>
                                <SelectContent>
                                  {agents.map((agent) => (
                                    <SelectItem key={agent.id} value={agent.id}>
                                      {agent.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>Phone Number</Label>
                              <Select
                                value={action.action_config.phone_number_id || ''}
                                onValueChange={(value) => {
                                  const updated = [...actions];
                                  updated[index].action_config.phone_number_id = value;
                                  setActions(updated);
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select phone number" />
                                </SelectTrigger>
                                <SelectContent>
                                  {phoneNumbers.map((phone: any) => (
                                    <SelectItem key={phone.id} value={phone.id}>
                                      {phone.phone_number} {phone.friendly_name ? `(${phone.friendly_name})` : ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}

                        {/* Wait Config */}
                        {action.action_type === 'wait' && (
                          <div>
                            <Label>Duration (minutes)</Label>
                            <Input
                              type="number"
                              min={1}
                              value={action.action_config.duration_minutes || 30}
                              onChange={(e) => {
                                const updated = [...actions];
                                updated[index].action_config.duration_minutes = parseInt(e.target.value);
                                setActions(updated);
                              }}
                            />
                          </div>
                        )}

                        {/* Placeholder for WhatsApp and Email */}
                        {(action.action_type === 'whatsapp_message' || action.action_type === 'email') && (
                          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                            <p className="text-sm text-blue-700 dark:text-blue-300">
                              Configuration for {action.action_type.replace('_', ' ')} coming soon
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>

            {/* Submit */}
            <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200 dark:border-gray-700">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/dashboard/auto-engagement')}
                className="border-gray-300 dark:border-gray-600"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isCreating || isUpdating}
                className="bg-teal-600 hover:bg-teal-700 text-white"
              >
                <Save className="mr-2 h-4 w-4" />
                {isEditMode ? 'Update Flow' : 'Create Flow'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
};

export default AutoEngagementFlowBuilder;
