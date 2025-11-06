import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/components/theme/ThemeProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Phone, CheckCircle, AlertCircle, Settings as SettingsIcon, Users } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { authenticatedFetch } from '@/utils/auth';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

interface UserConcurrencySettings {
  user_concurrent_calls_limit: number;
  user_active_calls: number;
  user_available_slots: number;
}

const UserConcurrency: React.FC = () => {
  const { theme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [newLimit, setNewLimit] = useState('');

  // Fetch all users
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const response = await authenticatedFetch('/api/admin/users');
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
    },
  });

  const users = usersData?.users || [];

  // Fetch concurrency settings for selected user
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['user-concurrency-settings', selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return null;
      const response = await authenticatedFetch(`/api/admin/users/${selectedUserId}/concurrency`);
      if (!response.ok) throw new Error('Failed to fetch user settings');
      return response.json();
    },
    enabled: !!selectedUserId,
    refetchInterval: 5000, // Refetch every 5 seconds for real-time updates
  });

  // Update concurrency limit mutation
  const updateMutation = useMutation({
    mutationFn: async ({ userId, limit }: { userId: string; limit: number }) => {
      const response = await authenticatedFetch(`/api/admin/users/${userId}/concurrency`, {
        method: 'PUT',
        body: JSON.stringify({ user_limit: limit }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update settings');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-concurrency-settings', selectedUserId] });
      toast({
        title: 'Concurrency Limit Updated',
        description: 'User concurrency limit has been updated successfully',
      });
      setNewLimit('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedUserId) {
      toast({
        title: 'Validation Error',
        description: 'Please select a user first',
        variant: 'destructive',
      });
      return;
    }

    const limit = parseInt(newLimit);
    
    if (isNaN(limit) || limit < 1 || limit > 10) {
      toast({
        title: 'Validation Error',
        description: 'Concurrency limit must be between 1 and 10',
        variant: 'destructive',
      });
      return;
    }

    updateMutation.mutate({ userId: selectedUserId, limit });
  };

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

  const selectedUser = users.find((u: User) => u.id.toString() === selectedUserId);

  return (
    <div className={`h-full p-6 ${theme === 'dark' ? 'bg-black text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Users className="w-8 h-8" />
          User Concurrency Management
        </h1>
        <p className={`mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
          Manage concurrent call limits for users
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl">
        {/* User Selection & Update Card */}
        <Card>
          <CardHeader>
            <CardTitle>Select User & Update Limit</CardTitle>
            <CardDescription>
              Choose a user and adjust their concurrency limit (1-10)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* User Selection */}
              <div>
                <Label htmlFor="user">Select User</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Choose a user" />
                  </SelectTrigger>
                  <SelectContent>
                    {usersLoading ? (
                      <SelectItem value="loading" disabled>Loading users...</SelectItem>
                    ) : users.length === 0 ? (
                      <SelectItem value="none" disabled>No users found</SelectItem>
                    ) : (
                      users.map((user: User) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.name} ({user.email}) - {user.role}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Show current limit if user selected */}
              {selectedUser && settings?.settings && (
                <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}>
                  <p className="text-sm font-medium mb-1">Current Status for {selectedUser.name}:</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Limit: <strong>{settings.settings.user_concurrent_calls_limit}</strong> | 
                    Active: <strong>{settings.settings.user_active_calls}</strong> | 
                    Available: <strong>{settings.settings.user_available_slots}</strong>
                  </p>
                </div>
              )}

              {/* New Limit Input */}
              <div>
                <Label htmlFor="limit">New Concurrency Limit</Label>
                <Input
                  id="limit"
                  type="number"
                  min="1"
                  max="10"
                  value={newLimit}
                  onChange={(e) => setNewLimit(e.target.value)}
                  placeholder={`Current: ${settings?.settings?.user_concurrent_calls_limit || 'Select a user'}`}
                  className="mt-1"
                  disabled={!selectedUserId}
                />
                <p className="text-xs text-gray-500 mt-2">
                  Set between 1 and 10. Higher limits allow more simultaneous calls.
                </p>
              </div>

              {/* Info Box */}
              <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'border-blue-900 bg-blue-950' : 'border-blue-200 bg-blue-50'}`}>
                <h4 className="font-medium text-blue-600 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Important Notes
                </h4>
                <ul className="text-sm space-y-1 text-gray-600 dark:text-gray-300">
                  <li>• Changes take effect immediately for new campaigns</li>
                  <li>• Active campaigns continue with their original settings</li>
                  <li>• Lowering the limit won't interrupt active calls</li>
                  <li>• Users cannot modify their own concurrency limits</li>
                </ul>
              </div>

              <Button
                type="submit"
                disabled={updateMutation.isPending || !selectedUserId || !newLimit}
                style={{ backgroundColor: '#1A6262' }}
                className="w-full text-white"
              >
                {updateMutation.isPending ? 'Updating...' : 'Update Limit'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Current Status Card */}
        {selectedUser && settings?.settings && (
          <Card>
            <CardHeader>
              <CardTitle>Current Status for {selectedUser.name}</CardTitle>
              <CardDescription>Real-time concurrency usage</CardDescription>
            </CardHeader>
            <CardContent>
              {settingsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Status Badge */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Status</span>
                    {getStatusBadge()}
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className={`text-center p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                      <Phone className={`w-8 h-8 mx-auto mb-2 ${getStatusColor()}`} />
                      <p className="text-2xl font-bold">{settings.settings.user_active_calls}</p>
                      <p className="text-xs text-gray-500">Active</p>
                    </div>
                    
                    <div className={`text-center p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-blue-50'}`}>
                      <CheckCircle className="w-8 h-8 mx-auto mb-2 text-blue-600" />
                      <p className="text-2xl font-bold text-blue-600">{settings.settings.user_available_slots}</p>
                      <p className="text-xs text-gray-500">Available</p>
                    </div>
                    
                    <div className={`text-center p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-purple-50'}`}>
                      <SettingsIcon className="w-8 h-8 mx-auto mb-2 text-purple-600" />
                      <p className="text-2xl font-bold text-purple-600">{settings.settings.user_concurrent_calls_limit}</p>
                      <p className="text-xs text-gray-500">Limit</p>
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
              )}
            </CardContent>
          </Card>
        )}

        {/* No user selected placeholder */}
        {!selectedUser && (
          <Card>
            <CardHeader>
              <CardTitle>User Status</CardTitle>
              <CardDescription>Select a user to view their concurrency status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center py-12 text-gray-400">
                <div className="text-center">
                  <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>No user selected</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default UserConcurrency;
