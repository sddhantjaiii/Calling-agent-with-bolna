import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Phone, Loader2 } from 'lucide-react';
import { apiService } from '@/services/apiService';
import { API_ENDPOINTS } from '@/config/api';
import { useToast } from '@/components/ui/use-toast';
import type { Contact } from '@/types/api';

interface Agent {
  id: string;
  name: string;
  type?: string;
  status?: string;
  isActive?: boolean;
}

interface CallAgentModalProps {
  open: boolean;
  contact: Contact | null;
  onClose: () => void;
  onCallInitiated?: (callId: string) => void;
}

export function CallAgentModal({
  open,
  contact,
  onClose,
  onCallInitiated,
}: CallAgentModalProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingAgents, setIsFetchingAgents] = useState(false);
  const { toast } = useToast();

  // Get phone number from contact (handle both field names: phone, phone_number, phoneNumber)
  const contactPhone = contact ? ((contact as any).phone || (contact as any).phone_number || contact.phoneNumber) : '';

  // Fetch agents when modal opens
  useEffect(() => {
    if (open) {
      fetchAgents();
    }
  }, [open]);

  const fetchAgents = async () => {
    setIsFetchingAgents(true);
    try {
      const response = await apiService.getAgents();
      
      // Handle response format
      let agentsList: Agent[] = [];
      if (response.success && Array.isArray(response.data)) {
        agentsList = response.data;
      } else if (Array.isArray(response)) {
        agentsList = response as any;
      }
      
      // Filter only active agents
      const activeAgents = agentsList.filter((agent: Agent) => agent.status === 'active' || agent.isActive);
      setAgents(activeAgents);

      // Auto-select first agent if available
      if (activeAgents.length > 0 && !selectedAgentId) {
        setSelectedAgentId(activeAgents[0].id);
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
      toast({
        title: 'Error',
        description: 'Failed to load agents. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsFetchingAgents(false);
    }
  };

  const handleInitiateCall = async () => {
    if (!contact || !selectedAgentId) {
      toast({
        title: 'Missing information',
        description: 'Please select an agent to initiate the call.',
        variant: 'destructive',
      });
      return;
    }

    // Get phone number from contact (handle both field names: phone, phone_number, phoneNumber)
    const phoneNumber = (contact as any).phone || (contact as any).phone_number || contact.phoneNumber;
    if (!phoneNumber) {
      toast({
        title: 'Missing phone number',
        description: 'Contact does not have a phone number.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      // Make raw POST request using fetch with authentication
      const token = localStorage.getItem('auth_token');
      const response = await fetch(API_ENDPOINTS.CALLS.INITIATE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify({
          contactId: contact.id,
          agentId: selectedAgentId,
          phoneNumber: phoneNumber,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const callData = data.call;
      
      toast({
        title: 'Call initiated',
        description: `Calling ${contact.name} (${phoneNumber})...`,
      });

      if (onCallInitiated && callData?.id) {
        onCallInitiated(callData.id);
      }

      onClose();
    } catch (error: any) {
      console.error('Error initiating call:', error);
      
      let errorMessage = 'Failed to initiate call. Please try again.';
      
      if (error.message.includes('402') || error.message.includes('credit')) {
        errorMessage = 'Insufficient credits. Please purchase more credits to make calls.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: 'Call failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Initiate Direct Call
          </DialogTitle>
          <DialogDescription>
            Select an agent to call {contact?.name || 'this contact'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Contact Information */}
          <div className="space-y-2">
            <Label>Contact</Label>
            <div className="p-3 border rounded-md bg-muted/50">
              <p className="font-medium">{contact?.name}</p>
              <p className="text-sm text-muted-foreground">{contactPhone}</p>
            </div>
          </div>

          {/* Agent Selection */}
          <div className="space-y-2">
            <Label htmlFor="agent">Select Agent</Label>
            {isFetchingAgents ? (
              <div className="flex items-center justify-center p-3 border rounded-md">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">Loading agents...</span>
              </div>
            ) : agents.length === 0 ? (
              <div className="p-3 border rounded-md bg-destructive/10 text-destructive text-sm">
                No active agents available. Please create an agent first.
              </div>
            ) : (
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger id="agent">
                  <SelectValue placeholder="Choose an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}{agent.type ? ` (${agent.type})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Call Information */}
          <div className="p-3 border rounded-md bg-blue-50 dark:bg-blue-950/20 text-sm">
            <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">
              Direct Call
            </p>
            <p className="text-blue-700 dark:text-blue-300">
              This will initiate an immediate call to the contact. Credits will be deducted based on call duration.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleInitiateCall}
            disabled={isLoading || !selectedAgentId || agents.length === 0}
            className="gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Initiating...
              </>
            ) : (
              <>
                <Phone className="h-4 w-4" />
                Call Now
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
