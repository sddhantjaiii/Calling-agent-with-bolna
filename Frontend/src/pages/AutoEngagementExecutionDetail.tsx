import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTheme } from '@/components/theme/ThemeProvider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAutoEngagementExecutionDetails } from '@/hooks/useAutoEngagement';
import { ArrowLeft, Clock, CheckCircle, XCircle, PauseCircle, AlertCircle } from 'lucide-react';
import type { ExecutionStatus, ActionLogStatus } from '@/types/autoEngagement';

const AutoEngagementExecutionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { theme } = useTheme();

  const { execution, isLoading, error } = useAutoEngagementExecutionDetails(id || null);

  const getStatusIcon = (status: ExecutionStatus | ActionLogStatus) => {
    const icons = {
      running: Clock,
      pending: Clock,
      completed: CheckCircle,
      success: CheckCircle,
      failed: XCircle,
      cancelled: PauseCircle,
      skipped: PauseCircle,
    };
    return icons[status as keyof typeof icons] || Clock;
  };

  const getStatusColor = (status: ExecutionStatus | ActionLogStatus) => {
    const colors = {
      running: 'text-blue-600',
      pending: 'text-gray-600',
      completed: 'text-green-600',
      success: 'text-green-600',
      failed: 'text-red-600',
      cancelled: 'text-gray-600',
      skipped: 'text-gray-600',
    };
    return colors[status as keyof typeof colors] || 'text-gray-600';
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading execution details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !execution) {
    return (
      <div className="container mx-auto py-8">
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400">Error Loading Execution</CardTitle>
            <CardDescription>{error?.toString() || 'Execution not found'}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const StatusIcon = getStatusIcon(execution.status);
  const actionLogs = execution.action_logs || [];

  return (
    <div className="container mx-auto py-8 max-w-5xl">
      <div className="mb-6">
        <Button variant="ghost" onClick={() => navigate('/dashboard/auto-engagement/executions')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Executions
        </Button>
      </div>

      {/* Execution Overview */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Execution Details</CardTitle>
              <CardDescription className="mt-1">
                Flow: {execution.flow_name || 'Unknown Flow'}
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-lg">
              <StatusIcon className={`mr-2 h-5 w-5 ${getStatusColor(execution.status)}`} />
              {execution.status.charAt(0).toUpperCase() + execution.status.slice(1)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Contact Information</h3>
              <div className="space-y-1">
                <div><span className="font-medium">Name:</span> {execution.contact_name || '-'}</div>
                <div><span className="font-medium">Phone:</span> {execution.contact_phone || '-'}</div>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Execution Timeline</h3>
              <div className="space-y-1">
                <div>
                  <span className="font-medium">Started:</span>{' '}
                  {new Date(execution.triggered_at).toLocaleString()}
                </div>
                {execution.completed_at && (
                  <div>
                    <span className="font-medium">Completed:</span>{' '}
                    {new Date(execution.completed_at).toLocaleString()}
                  </div>
                )}
                {execution.status === 'running' && (
                  <div>
                    <span className="font-medium">Current Step:</span> {execution.current_action_step}
                  </div>
                )}
              </div>
            </div>
          </div>

          {execution.error_message && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <div className="flex items-start">
                <AlertCircle className="h-5 w-5 text-red-600 mr-2 mt-0.5" />
                <div>
                  <h4 className="font-medium text-red-900 dark:text-red-100">Error</h4>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">{execution.error_message}</p>
                </div>
              </div>
            </div>
          )}

          {execution.is_test_run && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-blue-600 mr-2" />
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  This was a test execution - no actual actions were performed.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Action Timeline</CardTitle>
          <CardDescription>
            Detailed log of each action in the flow execution
          </CardDescription>
        </CardHeader>
        <CardContent>
          {actionLogs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No action logs available
            </div>
          ) : (
            <div className="space-y-4">
              {actionLogs
                .sort((a, b) => a.action_order - b.action_order)
                .map((log, index) => {
                  const ActionIcon = getStatusIcon(log.status);
                  const isLast = index === actionLogs.length - 1;

                  return (
                    <div key={log.id} className="relative">
                      {/* Timeline line */}
                      {!isLast && (
                        <div className="absolute left-6 top-12 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
                      )}

                      <div className="flex items-start space-x-4">
                        {/* Icon */}
                        <div className={`flex-shrink-0 w-12 h-12 rounded-full border-2 flex items-center justify-center bg-white dark:bg-gray-800 ${
                          log.status === 'success' ? 'border-green-500' :
                          log.status === 'failed' ? 'border-red-500' :
                          log.status === 'skipped' ? 'border-gray-400' :
                          log.status === 'running' ? 'border-blue-500' :
                          'border-gray-300'
                        }`}>
                          <ActionIcon className={`h-6 w-6 ${getStatusColor(log.status)}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <Card>
                            <CardHeader className="pb-3">
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-base">
                                  Step {log.action_order}: {log.action_type.replace('_', ' ').toUpperCase()}
                                </CardTitle>
                                <Badge variant={
                                  log.status === 'success' ? 'success' :
                                  log.status === 'failed' ? 'destructive' :
                                  log.status === 'running' ? 'default' :
                                  'secondary'
                                }>
                                  {log.status}
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-2">
                              <div className="text-sm text-gray-600 dark:text-gray-400">
                                <div>
                                  <span className="font-medium">Started:</span>{' '}
                                  {new Date(log.started_at).toLocaleString()}
                                </div>
                                {log.completed_at && (
                                  <div>
                                    <span className="font-medium">Completed:</span>{' '}
                                    {new Date(log.completed_at).toLocaleString()}
                                  </div>
                                )}
                              </div>

                              {log.skip_reason && (
                                <div className="text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded border">
                                  <span className="font-medium">Skip Reason:</span> {log.skip_reason}
                                </div>
                              )}

                              {log.error_message && (
                                <div className="text-sm p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200">
                                  <span className="font-medium text-red-600">Error:</span>{' '}
                                  <span className="text-red-700 dark:text-red-300">{log.error_message}</span>
                                </div>
                              )}

                              {log.result_data && Object.keys(log.result_data).length > 0 && (
                                <div className="text-sm">
                                  <span className="font-medium">Result:</span>
                                  <pre className="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs overflow-x-auto">
                                    {JSON.stringify(log.result_data, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AutoEngagementExecutionDetail;
