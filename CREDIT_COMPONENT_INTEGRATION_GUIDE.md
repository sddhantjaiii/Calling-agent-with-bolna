# Component Integration Guide

This guide shows how to integrate all the credit warning components into your main application.

## 1. App.tsx Root Level Integration

```tsx
// src/App.tsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './components/ui/ToastProvider';
import { CreditBanner } from './components/dashboard/CreditBanner';
import { AuthProvider } from './contexts/AuthContext';

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <div className="min-h-screen bg-gray-50">
            {/* Site-wide credit banner */}
            <CreditBanner />
            
            <Routes>
              {/* Your existing routes */}
            </Routes>
          </div>
        </Router>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
```

## 2. Dashboard Integration

```tsx
// src/pages/Dashboard.tsx
import React from 'react';
import { CreditWidget } from '../components/dashboard/CreditWidget';
import { LoginBanner } from '../components/auth/LoginBanner';

export const Dashboard: React.FC = () => {
  return (
    <div className="p-6 space-y-6">
      {/* Login banner for first-time login warnings */}
      <LoginBanner />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Credit widget in dashboard */}
        <div className="lg:col-span-1">
          <CreditWidget />
        </div>
        
        {/* Other dashboard widgets */}
        <div className="lg:col-span-2">
          {/* Your other dashboard content */}
        </div>
      </div>
    </div>
  );
};
```

## 3. Campaign Creation Integration

```tsx
// src/pages/CampaignCreate.tsx
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { CampaignCreditEstimator } from '../components/campaigns/CampaignCreditEstimator';
import { useCreditToasts } from '../components/ui/ToastProvider';

export const CampaignCreate: React.FC = () => {
  const [showEstimator, setShowEstimator] = useState(false);
  const [campaignData, setCampaignData] = useState({
    name: '',
    contacts: [],
    estimatedDuration: 5
  });
  const { showCreditInsufficient } = useCreditToasts();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Show credit estimator before final submission
    setShowEstimator(true);
  };

  const handleEstimatorConfirm = async () => {
    try {
      // Submit campaign
      const response = await authenticatedFetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaignData)
      });

      if (!response.ok) {
        throw new Error('Campaign creation failed');
      }

      // Success handling
      setShowEstimator(false);
    } catch (error) {
      if (error.message.includes('insufficient credits')) {
        showCreditInsufficient(
          'Cannot create campaign: insufficient credits',
          { autoClose: false, showPurchaseButton: true }
        );
      }
    }
  };

  return (
    <div className="p-6">
      {/* Campaign creation form */}
      <form onSubmit={handleSubmit}>
        {/* Your form fields */}
        
        <button type="submit" className="btn-primary">
          Create Campaign
        </button>
      </form>

      {/* Credit estimator modal */}
      <Dialog open={showEstimator} onOpenChange={setShowEstimator}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Campaign Cost Estimate</DialogTitle>
          </DialogHeader>
          
          <CampaignCreditEstimator
            contactCount={campaignData.contacts.length}
            estimatedDuration={campaignData.estimatedDuration}
            onConfirm={handleEstimatorConfirm}
            onCancel={() => setShowEstimator(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};
```

## 4. Mobile Responsive Layout

```tsx
// src/components/layout/MobileLayout.tsx
import React from 'react';
import { CompactCreditBanner } from '../dashboard/CreditBanner';
import { CompactLoginBanner } from '../auth/LoginBanner';

export const MobileLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile-optimized banners */}
      <div className="sm:hidden">
        <CompactCreditBanner />
        <CompactLoginBanner />
      </div>
      
      {/* Desktop banners */}
      <div className="hidden sm:block">
        <CreditBanner />
        <LoginBanner />
      </div>
      
      <main className="p-4 sm:p-6">
        {children}
      </main>
    </div>
  );
};
```

## 5. Real-time Updates Setup

```tsx
// src/hooks/useCreditUpdates.ts
import { useEffect } from 'react';
import { useCreditToasts } from '../components/ui/ToastProvider';

export const useCreditUpdates = () => {
  const { showCreditLow, showCreditDepleted } = useCreditToasts();

  useEffect(() => {
    // Set up WebSocket for real-time credit updates
    const ws = new WebSocket(process.env.REACT_APP_WS_URL || 'ws://localhost:3001');
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'CREDIT_UPDATE') {
        const { credits, previousCredits, userId } = data;
        
        // Show appropriate notifications
        if (credits <= 0 && previousCredits > 0) {
          showCreditDepleted('Your credits have been depleted');
        } else if (credits <= 5 && previousCredits > 5) {
          showCreditLow('Low credit warning: 5 credits remaining');
        }
        
        // Trigger component refreshes
        window.dispatchEvent(new CustomEvent('creditUpdate', { detail: data }));
      }
    };

    return () => {
      ws.close();
    };
  }, [showCreditLow, showCreditDepleted]);
};

// Use in App.tsx
// function App() {
//   useCreditUpdates();
//   return (...);
// }
```

## 6. Environment Configuration

```bash
# .env
REACT_APP_API_URL=http://localhost:3001
REACT_APP_WS_URL=ws://localhost:3001
REACT_APP_STRIPE_PUBLIC_KEY=pk_test_...
```

## 7. API Integration Checklist

- ✅ `/api/user/credit-status` - Real-time credit balance
- ✅ `/api/user/campaign-credit-check` - Campaign cost estimation
- ✅ `/api/user/login-status` - Login warnings and user info
- ✅ `/api/user/credit-alerts` - Credit notification preferences
- ✅ WebSocket endpoint for real-time updates

## 8. Component Props Reference

### CreditWidget
```tsx
interface CreditWidgetProps {
  refreshInterval?: number; // Default: 30000ms
  showCapabilityIndicators?: boolean; // Default: true
  compactMode?: boolean; // Default: false
  className?: string;
}
```

### CreditBanner
```tsx
interface CreditBannerProps {
  onClose?: () => void;
  autoRefresh?: boolean; // Default: true
  refreshInterval?: number; // Default: 60000ms
  className?: string;
}
```

### CampaignCreditEstimator
```tsx
interface CampaignCreditEstimatorProps {
  contactCount: number;
  estimatedDuration?: number; // Default: 5 minutes
  onConfirm?: () => void;
  onCancel?: () => void;
  compactMode?: boolean; // Default: false
  className?: string;
}
```

### LoginBanner
```tsx
interface LoginBannerProps {
  onClose?: () => void;
  className?: string;
}
```

## 9. Testing Integration

```tsx
// src/tests/CreditIntegration.test.tsx
import { render, screen } from '@testing-library/react';
import { ToastProvider } from '../components/ui/ToastProvider';
import { CreditWidget } from '../components/dashboard/CreditWidget';

test('Credit components integrate properly', () => {
  render(
    <ToastProvider>
      <CreditWidget />
    </ToastProvider>
  );
  
  expect(screen.getByText(/credit balance/i)).toBeInTheDocument();
});
```

## 10. Performance Optimization

- **Lazy Loading**: Load credit components only when needed
- **Memoization**: Use React.memo for expensive credit calculations
- **Debouncing**: Debounce API calls for real-time updates
- **Caching**: Cache credit status for short periods to reduce API calls

## Next Steps

1. **Immediate**: Integrate ToastProvider and CreditBanner at app root level
2. **High Priority**: Add CreditWidget to dashboard and CampaignCreditEstimator to campaign creation
3. **Medium Priority**: Set up WebSocket for real-time updates
4. **Low Priority**: Implement advanced features like credit purchase flows

This integration provides a complete credit warning system that covers all Priority 1 requirements and sets the foundation for Priority 2 and 3 enhancements.