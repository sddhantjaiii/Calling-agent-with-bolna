import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Phone, 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  UserCheck, 
  UserX,
  Power,
  Eye,
  AlertCircle
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '../../ui/dialog';
import { Label } from '../../ui/label';
import { toast } from 'sonner';
import { adminApiService } from '../../../services/adminApiService';
import type { PhoneNumber, AssignableAgent } from '../../../types/admin';

interface PhoneNumberManagementProps {
  className?: string;
}

interface PhoneNumberFormData {
  name: string;
  phone_number: string;
  assigned_to_agent_id: string | null;
}

const PhoneNumberManagement: React.FC<PhoneNumberManagementProps> = ({ className = '' }) => {
  // State management
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [assignmentFilter, setAssignmentFilter] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<PhoneNumber | null>(null);
  const [formData, setFormData] = useState<PhoneNumberFormData>({
    name: '',
    phone_number: '',
    assigned_to_agent_id: null,
  });
  const [agentSearch, setAgentSearch] = useState('');

  const queryClient = useQueryClient();

  // Queries
  const {
    data: phoneNumbersResponse,
    isLoading: isLoadingPhoneNumbers,
    error: phoneNumbersError
  } = useQuery({
    queryKey: ['admin-phone-numbers', searchTerm, statusFilter, assignmentFilter],
    queryFn: () => adminApiService.getPhoneNumbers(1, 100, {
      search: searchTerm || undefined,
      is_active: statusFilter === 'all' ? undefined : statusFilter,
      assigned_to: assignmentFilter === 'all' ? undefined : assignmentFilter,
    }),
    staleTime: 30000,
  });

  const {
    data: agentsResponse,
    isLoading: isLoadingAgents
  } = useQuery({
    queryKey: ['admin-available-agents', agentSearch],
    queryFn: () => adminApiService.getAvailableAgents(agentSearch),
    enabled: isCreateDialogOpen || isAssignDialogOpen,
    staleTime: 60000,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: PhoneNumberFormData) => adminApiService.createPhoneNumber(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-phone-numbers'] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast.success('Phone number created successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create phone number');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PhoneNumberFormData> }) =>
      adminApiService.updatePhoneNumber(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-phone-numbers'] });
      setIsEditDialogOpen(false);
      resetForm();
      toast.success('Phone number updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update phone number');
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, agentId }: { id: string; agentId: string }) =>
      adminApiService.assignPhoneNumber(id, agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-phone-numbers'] });
      setIsAssignDialogOpen(false);
      setSelectedPhoneNumber(null);
      toast.success('Phone number assigned to agent successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to assign phone number');
    },
  });

  const unassignMutation = useMutation({
    mutationFn: (id: string) => adminApiService.unassignPhoneNumber(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-phone-numbers'] });
      toast.success('Phone number unassigned successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to unassign phone number');
    },
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => adminApiService.activatePhoneNumber(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-phone-numbers'] });
      toast.success('Phone number activated successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to activate phone number');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApiService.deletePhoneNumber(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-phone-numbers'] });
      toast.success('Phone number deactivated successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to deactivate phone number');
    },
  });

  // Helper functions
  const resetForm = () => {
    setFormData({
      name: '',
      phone_number: '',
      assigned_to_agent_id: null,
    });
    setSelectedPhoneNumber(null);
  };

  const validateE164 = (phoneNumber: string): boolean => {
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phoneNumber);
  };

  const handleCreate = () => {
    if (!formData.name || !formData.phone_number) {
      toast.error('Name and phone number are required');
      return;
    }

    if (!validateE164(formData.phone_number)) {
      toast.error('Phone number must be in E.164 format (e.g., +19876543007)');
      return;
    }

    createMutation.mutate(formData);
  };

  const handleUpdate = () => {
    if (!selectedPhoneNumber) return;

    if (!formData.name || !formData.phone_number) {
      toast.error('Name and phone number are required');
      return;
    }

    if (!validateE164(formData.phone_number)) {
      toast.error('Phone number must be in E.164 format (e.g., +19876543007)');
      return;
    }

    updateMutation.mutate({
      id: selectedPhoneNumber.id,
      data: {
        name: formData.name,
        phone_number: formData.phone_number,
      },
    });
  };

  const handleEdit = (phoneNumber: PhoneNumber) => {
    setSelectedPhoneNumber(phoneNumber);
    setFormData({
      name: phoneNumber.name,
      phone_number: phoneNumber.phone_number,
      assigned_to_agent_id: phoneNumber.assigned_to_agent_id,
    });
    setIsEditDialogOpen(true);
  };

  const handleAssign = (phoneNumber: PhoneNumber) => {
    setSelectedPhoneNumber(phoneNumber);
    setIsAssignDialogOpen(true);
  };

  const confirmAssign = (agentId: string) => {
    if (!selectedPhoneNumber) return;
    assignMutation.mutate({ id: selectedPhoneNumber.id, agentId });
  };

  const handleUnassign = (phoneNumber: PhoneNumber) => {
    if (confirm(`Unassign phone number ${phoneNumber.phone_number} from ${phoneNumber.agent_name}?`)) {
      unassignMutation.mutate(phoneNumber.id);
    }
  };

  const handleActivate = (phoneNumber: PhoneNumber) => {
    if (confirm(`Activate phone number ${phoneNumber.phone_number}?`)) {
      activateMutation.mutate(phoneNumber.id);
    }
  };

  const handleDelete = (phoneNumber: PhoneNumber) => {
    if (confirm(`Deactivate phone number ${phoneNumber.phone_number}? This will prevent it from being used.`)) {
      deleteMutation.mutate(phoneNumber.id);
    }
  };

  // Extract data from API responses
  const phoneNumbers = phoneNumbersResponse?.data || [];
  const agents = agentsResponse?.data?.agents || [];

  const filteredPhoneNumbers = phoneNumbers.filter((phone) => {
    if (statusFilter === 'active' && !phone.is_active) return false;
    if (statusFilter === 'inactive' && phone.is_active) return false;
    if (assignmentFilter === 'assigned' && !phone.assigned_to_agent_id) return false;
    if (assignmentFilter === 'unassigned' && phone.assigned_to_agent_id) return false;
    return true;
  });

  const stats = {
    total: phoneNumbers.length,
    active: phoneNumbers.filter(p => p.is_active).length,
    inactive: phoneNumbers.filter(p => !p.is_active).length,
    assigned: phoneNumbers.filter(p => p.assigned_to_agent_id).length,
    unassigned: phoneNumbers.filter(p => !p.assigned_to_agent_id).length,
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Phone Number Management</h1>
          <p className="text-muted-foreground">Manage phone numbers for agent-level call initiation</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Phone Number
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Phone Number</DialogTitle>
              <DialogDescription>
                Add a new phone number in E.164 format (e.g., +19876543007)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Sales Line"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone Number (E.164 format)</Label>
                <Input
                  id="phone"
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  placeholder="+19876543007"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Format: +[country code][number] (e.g., +19876543007)
                </p>
              </div>
              <div>
                <Label htmlFor="agent">Assign to Agent (Optional)</Label>
                <Select
                  value={formData.assigned_to_agent_id || undefined}
                  onValueChange={(value) => setFormData({ ...formData, assigned_to_agent_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select agent..." />
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsCreateDialogOpen(false);
                resetForm();
              }}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inactive</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-400">{stats.inactive}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.assigned}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unassigned</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.unassigned}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search phone numbers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assignment</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Phone Numbers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Phone Numbers ({filteredPhoneNumbers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingPhoneNumbers ? (
            <div className="text-center py-8">Loading...</div>
          ) : phoneNumbersError ? (
            <div className="text-center py-8 text-red-600">
              <AlertCircle className="h-8 w-8 mx-auto mb-2" />
              Error loading phone numbers
            </div>
          ) : filteredPhoneNumbers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No phone numbers found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Assigned Agent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPhoneNumbers.map((phone) => (
                  <TableRow key={phone.id}>
                    <TableCell className="font-medium">{phone.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        {phone.phone_number}
                      </div>
                    </TableCell>
                    <TableCell>
                      {phone.assigned_to_agent_id ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="default">
                            {phone.agent_name || 'Unknown Agent'}
                          </Badge>
                        </div>
                      ) : (
                        <Badge variant="outline">Unassigned</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {phone.is_active ? (
                        <Badge variant="default" className="bg-green-600">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(phone.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(phone)}
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {phone.assigned_to_agent_id ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnassign(phone)}
                            title="Unassign from agent"
                          >
                            <UserX className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAssign(phone)}
                            title="Assign to agent"
                          >
                            <UserCheck className="h-4 w-4" />
                          </Button>
                        )}
                        {!phone.is_active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleActivate(phone)}
                            title="Activate"
                          >
                            <Power className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(phone)}
                          title="Deactivate"
                          disabled={!phone.is_active}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Phone Number</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-phone">Phone Number (E.164 format)</Label>
              <Input
                id="edit-phone"
                value={formData.phone_number}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsEditDialogOpen(false);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Updating...' : 'Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Dialog */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to Agent</DialogTitle>
            <DialogDescription>
              Select an agent to assign this phone number. Each agent can have only one phone number.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Phone Number</Label>
              <div className="p-2 bg-muted rounded">
                {selectedPhoneNumber?.phone_number}
              </div>
            </div>
            <div>
              <Label>Select Agent</Label>
              {isLoadingAgents ? (
                <div className="text-center py-4">Loading agents...</div>
              ) : (
                <Select onValueChange={confirmAssign}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PhoneNumberManagement;
