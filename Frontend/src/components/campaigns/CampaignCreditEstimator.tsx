import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { 
  Calculator, 
  AlertTriangle, 
  AlertCircle, 
  Info,
  DollarSign,
  Users,
  Clock,
  TrendingUp,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { authenticatedFetch } from '../../utils/auth';
import { Link } from 'react-router-dom';

interface CreditEstimate {
  contactCount: number;
  minimumCreditsNeeded: number;
  averageCreditsPerCall: number;
  estimatedTotalCredits: number;
  userCurrentCredits: number;
  canAfford: boolean;
  shortfall: number;
  hasHistoricalData: boolean;
  warning?: string;
  recommendation?: string;
}

interface CreditAffordability {
  canAfford: boolean;
  shortfall: number;
  remainingAfter: number;
  canProceed: boolean;
}

interface CreditWarnings {
  type: 'none' | 'info' | 'warning' | 'error';
  message: string;
  showWarning: boolean;
}

interface CreditCheckResponse {
  success: boolean;
  currentCredits: number;
  estimate: CreditEstimate;
  formatted: {
    estimatedRange: string;
    averagePerCall: string;
    confidenceLevel: string;
    recommendation: string;
  };
  affordability: CreditAffordability;
  warnings: CreditWarnings;
  recommendations: {
    suggestedTopUp: number;
  };
  timestamp: string;
}

interface CampaignCreditEstimatorProps {
  contactCount: number;
  onCreditCheckComplete?: (canProceed: boolean, estimate: CreditEstimate) => void;
  showDetailedBreakdown?: boolean;
  estimateOnly?: boolean;
  className?: string;
}

export const CampaignCreditEstimator: React.FC<CampaignCreditEstimatorProps> = ({
  contactCount,
  onCreditCheckComplete,
  showDetailedBreakdown = true,
  estimateOnly = false,
  className
}) => {
  const [creditCheck, setCreditCheck] = useState<CreditCheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCreditEstimate = async () => {
    if (contactCount <= 0) {
      setCreditCheck(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await authenticatedFetch('/api/user/campaign-credit-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contactCount,
          estimateOnly
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to estimate credits');
      }

      const data: CreditCheckResponse = await response.json();
      setCreditCheck(data);
      
      // Notify parent component
      if (onCreditCheckComplete) {
        onCreditCheckComplete(data.affordability.canProceed, data.estimate);
      }
    } catch (err) {
      console.error('Failed to estimate credits:', err);
      setError('Failed to estimate credit requirements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCreditEstimate();
  }, [contactCount, estimateOnly]);

  const getWarningIcon = (type: string) => {
    switch (type) {
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />;
      default:
        return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
  };

  const getWarningStyles = (type: string) => {
    switch (type) {
      case 'error':
        return 'border-red-200 bg-red-50';
      case 'warning':
        return 'border-orange-200 bg-orange-50';
      case 'info':
        return 'border-blue-200 bg-blue-50';
      default:
        return 'border-green-200 bg-green-50';
    }
  };

  if (contactCount <= 0) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Calculator className="h-4 w-4" />
            Credit Estimation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-4">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Select contacts to estimate credit requirements</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Calculator className="h-4 w-4" />
            Credit Estimation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
            <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !creditCheck) {
    return (
      <Card className={cn("w-full border-red-200", className)}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Calculator className="h-4 w-4" />
            Credit Estimation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="border-red-200">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              {error || 'Unable to estimate credit requirements'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const { estimate, formatted, affordability, warnings, recommendations } = creditCheck;

  return (
    <Card className={cn(
      "w-full transition-all duration-200",
      warnings.type === 'error' && "border-red-200",
      warnings.type === 'warning' && "border-orange-200",
      className
    )}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Credit Estimation
          </div>
          <Badge variant={affordability.canAfford ? "default" : "destructive"}>
            {affordability.canAfford ? "Affordable" : "Insufficient"}
          </Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Main Estimate */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Contacts</div>
            <div className="text-lg font-semibold flex items-center gap-1">
              <Users className="h-4 w-4" />
              {contactCount.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Estimated Credits</div>
            <div className="text-lg font-semibold flex items-center gap-1">
              <DollarSign className="h-4 w-4" />
              {estimate.estimatedTotalCredits}
            </div>
          </div>
        </div>

        {/* Current Balance vs Required */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Current Balance:</span>
            <span className="font-medium">{creditCheck.currentCredits} credits</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Required:</span>
            <span className="font-medium">{estimate.estimatedTotalCredits} credits</span>
          </div>
          
          {affordability.shortfall > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Shortfall:</span>
              <span className="font-medium text-red-600">-{affordability.shortfall} credits</span>
            </div>
          )}
          
          {affordability.canAfford && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Remaining After:</span>
              <span className="font-medium text-green-600">
                {affordability.remainingAfter} credits
              </span>
            </div>
          )}
        </div>

        <Separator />

        {/* Detailed Breakdown */}
        {showDetailedBreakdown && (
          <div className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Breakdown
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-muted-foreground">Avg per call</div>
                <div className="font-medium">{formatted.averagePerCall}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Minimum needed</div>
                <div className="font-medium">{estimate.minimumCreditsNeeded} credits</div>
              </div>
            </div>

            <div className="text-xs">
              <div className="text-muted-foreground">Confidence</div>
              <div className="font-medium flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {formatted.confidenceLevel}
              </div>
            </div>
            
            {estimate.hasHistoricalData && (
              <div className="text-xs text-muted-foreground">
                Based on your historical call data
              </div>
            )}
          </div>
        )}

        {/* Warnings and Recommendations */}
        {warnings.showWarning && (
          <Alert className={getWarningStyles(warnings.type)}>
            {getWarningIcon(warnings.type)}
            <AlertDescription className="text-sm">
              {warnings.message}
            </AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        {!affordability.canAfford && (
          <div className="space-y-2">
            <Button asChild size="sm" className="w-full">
              <Link to={`/billing/purchase?amount=${recommendations.suggestedTopUp}`}>
                <DollarSign className="h-4 w-4 mr-2" />
                Buy {recommendations.suggestedTopUp} Credits
              </Link>
            </Button>
            <div className="text-xs text-center text-muted-foreground">
              Recommended top-up: {recommendations.suggestedTopUp} credits
            </div>
          </div>
        )}

        {/* Last Updated */}
        <div className="text-xs text-muted-foreground text-center">
          <Clock className="h-3 w-3 inline mr-1" />
          Updated {new Date(creditCheck.timestamp).toLocaleTimeString()}
        </div>
      </CardContent>
    </Card>
  );
};

// Compact version for inline use
export const CompactCreditEstimator: React.FC<{
  contactCount: number;
  onCreditCheckComplete?: (canProceed: boolean) => void;
}> = ({ contactCount, onCreditCheckComplete }) => {
  const [creditCheck, setCreditCheck] = useState<CreditCheckResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchCreditEstimate = async () => {
    if (contactCount <= 0) return;
    
    setLoading(true);
    try {
      const response = await authenticatedFetch('/api/user/campaign-credit-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactCount, estimateOnly: true }),
      });

      if (response.ok) {
        const data: CreditCheckResponse = await response.json();
        setCreditCheck(data);
        if (onCreditCheckComplete) {
          onCreditCheckComplete(data.affordability.canProceed);
        }
      }
    } catch (err) {
      console.error('Failed to estimate credits:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCreditEstimate();
  }, [contactCount]);

  if (contactCount <= 0 || loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Calculator className="h-4 w-4" />
        {loading ? 'Calculating...' : 'Select contacts to estimate'}
      </div>
    );
  }

  if (!creditCheck) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600">
        <AlertCircle className="h-4 w-4" />
        Unable to estimate
      </div>
    );
  }

  const { estimate, affordability } = creditCheck;

  return (
    <div className={cn(
      "flex items-center justify-between p-2 rounded-md border text-sm",
      affordability.canAfford 
        ? "border-green-200 bg-green-50 text-green-800" 
        : "border-red-200 bg-red-50 text-red-800"
    )}>
      <div className="flex items-center gap-2">
        {affordability.canAfford ? (
          <CheckCircle className="h-4 w-4" />
        ) : (
          <XCircle className="h-4 w-4" />
        )}
        <span>
          ~{estimate.estimatedTotalCredits} credits needed
        </span>
      </div>
      
      {!affordability.canAfford && (
        <Button asChild size="sm" variant="secondary" className="h-6 text-xs px-2">
          <Link to="/billing/purchase">
            Buy Credits
          </Link>
        </Button>
      )}
    </div>
  );
};

export default CampaignCreditEstimator;