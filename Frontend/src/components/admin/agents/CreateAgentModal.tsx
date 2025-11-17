import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { Loader2, ArrowRight, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface CreateAgentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  users: Array<{ id: string; email: string; name: string }>;
}

interface BolnaAgentData {
  name: string;
  system_prompt: string;
}

export const CreateAgentModal: React.FC<CreateAgentModalProps> = ({
  open,
  onClose,
  onSuccess,
  users,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('Loading...');

  // Step 1 state
  const [bolnaAgentId, setBolnaAgentId] = useState('');

  // Step 2 state
  const [formData, setFormData] = useState({
    name: '',
    systemPrompt: '',
    description: '',
    dynamicInformation: '',
    userId: '',
  });

  // Fetch webhook URL from backend on mount
  React.useEffect(() => {
    const fetchWebhookUrl = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch('/api/admin/config/webhook-url', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          setWebhookUrl(data.webhookUrl || 'Not configured');
        } else {
          console.error('Failed to fetch webhook URL:', response.status);
          setWebhookUrl('Not configured');
        }
      } catch (error) {
        console.error('Error fetching webhook URL:', error);
        setWebhookUrl('Not configured');
      }
    };
    
    if (open) {
      fetchWebhookUrl();
    }
  }, [open]);

  const handleClose = () => {
    setStep(1);
    setBolnaAgentId('');
    setFormData({
      name: '',
      systemPrompt: '',
      description: '',
      dynamicInformation: '',
      userId: '',
    });
    onClose();
  };

  const handleFetchAgent = async () => {
    if (!bolnaAgentId.trim()) {
      toast.error('Please enter a Bolna Agent ID');
      return;
    }

    setIsFetching(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(
        `/api/admin/agents/bolna/${bolnaAgentId.trim()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch agent details');
      }

      const result = await response.json();
      const data = result.data || result; // Handle both wrapped and unwrapped responses
      setFormData({
        name: data.name || '',
        systemPrompt: data.system_prompt || '',
        description: '',
        dynamicInformation: '',
        userId: '',
      });
      setStep(2);
      toast.success('Agent details fetched successfully');
    } catch (error) {
      console.error('Error fetching agent:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to fetch agent details');
    } finally {
      setIsFetching(false);
    }
  };

  const handleCreateAgent = async () => {
    if (!formData.name.trim() || !formData.userId) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/admin/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bolna_agent_id: bolnaAgentId.trim(),
          user_id: formData.userId,
          name: formData.name,
          system_prompt: formData.systemPrompt,
          description: formData.description,
          dynamic_information: formData.dynamicInformation,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to link agent');
      }

      toast.success('Agent linked successfully');
      onSuccess();
      handleClose();
    } catch (error) {
      console.error('Error linking agent:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to link agent');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? 'Step 1: Enter Bolna Agent ID' : 'Step 2: Configure & Link Agent'}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'Enter the Bolna Agent ID to fetch agent details'
              : 'Review and edit the agent details before linking to a user'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="bolnaAgentId">Bolna Agent ID *</Label>
              <Input
                id="bolnaAgentId"
                placeholder="Enter Bolna Agent ID"
                value={bolnaAgentId}
                onChange={(e) => setBolnaAgentId(e.target.value)}
                disabled={isFetching}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4 max-h-[500px] overflow-y-auto">
            <div className="space-y-2">
              <Label htmlFor="name">Agent Name *</Label>
              <Input
                id="name"
                placeholder="Enter agent name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="systemPrompt">System Prompt</Label>
              <Textarea
                id="systemPrompt"
                placeholder="Agent system prompt"
                value={formData.systemPrompt}
                onChange={(e) =>
                  setFormData({ ...formData, systemPrompt: e.target.value })
                }
                disabled={isLoading}
                rows={6}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Brief description of the agent"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                disabled={isLoading}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dynamicInformation">
                Dynamic Information (Optional)
              </Label>
              <Textarea
                id="dynamicInformation"
                placeholder="Information to append to system prompt"
                value={formData.dynamicInformation}
                onChange={(e) =>
                  setFormData({ ...formData, dynamicInformation: e.target.value })
                }
                disabled={isLoading}
                rows={3}
              />
              <p className="text-sm text-muted-foreground">
                This information will be automatically appended to the system prompt
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="userId">Assign to User *</Label>
              <Select
                value={formData.userId}
                onValueChange={(value) =>
                  setFormData({ ...formData, userId: value })
                }
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Webhook URL (Read-only)</Label>
              <Input value={webhookUrl} disabled className="bg-muted" />
              <p className="text-sm text-muted-foreground">
                This URL will be automatically configured in Bolna
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isFetching}>
                Cancel
              </Button>
              <Button onClick={handleFetchAgent} disabled={isFetching}>
                {isFetching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                disabled={isLoading}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleCreateAgent} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Linking...
                  </>
                ) : (
                  'Link Agent'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
