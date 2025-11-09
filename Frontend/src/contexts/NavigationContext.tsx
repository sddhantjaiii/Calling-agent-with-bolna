import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface NavigationContextType {
  activeTab: string;
  activeSubTab: string;
  setActiveTab: (tab: string) => void;
  setActiveSubTab: (subTab: string) => void;
  navigateToLeadIntelligence: (identifier?: { phone?: string; email?: string } | string) => void;
  targetLeadIdentifier: { phone?: string; email?: string } | null;
  clearTargetLeadId: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

interface NavigationProviderProps {
  children: ReactNode;
  initialTab?: string;
  initialSubTab?: string;
}

export const NavigationProvider = ({ 
  children, 
  initialTab = "overview", 
  initialSubTab = "" 
}: NavigationProviderProps) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Read initial values from URL parameters, falling back to props
  const urlTab = searchParams.get('tab');
  const urlSubTab = searchParams.get('subtab');
  
  const [activeTab, setActiveTabState] = useState(urlTab || initialTab);
  const [activeSubTab, setActiveSubTabState] = useState(urlSubTab || initialSubTab);
  const [targetLeadIdentifier, setTargetLeadIdentifier] = useState<{ phone?: string; email?: string } | null>(null);

  // Update URL when tabs change
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeTab && activeTab !== 'overview') {
      params.set('tab', activeTab);
    }
    if (activeSubTab) {
      params.set('subtab', activeSubTab);
    }
    
    const newSearch = params.toString();
    const currentSearch = window.location.search.substring(1);
    
    // Only update URL if it actually changed
    if (newSearch !== currentSearch) {
      navigate(`/dashboard${newSearch ? `?${newSearch}` : ''}`, { replace: true });
    }
  }, [activeTab, activeSubTab, navigate]);

  // Sync with URL changes (e.g., browser back/forward)
  useEffect(() => {
    const urlTab = searchParams.get('tab');
    const urlSubTab = searchParams.get('subtab');
    
    if (urlTab && urlTab !== activeTab) {
      setActiveTabState(urlTab);
    }
    if (urlSubTab !== null && urlSubTab !== activeSubTab) {
      setActiveSubTabState(urlSubTab);
    }
  }, [searchParams]);

  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
  };

  const setActiveSubTab = (subTab: string) => {
    setActiveSubTabState(subTab);
  };

  const navigateToLeadIntelligence = (identifier?: { phone?: string; email?: string } | string) => {
    console.log('Navigating to Lead Intelligence with identifier:', identifier);
    setActiveTab("lead-intelligence");
    setActiveSubTab("");
    
    // Handle both old string format (for backward compatibility) and new object format
    if (typeof identifier === 'string') {
      // Legacy support - just clear it since we can't match by UUID
      setTargetLeadIdentifier(null);
    } else {
      setTargetLeadIdentifier(identifier || null);
    }
  };

  const clearTargetLeadId = () => {
    setTargetLeadIdentifier(null);
  };

  const value = {
    activeTab,
    activeSubTab,
    setActiveTab,
    setActiveSubTab,
    navigateToLeadIntelligence,
    targetLeadIdentifier,
    clearTargetLeadId,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};
