import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/components/theme/ThemeProvider';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAutoEngagementAnalytics } from '@/hooks/useAutoEngagement';
import { ArrowLeft, TrendingUp, Activity, CheckCircle, XCircle, BarChart3, Calendar } from 'lucide-react';
import { format } from 'date-fns';

const AutoEngagementAnalytics: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { analytics, isLoading } = useAutoEngagementAnalytics();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
      </div>
    );
  }

  const summary = analytics?.summary || {};
  const flowStats = analytics?.flow_statistics || [];
  const actionStats = analytics?.action_statistics || [];
  const timeline = analytics?.timeline || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/dashboard/auto-engagement')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics Dashboard</h1>
            <p className="text-muted-foreground">
              Monitor performance and insights for your automation flows
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Flows</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total_flows || 0}</div>
            <p className="text-xs text-muted-foreground">
              {summary.enabled_flows || 0} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Executions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total_executions || 0}</div>
            <p className="text-xs text-muted-foreground">
              All time executions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.success_rate || '0'}%</div>
            <p className="text-xs text-muted-foreground">
              {summary.completed_executions || 0} completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{summary.failed_executions || 0}</div>
            <p className="text-xs text-muted-foreground">
              Failed executions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Flow Statistics Table */}
      <Card>
        <CardHeader>
          <CardTitle>Flow Performance</CardTitle>
          <CardDescription>
            Detailed statistics for each automation flow
          </CardDescription>
        </CardHeader>
        <CardContent>
          {flowStats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No flow statistics available yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Flow Name</th>
                    <th className="text-center py-3 px-4 font-medium">Priority</th>
                    <th className="text-center py-3 px-4 font-medium">Status</th>
                    <th className="text-center py-3 px-4 font-medium">Executions</th>
                    <th className="text-center py-3 px-4 font-medium">Success</th>
                    <th className="text-center py-3 px-4 font-medium">Failed</th>
                    <th className="text-center py-3 px-4 font-medium">Success Rate</th>
                    <th className="text-left py-3 px-4 font-medium">Last Execution</th>
                  </tr>
                </thead>
                <tbody>
                  {flowStats.map((flow: any) => (
                    <tr key={flow.flow_id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4 font-medium">{flow.flow_name}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          {flow.priority}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {flow.is_enabled ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">{flow.execution_count}</td>
                      <td className="py-3 px-4 text-center text-green-600">{flow.success_count}</td>
                      <td className="py-3 px-4 text-center text-red-600">{flow.failure_count}</td>
                      <td className="py-3 px-4 text-center font-medium">{flow.success_rate}%</td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {flow.last_execution
                          ? format(new Date(flow.last_execution), 'MMM dd, yyyy HH:mm')
                          : 'Never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Action Type Statistics</CardTitle>
          <CardDescription>
            Success rates by action type across all flows
          </CardDescription>
        </CardHeader>
        <CardContent>
          {actionStats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No action statistics available yet
            </div>
          ) : (
            <div className="space-y-4">
              {actionStats.map((stat: any) => (
                <div key={stat.action_type} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-medium capitalize">{stat.action_type.replace('_', ' ')}</h3>
                      <span className="text-sm text-muted-foreground">
                        ({stat.total_actions} actions)
                      </span>
                    </div>
                    <div className="mt-2 flex items-center space-x-4 text-sm">
                      <div className="flex items-center text-green-600">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        {stat.successful_actions} successful
                      </div>
                      <div className="flex items-center text-red-600">
                        <XCircle className="h-4 w-4 mr-1" />
                        {stat.failed_actions} failed
                      </div>
                      <div className="text-muted-foreground">
                        {stat.skipped_actions} skipped
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">{stat.success_rate}%</div>
                    <div className="text-xs text-muted-foreground">Success Rate</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Execution Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Execution Timeline (Last 30 Days)</CardTitle>
          <CardDescription>
            Daily execution trends and success rates
          </CardDescription>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No timeline data available yet
            </div>
          ) : (
            <div className="space-y-2">
              {timeline.map((day: any) => {
                const successRate = day.execution_count > 0
                  ? ((day.success_count / day.execution_count) * 100).toFixed(0)
                  : 0;
                
                return (
                  <div key={day.date} className="flex items-center space-x-4 p-3 border rounded-lg">
                    <div className="flex items-center space-x-2 w-32">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {format(new Date(day.date), 'MMM dd')}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-4">
                        <div className="text-sm">
                          <span className="font-medium">{day.execution_count}</span> executions
                        </div>
                        <div className="text-sm text-green-600">
                          <span className="font-medium">{day.success_count}</span> succeeded
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {successRate}% success rate
                        </div>
                      </div>
                      <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full"
                          style={{ width: `${successRate}%` }}
                        />
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

export default AutoEngagementAnalytics;
