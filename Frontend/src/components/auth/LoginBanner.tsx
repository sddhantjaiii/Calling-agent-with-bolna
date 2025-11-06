import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  X,
  CreditCard,
  Clock
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { authenticatedFetch } from '../../utils/auth';
import { Link } from 'react-router-dom';

interface LoginWarningData {
  showBanner: boolean;
  message: string;
  type: 'info' | 'warning' | 'error';
  autoHide: boolean;
  duration: number;
}

interface UserData {
  id: string;
  email: string;
  name: string;
  credits: number;
  lastCreditWarning?: string | null;
}

interface LoginStatusResponse {
  success: boolean;
  user: UserData;
  loginWarnings: LoginWarningData;
  timestamp: string;
}

interface LoginBannerProps {
  onClose?: () => void;
  className?: string;
}

export const LoginBanner: React.FC<LoginBannerProps> = ({ 
  onClose,
  className 
}) => {
  const [loginData, setLoginData] = useState<LoginStatusResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  const fetchLoginStatus = async () => {
    try {
      const response = await authenticatedFetch('/api/user/login-status');
      if (!response.ok) {
        throw new Error('Failed to fetch login status');
      }
      const data: LoginStatusResponse = await response.json();
      setLoginData(data);
      
      // Set up auto-hide timer if configured
      if (data.loginWarnings.autoHide && data.loginWarnings.duration > 0) {
        setTimeRemaining(data.loginWarnings.duration);
      }
    } catch (err) {
      console.error('Failed to fetch login status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoginStatus();
  }, []);

  // Auto-hide countdown
  useEffect(() => {
    if (timeRemaining !== null && timeRemaining > 0) {
      const timer = setTimeout(() => {
        setTimeRemaining(prev => prev !== null ? prev - 1000 : null);
      }, 1000);

      return () => clearTimeout(timer);
    } else if (timeRemaining === 0) {
      setDismissed(true);
      if (onClose) {
        onClose();
      }
    }
  }, [timeRemaining, onClose]);

  // Don't show banner if loading, dismissed, or not configured to show
  if (loading || dismissed || !loginData || !loginData.loginWarnings.showBanner) {
    return null;
  }

  const { loginWarnings, user } = loginData;

  const getBannerIcon = (type: string) => {
    switch (type) {
      case 'error':
        return <AlertCircle className="h-5 w-5" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5" />;
      default:
        return <Info className="h-5 w-5" />;
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
    setDismissed(true);
    if (onClose) {
      onClose();
    }
  };

  const formatTimeRemaining = (ms: number) => {
    const seconds = Math.ceil(ms / 1000);
    return `${seconds}s`;
  };

  return (
    <div className={cn(
      "w-full border-l-4 rounded-lg shadow-sm mb-6",
      getBannerStyles(loginWarnings.type),
      className
    )}>
      <Alert className="border-0 bg-transparent">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            {getBannerIcon(loginWarnings.type)}
            
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm">
                  Welcome back, {user.name}!
                </div>
                {timeRemaining !== null && timeRemaining > 0 && (
                  <div className="flex items-center gap-1 text-xs opacity-75">
                    <Clock className="h-3 w-3" />
                    {formatTimeRemaining(timeRemaining)}
                  </div>
                )}
              </div>
              
              <AlertDescription className="text-sm">
                {loginWarnings.message}
              </AlertDescription>

              {/* Current credit info */}
              <div className="text-xs opacity-90">
                Current balance: <span className="font-medium">{user.credits} credits</span>
              </div>

              {/* Action buttons for low credits */}
              {(loginWarnings.type === 'error' || loginWarnings.type === 'warning') && (
                <div className="flex gap-2 mt-3">
                  <Button
                    asChild
                    size="sm"
                    variant={loginWarnings.type === 'error' ? 'default' : 'secondary'}
                    className={cn(
                      "text-white shadow-sm",
                      loginWarnings.type === 'error' && "bg-red-600 hover:bg-red-700",
                      loginWarnings.type === 'warning' && "bg-orange-600 hover:bg-orange-700 text-white"
                    )}
                  >
                    <Link to="/billing/purchase" className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Buy Credits
                    </Link>
                  </Button>

                  {/* Quick purchase options */}
                  {user.credits <= 5 && (
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="border-current text-current hover:bg-current/10"
                    >
                      <Link to="/billing/purchase?amount=50">
                        +50 Credits
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Dismiss Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="h-8 w-8 p-0 hover:bg-black/10 flex-shrink-0"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Dismiss</span>
          </Button>
        </div>
      </Alert>
    </div>
  );
};

// Compact version for mobile/smaller screens
export const CompactLoginBanner: React.FC<LoginBannerProps> = ({ 
  onClose,
  className 
}) => {
  const [loginData, setLoginData] = useState<LoginStatusResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchLoginStatus = async () => {
    try {
      const response = await authenticatedFetch('/api/user/login-status');
      if (!response.ok) {
        throw new Error('Failed to fetch login status');
      }
      const data: LoginStatusResponse = await response.json();
      setLoginData(data);
    } catch (err) {
      console.error('Failed to fetch login status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoginStatus();
  }, []);

  if (loading || dismissed || !loginData || !loginData.loginWarnings.showBanner) {
    return null;
  }

  const { loginWarnings, user } = loginData;

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
    setDismissed(true);
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className={cn(
      "w-full border-l-2 rounded p-3 mb-4",
      getBannerStyles(loginWarnings.type),
      className
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            Welcome back! {user.credits} credits remaining.
          </div>
          {(loginWarnings.type === 'error' || loginWarnings.type === 'warning') && (
            <div className="text-xs opacity-90 mt-1">
              {loginWarnings.type === 'error' ? 'Calls disabled' : 'Low credits'}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-1 flex-shrink-0">
          {(loginWarnings.type === 'error' || loginWarnings.type === 'warning') && (
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
          )}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="h-7 w-7 p-0"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LoginBanner;