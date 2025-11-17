import React, { useState, useEffect } from 'react';
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
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Agent {
  id: string;
  bolna_agent_id: string;
  user_id: string;
  name: string;
  system_prompt: string | null;
  dynamic_information: string | null;
  description?: string;
  user?: {
    email: string;
    name: string;
  };
}

interface EditAgentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  agent: Agent | null;
  users: Array<{ id: string; email: string; name: string }>;
}

export const EditAgentModal: React.FC<EditAgentModalProps> = ({
  open,
  onClose,
  onSuccess,
  agent,
  users,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('Loading...');
  const [formData, setFormData] = useState({
    name: '',
    systemPrompt: '',
    description: '',
    dynamicInformation: '',
    userId: '',
  });

  // Fetch webhook URL from backend on mount
  useEffect(() => {
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

  useEffect(() => {
    if (agent) {
      setFormData({
        name: agent.name || '',
        systemPrompt: agent.system_prompt || '',
        description: agent.description || '',
        dynamicInformation: agent.dynamic_information || '',
        userId: agent.user_id || '',
      });
    }
  }, [agent]);

  const handleClose = () => {
    setFormData({
      name: '',
      systemPrompt: '',
      description: '',
      dynamicInformation: '',
      userId: '',
    });
    onClose();
  };

  const handleUpdateAgent = async () => {
    if (!agent || !formData.name.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/admin/agents/${agent.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          system_prompt: formData.systemPrompt,
          description: formData.description,
          dynamic_information: formData.dynamicInformation,
          user_id: formData.userId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update agent');
      }

      toast.success('Agent updated successfully');
      onSuccess();
      handleClose();
    } catch (error) {
      console.error('Error updating agent:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update agent');
    } finally {
      setIsLoading(false);
    }
  };

  if (!agent) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Agent</DialogTitle>
          <DialogDescription>
            Update agent details. Changes will sync to both database and Bolna.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[500px] overflow-y-auto">
          <div className="space-y-2">
            <Label>Bolna Agent ID (Read-only)</Label>
            <Input value={agent.bolna_agent_id} disabled className="bg-muted" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-name">Agent Name *</Label>
            <Input
              id="edit-name"
              placeholder="Enter agent name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-systemPrompt">System Prompt</Label>
            <Textarea
              id="edit-systemPrompt"
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
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
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
            <Label htmlFor="edit-dynamicInformation">
              Dynamic Information (Optional)
            </Label>
            <Textarea
              id="edit-dynamicInformation"
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
            <Label htmlFor="edit-userId">Assigned User</Label>
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
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleUpdateAgent} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              'Update Agent'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
