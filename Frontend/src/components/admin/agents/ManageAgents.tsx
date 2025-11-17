import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../ui/alert-dialog';
import { Badge } from '../../ui/badge';
import { Search, Loader2, Edit, User, Link, Trash2 } from 'lucide-react';
import { CreateAgentModal } from './CreateAgentModal';
import { EditAgentModal } from './EditAgentModal';
import { toast } from 'sonner';

interface Agent {
  id: string;
  bolna_agent_id: string;
  user_id: string;
  name: string;
  system_prompt: string | null;
  dynamic_information: string | null;
  description?: string;
  is_active: boolean;
  created_at: string;
  user_email?: string;
  user_name?: string;
}

interface User {
  id: string;
  email: string;
  name: string;
}

export const ManageAgents: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchAgents = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/admin/agents', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch agents');
      }

      const result = await response.json();
      // Backend returns { success: true, data: { agents: [], total, page, limit, totalPages } }
      setAgents(result.data?.agents || []);
    } catch (error) {
      console.error('Error fetching agents:', error);
      toast.error('Failed to load agents');
    }
  };

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/admin/users', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const result = await response.json();
      // Backend returns { success: true, data: { users: [] } }
      setUsers(result.data?.users || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    await Promise.all([fetchAgents(), fetchUsers()]);
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleEditAgent = (agent: Agent) => {
    setSelectedAgent(agent);
    setEditModalOpen(true);
  };

  const handleDeleteClick = (agent: Agent, e: React.MouseEvent) => {
    e.stopPropagation();
    setAgentToDelete(agent);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!agentToDelete) return;

    setIsDeleting(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/admin/agents/${agentToDelete.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete agent');
      }

      toast.success('Agent deleted successfully');
      setDeleteDialogOpen(false);
      setAgentToDelete(null);
      loadData();
    } catch (error) {
      console.error('Error deleting agent:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete agent');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSuccess = () => {
    loadData();
  };

  const filteredAgents = agents.filter((agent) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      agent.name.toLowerCase().includes(searchLower) ||
      agent.bolna_agent_id.toLowerCase().includes(searchLower) ||
      agent.user_email?.toLowerCase().includes(searchLower) ||
      agent.user_name?.toLowerCase().includes(searchLower)
    );
  });

  const truncateText = (text: string | null, maxLength: number = 50) => {
    if (!text) return '-';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Manage Agents</CardTitle>
              <CardDescription>
                View and manage all agents across all users
              </CardDescription>
            </div>
            <Button onClick={() => setCreateModalOpen(true)}>
              <Link className="mr-2 h-4 w-4" />
              Link Agent
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, Bolna ID, user email, or user name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent Name</TableHead>
                    <TableHead>Bolna ID</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>System Prompt</TableHead>
                    <TableHead>Dynamic Info</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAgents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        {searchQuery ? 'No agents found matching your search' : 'No agents found'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAgents.map((agent) => (
                      <TableRow
                        key={agent.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleEditAgent(agent)}
                      >
                        <TableCell className="font-medium">{agent.name}</TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {agent.bolna_agent_id}
                          </code>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="text-sm font-medium">
                                {agent.user_name || 'Unknown'}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {agent.user_email || '-'}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground font-mono">
                            {truncateText(agent.system_prompt, 40)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {truncateText(agent.dynamic_information, 30)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={agent.is_active ? 'default' : 'secondary'}>
                            {agent.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditAgent(agent);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleDeleteClick(agent, e)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {!isLoading && filteredAgents.length > 0 && (
            <div className="mt-4 text-sm text-muted-foreground">
              Showing {filteredAgents.length} of {agents.length} agents
            </div>
          )}
        </CardContent>
      </Card>

      <CreateAgentModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={handleSuccess}
        users={users}
      />

      <EditAgentModal
        open={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setSelectedAgent(null);
        }}
        onSuccess={handleSuccess}
        agent={selectedAgent}
        users={users}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the agent "{agentToDelete?.name}"?
              <br />
              <br />
              <strong>This action cannot be undone.</strong> The agent will be removed from the database,
              but will remain in Bolna. You may need to manually remove it from Bolna if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Agent'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
