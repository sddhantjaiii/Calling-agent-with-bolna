import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/components/theme/ThemeProvider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Calendar, Clock, Phone, CheckCircle, XCircle, TrendingUp, Eye } from 'lucide-react';
import { authenticatedFetch } from '@/utils/auth';
import { formatDateInUserTimezone } from '@/utils/timezone';
import type { Campaign } from '@/types/api';

interface CampaignDetailsDialogProps {
  campaign: Campaign;
  onClose: () => void;
}

const CampaignDetailsDialog: React.FC<CampaignDetailsDialogProps> = ({
  campaign,
  onClose,
}) => {
  const { theme } = useTheme();
  const navigate = useNavigate();

  // Fetch detailed analytics
  const { data: analyticsResponse, isLoading } = useQuery({
    queryKey: ['campaign-analytics', campaign.id],
    queryFn: async () => {
      const response = await authenticatedFetch(`/api/campaigns/${campaign.id}/analytics`);
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json();
    },
    staleTime: 30000, // Cache for 30 seconds
    refetchInterval: 60000, // Auto-refresh every 60 seconds
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
  });
  
  // Extract the nested analytics object from the API response
  const analytics = analyticsResponse?.analytics;
  
  // Navigate to call logs with campaign filter
  const handleViewCallLogs = () => {
    // Store campaign ID in sessionStorage so UnifiedCallLogs can read it
    sessionStorage.setItem('filterCampaignId', campaign.id);
    onClose();
    // Navigate to dashboard with agents tab and calling-agent-logs subtab
    navigate('/dashboard?tab=agents&subtab=calling-agent-logs');
  };

  const calculateProgress = () => {
    // Use analytics data for accurate progress (unique contacts handled)
    if (analytics?.progress_percentage !== undefined) {
      return Math.round(analytics.progress_percentage);
    }
    // Fallback to campaign data
    if (campaign.total_contacts === 0) return 0;
    return Math.min(Math.round((campaign.completed_calls / campaign.total_contacts) * 100), 100);
  };

  const calculateSuccessRate = () => {
    if (analytics?.success_rate !== undefined) {
      return Math.round(analytics.success_rate);
    }
    if (campaign.completed_calls === 0) return 0;
    return Math.round((campaign.successful_calls / campaign.completed_calls) * 100);
  };

  const formatDuration = (startDate: string, endDate: string | null) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    const diff = end.getTime() - start.getTime();
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatDurationSeconds = (seconds: number) => {
    if (!seconds) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const progress = calculateProgress();
  const successRate = calculateSuccessRate();

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className={`max-w-4xl max-h-[90vh] flex flex-col ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle>{campaign.name}</DialogTitle>
            <Badge variant={campaign.status === 'active' ? 'default' : 'secondary'}>
              {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
            </Badge>
          </div>
          <DialogDescription>
            Campaign details and analytics
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 overflow-y-auto flex-1 pr-2 invisible-scrollbar">
          {/* Progress Overview */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Overall Progress</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={Math.min(progress, 100)} className="h-2" />
            <div className="flex justify-between text-xs text-gray-500">
              <span>{analytics?.handled_calls ?? campaign.completed_calls} of {campaign.total_contacts} contacts called</span>
              <span>{Math.max(0, campaign.total_contacts - (analytics?.handled_calls ?? campaign.completed_calls))} remaining</span>
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
              <div className="flex items-center space-x-2 mb-2">
                <Phone className="w-4 h-4 text-blue-500" />
                <span className="text-sm text-gray-500">Contacts Handled</span>
              </div>
              <p className="text-2xl font-bold">{analytics?.completed_calls ?? campaign.completed_calls}</p>
            </div>

            <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-green-50'}`}>
              <div className="flex items-center space-x-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm text-gray-500">Successful</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{analytics?.successful_calls ?? campaign.successful_calls}</p>
            </div>

            <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-red-50'}`}>
              <div className="flex items-center space-x-2 mb-2">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-sm text-gray-500">Failed</span>
              </div>
              <p className="text-2xl font-bold text-red-600">{campaign.failed_calls}</p>
            </div>

            <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-blue-50'}`}>
              <div className="flex items-center space-x-2 mb-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                <span className="text-sm text-gray-500">Success Rate</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">{successRate}%</p>
            </div>
          </div>

          {/* Campaign Info */}
          <div className={`p-4 rounded-lg space-y-3 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
            <h3 className="font-semibold">Campaign Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-gray-500">Created</p>
                  <p className="font-medium">{formatDateInUserTimezone(campaign.created_at, campaign.campaign_timezone)}</p>
                </div>
              </div>
              
              {campaign.started_at && (
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-gray-500">Started</p>
                    <p className="font-medium">{formatDateInUserTimezone(campaign.started_at, campaign.campaign_timezone)}</p>
                  </div>
                </div>
              )}

              {campaign.completed_at && (
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-gray-500">Completed</p>
                    <p className="font-medium">{formatDateInUserTimezone(campaign.completed_at, campaign.campaign_timezone)}</p>
                  </div>
                </div>
              )}

              {campaign.started_at && (
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-gray-500">Duration</p>
                    <p className="font-medium">{formatDuration(campaign.started_at, campaign.completed_at)}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Schedule Information */}
            <div className="grid grid-cols-2 gap-4 text-sm pt-2 border-t border-gray-200 dark:border-gray-700">
              {campaign.start_date && (
                <div>
                  <p className="text-gray-500">Scheduled Start Date</p>
                  <p className="font-medium">{formatDateInUserTimezone(campaign.start_date, campaign.campaign_timezone, { hour: undefined, minute: undefined })}</p>
                </div>
              )}
              {campaign.end_date && (
                <div>
                  <p className="text-gray-500">Scheduled End Date</p>
                  <p className="font-medium">{formatDateInUserTimezone(campaign.end_date, campaign.campaign_timezone, { hour: undefined, minute: undefined })}</p>
                </div>
              )}
              {campaign.first_call_time && (
                <div>
                  <p className="text-gray-500">First Call Time</p>
                  <p className="font-medium">{campaign.first_call_time}</p>
                </div>
              )}
              {campaign.last_call_time && (
                <div>
                  <p className="text-gray-500">Last Call Time</p>
                  <p className="font-medium">{campaign.last_call_time}</p>
                </div>
              )}
              {campaign.campaign_timezone && (
                <div>
                  <p className="text-gray-500">Timezone</p>
                  <p className="font-medium">{campaign.campaign_timezone}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm pt-2 border-t border-gray-200 dark:border-gray-700">
              <div>
                <p className="text-gray-500">Priority</p>
                <p className="font-medium">Level {campaign.priority}</p>
              </div>
              <div>
                <p className="text-gray-500">Max Concurrent Calls</p>
                <p className="font-medium">{campaign.max_concurrent_calls}</p>
              </div>
            </div>
          </div>

          {/* Detailed Analytics */}
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white mx-auto"></div>
              <p className="mt-2 text-sm text-gray-500">Loading analytics...</p>
            </div>
          ) : analytics ? (
            <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
              <h3 className="font-semibold mb-3">Detailed Analytics</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Average Call Duration:</span>
                  <span className="font-medium">{formatDurationSeconds(analytics?.average_duration_seconds || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pending Calls:</span>
                  <span className="font-medium">{analytics.pending_calls || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>In Progress:</span>
                  <span className="font-medium">{analytics.in_progress || 0}</span>
                </div>
              </div>
            </div>
          ) : null}
          
          {/* View Call Logs Button */}
          <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button
              onClick={handleViewCallLogs}
              style={{ backgroundColor: '#1A6262' }}
              className="text-white hover:opacity-90"
            >
              <Eye className="w-4 h-4 mr-2" />
              View Call Logs
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CampaignDetailsDialog;
