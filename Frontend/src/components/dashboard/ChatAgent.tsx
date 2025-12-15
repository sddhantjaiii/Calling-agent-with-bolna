import { useState } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import ChatLogs from "@/components/chat/ChatLogs";
import ChatAnalytics from "@/components/chat/ChatAnalytics";
import type { Lead } from "@/pages/Dashboard";

interface ChatAgentProps {
  activeTab: string;
  activeSubTab: string;
  setActiveSubTab: (subTab: string) => void;
  onOpenProfile?: (lead: Lead) => void;
}

const ChatAgent = ({
  activeTab,
  activeSubTab,
  setActiveSubTab,
  onOpenProfile,
}: ChatAgentProps) => {
  const { theme } = useTheme();
  const [isAdminIntervened, setIsAdminIntervened] = useState(false);

  // Debug logging
  console.log('ChatAgent received activeSubTab:', activeSubTab);

  const handleIntervene = () => {
    setIsAdminIntervened(true);
  };

  const handleExit = () => {
    setIsAdminIntervened(false);
  };

  const renderSubTabContent = () => {
    switch (activeSubTab) {
      case "logs":
        return (
          <ChatLogs
            onIntervene={handleIntervene}
            isAdminIntervened={isAdminIntervened}
            onExit={handleExit}
          />
        );
      case "analytics":
        return <ChatAnalytics />;
      default:
        return (
          <ChatLogs
            onIntervene={handleIntervene}
            isAdminIntervened={isAdminIntervened}
            onExit={handleExit}
          />
        );
    }
  };

  return (
    <div
      className={`p-6 space-y-6 ${
        theme === "dark" ? "bg-black text-white" : "bg-white text-gray-900"
      }`}
    >
      {renderSubTabContent()}
    </div>
  );
};

export default ChatAgent;
