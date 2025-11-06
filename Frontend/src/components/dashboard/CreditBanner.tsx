import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { AlertCircle, AlertTriangle, X, CreditCard } from 'lucide-react';
import { cn } from '../../lib/utils';
import { authenticatedFetch } from '../../utils/auth';
import { Link } from 'react-router-dom';

interface CreditBannerData {
  showBanner: boolean;
  bannerMessage: string;
  bannerType: 'info' | 'warning' | 'error';
  isDismissible: boolean;
}

interface CreditStatusResponse {
  success: boolean;
  warnings: CreditBannerData;
  timestamp: string;
}

export const CreditBanner: React.FC = () => {
  const [bannerData, setBannerData] = useState<CreditBannerData | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchCreditStatus = async () => {
    try {
      const response = await authenticatedFetch('/api/user/credit-status');
      if (!response.ok) {
        throw new Error('Failed to fetch credit status');
      }
      const data: CreditStatusResponse = await response.json();
      setBannerData(data.warnings);
    } catch (err) {
      console.error('Failed to fetch credit banner status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCreditStatus();
    
    // Check for updates every 60 seconds
    const interval = setInterval(fetchCreditStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  // Don't show banner if loading, dismissed (and dismissible), or not configured to show
  if (loading || !bannerData || !bannerData.showBanner) {
    return null;
  }

  if (dismissed && bannerData.isDismissible) {
    return null;
  }

  const getBannerIcon = (type: string) => {
    switch (type) {
      case 'error':
        return <AlertCircle className="h-5 w-5" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5" />;
      default:
        return <AlertCircle className="h-5 w-5" />;
    }
  };

  const getBannerStyles = (type: string) => {
    switch (type) {
      case 'error':
        return 'border-red-500 bg-red-50 text-red-800';
      case 'warning':
        return 'border-orange-500 bg-orange-50 text-orange-800';
      case 'info':
        return 'border-blue-500 bg-blue-50 text-blue-800';
      default:
        return 'border-gray-500 bg-gray-50 text-gray-800';
    }
  };

  const handleDismiss = () => {
    if (bannerData.isDismissible) {
      setDismissed(true);
    }
  };

  return (
    <div className={cn(
      "sticky top-0 z-50 w-full border-b-2 px-4 py-3 shadow-sm",
      getBannerStyles(bannerData.bannerType)
    )}>
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            {getBannerIcon(bannerData.bannerType)}
            <div className="flex-1">
              <p className="text-sm font-medium">
                {bannerData.bannerMessage}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Purchase Credits Button */}
            <Button
              asChild
              size="sm"
              variant={bannerData.bannerType === 'error' ? 'default' : 'secondary'}
              className={cn(
                "text-white shadow-sm",
                bannerData.bannerType === 'error' && "bg-red-600 hover:bg-red-700 border-red-600",
                bannerData.bannerType === 'warning' && "bg-orange-600 hover:bg-orange-700 border-orange-600 text-white",
                bannerData.bannerType === 'info' && "bg-blue-600 hover:bg-blue-700 border-blue-600 text-white"
              )}
            >
              <Link to="/billing/purchase" className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Buy Credits
              </Link>
            </Button>

            {/* Dismiss Button (only if dismissible) */}
            {bannerData.isDismissible && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="h-8 w-8 p-0 hover:bg-black/10"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Dismiss</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Compact version for smaller screens
export const CreditBannerMobile: React.FC = () => {
  const [bannerData, setBannerData] = useState<CreditBannerData | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchCreditStatus = async () => {
    try {
      const response = await authenticatedFetch('/api/user/credit-status');
      if (!response.ok) {
        throw new Error('Failed to fetch credit status');
      }
      const data: CreditStatusResponse = await response.json();
      setBannerData(data.warnings);
    } catch (err) {
      console.error('Failed to fetch credit banner status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCreditStatus();
    const interval = setInterval(fetchCreditStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !bannerData || !bannerData.showBanner) {
    return null;
  }

  if (dismissed && bannerData.isDismissible) {
    return null;
  }

  const getBannerStyles = (type: string) => {
    switch (type) {
      case 'error':
        return 'border-red-500 bg-red-50 text-red-800';
      case 'warning':
        return 'border-orange-500 bg-orange-50 text-orange-800';
      case 'info':
        return 'border-blue-500 bg-blue-50 text-blue-800';
      default:
        return 'border-gray-500 bg-gray-50 text-gray-800';
    }
  };

  return (
    <div className={cn(
      "sticky top-0 z-50 w-full border-b-2 px-3 py-2",
      getBannerStyles(bannerData.bannerType)
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">
            {bannerData.bannerMessage}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            asChild
            size="sm"
            variant="secondary"
            className="h-7 px-2 text-xs"
          >
            <Link to="/billing/purchase">
              Buy
            </Link>
          </Button>
          {bannerData.isDismissible && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDismissed(true)}
              className="h-7 w-7 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreditBanner;