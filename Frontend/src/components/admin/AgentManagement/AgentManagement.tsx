import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Users, Activity, Shield, BarChart3, UserCheck, Settings, Link } from 'lucide-react';
import { AgentList } from './AgentList';
import { AgentMonitor } from './AgentMonitor';
import { AgentHealthCheckDashboard } from './AgentHealthCheck';
import AdminAssignAgent from '../agents/AdminAssignAgent';
import { ManageAgents } from '../agents/ManageAgents';
import { CreateAgentModal } from '../agents/CreateAgentModal';
import type { AdminAgentListItem, AgentHealthCheck } from '../../../types/admin';

interface AgentManagementProps {
  className?: string;
}

export const AgentManagement: React.FC<AgentManagementProps> = ({ className }) => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const [selectedAgent, setSelectedAgent] = useState<AdminAgentListItem | null>(null);
  const [healthData, setHealthData] = useState<AgentHealthCheck | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [linkAgentModalOpen, setLinkAgentModalOpen] = useState(false);
  const [users, setUsers] = useState<Array<{ id: string; email: string; name: string }>>([]);

  // Determine active tab from URL
  const getActiveTabFromPath = () => {
    const path = location.pathname;
    if (path.includes('/assign')) return 'assign';
    if (path.includes('/manage')) return 'manage';
    if (path.includes('/monitor')) return 'monitor';
    if (path.includes('/health')) return 'health';
    return 'agents'; // default tab
  };

  const [activeTab, setActiveTab] = useState(getActiveTabFromPath());

  // Update active tab when URL changes
  useEffect(() => {
    setActiveTab(getActiveTabFromPath());
  }, [location.pathname]);

  // Handle tab change and update URL
  const handleTabChange = (tabValue: string) => {
    setActiveTab(tabValue);
    
    // Update URL based on tab
    const basePath = '/admin/agents';
    switch (tabValue) {
      case 'assign':
        navigate(`${basePath}/assign`);
        break;
      case 'manage':
        navigate(`${basePath}/manage`);
        break;
      case 'monitor':
        navigate(`${basePath}/monitor`);
        break;
      case 'health':
        navigate(`${basePath}/health`);
        break;
      default:
        navigate(basePath);
        break;
    }
  };

  // Handle agent selection
  const handleAgentSelect = (agent: AdminAgentListItem) => {
    setSelectedAgent(agent);
  };

  // Handle refresh
  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // Fetch users for agent creation
  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/admin/users', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const result = await response.json();
      setUsers(result.data?.users || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  // Load users on mount
  useEffect(() => {
    fetchUsers();
  }, []);

  // Handle health data change
  const handleHealthChange = (data: AgentHealthCheck) => {
    setHealthData(data);
  };

  // Calculate health percentage
  const getHealthPercentage = () => {
    if (!healthData) return 0;
    return Math.round((healthData.healthyAgents / healthData.totalAgents) * 100);
  };

  // Get health status
  const getHealthStatus = () => {
    const percentage = getHealthPercentage();
    if (percentage >= 90) return { status: 'Excellent', variant: 'default' as const };
    if (percentage >= 70) return { status: 'Good', variant: 'secondary' as const };
    return { status: 'Needs Attention', variant: 'destructive' as const };
  };

  const healthStatus = getHealthStatus();

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{healthData?.totalAgents || 0}</div>
            <p className="text-xs text-muted-foreground">
              Across all users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Healthy Agents</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {healthData?.healthyAgents || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {getHealthPercentage()}% of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant={healthStatus.variant}>{healthStatus.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Overall system status
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Issues</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {(healthData?.unhealthyAgents || 0) + (healthData?.unreachableAgents || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Agents needing attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <div className="flex items-center justify-between mb-4">
          <TabsList className="grid w-auto grid-cols-5">
            <TabsTrigger value="agents" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Agent List
            </TabsTrigger>
            <TabsTrigger value="assign" className="flex items-center gap-2">
              <UserCheck className="w-4 h-4" />
              Assign Agent
            </TabsTrigger>
            <TabsTrigger value="manage" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Manage Agents
            </TabsTrigger>
            <TabsTrigger value="monitor" className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Performance Monitor
            </TabsTrigger>
            <TabsTrigger value="health" className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Health Check
            </TabsTrigger>
          </TabsList>
          <Button onClick={() => setLinkAgentModalOpen(true)} className="flex items-center gap-2">
            <Link className="w-4 h-4" />
            Link Agent
          </Button>
        </div>

        <TabsContent value="agents" className="space-y-4">
          <AgentList 
            onAgentSelect={handleAgentSelect}
            onRefresh={handleRefresh}
            key={refreshTrigger}
          />
        </TabsContent>

        <TabsContent value="assign" className="space-y-4">
          <AdminAssignAgent onAssignmentComplete={handleRefresh} />
        </TabsContent>

        <TabsContent value="manage" className="space-y-4">
          <ManageAgents />
        </TabsContent>

        <TabsContent value="monitor" className="space-y-4">
          <AgentMonitor />
        </TabsContent>

        <TabsContent value="health" className="space-y-4">
          <AgentHealthCheckDashboard 
            onHealthChange={handleHealthChange}
          />
        </TabsContent>
      </Tabs>

      <CreateAgentModal
        open={linkAgentModalOpen}
        onClose={() => setLinkAgentModalOpen(false)}
        onSuccess={handleRefresh}
        users={users}
      />
    </div>
  );
};

export default AgentManagement;