import { useState } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import ChatAgent from "@/components/dashboard/ChatAgent";
import Integrations from "@/components/dashboard/Integrations";
import Profile from "@/components/dashboard/Profile";
import TopNavigation from "@/components/dashboard/TopNavigation";
import LeadIntelligence from "@/components/dashboard/LeadIntelligence";
import ImportedData from "@/components/dashboard/ImportedData";
import Customers from "@/components/dashboard/Customers";
import CallingAgent from "@/components/dashboard/CallingAgent";
import Campaigns from "@/pages/Campaigns";
import CampaignSettings from "@/pages/CampaignSettings";
import Templates from "@/pages/Templates";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useAgents } from "@/contexts/AgentContext";
import { NavigationProvider, useNavigation } from "@/contexts/NavigationContext";
import AgentSelector from "@/components/ui/AgentSelector";
import { Toaster } from "sonner";
import LeadProfileTab from "@/components/chat/LeadProfileTab";
import Overview from "@/pages/Overview";
import Agents from "@/pages/Agents";
import { DashboardErrorBoundary } from "@/components/ui/ErrorBoundaryWrapper";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";

export interface ChatMessage {
  from: string;
  message: string;
  time: string;
}

export interface TimelineEntry {
  id: number | string;
  type: string;
  interactionAgent?: string;
  interactionDate?: string;
  platform?: string;
  leadType?: string;
  businessType?: string;
  status?: string;
  useCase?: string;
  messages?: number | null;
  duration?: string | null;
  engagementLevel?: string;
  intentLevel?: string;
  budgetConstraint?: string;
  timelineUrgency?: string;
  followUpScheduled?: string;
  demoScheduled?: string;
  actions?: string;
  queries?: number;
  query?: string;
  audioUrl?: string;
  recording?: boolean;
  transcript?: string | string[];
  chatHistory?: ChatMessage[];
  date?: string;
}

export interface Lead {
  id: number | string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  businessType?: string;
  leadType?: string;
  leadTag?: string;
  agentType?: string;
  interactions?: number;
  engagementLevel?: string;
  intentLevel?: string;
  budgetConstraint?: string;
  timelineUrgency?: string;
  useCase?: string;
  timeline?: TimelineEntry[];
  followUpScheduled?: string;
  demoScheduled?: string;
}

// Agents are now managed by the useAgents hook in AgentManager

interface DashboardProps {
  initialTab?: string;
  initialSubTab?: string;
  customContent?: React.ReactNode;
}

