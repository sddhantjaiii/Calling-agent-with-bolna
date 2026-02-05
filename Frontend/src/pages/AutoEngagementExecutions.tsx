import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/components/theme/ThemeProvider';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAutoEngagementExecutions } from '@/hooks/useAutoEngagement';
import { Eye, X, PlayCircle, Clock, CheckCircle, XCircle, PauseCircle } from 'lucide-react';
import type { FlowExecution, ExecutionStatus } from '@/types/autoEngagement';

const AutoEngagementExecutions: React.FC = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const {
    executions,
    isLoading,
    error,
    cancelExecution,
    isCancelling,
  } = useAutoEngagementExecutions({
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const getStatusBadge = (status: ExecutionStatus) => {
    const statusConfig = {
      running: { variant: 'default' as const, icon: Clock, label: 'Running' },
      completed: { variant: 'success' as const, icon: CheckCircle, label: 'Completed' },
      failed: { variant: 'destructive' as const, icon: XCircle, label: 'Failed' },
      cancelled: { variant: 'secondary' as const, icon: PauseCircle, label: 'Cancelled' },
      skipped: { variant: 'outline' as const, icon: PauseCircle, label: 'Skipped' },
    };

    const config = statusConfig[status] || statusConfig.completed;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant}>
        <Icon className="mr-1 h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const handleCancelExecution = async (executionId: string) => {
    if (!window.confirm('Are you sure you want to cancel this execution?')) {
      return;
    }

    try {
      await cancelExecution(executionId);
    } catch (error) {
      console.error('Failed to cancel execution:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading executions...</p>
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
            <CardTitle className="text-red-600 dark:text-red-400">Error Loading Executions</CardTitle>
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
            <CardTitle className="text-2xl font-bold">Flow Executions</CardTitle>
            <CardDescription className="mt-1">
              Track all auto-engagement flow executions and their status
            </CardDescription>
          </div>
          <div className="flex items-center space-x-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {executions.length === 0 ? (
            <div className="text-center py-12">
              <PlayCircle className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                No executions yet
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Flow executions will appear here when contacts are added
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Flow</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Step</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {executions.map((execution) => (
                    <TableRow key={execution.id}>
                      <TableCell className="font-medium">
                        {execution.flow_name || 'Unknown Flow'}
                      </TableCell>
                      <TableCell>
                        {execution.contact_name || 'Unknown Contact'}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {execution.contact_phone || '-'}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(execution.status)}
                        {execution.is_test_run && (
                          <Badge variant="outline" className="ml-2">Test</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {execution.status === 'running' && (
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            Step {execution.current_action_step}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{new Date(execution.triggered_at).toLocaleDateString()}</div>
                          <div className="text-xs text-gray-500">
                            {new Date(execution.triggered_at).toLocaleTimeString()}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {execution.completed_at ? (
                          <div className="text-sm">
                            <div>{new Date(execution.completed_at).toLocaleDateString()}</div>
                            <div className="text-xs text-gray-500">
                              {new Date(execution.completed_at).toLocaleTimeString()}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/dashboard/auto-engagement/executions/${execution.id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {execution.status === 'running' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancelExecution(execution.id)}
                              disabled={isCancelling}
                            >
                              <X className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
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

      {/* Summary Stats */}
      {executions.length > 0 && (
        <div className="grid grid-cols-5 gap-4 mt-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{executions.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Running
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {executions.filter(e => e.status === 'running').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {executions.filter(e => e.status === 'completed').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Failed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {executions.filter(e => e.status === 'failed').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Cancelled
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-600">
                {executions.filter(e => e.status === 'cancelled').length}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AutoEngagementExecutions;
