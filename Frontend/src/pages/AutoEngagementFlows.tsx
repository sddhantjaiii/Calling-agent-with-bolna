import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useAutoEngagementFlows } from '@/hooks/useAutoEngagement';
import { Plus, Edit, Trash2, BarChart3, PlayCircle, PauseCircle, GripVertical } from 'lucide-react';
import type { AutoEngagementFlow } from '@/types/autoEngagement';

const AutoEngagementFlows: React.FC = () => {
  const navigate = useNavigate();
  const {
    flows,
    isLoading,
    error,
    toggleFlow,
    deleteFlow,
    isToggling,
    isDeleting,
  } = useAutoEngagementFlows();

  const [deletingFlowId, setDeletingFlowId] = useState<string | null>(null);

  const handleToggleFlow = async (flow: AutoEngagementFlow) => {
    try {
      await toggleFlow({ id: flow.id, enabled: !flow.is_enabled });
    } catch (error) {
      console.error('Failed to toggle flow:', error);
    }
  };

  const handleDeleteFlow = async (flowId: string) => {
    if (!window.confirm('Are you sure you want to delete this flow? This action cannot be undone.')) {
      return;
    }

    try {
      setDeletingFlowId(flowId);
      await deleteFlow(flowId);
    } catch (error) {
      console.error('Failed to delete flow:', error);
    } finally {
      setDeletingFlowId(null);
    }
  };

  const getPriorityBadge = (priority: number) => {
    if (priority === 0) return <Badge variant="destructive">Highest</Badge>;
    if (priority === 1) return <Badge variant="default">High</Badge>;
    if (priority === 2) return <Badge variant="secondary">Medium</Badge>;
    return <Badge variant="outline">Low</Badge>;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading flows...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400">Error Loading Flows</CardTitle>
            <CardDescription>{error.toString()}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-2xl font-bold">Auto Engagement Flows</CardTitle>
            <CardDescription className="mt-1">
              Automatically engage with new leads using AI calls, WhatsApp, and email
            </CardDescription>
          </div>
          <Button
            onClick={() => navigate('/dashboard/auto-engagement/create')}
            className="ml-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Flow
          </Button>
        </CardHeader>
        <CardContent>
          {flows.length === 0 ? (
            <div className="text-center py-12">
              <PlayCircle className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                No flows yet
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Create your first auto-engagement flow to start automatically reaching out to new leads
              </p>
              <Button onClick={() => navigate('/dashboard/auto-engagement/create')}>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Flow
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead className="w-12">Priority</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...flows]
                    .sort((a, b) => a.priority - b.priority)
                    .map((flow) => (
                      <TableRow key={flow.id}>
                        <TableCell>
                          <div className="cursor-move text-gray-400 hover:text-gray-600">
                            <GripVertical className="h-5 w-5" />
                          </div>
                        </TableCell>
                        <TableCell>
                          {getPriorityBadge(flow.priority)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {flow.name}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {flow.description || '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={flow.is_enabled}
                              onCheckedChange={() => handleToggleFlow(flow)}
                              disabled={isToggling}
                            />
                            {flow.is_enabled ? (
                              <Badge variant="default">
                                <PlayCircle className="mr-1 h-3 w-3" />
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <PauseCircle className="mr-1 h-3 w-3" />
                                Inactive
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {new Date(flow.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/dashboard/auto-engagement/${flow.id}/statistics`)}
                            >
                              <BarChart3 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/dashboard/auto-engagement/${flow.id}/edit`)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteFlow(flow.id)}
                              disabled={deletingFlowId === flow.id || isDeleting}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Additional Info Card */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">How Auto Engagement Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p>• Flows are executed automatically when new contacts are added to your system</p>
          <p>• Higher priority flows (lower numbers) are checked first</p>
          <p>• Only the first matching flow will execute for each contact</p>
          <p>• Contacts with the "DNC" tag will skip all flows</p>
          <p>• You can configure business hours for each flow</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AutoEngagementFlows;
