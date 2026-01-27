import React, { useState, useEffect } from "react";
import CreateAgentModal from "./CreateAgentModal";
import DeleteAgentModal from "./DeleteAgentModal";
import { toast } from "sonner";
import { useAgents } from "@/hooks/useAgents";
import { useSuccessFeedback } from "@/contexts/SuccessFeedbackContext";
import { useAuth } from "@/contexts/AuthContext";
import { confirmationPresets } from "@/hooks/useConfirmation";
import type { Agent } from "@/types";
import {
  Pencil,
  Trash2,
  Wifi,
  Phone,
  MessageCircle,
  MessageSquare,
  Send,
  Globe,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

// Platform icons and colors configuration
const PLATFORM_CONFIG: Record<string, { 
  icon: React.ReactNode; 
  label: string; 
  bgColor: string; 
  textColor: string;
  logoUrl?: string;
}> = {
  whatsapp: {
    icon: <MessageCircle className="w-4 h-4" />,
    label: 'WhatsApp',
    bgColor: 'bg-green-100',
    textColor: 'text-green-600',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg',
  },
  telegram: {
    icon: <Send className="w-4 h-4" />,
    label: 'Telegram',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-500',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg',
  },
  messenger: {
    icon: <MessageSquare className="w-4 h-4" />,
    label: 'Messenger',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-600',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/be/Facebook_Messenger_logo_2020.svg',
  },
  instagram: {
    icon: <MessageCircle className="w-4 h-4" />,
    label: 'Instagram',
    bgColor: 'bg-gradient-to-r from-purple-100 to-pink-100',
    textColor: 'text-pink-600',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/e7/Instagram_logo_2016.svg',
  },
  website: {
    icon: <Globe className="w-4 h-4" />,
    label: 'Website',
    bgColor: 'bg-cyan-100',
    textColor: 'text-cyan-600',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/c4/Globe_icon.svg',
  },
  webchat: {
    icon: <Globe className="w-4 h-4" />,
    label: 'Web Chat',
    bgColor: 'bg-cyan-100',
    textColor: 'text-cyan-600',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/c4/Globe_icon.svg',
  },
  sms: {
    icon: <MessageSquare className="w-4 h-4" />,
    label: 'SMS',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-600',
  },
  bolna: {
    icon: <Phone className="w-4 h-4" />,
    label: 'Bolna Voice',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-600',
  },
};

// No mock data - use real agents from API

const agentStatusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
];

const agentTypeOptions = [
  { value: "all", label: "All Types" },
  { value: "CallAgent", label: "Call Agents" },
  { value: "ChatAgent", label: "Chat Agents" },
];


