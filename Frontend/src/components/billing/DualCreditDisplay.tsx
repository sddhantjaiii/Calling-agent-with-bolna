import React from 'react';
import { Phone, MessageSquare, RefreshCw, AlertCircle } from 'lucide-react';
import { useBilling } from '../../hooks/useBilling';
import { useChatCredits } from '../../hooks/useChatCredits';
import { Button } from '../ui/button';
import { useTheme } from '../theme/ThemeProvider';
import { toast } from 'sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';

interface DualCreditDisplayProps {
  showRefresh?: boolean;
  className?: string;
}

/**
 * Dual Credit Display Component
 * Shows both Call Credits (from main server) and Chat Credits (from microservice)
 * Uses Phone icon for Call credits and MessageSquare icon for Chat credits
 */
export const DualCreditDisplay: React.FC<DualCreditDisplayProps> = ({
  showRefresh = true,
  className = '',
}) => {
  const { theme } = useTheme();
  const {
    credits: callCredits,
    loadingCredits: loadingCallCredits,
    refreshCredits: refreshCallCredits,
  } = useBilling();
  
  const {
    chatCredits,
    loadingChatCredits,
    refreshChatCredits,
    isChatServiceAvailable,
  } = useChatCredits();

  const handleRefresh = async () => {
    try {
      await Promise.all([refreshCallCredits(), refreshChatCredits()]);
      toast.success('Credits updated');
    } catch (error) {
      toast.error('Failed to refresh credits');
    }
  };

  const isLoading = loadingCallCredits || loadingChatCredits;
  
  // Call credits warnings
  const isLowCallCredits = callCredits && callCredits.credits < 50;
  const isCriticalCallCredits = callCredits && callCredits.credits < 10;
  
  // Chat credits warnings
  const isLowChatCredits = chatCredits && chatCredits.credits < 50;
  const isCriticalChatCredits = chatCredits && chatCredits.credits < 10;

  return (
    <TooltipProvider>
      <div className={`flex items-center space-x-3 ${className}`}>
        {/* Call Credits */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center space-x-1">
              <Phone className={`w-4 h-4 ${
                isCriticalCallCredits 
                  ? 'text-red-500' 
                  : isLowCallCredits 
                    ? 'text-yellow-500' 
                    : theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'
              }`} />
              {loadingCallCredits ? (
                <div className="animate-pulse">
                  <div className={`h-4 w-8 rounded ${
                    theme === 'dark' ? 'bg-slate-700' : 'bg-gray-200'
                  }`} />
                </div>
              ) : callCredits ? (
                <span className={`text-sm font-medium ${
                  isCriticalCallCredits 
                    ? 'text-red-500' 
                    : isLowCallCredits 
                      ? 'text-yellow-500' 
                      : theme === 'dark' 
                        ? 'text-slate-300' 
                        : 'text-gray-700'
                }`}>
                  {callCredits.credits}
                </span>
              ) : (
                <span className={`text-sm ${
                  theme === 'dark' ? 'text-slate-400' : 'text-gray-500'
                }`}>
                  --
                </span>
              )}
              {(isLowCallCredits || isCriticalCallCredits) && (
                <AlertCircle className={`w-3 h-3 ${
                  isCriticalCallCredits ? 'text-red-500' : 'text-yellow-500'
                }`} />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">
              <span className="font-semibold">Call Credits:</span> {callCredits?.credits ?? 0}
              {isLowCallCredits && (
                <span className={`block ${isCriticalCallCredits ? 'text-red-400' : 'text-yellow-400'}`}>
                  {isCriticalCallCredits ? '⚠️ Critical: Very low!' : '⚠️ Running low'}
                </span>
              )}
            </p>
          </TooltipContent>
        </Tooltip>

        {/* Divider */}
        <div className={`h-4 w-px ${
          theme === 'dark' ? 'bg-slate-600' : 'bg-gray-300'
        }`} />

        {/* Chat Credits */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center space-x-1">
              <MessageSquare className={`w-4 h-4 ${
                !isChatServiceAvailable 
                  ? theme === 'dark' ? 'text-slate-500' : 'text-gray-400'
                  : isCriticalChatCredits 
                    ? 'text-red-500' 
                    : isLowChatCredits 
                      ? 'text-yellow-500' 
                      : theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
              }`} />
              {loadingChatCredits ? (
                <div className="animate-pulse">
                  <div className={`h-4 w-8 rounded ${
                    theme === 'dark' ? 'bg-slate-700' : 'bg-gray-200'
                  }`} />
                </div>
              ) : chatCredits ? (
                <span className={`text-sm font-medium ${
                  !isChatServiceAvailable
                    ? theme === 'dark' ? 'text-slate-500' : 'text-gray-400'
                    : isCriticalChatCredits 
                      ? 'text-red-500' 
                      : isLowChatCredits 
                        ? 'text-yellow-500' 
                        : theme === 'dark' 
                          ? 'text-slate-300' 
                          : 'text-gray-700'
                }`}>
                  {chatCredits.credits}
                </span>
              ) : (
                <span className={`text-sm ${
                  theme === 'dark' ? 'text-slate-400' : 'text-gray-500'
                }`}>
                  --
                </span>
              )}
              {isChatServiceAvailable && (isLowChatCredits || isCriticalChatCredits) && (
                <AlertCircle className={`w-3 h-3 ${
                  isCriticalChatCredits ? 'text-red-500' : 'text-yellow-500'
                }`} />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">
              <span className="font-semibold">Chat Credits:</span> {chatCredits?.credits ?? 0}
              {!isChatServiceAvailable && (
                <span className="block text-slate-400">Chat service unavailable</span>
              )}
              {isChatServiceAvailable && isLowChatCredits && (
                <span className={`block ${isCriticalChatCredits ? 'text-red-400' : 'text-yellow-400'}`}>
                  {isCriticalChatCredits ? '⚠️ Critical: Very low!' : '⚠️ Running low'}
                </span>
              )}
            </p>
          </TooltipContent>
        </Tooltip>

        {/* Refresh Button */}
        {showRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className={`p-1 h-6 w-6 ${
              theme === 'dark'
                ? 'text-slate-300 hover:text-white hover:bg-slate-700'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>
    </TooltipProvider>
  );
};

export default DualCreditDisplay;
