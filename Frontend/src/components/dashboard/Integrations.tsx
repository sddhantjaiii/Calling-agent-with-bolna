import { useState, useEffect } from "react";
import { Plus, Upload, FileText, Link, Download, Calendar, CheckCircle, XCircle, AlertCircle, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/components/theme/ThemeProvider";
import { toast } from "sonner";
import EmailSettingsSection from "@/components/settings/EmailSettingsSection";

type FormField = {
  name: string;
  type: string;
  required: boolean;
};

const Integrations = () => {
  const { theme } = useTheme();
  const [showDataModal, setShowDataModal] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [dataUploadType, setDataUploadType] = useState("");

  // Google Calendar integration state
  const [calendarStatus, setCalendarStatus] = useState<{
    connected: boolean;
    loading: boolean;
    email?: string;
  }>({
    connected: false,
    loading: true,
  });

  // Gmail integration state
  const [gmailStatus, setGmailStatus] = useState<{
    connected: boolean;
    hasGmailScope: boolean;
    loading: boolean;
    requiresReconnect?: boolean;
    email?: string;
    message?: string;
  }>({
    connected: false,
    hasGmailScope: false,
    loading: true,
  });

  // Dynamic Information state
  const [dynamicInfoAgents, setDynamicInfoAgents] = useState<Array<{ id: string; name: string; agent_type: string }>>([]);
  const [selectedDynamicAgent, setSelectedDynamicAgent] = useState("");
  const [dynamicInformation, setDynamicInformation] = useState("");
  const [loadingDynamicInfo, setLoadingDynamicInfo] = useState(false);
  const [savingDynamicInfo, setSavingDynamicInfo] = useState(false);

  // New state for enhanced Add Lead form
  const [newLeadData, setNewLeadData] = useState({
    name: "",
    email: "",
    phone: "",
    leadType: "",
    leadTag: "",
    agent: "",
    businessType: "",
    engagementLevel: "",
    intentLevel: "",
    budgetConstraint: "",
    timelineUrgency: "",
  });
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    fields: [
      {
        name: "",
        type: "text",
        required: true,
      },
    ],
  });

  // Check Google Calendar connection status on mount
  useEffect(() => {
    checkCalendarStatus();
    checkGmailStatus();
    
    // Handle OAuth callback query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const googleCalendarStatus = urlParams.get('google_calendar');
    
    if (googleCalendarStatus === 'connected') {
      toast.success('Google Calendar connected successfully!');
      // Clean up URL - keep the dashboard tab parameter
      const cleanUrl = window.location.pathname + '?tab=integrations';
      window.history.replaceState({}, '', cleanUrl);
      // Refresh status
      setTimeout(() => {
        checkCalendarStatus();
        checkGmailStatus();
      }, 1000);
    } else if (googleCalendarStatus === 'error') {
      const errorMessage = urlParams.get('message') || 'Failed to connect Google Calendar';
      toast.error(errorMessage);
      // Clean up URL - keep the dashboard tab parameter
      const cleanUrl = window.location.pathname + '?tab=integrations';
      window.history.replaceState({}, '', cleanUrl);
    }
  }, []);

  const checkCalendarStatus = async () => {
    try {
      setCalendarStatus(prev => ({ ...prev, loading: true }));
      const token = localStorage.getItem("auth_token");
      
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/integrations/google/status`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setCalendarStatus({
          connected: data.connected,
          loading: false,
          email: data.google_email,
        });
      } else {
        setCalendarStatus({ connected: false, loading: false });
      }
    } catch (error) {
      console.error("Failed to check calendar status:", error);
      setCalendarStatus({ connected: false, loading: false });
    }
  };

  const checkGmailStatus = async () => {
    try {
      setGmailStatus(prev => ({ ...prev, loading: true }));
      const token = localStorage.getItem("auth_token");
      
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/integrations/gmail/status`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // API returns flat structure: { success, connected, hasGmailScope, ... }
          setGmailStatus({
            connected: data.connected,
            hasGmailScope: data.hasGmailScope,
            loading: false,
            requiresReconnect: data.requiresReconnect,
            email: data.email,
            message: data.message,
          });
        } else {
          setGmailStatus({
            connected: false,
            hasGmailScope: false,
            loading: false,
          });
        }
      } else {
        setGmailStatus({
          connected: false,
          hasGmailScope: false,
          loading: false,
        });
      }
    } catch (error) {
      console.error("Failed to check Gmail status:", error);
      setGmailStatus({
        connected: false,
        hasGmailScope: false,
        loading: false,
      });
    }
  };

  const handleConnectCalendar = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/integrations/google/auth`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        // Redirect to Google OAuth
        window.location.href = data.authUrl;
      } else {
        toast.error("Failed to initiate Google Calendar connection");
      }
    } catch (error) {
      console.error("Failed to connect calendar:", error);
      toast.error("Failed to connect Google Calendar");
    }
  };

  const handleDisconnectCalendar = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/integrations/google/disconnect`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        toast.success("Google Calendar disconnected successfully");
        setCalendarStatus({ connected: false, loading: false });
      } else {
        toast.error("Failed to disconnect Google Calendar");
      }
    } catch (error) {
      console.error("Failed to disconnect calendar:", error);
      toast.error("Failed to disconnect Google Calendar");
    }
  };

  // Fetch user agents for dynamic information management
  const fetchDynamicInfoAgents = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/integrations/agents`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setDynamicInfoAgents(data.agents || []);
      }
    } catch (error) {
      console.error("Failed to fetch agents:", error);
    }
  };

  // Fetch dynamic information for selected agent
  const fetchDynamicInfo = async (agentId: string) => {
    if (!agentId) return;
    
    try {
      setLoadingDynamicInfo(true);
      const token = localStorage.getItem("auth_token");
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/integrations/agents/${agentId}/dynamic-info`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setDynamicInformation(data.dynamicInformation || "");
      } else {
        toast.error("Failed to load dynamic information");
      }
    } catch (error) {
      console.error("Failed to fetch dynamic info:", error);
      toast.error("Failed to load dynamic information");
    } finally {
      setLoadingDynamicInfo(false);
    }
  };

  // Save dynamic information
  const saveDynamicInfo = async () => {
    if (!selectedDynamicAgent) {
      toast.error("Please select an agent");
      return;
    }

    try {
      setSavingDynamicInfo(true);
      const token = localStorage.getItem("auth_token");
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/integrations/agents/${selectedDynamicAgent}/dynamic-info`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ dynamicInformation }),
        }
      );

      if (response.ok) {
        toast.success("Dynamic information updated successfully");
      } else {
        const error = await response.json();
        toast.error(error.message || "Failed to update dynamic information");
      }
    } catch (error) {
      console.error("Failed to save dynamic info:", error);
      toast.error("Failed to update dynamic information");
    } finally {
      setSavingDynamicInfo(false);
    }
  };

  // Load agents when component mounts
  useEffect(() => {
    fetchDynamicInfoAgents();
  }, []);

  // Load dynamic info when agent selection changes
  useEffect(() => {
    if (selectedDynamicAgent) {
      fetchDynamicInfo(selectedDynamicAgent);
    } else {
      setDynamicInformation("");
    }
  }, [selectedDynamicAgent]);

  const handleDataUpload = () => {
    if (!selectedAgent || !dataUploadType) {
      toast.error("Please select agent and upload type");
      return;
    }
    toast.success(`Data uploaded to ${selectedAgent} successfully`);
    setShowDataModal(false);
    setSelectedAgent("");
    setDataUploadType("");
  };
  const handleFormCreate = () => {
    if (!formData.title || !selectedAgent) {
      toast.error("Please fill in form title and select agent");
      return;
    }
    toast.success(`Form "${formData.title}" created for ${selectedAgent}`);
    setShowFormModal(false);
    setFormData({
      title: "",
      description: "",
      fields: [
        {
          name: "",
          type: "text",
          required: true,
        },
      ],
    });
    setSelectedAgent("");
  };
  const handleAddLead = () => {
    if (!newLeadData.name || !newLeadData.email || !newLeadData.leadType) {
      toast.error("Please fill in required fields");
      return;
    }
    toast.success(`Lead "${newLeadData.name}" added successfully`);
    setShowAddLeadModal(false);
    setNewLeadData({
      name: "",
      email: "",
      phone: "",
      leadType: "",
      leadTag: "",
      agent: "",
      businessType: "",
      engagementLevel: "",
      intentLevel: "",
      budgetConstraint: "",
      timelineUrgency: "",
    });
  };
  const addFormField = () => {
    setFormData((prev) => ({
      ...prev,
      fields: [
        ...prev.fields,
        {
          name: "",
          type: "text",
          required: true,
        },
      ],
    }));
  };
  const updateFormField = (index: number, field: FormField) => {
    setFormData((prev) => ({
      ...prev,
      fields: prev.fields.map((f, i) => (i === index ? field : f)),
    }));
  };
  const removeFormField = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index),
    }));
  };
  const downloadSampleTemplate = () => {
    const sampleData = [
      [
        "Name",
        "Email",
        "Phone",
        "Lead Type",
        "Lead Tag",
        "Business Type",
        "Engagement Level",
        "Intent Level",
        "Budget Constraint",
        "Timeline Urgency",
      ],
      [
        "John Doe",
        "john@example.com",
        "+1234567890",
        "Inbound",
        "Hot",
        "SaaS",
        "High",
        "High",
        "Medium",
        "High",
      ],
      [
        "Jane Smith",
        "jane@example.com",
        "+0987654321",
        "Outbound",
        "Warm",
        "E-commerce",
        "Medium",
        "Medium",
        "High",
        "Medium",
      ],
      [
        "Mike Johnson",
        "mike@example.com",
        "+1122334455",
        "Customer",
        "Cold",
        "Fintech",
        "Low",
        "Low",
        "Low",
        "Low",
      ],
    ];
    const csvContent = sampleData.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lead_data_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    toast.success("Sample template downloaded successfully");
  };
  return (
    <div
      className={`p-6 space-y-6 ${
        theme === "dark" ? "bg-black" : "bg-gray-50"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className={`text-2xl font-bold ${
              theme === "dark" ? "text-white" : "text-gray-900"
            }`}
          >
            Integrations
          </h1>
          <p
            className={`mt-2 ${
              theme === "dark" ? "text-slate-400" : "text-gray-600"
            }`}
          >
            Connect your favorite tools and platforms to SniperThink
          </p>
        </div>

        {/* Add Lead/Customer Button */}
        <Dialog open={showAddLeadModal} onOpenChange={setShowAddLeadModal}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Lead/Customer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Lead Name *
                  </label>
                  <Input
                    placeholder="Enter lead name"
                    value={newLeadData.name}
                    onChange={(e) =>
                      setNewLeadData((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Email *
                  </label>
                  <Input
                    type="email"
                    placeholder="Enter email address"
                    value={newLeadData.email}
                    onChange={(e) =>
                      setNewLeadData((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Phone Number
                  </label>
                  <Input
                    placeholder="Enter phone number"
                    value={newLeadData.phone}
                    onChange={(e) =>
                      setNewLeadData((prev) => ({
                        ...prev,
                        phone: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Lead Type *
                  </label>
                  <Select
                    value={newLeadData.leadType}
                    onValueChange={(value) =>
                      setNewLeadData((prev) => ({
                        ...prev,
                        leadType: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select lead type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Inbound">Inbound</SelectItem>
                      <SelectItem value="Outbound">Outbound</SelectItem>
                      <SelectItem value="Customer">Customer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Lead Tag
                  </label>
                  <Select
                    value={newLeadData.leadTag}
                    onValueChange={(value) =>
                      setNewLeadData((prev) => ({
                        ...prev,
                        leadTag: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select lead tag" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Hot">Hot</SelectItem>
                      <SelectItem value="Warm">Warm</SelectItem>
                      <SelectItem value="Cold">Cold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Select Agent
                  </label>
                  <Select
                    value={newLeadData.agent}
                    onValueChange={(value) =>
                      setNewLeadData((prev) => ({
                        ...prev,
                        agent: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose agent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Chat Agent">Chat Agent</SelectItem>
                      <SelectItem value="Call Agent">Call Agent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Business Type
                  </label>
                  <Select
                    value={newLeadData.businessType}
                    onValueChange={(value) =>
                      setNewLeadData((prev) => ({
                        ...prev,
                        businessType: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select business type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SaaS">SaaS</SelectItem>
                      <SelectItem value="E-commerce">E-commerce</SelectItem>
                      <SelectItem value="Fintech">Fintech</SelectItem>
                      <SelectItem value="Healthcare">Healthcare</SelectItem>
                      <SelectItem value="Education">Education</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Engagement Level
                  </label>
                  <Select
                    value={newLeadData.engagementLevel}
                    onValueChange={(value) =>
                      setNewLeadData((prev) => ({
                        ...prev,
                        engagementLevel: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select engagement level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="Low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Intent Level
                  </label>
                  <Select
                    value={newLeadData.intentLevel}
                    onValueChange={(value) =>
                      setNewLeadData((prev) => ({
                        ...prev,
                        intentLevel: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select intent level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="Low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Budget Constraint
                  </label>
                  <Select
                    value={newLeadData.budgetConstraint}
                    onValueChange={(value) =>
                      setNewLeadData((prev) => ({
                        ...prev,
                        budgetConstraint: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select budget constraint" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="Low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Timeline Urgency
                  </label>
                  <Select
                    value={newLeadData.timelineUrgency}
                    onValueChange={(value) =>
                      setNewLeadData((prev) => ({
                        ...prev,
                        timelineUrgency: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select timeline urgency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="Low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Upload Container */}
              <div className="mt-6">
                <label className="text-sm font-medium mb-2 block">
                  Upload Data
                </label>
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center ${
                    theme === "dark"
                      ? "border-gray-600 bg-gray-700/50"
                      : "border-gray-300 bg-gray-50"
                  }`}
                >
                  <Upload
                    className={`w-8 h-8 mx-auto mb-2 ${
                      theme === "dark" ? "text-slate-400" : "text-gray-400"
                    }`}
                  />
                  <p
                    className={`text-sm ${
                      theme === "dark" ? "text-slate-300" : "text-gray-600"
                    }`}
                  >
                    Drag and drop your Excel/CSV file here or click to browse
                  </p>
                  <Button variant="outline" size="sm" className="mb-3">
                    Browse Files
                  </Button>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowAddLeadModal(false)}
                  className={
                    theme === "dark"
                      ? "bg-gray-700 border-gray-600 text-slate-300 hover:bg-gray-600"
                      : ""
                  }
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddLead}
                  style={{
                    backgroundColor: "#1A6262",
                  }}
                  className="hover:opacity-90 text-white"
                >
                  Save Lead
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Dynamic Information Management Section */}
      <div>
        <h2
          className={`text-lg font-semibold mb-4 ${
            theme === "dark" ? "text-white" : "text-gray-900"
          }`}
        >
          Agent Dynamic Information
        </h2>
        <div
          className={`p-6 rounded-lg border ${
            theme === "dark"
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200"
          }`}
        >
          <p
            className={`text-sm mb-4 ${
              theme === "dark" ? "text-slate-400" : "text-gray-600"
            }`}
          >
            Add dynamic information to your agent's system prompt. This allows you to customize agent behavior without changing the core system prompt.
          </p>

          {/* Agent Selection */}
          <div className="space-y-4">
            <div>
              <label
                className={`block text-sm font-medium mb-2 ${
                  theme === "dark" ? "text-slate-300" : "text-gray-700"
                }`}
              >
                Select Agent
              </label>
              <Select
                value={selectedDynamicAgent}
                onValueChange={setSelectedDynamicAgent}
              >
                <SelectTrigger
                  className={`w-full ${
                    theme === "dark"
                      ? "bg-gray-700 border-gray-600 text-white"
                      : "bg-white border-gray-300 text-gray-900"
                  }`}
                >
                  <SelectValue placeholder="Choose an agent..." />
                </SelectTrigger>
                <SelectContent>
                  {dynamicInfoAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name} ({agent.agent_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic Information Textarea */}
            {selectedDynamicAgent && (
              <div>
                <label
                  className={`block text-sm font-medium mb-2 ${
                    theme === "dark" ? "text-slate-300" : "text-gray-700"
                  }`}
                >
                  Dynamic Information
                </label>
                {loadingDynamicInfo ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  </div>
                ) : (
                  <>
                    <textarea
                      value={dynamicInformation}
                      onChange={(e) => setDynamicInformation(e.target.value)}
                      placeholder="Enter dynamic information to append to your agent's system prompt..."
                      rows={8}
                      className={`w-full px-3 py-2 rounded-lg border resize-none ${
                        theme === "dark"
                          ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                          : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                      }`}
                    />
                    <p
                      className={`text-xs mt-2 ${
                        theme === "dark" ? "text-slate-500" : "text-gray-500"
                      }`}
                    >
                      This information will be appended to the agent's main system prompt when making calls.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Save Button */}
            {selectedDynamicAgent && !loadingDynamicInfo && (
              <div className="flex justify-end">
                <Button
                  onClick={saveDynamicInfo}
                  disabled={savingDynamicInfo}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {savingDynamicInfo ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Dynamic Information"
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Google Calendar Integration Section */}
      <div>
        <h2
          className={`text-lg font-semibold mb-4 ${
            theme === "dark" ? "text-white" : "text-gray-900"
          }`}
        >
          Calendar & Meeting Integrations
        </h2>
        <div className="grid grid-cols-1 gap-4">
          <div
            className={`p-6 rounded-lg border ${
              theme === "dark"
                ? "bg-gray-800 border-gray-700"
                : "bg-white border-gray-200"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Calendar className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3
                    className={`font-semibold text-lg mb-1 ${
                      theme === "dark" ? "text-white" : "text-gray-900"
                    }`}
                  >
                    Google Calendar
                  </h3>
                  <p
                    className={`text-sm mb-2 ${
                      theme === "dark" ? "text-slate-400" : "text-gray-600"
                    }`}
                  >
                    Automatically schedule demo meetings from AI call analysis
                  </p>
                  
                  {/* Connection Status */}
                  {calendarStatus.loading ? (
                    <div className="flex items-center space-x-2 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      <span className={theme === "dark" ? "text-slate-400" : "text-gray-600"}>
                        Checking connection...
                      </span>
                    </div>
                  ) : calendarStatus.connected ? (
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                        Connected
                      </span>
                      {calendarStatus.email && (
                        <span className={`text-sm ${theme === "dark" ? "text-slate-400" : "text-gray-600"}`}>
                          • {calendarStatus.email}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <XCircle className="w-4 h-4 text-gray-400" />
                      <span className={`text-sm ${theme === "dark" ? "text-slate-400" : "text-gray-600"}`}>
                        Not connected
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col space-y-2">
                {calendarStatus.loading ? (
                  <Button
                    size="sm"
                    disabled
                    className="bg-gray-400 cursor-not-allowed"
                  >
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading...
                  </Button>
                ) : calendarStatus.connected ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDisconnectCalendar}
                    className={`${
                      theme === "dark"
                        ? "bg-gray-700 border-gray-600 text-slate-300 hover:bg-red-900/20 hover:border-red-500 hover:text-red-400"
                        : "hover:bg-red-50 hover:border-red-300 hover:text-red-600"
                    }`}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleConnectCalendar}
                    style={{
                      backgroundColor: "#1A6262",
                    }}
                    className="hover:opacity-90 text-white"
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    Connect Calendar
                  </Button>
                )}
              </div>
            </div>

            {/* Features List */}
            {calendarStatus.connected && (
              <div className={`mt-6 pt-6 border-t ${theme === "dark" ? "border-gray-700" : "border-gray-200"}`}>
                <h4 className={`text-sm font-medium mb-3 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                  Active Features:
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className={`text-sm font-medium ${theme === "dark" ? "text-slate-300" : "text-gray-700"}`}>
                        Auto-Schedule Meetings
                      </p>
                      <p className={`text-xs ${theme === "dark" ? "text-slate-500" : "text-gray-500"}`}>
                        From AI analysis
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className={`text-sm font-medium ${theme === "dark" ? "text-slate-300" : "text-gray-700"}`}>
                        Email Notifications
                      </p>
                      <p className={`text-xs ${theme === "dark" ? "text-slate-500" : "text-gray-500"}`}>
                        Automated invites
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className={`text-sm font-medium ${theme === "dark" ? "text-slate-300" : "text-gray-700"}`}>
                        Reschedule/Cancel
                      </p>
                      <p className={`text-xs ${theme === "dark" ? "text-slate-500" : "text-gray-500"}`}>
                        From Lead Intelligence
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className={`text-sm font-medium ${theme === "dark" ? "text-slate-300" : "text-gray-700"}`}>
                        Lead Context
                      </p>
                      <p className={`text-xs ${theme === "dark" ? "text-slate-500" : "text-gray-500"}`}>
                        In meeting details
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Info Banner for disconnected state */}
            {!calendarStatus.connected && !calendarStatus.loading && (
              <div className={`mt-4 p-4 rounded-lg flex items-start space-x-3 ${
                theme === "dark" ? "bg-blue-900/20 border border-blue-800" : "bg-blue-50 border border-blue-200"
              }`}>
                <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className={`text-sm font-medium ${theme === "dark" ? "text-blue-300" : "text-blue-800"}`}>
                    Connect your Google Calendar to enable automatic meeting scheduling
                  </p>
                  <p className={`text-xs mt-1 ${theme === "dark" ? "text-blue-400" : "text-blue-600"}`}>
                    When AI detects a demo booking request with email and date/time, a meeting will be automatically scheduled in your calendar.
                  </p>
                </div>
              </div>
            )}

            {/* Gmail Email Sending Status Banner */}
            {!gmailStatus.loading && calendarStatus.connected && !gmailStatus.hasGmailScope && (
              <div className={`mt-4 p-4 rounded-lg flex items-start justify-between ${
                theme === "dark" ? "bg-amber-900/20 border border-amber-800" : "bg-amber-50 border border-amber-200"
              }`}>
                <div className="flex items-start space-x-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className={`text-sm font-medium ${theme === "dark" ? "text-amber-300" : "text-amber-800"}`}>
                      Reconnect Google to enable sending emails from your Gmail
                    </p>
                    <p className={`text-xs mt-1 ${theme === "dark" ? "text-amber-400" : "text-amber-600"}`}>
                      Your Google connection needs to be updated to include email sending permission. Emails will be sent from your connected Gmail account.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleConnectCalendar}
                  className="ml-4 whitespace-nowrap bg-amber-600 hover:bg-amber-700 text-white flex-shrink-0"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Reconnect Google
                </Button>
              </div>
            )}

            {/* Gmail Connected Status */}
            {!gmailStatus.loading && gmailStatus.hasGmailScope && (
              <div className={`mt-4 p-4 rounded-lg flex items-start space-x-3 ${
                theme === "dark" ? "bg-green-900/20 border border-green-800" : "bg-green-50 border border-green-200"
              }`}>
                <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className={`text-sm font-medium ${theme === "dark" ? "text-green-300" : "text-green-800"}`}>
                    Gmail email sending enabled
                  </p>
                  <p className={`text-xs mt-1 ${theme === "dark" ? "text-green-400" : "text-green-600"}`}>
                    Contact emails and campaign emails will be sent from your Gmail account ({gmailStatus.email || calendarStatus.email}).
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Follow-up Email Settings Section */}
      <div>
        <h2
          className={`text-lg font-semibold mb-4 ${
            theme === "dark" ? "text-white" : "text-gray-900"
          }`}
        >
          Follow-up Email Automation
        </h2>
        <EmailSettingsSection />
      </div>

      {/* Data Upload Modal */}
      <Dialog open={showDataModal} onOpenChange={setShowDataModal}>
        <DialogContent
          className={`max-w-lg ${
            theme === "dark"
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200"
          }`}
        >
          <DialogHeader>
            <DialogTitle
              className={`flex items-center ${
                theme === "dark" ? "text-white" : "text-gray-900"
              }`}
            >
              <Upload className="w-5 h-5 mr-2" />
              Upload Data
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div>
              <label
                className={`text-sm mb-2 block ${
                  theme === "dark" ? "text-slate-300" : "text-gray-700"
                }`}
              >
                Select Agent
              </label>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className={`w-full rounded-lg px-3 py-2 border ${
                  theme === "dark"
                    ? "bg-gray-700 border-gray-600 text-white"
                    : "bg-white border-gray-300 text-black"
                }`}
              >
                <option value="">Choose Agent</option>
                <option value="Chat Agent">Chat Agent</option>
                <option value="Call Agent">Call Agent</option>
              </select>
            </div>

            <div>
              <label
                className={`text-sm mb-2 block ${
                  theme === "dark" ? "text-slate-300" : "text-gray-700"
                }`}
              >
                Upload Type
              </label>
              <select
                value={dataUploadType}
                onChange={(e) => setDataUploadType(e.target.value)}
                className={`w-full rounded-lg px-3 py-2 border ${
                  theme === "dark"
                    ? "bg-gray-700 border-gray-600 text-white"
                    : "bg-white border-gray-300 text-black"
                }`}
              >
                <option value="">Choose Type</option>
                <option value="Individual Contact">Individual Contact</option>
                <option value="Bulk Upload">Bulk Upload (Excel)</option>
                <option value="CSV Import">CSV Import</option>
              </select>
            </div>

            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center ${
                theme === "dark"
                  ? "border-gray-600 bg-gray-700/50"
                  : "border-gray-300 bg-gray-50"
              }`}
            >
              <Upload
                className={`w-8 h-8 mx-auto mb-2 ${
                  theme === "dark" ? "text-slate-400" : "text-gray-400"
                }`}
              />
              <p
                className={`text-sm ${
                  theme === "dark" ? "text-slate-300" : "text-gray-600"
                }`}
              >
                Drag and drop files here or
              </p>
              <Button variant="outline" size="sm" className="mt-2">
                Browse Files
              </Button>
            </div>
            <a
              onClick={downloadSampleTemplate}
              className="text-blue-600 underline text-sm mt-2 block text-left cursor-pointer"
              style={{ minWidth: 120 }}
            >
              Download Template
            </a>

            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => setShowDataModal(false)}
                className={
                  theme === "dark"
                    ? "bg-gray-700 border-gray-600 text-slate-300 hover:bg-gray-600"
                    : ""
                }
              >
                Cancel
              </Button>
              <Button
                onClick={handleDataUpload}
                className="bg-[#374151] hover:bg-[#4B5563] text-[#CBD5E1]"
              >
                Upload Data
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Form Creation Modal */}
      <Dialog open={showFormModal} onOpenChange={setShowFormModal}>
        <DialogContent
          className={`max-w-2xl ${
            theme === "dark"
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200"
          }`}
        >
          <DialogHeader>
            <DialogTitle
              className={`flex items-center ${
                theme === "dark" ? "text-white" : "text-gray-900"
              }`}
            >
              <FileText className="w-5 h-5 mr-2" />
              Create Data Collection Form
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-4 max-h-96 overflow-y-auto">
            <div>
              <label
                className={`text-sm mb-2 block ${
                  theme === "dark" ? "text-slate-300" : "text-gray-700"
                }`}
              >
                Select Agent
              </label>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className={`w-full rounded-lg px-3 py-2 border ${
                  theme === "dark"
                    ? "bg-gray-700 border-gray-600 text-white"
                    : "bg-white border-gray-300 text-black"
                }`}
              >
                <option value="">Choose Agent</option>
                <option value="Chat Agent">Chat Agent</option>
                <option value="Call Agent">Call Agent</option>
              </select>
            </div>

            <div>
              <label
                className={`text-sm mb-2 block ${
                  theme === "dark" ? "text-slate-300" : "text-gray-700"
                }`}
              >
                Form Title
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    title: e.target.value,
                  }))
                }
                className={`w-full rounded-lg px-3 py-2 border ${
                  theme === "dark"
                    ? "bg-gray-700 border-gray-600 text-white"
                    : "bg-white border-gray-300 text-black"
                }`}
                placeholder="Enter form title"
              />
            </div>

            <div>
              <label
                className={`text-sm mb-2 block ${
                  theme === "dark" ? "text-slate-300" : "text-gray-700"
                }`}
              >
                Description (Optional)
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                className={`w-full rounded-lg px-3 py-2 border ${
                  theme === "dark"
                    ? "bg-gray-700 border-gray-600 text-white"
                    : "bg-white border-gray-300 text-black"
                }`}
                placeholder="Enter form description"
                rows={3}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label
                  className={`text-sm ${
                    theme === "dark" ? "text-slate-300" : "text-gray-700"
                  }`}
                >
                  Form Fields
                </label>
                <Button
                  size="sm"
                  onClick={addFormField}
                  className="bg-green-500 hover:bg-green-600"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Field
                </Button>
              </div>

              {formData.fields.map((field, index) => (
                <div
                  key={index}
                  className={`p-3 border rounded-lg ${
                    theme === "dark"
                      ? "border-gray-600 bg-gray-700/50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <input
                      type="text"
                      value={field.name}
                      onChange={(e) =>
                        updateFormField(index, {
                          ...field,
                          name: e.target.value,
                        })
                      }
                      className={`rounded px-2 py-1 text-sm border ${
                        theme === "dark"
                          ? "bg-gray-600 border-gray-500 text-white"
                          : "bg-white border-gray-300 text-black"
                      }`}
                      placeholder="Field name"
                    />
                    <select
                      value={field.type}
                      onChange={(e) =>
                        updateFormField(index, {
                          ...field,
                          type: e.target.value,
                        })
                      }
                      className={`rounded px-2 py-1 text-sm border ${
                        theme === "dark"
                          ? "bg-gray-600 border-gray-500 text-white"
                          : "bg-white border-gray-300 text-black"
                      }`}
                    >
                      <option value="text">Text</option>
                      <option value="email">Email</option>
                      <option value="phone">Phone</option>
                      <option value="number">Number</option>
                      <option value="textarea">Textarea</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center text-sm">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) =>
                          updateFormField(index, {
                            ...field,
                            required: e.target.checked,
                          })
                        }
                        className="mr-2"
                      />
                      Required
                    </label>
                    {formData.fields.length > 1 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removeFormField(index)}
                        className="text-red-500 border-red-500 hover:bg-red-50"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => setShowFormModal(false)}
                className={
                  theme === "dark"
                    ? "bg-gray-700 border-gray-600 text-slate-300 hover:bg-gray-600"
                    : ""
                }
              >
                Cancel
              </Button>
              <Button
                onClick={handleFormCreate}
                className="bg-[#374151] hover:bg-[#4B5563] text-[#CBD5E1]"
              >
                Create Form
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default Integrations;