// Dashboard content component that uses navigation context
const DashboardContent = ({
  customContent,
}: Omit<DashboardProps, 'initialTab' | 'initialSubTab'>) => {
  const { theme } = useTheme();
  const { agents } = useAgents();
  const { activeTab, activeSubTab, setActiveTab, setActiveSubTab } = useNavigation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Agents are now managed by the useAgents hook from AgentContext

  // State for profile/lead viewing
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  // Track where the lead profile launched from ("chat" | "call"), to restore on back
  const [profileAgentTab, setProfileAgentTab] = useState<string | null>(null);
  const [profileAgentSubTab, setProfileAgentSubTab] = useState<string | null>(
    null
  );

  // Handler that child passes when clicking on a lead in Chat/Call data tabs
  const handleOpenProfile = (
    lead: Lead,
    agentTab: string = "chat",
    agentSubTab: string = "data"
  ) => {
    setProfileAgentTab(agentTab);
    setProfileAgentSubTab(agentSubTab);
    setSelectedLead(lead);
  };

  const handleBackFromProfile = () => {
    setSelectedLead(null);
    setProfileAgentTab(null);
    setProfileAgentSubTab(null);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab !== "profile") {
      setSelectedLead(null);
      setProfileAgentTab(null);
      setProfileAgentSubTab(null);
    }
    if (tab === "agents") {
      setActiveSubTab("agent-manager");
    }
  };

  // Helper function to get calling agent sub-tab
  const getCallingAgentSubTab = () => {
    if (!activeSubTab?.startsWith("calling-agent")) return null;
    
    const match = activeSubTab.match(/^calling-agent-(.+)$/);
    return match ? match[1] : null;
  };

  // Helper function to get chat agent sub-tab
  const getChatAgentSubTab = () => {
    if (!activeSubTab?.startsWith("chat-agent")) return null;
    
    const match = activeSubTab.match(/^chat-agent-(.+)$/);
    return match ? match[1] : null;
  };

  const isAgentsTab = activeTab === "agents";
  const isAgentManager = isAgentsTab && activeSubTab === "agent-manager";
  const isCallingAgent = isAgentsTab && activeSubTab?.startsWith("calling-agent");
  const isChatAgent = isAgentsTab && activeSubTab?.startsWith("chat-agent");

  const callingAgentSubTab = getCallingAgentSubTab();
  const chatAgentSubTab = getChatAgentSubTab();

  const renderContent = () => {
    if (selectedLead) {
      return (
        <LeadProfileTab lead={selectedLead} onBack={handleBackFromProfile} />
      );
    }
    if (activeTab === "profile") {
      return <Profile />;
    }
    if (activeTab === "overview") {
      return (
        <DashboardErrorBoundary>
          <Overview />
        </DashboardErrorBoundary>
      );
    }
    if (activeTab === "imported-data") {
      return <ImportedData onOpenProfile={handleOpenProfile} />;
    }
    if (activeTab === "campaigns") {
      console.log('Campaign tab active, activeSubTab:', activeSubTab);
      if (activeSubTab === "campaigns-settings") {
        return <CampaignSettings />;
      }
      if (activeSubTab === "campaigns-list") {
        return <Campaigns />;
      }
      // Default to campaigns list if no sub-tab specified
      return <Campaigns />;
    }
    if (activeTab === "templates") {
      return <Templates />;
    }
    if (activeTab === "lead-intelligence") {
      return <LeadIntelligence onOpenProfile={handleOpenProfile} />;
    }
    if (activeTab === "customers") {
      return (
        <DashboardErrorBoundary>
          <Customers />
        </DashboardErrorBoundary>
      );
    }
    if (isAgentsTab) {
      if (isAgentManager && !isCallingAgent && !isChatAgent) {
        return <Agents />;
      }
      // Calling Agent with unified logs and analytics
      if (isCallingAgent && callingAgentSubTab) {
        return (
          <CallingAgent
            activeSubTab={callingAgentSubTab}
            activeTab={activeTab}
            setActiveSubTab={(subtab) =>
              setActiveSubTab(`calling-agent-${subtab}`)
            }
            onOpenProfile={(lead: Lead) =>
              handleOpenProfile(lead, "call", "data")
            }
          />
        );
      }
      // Chat Agent with unified logs and analytics
      if (isChatAgent && chatAgentSubTab) {
        return (
          <ChatAgent
            activeSubTab={chatAgentSubTab}
            activeTab={activeTab}
            setActiveSubTab={(subtab) =>
              setActiveSubTab(`chat-agent-${subtab}`)
            }
            onOpenProfile={(lead: Lead) =>
              handleOpenProfile(lead, "chat", "data")
            }
          />
        );
      }
    }
    if (activeTab === "integrations") {
      return <Integrations />;
    }
    return (
      <DashboardErrorBoundary>
        <Overview />
      </DashboardErrorBoundary>
    );
  };

  return (
    <div
      className={`h-screen flex flex-col ${theme === "dark" ? "bg-black text-white" : "bg-gray-50 text-gray-900"
        }`}
    >
      {/* Impersonation Banner - shows when admin is viewing as user */}
      <ImpersonationBanner />
      
      {/* Main dashboard container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar with fixed width */}
        <div className={`${sidebarCollapsed ? 'w-0' : 'w-64'} flex-shrink-0 transition-all duration-300 overflow-hidden h-full`}>
          <Sidebar
            agents={agents.map(agent => ({
              id: agent.id,
              name: agent.name,
              type: agent.type || 'CallAgent' // Provide default type
            }))}
            activeTab={activeTab}
            setActiveTab={handleTabChange}
            activeSubTab={activeSubTab}
            setActiveSubTab={setActiveSubTab}
            onInviteTeam={() => { }}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        </div>
        
        {/* Main content area with proper constraints and full height border */}
        <div className={`flex-1 flex flex-col min-w-0 h-full ${!sidebarCollapsed ? 'sidebar-separator' : ''}`}>
          <TopNavigation 
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
          <main className="flex-1 overflow-hidden">
            <div className="h-full overflow-auto invisible-scrollbar">
              {renderContent()}
            </div>
          </main>
        </div>
      </div>
      <Toaster position="bottom-right" />
    </div>
  );
};

// Main Dashboard component with NavigationProvider
const Dashboard = ({
  initialTab = "overview",
  initialSubTab = "",
  customContent,
}: DashboardProps) => {
  return (
    <NavigationProvider initialTab={initialTab} initialSubTab={initialSubTab}>
      <DashboardContent customContent={customContent} />
    </NavigationProvider>
  );
};

export default Dashboard;
