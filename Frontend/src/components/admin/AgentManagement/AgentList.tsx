import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, MoreHorizontal, Eye, Edit, Trash2, Users, Activity, AlertTriangle, CheckCircle, Loader2, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Checkbox } from '../../ui/checkbox';
import { LoadingSpinner } from '../../ui/LoadingSpinner';
import { EmptyState } from '../../ui/EmptyStateComponents';
import { adminApiService } from '../../../services/adminApiService';
import { AgentDetailsModal } from './AgentDetailsModal';
import { BulkAgentActions } from './BulkAgentActions';
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
import { toast } from 'sonner';
import type { AdminAgentListItem } from '../../../types/admin';

interface AgentListProps {
    onAgentSelect?: (agent: AdminAgentListItem) => void;
    onRefresh?: () => void;
}

interface AgentFilters {
    search: string;
    status: 'all' | 'active' | 'inactive';
    type: 'all' | 'call' | 'chat';
    healthStatus: 'all' | 'healthy' | 'warning' | 'error';
    userId?: string;
}

export const AgentList: React.FC<AgentListProps> = ({ onAgentSelect, onRefresh }) => {
    const [agents, setAgents] = useState<AdminAgentListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
    const [selectedAgent, setSelectedAgent] = useState<AdminAgentListItem | null>(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [showBulkActions, setShowBulkActions] = useState(false);
    const [agentToDelete, setAgentToDelete] = useState<AdminAgentListItem | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [checkingHealthFor, setCheckingHealthFor] = useState<string | null>(null);

    const [filters, setFilters] = useState<AgentFilters>({
        search: '',
        status: 'all',
        type: 'all',
        healthStatus: 'all',
    });

    const [pagination, setPagination] = useState({
        page: 1,
        limit: 20,
        total: 0,
    });

    // Load agents
    const loadAgents = async () => {
        try {
            setLoading(true);
            setError(null);

            const queryParams = {
                page: pagination.page,
                limit: pagination.limit,
                search: filters.search || undefined,
                isActive: filters.status === 'all' ? undefined : filters.status === 'active',
                agentType: filters.type === 'all' ? undefined : filters.type,
                userId: filters.userId,
            };

            const response = await adminApiService.getAgents(queryParams);

            if (response.success && response.data) {
                // Handle nested data structure: response.data.agents or response.data directly
                let rawAgentsData: any[] = [];
                
                if (Array.isArray(response.data)) {
                    // Direct array format
                    rawAgentsData = response.data;
                } else if (response.data.agents && Array.isArray(response.data.agents)) {
                    // Nested format: { data: { agents: [...] } }
                    rawAgentsData = response.data.agents;
                } else {
                    // Fallback to empty array
                    rawAgentsData = [];
                }
                
                // Transform snake_case backend fields to camelCase frontend fields
                const agentsData: AdminAgentListItem[] = rawAgentsData.map((agent: any) => ({
                    id: agent.id,
                    userId: agent.user_id || agent.userId,
                    name: agent.name,
                    type: agent.agent_type || agent.type || 'call',
                    status: agent.is_active !== undefined 
                        ? (agent.is_active ? 'active' : 'inactive') 
                        : (agent.status || 'inactive'),
                    isActive: agent.is_active ?? agent.isActive ?? false,
                    agentType: agent.agent_type || agent.agentType || 'call',
                    bolnaAgentId: agent.bolna_agent_id || agent.bolnaAgentId,
                    description: agent.description || '',
                    systemPrompt: agent.system_prompt || agent.systemPrompt,
                    dynamicInformation: agent.dynamic_information || agent.dynamicInformation,
                    userEmail: agent.user_email || agent.userEmail || '',
                    userName: agent.user_name || agent.userName || '',
                    callCount: parseInt(agent.call_count || agent.callCount || '0', 10),
                    lastCallAt: agent.last_call_at || agent.lastCallAt,
                    createdAt: agent.created_at || agent.createdAt,
                    updatedAt: agent.updated_at || agent.updatedAt,
                    bolnaStatus: agent.bolna_status || agent.bolnaStatus || 'unknown',
                    healthStatus: agent.health_status || agent.healthStatus || 'unknown',
                }));
                
                setAgents(agentsData);
                setPagination(prev => ({
                    ...prev,
                    total: response.pagination?.total || agentsData.length,
                }));
            } else {
                throw new Error(response.error?.message || 'Failed to load agents');
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to load agents';
            setError(errorMessage);
            console.error('Failed to load agents:', err);
        } finally {
            setLoading(false);
        }
    };

    // Filter agents based on current filters
    const filteredAgents = useMemo(() => {
        // Ensure agents is an array before filtering
        const agentsArray = Array.isArray(agents) ? agents : [];
        return agentsArray.filter(agent => {
            // Search filter
            if (filters.search) {
                const searchLower = filters.search.toLowerCase();
                const matchesSearch =
                    agent.name.toLowerCase().includes(searchLower) ||
                    agent.userEmail.toLowerCase().includes(searchLower) ||
                    agent.userName.toLowerCase().includes(searchLower);
                if (!matchesSearch) return false;
            }

            // Status filter
            if (filters.status !== 'all') {
                const isActive = agent.status === 'active';
                if (filters.status === 'active' && !isActive) return false;
                if (filters.status === 'inactive' && isActive) return false;
            }

            // Type filter
            if (filters.type !== 'all') {
                if (agent.type !== filters.type) return false;
            }

            // Health status filter
            if (filters.healthStatus !== 'all') {
                if (agent.healthStatus !== filters.healthStatus) return false;
            }

            return true;
        });
    }, [agents, filters]);

    // Handle agent selection
    const handleAgentSelect = (agentId: string, selected: boolean) => {
        setSelectedAgents(prev =>
            selected
                ? [...prev, agentId]
                : prev.filter(id => id !== agentId)
        );
    };

    // Handle select all
    const handleSelectAll = (selected: boolean) => {
        setSelectedAgents(selected ? filteredAgents.map(agent => agent.id) : []);
    };

    // Handle agent details
    const handleViewDetails = (agent: AdminAgentListItem) => {
        setSelectedAgent(agent);
        setShowDetailsModal(true);
        onAgentSelect?.(agent);
    };

    // Handle bulk actions
    const handleBulkAction = () => {
        if (selectedAgents.length > 0) {
            setShowBulkActions(true);
        }
    };

    // Handle bulk action complete
    const handleBulkActionComplete = () => {
        setSelectedAgents([]);
        setShowBulkActions(false);
        loadAgents();
        onRefresh?.();
    };

    // Handle delete agent
    const handleDeleteAgent = (agent: AdminAgentListItem) => {
        setAgentToDelete(agent);
    };

    // Confirm delete agent
    const confirmDeleteAgent = async () => {
        if (!agentToDelete) return;

        setIsDeleting(true);
        try {
            const response = await adminApiService.deleteAgent(agentToDelete.id);
            if (response.success) {
                toast.success('Agent deleted successfully', {
                    description: `${agentToDelete.name} has been permanently removed.`
                });
                loadAgents();
                onRefresh?.();
            } else {
                throw new Error(response.error?.message || 'Failed to delete agent');
            }
        } catch (err) {
            console.error('Failed to delete agent:', err);
            toast.error('Failed to delete agent', {
                description: err instanceof Error ? err.message : 'An error occurred while deleting the agent.'
            });
        } finally {
            setIsDeleting(false);
            setAgentToDelete(null);
        }
    };

    // Check Bolna agent health
    const handleCheckBolnaHealth = async (agent: AdminAgentListItem) => {
        if (!agent.bolnaAgentId) {
            toast.error('No Bolna Agent ID', {
                description: 'This agent does not have a Bolna Agent ID configured.'
            });
            return;
        }

        setCheckingHealthFor(agent.id);
        try {
            const response = await adminApiService.checkBolnaAgentHealth(agent.id);
            if (response.success && response.data) {
                if (response.data.bolnaStatus === 'healthy') {
                    toast.success('Bolna Agent Healthy', {
                        description: `Agent "${response.data.bolnaAgentData?.name || agent.name}" exists in Bolna.`
                    });
                } else {
                    toast.error('Bolna Agent Not Found', {
                        description: 'This agent was not found in Bolna. It may have been deleted.'
                    });
                }
            } else {
                throw new Error(response.error?.message || 'Health check failed');
            }
        } catch (err) {
            console.error('Bolna health check error:', err);
            toast.error('Health Check Failed', {
                description: err instanceof Error ? err.message : 'Failed to check Bolna agent health.'
            });
        } finally {
            setCheckingHealthFor(null);
        }
    };

    // Get health status badge
    const getHealthStatusBadge = (status: string) => {
        switch (status) {
            case 'healthy':
                return <Badge variant="success" className="flex items-center gap-1"><CheckCircle className="w-3 h-3" />Healthy</Badge>;
            case 'warning':
                return <Badge variant="warning" className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Warning</Badge>;
            case 'error':
                return <Badge variant="destructive" className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Error</Badge>;
            default:
                return <Badge variant="secondary">Unknown</Badge>;
        }
    };

    // Get Bolna status badge
    const getBolnaStatusBadge = (status?: string) => {
        switch (status) {
            case 'active':
                return <Badge variant="success">Active</Badge>;
            case 'inactive':
                return <Badge variant="secondary">Inactive</Badge>;
            case 'error':
                return <Badge variant="destructive">Error</Badge>;
            default:
                return <Badge variant="outline">Unknown</Badge>;
        }
    };

    // Load agents on mount and filter changes
    useEffect(() => {
        loadAgents();
    }, [pagination.page, pagination.limit]);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (pagination.page === 1) {
                loadAgents();
            } else {
                setPagination(prev => ({ ...prev, page: 1 }));
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [filters.search]);

    // Reload on filter changes (except search)
    useEffect(() => {
        if (pagination.page === 1) {
            loadAgents();
        } else {
            setPagination(prev => ({ ...prev, page: 1 }));
        }
    }, [filters.status, filters.type, filters.healthStatus, filters.userId]);

    if (loading && (!Array.isArray(agents) || agents.length === 0)) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-8">
                    <LoadingSpinner size="lg" />
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Agent Management</h2>
                    <p className="text-muted-foreground">
                        Manage all agents across all users ({filteredAgents.length} agents)
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {selectedAgents.length > 0 && (
                        <Button onClick={handleBulkAction} variant="outline">
                            <Users className="w-4 h-4 mr-2" />
                            Bulk Actions ({selectedAgents.length})
                        </Button>
                    )}
                    <Button onClick={loadAgents} variant="outline">
                        <Activity className="w-4 h-4 mr-2" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Filters</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Search</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <Input
                                    placeholder="Search agents, users..."
                                    value={filters.search}
                                    onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                                    className="pl-10"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Status</label>
                            <Select
                                value={filters.status}
                                onValueChange={(value) => setFilters(prev => ({ ...prev, status: value as any }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Type</label>
                            <Select
                                value={filters.type}
                                onValueChange={(value) => setFilters(prev => ({ ...prev, type: value as any }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Types</SelectItem>
                                    <SelectItem value="call">Call Agent</SelectItem>
                                    <SelectItem value="chat">Chat Agent</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Health</label>
                            <Select
                                value={filters.healthStatus}
                                onValueChange={(value) => setFilters(prev => ({ ...prev, healthStatus: value as any }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Health</SelectItem>
                                    <SelectItem value="healthy">Healthy</SelectItem>
                                    <SelectItem value="warning">Warning</SelectItem>
                                    <SelectItem value="error">Error</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Error State */}
            {error && (
                <Card>
                    <CardContent className="py-8">
                        <div className="text-center text-red-600">
                            <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
                            <p className="text-lg font-semibold mb-2">Error Loading Agents</p>
                            <p className="text-sm mb-4">{error}</p>
                            <Button onClick={loadAgents} variant="outline">
                                Try Again
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Agents Table */}
            {!error && (
                <Card>
                    <CardContent className="p-0">
                        {filteredAgents.length === 0 ? (
                            <EmptyState
                                icon={Users}
                                title="No agents found"
                                description="No agents match your current filters."
                                action={
                                    <Button onClick={() => setFilters({
                                        search: '',
                                        status: 'all',
                                        type: 'all',
                                        healthStatus: 'all',
                                    })}>
                                        Clear Filters
                                    </Button>
                                }
                            />
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-12">
                                                <Checkbox
                                                    checked={selectedAgents.length === filteredAgents.length}
                                                    onCheckedChange={handleSelectAll}
                                                />
                                            </TableHead>
                                            <TableHead>Agent</TableHead>
                                            <TableHead>Owner</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Health</TableHead>
                                            <TableHead>Bolna</TableHead>
                                            <TableHead>Calls</TableHead>
                                            <TableHead>Last Call</TableHead>
                                            <TableHead className="w-12"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredAgents.map((agent) => (
                                            <TableRow key={agent.id}>
                                                <TableCell>
                                                    <Checkbox
                                                        checked={selectedAgents.includes(agent.id)}
                                                        onCheckedChange={(checked) => handleAgentSelect(agent.id, checked as boolean)}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <div>
                                                        <div className="font-medium">{agent.name}</div>
                                                        <div className="text-sm text-muted-foreground">
                                                            ID: {agent.id}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div>
                                                        <div className="font-medium">{agent.userName}</div>
                                                        <div className="text-sm text-muted-foreground">{agent.userEmail}</div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={agent.type === 'call' ? 'default' : 'secondary'}>
                                                        {agent.type === 'call' ? 'Call Agent' : 'Chat Agent'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={agent.status === 'active' ? 'success' : 'secondary'}>
                                                        {agent.status === 'active' ? 'Active' : 'Inactive'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {getHealthStatusBadge(agent.healthStatus)}
                                                </TableCell>
                                                <TableCell>
                                                    {agent.bolnaAgentId ? (
                                                        <div className="flex items-center gap-2">
                                                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono truncate max-w-[120px]" title={agent.bolnaAgentId}>
                                                                {agent.bolnaAgentId.substring(0, 8)}...
                                                            </code>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-6 w-6 p-0"
                                                                onClick={() => handleCheckBolnaHealth(agent)}
                                                                disabled={checkingHealthFor === agent.id}
                                                                title="Check Bolna Health"
                                                            >
                                                                {checkingHealthFor === agent.id ? (
                                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                                ) : (
                                                                    <RefreshCw className="h-3 w-3" />
                                                                )}
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground text-sm">Not linked</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-sm">
                                                        <div>{agent.callCount || 0}</div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-sm text-muted-foreground">
                                                        {agent.lastCallAt
                                                            ? new Date(agent.lastCallAt).toLocaleDateString()
                                                            : 'Never'
                                                        }
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="sm">
                                                                <MoreHorizontal className="w-4 h-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => handleViewDetails(agent)}>
                                                                <Eye className="w-4 h-4 mr-2" />
                                                                View Details
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => handleViewDetails(agent)}>
                                                                <Edit className="w-4 h-4 mr-2" />
                                                                Edit Agent
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onClick={() => handleDeleteAgent(agent)}
                                                                className="text-red-600"
                                                            >
                                                                <Trash2 className="w-4 h-4 mr-2" />
                                                                Delete Agent
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Pagination */}
            {filteredAgents.length > 0 && pagination.total > pagination.limit && (
                <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                        Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                        {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                        {pagination.total} agents
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                            disabled={pagination.page === 1}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                            disabled={pagination.page * pagination.limit >= pagination.total}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}

            {/* Modals */}
            {showDetailsModal && selectedAgent && (
                <AgentDetailsModal
                    agent={selectedAgent}
                    open={showDetailsModal}
                    onClose={() => {
                        setShowDetailsModal(false);
                        setSelectedAgent(null);
                    }}
                    onUpdate={() => {
                        loadAgents();
                        onRefresh?.();
                    }}
                />
            )}

            {showBulkActions && (
                <BulkAgentActions
                    agentIds={selectedAgents}
                    open={showBulkActions}
                    onClose={() => setShowBulkActions(false)}
                    onComplete={handleBulkActionComplete}
                />
            )}

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!agentToDelete} onOpenChange={() => setAgentToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Agent</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete <strong>"{agentToDelete?.name}"</strong>?
                            <br /><br />
                            <strong>This action cannot be undone.</strong> The agent will be removed from the database,
                            but will remain in Bolna. You may need to manually remove it from Bolna if needed.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDeleteAgent}
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