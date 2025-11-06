import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import { 
  Wallet, 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle,
  Plus,
  RefreshCw
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { authenticatedFetch } from '../../utils/auth';
import { Link } from 'react-router-dom';

interface CreditStatus {
  current: number;
  status: 'healthy' | 'warning' | 'critical' | 'depleted';
  color: 'green' | 'yellow' | 'orange' | 'red';
  warningLevel: number;
  lastWarningAt?: string | null;
  dbWarningLevel: number;
}

interface CreditCapabilities {
  canInitiateCalls: boolean;
  canCreateCampaigns: boolean;
  canStartCampaigns: boolean;
}

interface CreditRecommendations {
  suggestedTopUp: number;
  urgency: 'low' | 'medium' | 'high';
}

interface CreditStatusResponse {
  success: boolean;
  credits: CreditStatus;
  capabilities: CreditCapabilities;
  recommendations: CreditRecommendations;
  timestamp: string;
}

export const CreditWidget: React.FC = () => {
  const [creditData, setCreditData] = useState<CreditStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCreditStatus = async () => {
    try {
      const response = await authenticatedFetch('/api/user/credit-status');
      if (!response.ok) {
        throw new Error('Failed to fetch credit status');
      }
      const data = await response.json();
      setCreditData(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch credit status:', err);
      setError('Failed to load credit information');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCreditStatus();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchCreditStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchCreditStatus();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'critical':
        return <AlertCircle className="h-5 w-5 text-orange-500" />;
      case 'depleted':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Wallet className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (color: string) => {
    switch (color) {
      case 'green':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'yellow':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'orange':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'red':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'high':
        return 'border-red-500';
      case 'medium':
        return 'border-yellow-500';
      case 'low':
        return 'border-green-500';
      default:
        return 'border-gray-200';
    }
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Credit Balance</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-8 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 bg-gray-200 rounded animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !creditData) {
    return (
      <Card className="w-full border-red-200">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Credit Balance</CardTitle>
          <AlertCircle className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <Alert className="border-red-200">
            <AlertDescription className="text-sm">
              {error || 'Unable to load credit information'}
            </AlertDescription>
          </Alert>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="mt-2 w-full"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { credits, capabilities, recommendations } = creditData;

  return (
    <Card className={cn(
      "w-full transition-all duration-200",
      getUrgencyColor(recommendations.urgency)
    )}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center space-x-2">
          <CardTitle className="text-sm font-medium">Credit Balance</CardTitle>
          {getStatusIcon(credits.status)}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="h-8 w-8 p-0"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Credit Amount */}
          <div className="flex items-center justify-between">
            <div className="text-2xl font-bold">
              {credits.current}
            </div>
            <Badge 
              variant="outline" 
              className={cn("capitalize", getStatusColor(credits.color))}
            >
              {credits.status}
            </Badge>
          </div>

          {/* Status Message */}
          {credits.status === 'depleted' && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                {credits.current === 0 
                  ? 'No credits remaining. Calls are disabled.'
                  : `Negative balance (${credits.current}). Calls are disabled.`
                }
              </AlertDescription>
            </Alert>
          )}

          {credits.status === 'critical' && (
            <Alert className="border-orange-200 bg-orange-50">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Very low credits. Consider topping up soon.
              </AlertDescription>
            </Alert>
          )}

          {credits.status === 'warning' && (
            <Alert className="border-yellow-200 bg-yellow-50">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Credits running low. Plan your next purchase.
              </AlertDescription>
            </Alert>
          )}

          {/* Capabilities */}
          <div className="text-xs text-gray-600 space-y-1">
            <div className="flex items-center justify-between">
              <span>Make calls:</span>
              <span className={capabilities.canInitiateCalls ? 'text-green-600' : 'text-red-600'}>
                {capabilities.canInitiateCalls ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Start campaigns:</span>
              <span className={capabilities.canStartCampaigns ? 'text-green-600' : 'text-red-600'}>
                {capabilities.canStartCampaigns ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button 
              asChild 
              size="sm" 
              className="flex-1"
              variant={credits.status === 'depleted' ? 'default' : 'outline'}
            >
              <Link to="/billing/purchase">
                <Plus className="h-4 w-4 mr-1" />
                Buy Credits
              </Link>
            </Button>
            
            {recommendations.suggestedTopUp > 0 && (
              <Button 
                asChild 
                size="sm" 
                variant="secondary"
                className="flex-1"
              >
                <Link to={`/billing/purchase?amount=${recommendations.suggestedTopUp}`}>
                  +{recommendations.suggestedTopUp}
                </Link>
              </Button>
            )}
          </div>

          {/* Last Updated */}
          <div className="text-xs text-gray-400 text-center">
            Updated {new Date(creditData.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CreditWidget;