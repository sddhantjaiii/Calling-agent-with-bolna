import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/components/theme/ThemeProvider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Phone, CheckCircle, Settings as SettingsIcon, AlertCircle } from 'lucide-react';
import { authenticatedFetch } from '@/utils/auth';

const CampaignSettings: React.FC = () => {
  const { theme } = useTheme();

  // Fetch concurrency settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['concurrency-settings'],
    queryFn: async () => {
      const response = await authenticatedFetch('/api/settings/concurrency');
      if (!response.ok) throw new Error('Failed to fetch settings');
      return response.json();
    },
    refetchInterval: 5000, // Refetch every 5 seconds for real-time updates
  });

  const getStatusColor = () => {
    if (!settings?.settings) return 'text-gray-500';
    
    const usagePercent = (settings.settings.user_active_calls / settings.settings.user_concurrent_calls_limit) * 100;
    
    if (usagePercent >= 90) return 'text-red-600';
    if (usagePercent >= 70) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getStatusBadge = () => {
    if (!settings?.settings) return null;
    
    if (settings.settings.user_available_slots === 0) {
      return <Badge variant="destructive">At Capacity</Badge>;
    }
    
    if (settings.settings.user_available_slots <= 1) {
      return <Badge variant="outline" className="text-yellow-600">Low Availability</Badge>;
    }
    
    return <Badge variant="default" className="bg-green-600">Available</Badge>;
  };

  return (
    <div className={`h-full p-6 ${theme === 'dark' ? 'bg-black text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <SettingsIcon className="w-8 h-8" />
          Campaign Settings
        </h1>
        <p className={`mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
          Manage your concurrent call limit
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl">
        {/* Current Status Card */}
        <Card>
          <CardHeader>
            <CardTitle>Your Concurrency Status</CardTitle>
            <CardDescription>Real-time view of your concurrent call usage</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
              </div>
            ) : settings ? (
              <div className="space-y-6">
                {/* Status Badge */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Your Status</span>
                  {getStatusBadge()}
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-3 gap-4">
                  <div className={`text-center p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                    <Phone className={`w-8 h-8 mx-auto mb-2 ${getStatusColor()}`} />
                    <p className="text-2xl font-bold">{settings.settings.user_active_calls}</p>
                    <p className="text-xs text-gray-500">Active Calls</p>
                  </div>
                  
                  <div className={`text-center p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-blue-50'}`}>
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 text-blue-600" />
                    <p className="text-2xl font-bold text-blue-600">{settings.settings.user_available_slots}</p>
                    <p className="text-xs text-gray-500">Available</p>
                  </div>
                  
                  <div className={`text-center p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-purple-50'}`}>
                    <SettingsIcon className="w-8 h-8 mx-auto mb-2 text-purple-600" />
                    <p className="text-2xl font-bold text-purple-600">{settings.settings.user_concurrent_calls_limit}</p>
                    <p className="text-xs text-gray-500">Total Limit</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Usage</span>
                    <span className="font-medium">
                      {settings.settings.user_active_calls} / {settings.settings.user_concurrent_calls_limit}
                    </span>
                  </div>
                  <div className={`w-full h-3 rounded-full ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}>
                    <div
                      className={`h-3 rounded-full transition-all ${
                        (settings.settings.user_active_calls / settings.settings.user_concurrent_calls_limit) * 100 >= 90
                          ? 'bg-red-600'
                          : (settings.settings.user_active_calls / settings.settings.user_concurrent_calls_limit) * 100 >= 70
                          ? 'bg-yellow-600'
                          : 'bg-green-600'
                      }`}
                      style={{
                        width: `${Math.min((settings.settings.user_active_calls / settings.settings.user_concurrent_calls_limit) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-center text-gray-500">Failed to load settings</p>
            )}
          </CardContent>
        </Card>

        {/* Info Card - Contact Admin */}
        <Card>
          <CardHeader>
            <CardTitle>Need to Change Your Limit?</CardTitle>
            <CardDescription>
              Contact your administrator to adjust your concurrency limit
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'border-blue-900 bg-blue-950' : 'border-blue-200 bg-blue-50'}`}>
              <h4 className="font-medium text-blue-600 mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                About Concurrency Limits
              </h4>
              <ul className="text-sm space-y-2 text-gray-600 dark:text-gray-300">
                <li>• Your concurrency limit determines how many simultaneous calls you can make</li>
                <li>• Only administrators can modify user concurrency limits</li>
                <li>• Current limit: <strong>{settings?.settings?.user_concurrent_calls_limit || 'Loading...'}</strong></li>
                <li>• To request a change, please contact your system administrator</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CampaignSettings;
