import React, { useState, useEffect } from 'react';
import { X, DollarSign, Plus, Minus, AlertCircle, CheckCircle, Phone, MessageSquare } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Badge } from '../../ui/badge';
import { Alert, AlertDescription } from '../../ui/alert';
import LoadingSpinner from '../../ui/LoadingSpinner';
import type { AdminUserListItem, CreditAdjustmentRequest } from '../../../types/admin';
import { adminApiService } from '../../../services/adminApiService';

interface CreditAdjustModalProps {
  user: AdminUserListItem | null;
  isOpen: boolean;
  onClose: () => void;
  onCreditAdjusted: (user: AdminUserListItem, newBalance: number) => void;
}

type CreditServiceType = 'calling' | 'chat';

interface CreditFormData {
  amount: string;
  type: 'add' | 'subtract';
  reason: string;
  creditService: CreditServiceType;
}

export function CreditAdjustModal({ 
  user, 
  isOpen, 
  onClose, 
  onCreditAdjusted 
}: CreditAdjustModalProps) {
  const [formData, setFormData] = useState<CreditFormData>({
    amount: '',
    type: 'add',
    reason: '',
    creditService: 'calling',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  
  // Chat credits state
  const [chatCredits, setChatCredits] = useState<number | null>(null);
  const [chatCreditsLoading, setChatCreditsLoading] = useState(false);

  // Fetch chat credits when chat service is selected
  useEffect(() => {
    if (isOpen && user && formData.creditService === 'chat') {
      fetchChatCredits();
    }
  }, [isOpen, user, formData.creditService]);

  const fetchChatCredits = async () => {
    if (!user) return;
    
    try {
      setChatCreditsLoading(true);
      const response = await adminApiService.getUserChatCredits(user.id);
      if (response.success && response.data) {
        setChatCredits(response.data.credits);
      } else {
        setChatCredits(null);
      }
    } catch (err) {
      console.error('Failed to fetch chat credits:', err);
      setChatCredits(null);
    } finally {
      setChatCreditsLoading(false);
    }
  };

  // Reset form when modal opens/closes or user changes
  useEffect(() => {
    if (isOpen && user) {
      setFormData({
        amount: '',
        type: 'add',
        reason: '',
        creditService: 'calling',
      });
      setError(null);
      setSuccess(null);
      setValidationErrors({});
      setChatCredits(null);
    }
  }, [isOpen, user]);

  // Helper function to get current balance as a number
  const getCurrentBalance = (): number => {
    if (!user) return 0;
    const rawBalance = user.credits ?? (user as any).credit_balance ?? 0;
    const balance = typeof rawBalance === 'string' ? parseFloat(rawBalance) : Number(rawBalance);
    return isNaN(balance) ? 0 : balance;
  };

  // Validate form data
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    const amount = parseFloat(formData.amount);
    if (!formData.amount.trim()) {
      errors.amount = 'Amount is required';
    } else if (isNaN(amount) || amount <= 0) {
      errors.amount = 'Please enter a valid positive amount';
    } else if (amount > 10000) {
      errors.amount = 'Amount cannot exceed $10,000';
    }

    if (!formData.reason.trim()) {
      errors.reason = 'Reason is required for audit purposes';
    } else if (formData.reason.trim().length < 10) {
      errors.reason = 'Please provide a more detailed reason (minimum 10 characters)';
    }

    // Check if subtraction would result in negative balance (only for calling credits)
    if (formData.type === 'subtract' && user && formData.creditService === 'calling') {
      const currentBalance = getCurrentBalance();
      if (amount > currentBalance) {
        errors.amount = `Cannot subtract more than current balance ($${currentBalance.toFixed(2)})`;
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !validateForm()) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const amount = parseFloat(formData.amount);
      const request: CreditAdjustmentRequest = {
        userId: user.id,
        amount: amount,
        type: formData.type,
        reason: formData.reason.trim(),
      };

      // Call appropriate API based on credit service type
      const response = formData.creditService === 'chat'
        ? await adminApiService.adjustUserChatCredits(request)
        : await adminApiService.adjustUserCredits(request);

      const serviceName = formData.creditService === 'chat' ? 'Chat Agent' : 'Calling Agent';

      if (response.success && response.data) {
        // Parse newBalance as number (backend may return it as string)
        const newBalance = typeof response.data.newBalance === 'string' 
          ? parseFloat(response.data.newBalance) 
          : Number(response.data.newBalance);
        
        setSuccess(
          `Successfully ${formData.type === 'add' ? 'added' : 'subtracted'} $${amount.toFixed(2)} ${serviceName} credits. ` +
          `New balance: $${newBalance.toFixed(2)}`
        );
        
        // Update based on credit service type
        if (formData.creditService === 'calling') {
          // Update the user in the parent component for calling credits
          onCreditAdjusted(user, newBalance);
        } else {
          // Update local chat credits display
          setChatCredits(newBalance);
        }

        // Close modal after a brief success message
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        throw new Error(response.error?.message || `Failed to adjust ${serviceName} credits`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to adjust credits');
    } finally {
      setLoading(false);
    }
  };

  // Handle input changes
  const handleInputChange = (field: keyof CreditFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
    
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => ({
        ...prev,
        [field]: '',
      }));
    }
  };

  // Handle type change
  const handleTypeChange = (type: 'add' | 'subtract') => {
    setFormData(prev => ({
      ...prev,
      type,
    }));
    
    // Clear amount validation error when type changes
    if (validationErrors.amount) {
      setValidationErrors(prev => ({
        ...prev,
        amount: '',
      }));
    }
  };

  // Handle credit service type change
  const handleCreditServiceChange = (creditService: CreditServiceType) => {
    setFormData(prev => ({
      ...prev,
      creditService,
    }));
    // Clear errors when switching service
    setError(null);
    setValidationErrors({});
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Calculate new balance preview
  const getNewBalancePreview = (): number | null => {
    if (!user || !formData.amount) return null;
    
    const amount = parseFloat(formData.amount);
    if (isNaN(amount)) return null;
    
    const currentBalance = getCurrentBalance();
    
    return formData.type === 'add' 
      ? currentBalance + amount 
      : currentBalance - amount;
  };

  if (!isOpen || !user) return null;

  const newBalance = getNewBalancePreview();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-25" onClick={onClose} />
        
        <div className="relative bg-card rounded-lg shadow-xl max-w-md w-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Adjust Credits
              </h2>
              <p className="text-sm text-gray-500">
                Add or subtract credits for {user.name || user.email}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Success Message */}
            {success && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  {success}
                </AlertDescription>
              </Alert>
            )}

            {/* Error Message */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Credit Service Type Selector */}
            <div className="space-y-2">
              <Label>Credit Service</Label>
              <div className="flex space-x-2">
                <Button
                  type="button"
                  variant={formData.creditService === 'calling' ? 'default' : 'outline'}
                  onClick={() => handleCreditServiceChange('calling')}
                  className="flex-1"
                >
                  <Phone className="mr-2 h-4 w-4" />
                  Calling Agent
                </Button>
                <Button
                  type="button"
                  variant={formData.creditService === 'chat' ? 'default' : 'outline'}
                  onClick={() => handleCreditServiceChange('chat')}
                  className="flex-1"
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Chat Agent
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {formData.creditService === 'calling' 
                  ? '📞 Credits for AI voice calls (Bolna.ai)' 
                  : '💬 Credits for WhatsApp/Chat messages (Chat Agent Server)'}
              </p>
            </div>

            {/* Info Alert for Chat Agent */}
            {formData.creditService === 'chat' && (
              <Alert className="border-blue-200 bg-blue-50">
                <MessageSquare className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  <strong>Chat Agent Credits:</strong> These credits are managed by the Chat Agent Server 
                  and are separate from calling credits. They are used for WhatsApp messaging and chat features.
                </AlertDescription>
              </Alert>
            )}

            {/* Current Balance - show based on selected service */}
            {formData.creditService === 'calling' && (
              <div className="p-4 bg-secondary/50 dark:bg-secondary/20 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Current Calling Balance</Label>
                    <p className="text-2xl font-bold text-foreground">
                      {formatCurrency(getCurrentBalance())}
                    </p>
                  </div>
                  <Phone className="h-8 w-8 text-gray-400" />
                </div>
              </div>
            )}

            {/* Chat Credits Balance */}
            {formData.creditService === 'chat' && (
              <div className="p-4 bg-secondary/50 dark:bg-secondary/20 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Current Chat Balance</Label>
                    {chatCreditsLoading ? (
                      <p className="text-2xl font-bold text-muted-foreground">Loading...</p>
                    ) : chatCredits !== null ? (
                      <p className="text-2xl font-bold text-foreground">
                        {formatCurrency(chatCredits)}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Unable to fetch balance</p>
                    )}
                  </div>
                  <MessageSquare className="h-8 w-8 text-gray-400" />
                </div>
              </div>
            )}

            {/* Operation Type */}
            <div className="space-y-2">
              <Label>Operation Type</Label>
              <div className="flex space-x-2">
                <Button
                  type="button"
                  variant={formData.type === 'add' ? 'default' : 'outline'}
                  onClick={() => handleTypeChange('add')}
                  className="flex-1"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Credits
                </Button>
                <Button
                  type="button"
                  variant={formData.type === 'subtract' ? 'default' : 'outline'}
                  onClick={() => handleTypeChange('subtract')}
                  className="flex-1"
                >
                  <Minus className="mr-2 h-4 w-4" />
                  Subtract Credits
                </Button>
              </div>
            </div>

            {/* Amount Field */}
            <div className="space-y-2">
              <Label htmlFor="amount">
                Amount to {formData.type === 'add' ? 'Add' : 'Subtract'} *
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="10000"
                  value={formData.amount}
                  onChange={(e) => handleInputChange('amount', e.target.value)}
                  placeholder="0.00"
                  className={`pl-10 ${validationErrors.amount ? 'border-red-500' : ''}`}
                />
              </div>
              {validationErrors.amount && (
                <p className="text-xs text-red-600">{validationErrors.amount}</p>
              )}
            </div>

            {/* New Balance Preview - only for calling credits */}
            {formData.creditService === 'calling' && newBalance !== null && (
              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-blue-900">
                    New Balance Preview
                  </Label>
                  <Badge 
                    variant={newBalance >= 0 ? 'default' : 'destructive'}
                    className="text-sm font-bold"
                  >
                    {formatCurrency(newBalance)}
                  </Badge>
                </div>
              </div>
            )}

            {/* Reason Field */}
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Adjustment *</Label>
              <Textarea
                id="reason"
                value={formData.reason}
                onChange={(e) => handleInputChange('reason', e.target.value)}
                placeholder="Provide a detailed reason for this credit adjustment (required for audit trail)"
                rows={3}
                className={validationErrors.reason ? 'border-red-500' : ''}
              />
              {validationErrors.reason && (
                <p className="text-xs text-red-600">{validationErrors.reason}</p>
              )}
              <p className="text-xs text-gray-500">
                This reason will be logged in the audit trail for compliance purposes.
              </p>
            </div>

            {/* Warning for Subtraction */}
            {formData.type === 'subtract' && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Warning:</strong> Subtracting credits will immediately reduce the user's available balance. 
                  This action cannot be undone automatically.
                </AlertDescription>
              </Alert>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || !formData.amount || !formData.reason}
                className="min-w-[120px]"
                variant={formData.type === 'subtract' ? 'destructive' : 'default'}
              >
                {loading ? (
                  <>
                    <LoadingSpinner className="mr-2 h-4 w-4" />
                    Processing...
                  </>
                ) : (
                  <>
                    {formData.type === 'add' ? (
                      <Plus className="mr-2 h-4 w-4" />
                    ) : (
                      <Minus className="mr-2 h-4 w-4" />
                    )}
                    {formData.type === 'add' ? 'Add Credits' : 'Subtract Credits'}
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default CreditAdjustModal;