export default function AgentManager() {
  // Use the useAgents hook for data management
  const {
    agents,
    voices,
    loading,
    error,
    creating,
    updating,
    deleting,
    testingConnection,
    createAgent,
    updateAgent,
    deleteAgent: deleteAgentFromAPI,
    refreshAgents,
    loadVoices,
    testConnection,
    clearError,
  } = useAgents();

  const { isAdminUser } = useAuth();

  // Use success feedback for notifications
  const { showSuccess, confirm } = useSuccessFeedback();

  const [modalOpen, setModalOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [deleteAgentState, setDeleteAgentState] = useState<Agent | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [agentType, setAgentType] = useState("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Display error messages from the hook
  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  // Use loaded agents from API
  const displayAgents = agents;





  const handleDeleteAgent = async (agent: Agent) => {
    const confirmed = await confirm(confirmationPresets.deleteAgent(agent.name));
    if (confirmed) {
      try {
        const success = await deleteAgentFromAPI(agent.id);
        if (success) {
          showSuccess.agent.deleted(agent.name, {
            description: 'Agent has been permanently removed from your account',
            action: {
              label: 'Undo',
              onClick: () => {
                // Could implement undo functionality here
                toast.info('Undo functionality coming soon');
              },
            },
          });
        }
      } catch (error) {
        console.error('Error deleting agent:', error);
        // Error handling is done in the hook
      }
    }
  };

  const handleClearFilters = () => {
    setSearch("");
    setStatus("all");
    setAgentType("all");
  };

  const handleTestConnection = async () => {
    try {
      const result = await testConnection();
      if (result) {
        if (result.success) {
          showSuccess.agent.tested('ElevenLabs Connection', {
            message: result.message,
            description: 'Your agents are ready to make calls',
            action: {
              label: 'Create Agent',
              onClick: () => {
                setModalOpen(true);
                setEditAgent(null);
              },
            },
          });
        } else {
          toast.error(result.message, {
            description: 'Please check your ElevenLabs API configuration',
            duration: 5000,
          });
        }
      } else {
        toast.error('Connection test failed', {
          description: 'Unable to reach ElevenLabs API. Please try again.',
          duration: 5000,
        });
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      toast.error('Connection test failed', {
        description: 'An unexpected error occurred. Please try again.',
        duration: 5000,
      });
    }
  };

  // Helper to determine agent type
  const getAgentType = (agent: Agent): 'CallAgent' | 'ChatAgent' => {
    if (agent.type === 'ChatAgent' || agent.agentType === 'chat' || agent.id?.startsWith('chat_')) {
      return 'ChatAgent';
    }
    return 'CallAgent';
  };

  // Check if agent is a chat agent (from Chat Agent Server)
  const isChatAgent = (agent: Agent): boolean => {
    return getAgentType(agent) === 'ChatAgent';
  };

  // Get platform config for an agent
  const getPlatformConfig = (agent: Agent) => {
    if (!isChatAgent(agent)) {
      return PLATFORM_CONFIG.bolna;
    }
    const platform = agent.platform?.toLowerCase() || 'whatsapp';
    return PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.whatsapp;
  };

  // Platform logo component
  const PlatformBadge = ({ agent }: { agent: Agent }) => {
    const config = getPlatformConfig(agent);
    const isChat = isChatAgent(agent);
    
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${config.bgColor} ${config.textColor}`}>
            {config.logoUrl ? (
              <img src={config.logoUrl} alt={config.label} className="w-4 h-4" />
            ) : (
              config.icon
            )}
            <span className="hidden sm:inline">{config.label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{isChat ? `Chat Agent - ${config.label}` : 'Voice Call Agent'}</p>
          {agent.phoneDisplay && <p className="text-xs text-muted-foreground">{agent.phoneDisplay}</p>}
        </TooltipContent>
      </Tooltip>
    );
  };

  const filteredAgents = displayAgents.filter((agent) => {
    const searchText = search.toLowerCase();
    const matchesSearch =
      agent.name?.toLowerCase().includes(searchText) ||
      agent.description?.toLowerCase().includes(searchText);
    const matchesStatus = status === "all" || agent.status === status;
    const matchesType = agentType === "all" || getAgentType(agent) === agentType;
    return matchesSearch && matchesStatus && matchesType;
  });

  // Count agents by type
  const callAgentsCount = displayAgents.filter(a => getAgentType(a) === 'CallAgent').length;
  const chatAgentsCount = displayAgents.filter(a => getAgentType(a) === 'ChatAgent').length;

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4">
        {/* HEADER row */}
        <div className="flex items-center justify-between mt-2 mb-0">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">
              Your Agents
            </h2>
            <div className="text-muted-foreground mt-1 mb-2 text-sm flex items-center gap-4">
              <span>Create and manage your AI agents</span>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  <Phone className="w-3 h-3" />
                  {callAgentsCount} Call
                </span>
                <span className="flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  <MessageCircle className="w-3 h-3" />
                  {chatAgentsCount} Chat
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* FILTERS */}
        <div className="flex flex-col md:flex-row md:gap-6 items-start md:items-end w-full">
          <div className="w-full md:w-1/3">
            <label
              className="text-xs font-semibold text-muted-foreground"
              htmlFor="agent-search"
            >
              Search
            </label>
            <input
              id="agent-search"
              type="text"
              placeholder="Search agents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full mt-1 px-4 py-2 border border-border rounded outline-none text-sm bg-background"
              autoComplete="off"
            />
          </div>
          <div className="w-full md:w-1/4 mt-2 md:mt-0">
            <label
              className="text-xs font-semibold text-muted-foreground"
              htmlFor="agent-type"
            >
              Type
            </label>
            <select
              id="agent-type"
              value={agentType}
              onChange={(e) => setAgentType(e.target.value)}
              className="w-full mt-1 px-4 py-2 border border-border rounded bg-background text-sm"
            >
              {agentTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full md:w-1/4 mt-2 md:mt-0">
            <label
              className="text-xs font-semibold text-muted-foreground"
              htmlFor="agent-status"
            >
              Status
            </label>
            <select
              id="agent-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full mt-1 px-4 py-2 border border-border rounded bg-background text-sm"
            >
              {agentStatusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full md:w-auto flex md:justify-end mt-2 md:mt-0 items-end">
            <button
              onClick={handleClearFilters}
              className="text-sm font-medium text-primary hover:underline px-2 py-2 rounded"
              type="button"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* AGENT CARDS */}
        <div className="mt-3">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-lg shadow-md p-6 animate-pulse">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-5 bg-muted rounded w-3/5"></div>
                    <div className="h-6 bg-muted rounded w-16"></div>
                  </div>
                  <div className="space-y-2 mb-4">
                    <div className="h-4 bg-muted rounded"></div>
                    <div className="h-4 bg-muted rounded w-4/5"></div>
                    <div className="h-4 bg-muted rounded w-3/5"></div>
                  </div>
                  <div className="space-y-2 mb-4">
                    {[...Array(4)].map((_, j) => (
                      <div key={j} className="flex items-center gap-2">
                        <div className="h-3 bg-muted rounded w-24"></div>
                        <div className="h-3 bg-muted rounded w-32"></div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-4">
                    <div className="h-4 bg-muted rounded w-24"></div>
                    <div className="flex gap-3">
                      <div className="h-8 w-8 bg-muted rounded-full"></div>
                      <div className="h-8 w-8 bg-muted rounded-full"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="text-muted-foreground col-span-full text-center py-12">
              No agents found.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredAgents.map((agent) => {
                const isExpanded = expanded[agent.id];
                const desc =
                  typeof agent.description === "string" ? agent.description : "";
                const fallbackDesc = (
                  <span className="italic opacity-70">
                    No description provided
                  </span>
                );
                const isAgentChatType = isChatAgent(agent);
                const platformConfig = getPlatformConfig(agent);
                return (
                  <div
                    key={agent.id}
                    className="bg-card border border-border rounded-lg shadow-md p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-lg min-h-[200px]"
                  >
                    {/* Title with Platform Badge */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {/* Platform Badge with Logo */}
                      <PlatformBadge agent={agent} />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="font-semibold text-lg text-foreground truncate max-w-[55%] cursor-help">
                            {agent.name}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p>
                            {isAgentChatType 
                              ? 'This is a Chat Agent from your WhatsApp integration.'
                              : 'You can rename agents and add descriptions. Click the edit button to modify agent details.'}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${agent.status === "active"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                          }`}
                      >
                        {agent.status}
                      </span>
                    </div>

                    {/* Description */}
                    <div className="text-sm text-muted-foreground mb-1">
                      {desc ? (
                        !isExpanded && desc.length > 120 ? (
                          <div>
                            {desc.slice(0, 120)}...{" "}
                            <button
                              className="text-primary underline text-xs"
                              onClick={() =>
                                setExpanded((e) => ({
                                  ...e,
                                  [agent.id]: true,
                                }))
                              }
                            >
                              Read more
                            </button>
                          </div>
                        ) : desc.length > 120 ? (
                          <div>
                            {desc}{" "}
                            <button
                              className="text-primary underline text-xs"
                              onClick={() =>
                                setExpanded((e) => ({
                                  ...e,
                                  [agent.id]: false,
                                }))
                              }
                            >
                              Show less
                            </button>
                          </div>
                        ) : (
                          desc
                        )
                      ) : (
                        fallbackDesc
                      )}
                    </div>

                    {/* Agent details */}
                    <div className="flex flex-col gap-0.5 text-[13px] text-foreground/80 mb-2 mt-2">
                      <div className="flex items-center gap-2">
                        <span className="w-24 text-muted-foreground font-semibold">
                          Type:
                        </span>
                        <span>
                          {agent.type === "ChatAgent"
                            ? "Chat Agent"
                            : "Call Agent"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-24 text-muted-foreground font-semibold">
                          Language:
                        </span>
                        <span>{agent.language || "-"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-24 text-muted-foreground font-semibold">
                          Conversations:
                        </span>
                        <span>{agent.conversations ?? 0}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-24 text-muted-foreground font-semibold">
                          Performance:
                        </span>
                        <span className="text-blue-600">
                          {agent.successRate || 0}% success rate
                        </span>
                      </div>
                      {agent.phoneDisplay && (
                        <div className="flex items-center gap-2">
                          <span className="w-24 text-muted-foreground font-semibold">
                            Phone:
                          </span>
                          <span>{agent.phoneDisplay}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="w-24 text-muted-foreground font-semibold">
                          Created:
                        </span>
                        <span>{agent.created || "-"}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end mt-auto pt-4">
                      <div className="flex gap-3">
                        {/* Edit button - disabled for chat agents */}
                        {isAgentChatType ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className="text-gray-400 cursor-not-allowed rounded p-1"
                                disabled
                                title="Edit in Chat Agent Server"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>Chat agents are managed in the Chat Agent Server</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className="text-blue-600 hover:bg-blue-50 rounded p-1"
                                onClick={() => {
                                  setModalOpen(true);
                                  setEditAgent(agent);
                                }}
                                title="Edit"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>Edit agent name</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {/* Delete button - disabled for chat agents */}
                        {isAgentChatType ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className="text-gray-400 cursor-not-allowed rounded p-1"
                                disabled
                                title="Delete in Chat Agent Server"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>Chat agents are managed in the Chat Agent Server</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <button
                            className="text-red-600 hover:bg-red-50 rounded p-1"
                            onClick={() => handleDeleteAgent(agent)}
                            title="Delete"
                            disabled={deleting}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <CreateAgentModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditAgent(null);
        }}
        editAgent={editAgent}
      />

    </TooltipProvider>
  );
}
