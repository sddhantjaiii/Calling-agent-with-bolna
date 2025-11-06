import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { 
  CheckCircle, 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  X,
  CreditCard,
  DollarSign
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Link } from 'react-router-dom';

export interface Toast {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message: string;
  duration?: number;
  actionRequired?: boolean;
  action?: {
    label: string;
    url: string;
  };
  timestamp: Date;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id' | 'timestamp'>) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id' | 'timestamp'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast: Toast = {
      ...toast,
      id,
      timestamp: new Date(),
    };

    setToasts(prev => [newToast, ...prev]);

    // Auto-remove toast after duration (if specified)
    if (toast.duration && toast.duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, toast.duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  // Limit number of toasts shown
  useEffect(() => {
    if (toasts.length > 5) {
      setToasts(prev => prev.slice(0, 5));
    }
  }, [toasts]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearAll }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
};

const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onRemove={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
};

interface ToastItemProps {
  toast: Toast;
  onRemove: () => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onRemove }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    // Animate in
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleRemove = () => {
    setIsRemoving(true);
    setTimeout(onRemove, 200); // Wait for animation
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getStyles = (type: string) => {
    switch (type) {
      case 'success':
        return 'border-green-200 bg-green-50';
      case 'warning':
        return 'border-orange-200 bg-orange-50';
      case 'error':
        return 'border-red-200 bg-red-50';
      default:
        return 'border-blue-200 bg-blue-50';
    }
  };

  return (
    <div
      className={cn(
        "transform transition-all duration-200 ease-in-out",
        isVisible && !isRemoving ? "translate-x-0 opacity-100" : "translate-x-full opacity-0",
        isRemoving && "translate-x-full opacity-0"
      )}
    >
      <Alert className={cn(
        "shadow-lg border-l-4 relative",
        getStyles(toast.type)
      )}>
        <div className="flex items-start gap-3">
          {getIcon(toast.type)}
          
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">{toast.title}</div>
            <AlertDescription className="text-sm mt-1">
              {toast.message}
            </AlertDescription>
            
            {toast.action && (
              <div className="mt-3">
                <Button
                  asChild
                  size="sm"
                  variant={toast.type === 'error' ? 'default' : 'secondary'}
                  className="h-8"
                >
                  <Link to={toast.action.url} onClick={handleRemove}>
                    <CreditCard className="h-4 w-4 mr-2" />
                    {toast.action.label}
                  </Link>
                </Button>
              </div>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="h-6 w-6 p-0 hover:bg-black/10"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </Alert>
    </div>
  );
};

// Credit-specific toast helpers
export const useCreditToasts = () => {
  const { addToast } = useToast();

  const showCreditDeductedToast = useCallback((creditsUsed: number, remaining: number) => {
    if (remaining <= 0) {
      addToast({
        type: 'error',
        title: 'Credits Depleted',
        message: remaining === 0 
          ? 'Your credit balance is now zero. Purchase more credits to continue.'
          : `Your credit balance is now negative (${remaining}). Please purchase credits immediately.`,
        actionRequired: true,
        action: {
          label: 'Buy Credits',
          url: '/billing/purchase'
        },
        duration: 0 // Don't auto-hide
      });
    } else if (remaining <= 5) {
      addToast({
        type: 'warning',
        title: 'Low Credits Warning',
        message: `Call completed (-${creditsUsed} credits). ${remaining} credits remaining.`,
        actionRequired: true,
        action: {
          label: 'Buy Credits',
          url: '/billing/purchase'
        },
        duration: 10000
      });
    } else if (remaining <= 15) {
      addToast({
        type: 'info',
        title: 'Credit Update',
        message: `Call completed (-${creditsUsed} credits). ${remaining} credits remaining.`,
        duration: 5000
      });
    }
  }, [addToast]);

  const showCreditAddedToast = useCallback((creditsAdded: number, newBalance: number) => {
    addToast({
      type: 'success',
      title: 'Credits Added',
      message: `${creditsAdded} credits added to your account. New balance: ${newBalance}`,
      duration: 6000
    });
  }, [addToast]);

  const showCreditRestoredToast = useCallback((newBalance: number) => {
    addToast({
      type: 'success',
      title: 'Credits Restored',
      message: `Great! Your credit balance has been restored to ${newBalance}. You can now make calls again.`,
      duration: 8000
    });
  }, [addToast]);

  const showInsufficientCreditsToast = useCallback((required: number, current: number) => {
    const shortfall = required - current;
    addToast({
      type: 'error',
      title: 'Insufficient Credits',
      message: `You need ${shortfall} more credits to proceed. Current balance: ${current}`,
      actionRequired: true,
      action: {
        label: 'Buy Credits',
        url: `/billing/purchase?amount=${Math.max(shortfall + 20, 50)}`
      },
      duration: 0
    });
  }, [addToast]);

  const showCampaignPausedToast = useCallback(() => {
    addToast({
      type: 'warning',
      title: 'Campaign Paused',
      message: 'Your campaign has been automatically paused due to insufficient credits.',
      actionRequired: true,
      action: {
        label: 'Buy Credits',
        url: '/billing/purchase'
      },
      duration: 0
    });
  }, [addToast]);

  return {
    showCreditDeductedToast,
    showCreditAddedToast,
    showCreditRestoredToast,
    showInsufficientCreditsToast,
    showCampaignPausedToast
  };
};

export default ToastProvider;