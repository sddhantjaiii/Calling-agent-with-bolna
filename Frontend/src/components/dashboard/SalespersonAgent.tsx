import { useState, useEffect } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { 
  Calendar,
  ChevronDown,
  Phone,
  Users,
  CheckCircle2,
  Clock,
  Edit,
  FileText,
  Award,
  TrendingUp
} from "lucide-react";
import apiService, { TeamMemberKPIs, TeamMemberActivityLog } from "@/services/apiService";
import { format } from "date-fns";

interface SalespersonAgentProps {
  activeTab: string;
  activeSubTab: string;
  setActiveSubTab: (subTab: string) => void;
}

const SalespersonAgent = ({
  activeTab,
  activeSubTab,
  setActiveSubTab,
}: SalespersonAgentProps) => {
  const { theme } = useTheme();
  const [analyticsData, setAnalyticsData] = useState<TeamMemberKPIs[]>([]);
  const [selectedSalesperson, setSelectedSalesperson] = useState<string>("");
  const [activityLog, setActivityLog] = useState<TeamMemberActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(false);

  // Fetch all salesperson analytics
  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        const response = await apiService.getTeamMemberAnalytics();
        console.log("Analytics response:", response);
        
        // Handle both direct response and wrapped response
        if (response && typeof response === 'object') {
          if ('analytics' in response) {
            setAnalyticsData(response.analytics || []);
          } else if (Array.isArray(response)) {
            setAnalyticsData(response);
          } else {
            console.error("Unexpected response format:", response);
            setAnalyticsData([]);
          }
        } else {
          setAnalyticsData([]);
        }
      } catch (error) {
        console.error("Error fetching salesperson analytics:", error);
        setAnalyticsData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  // Fetch activity log when a specific salesperson is selected
  useEffect(() => {
    if (!selectedSalesperson || activeSubTab !== "activity-logs") return;

    const fetchActivityLog = async () => {
      try {
        setActivityLoading(true);
        const response = await apiService.getTeamMemberActivityLog(selectedSalesperson, {
          limit: 50,
          offset: 0,
        });
        setActivityLog(response.activities || []);
      } catch (error) {
        console.error("Error fetching activity log:", error);
      } finally {
        setActivityLoading(false);
      }
    };

    fetchActivityLog();
  }, [selectedSalesperson, activeSubTab]);

  const getSelectedSalesperson = () => {
    return analyticsData.find((sp) => sp.teamMemberId === selectedSalesperson);
  };

  const renderAnalytics = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-sm text-muted-foreground">Loading analytics...</p>
          </div>
        </div>
      );
    }

    if (analyticsData.length === 0) {
      return (
        <div className="text-center py-12">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No team members found</p>
        </div>
      );
    }

    // Show individual salesperson analytics if one is selected
    const selectedData = selectedSalesperson ? getSelectedSalesperson() : null;
    const displayData = selectedData ? [selectedData] : analyticsData;

    // Show team members overview when no filter is selected
    const showTeamOverview = !selectedSalesperson;

    return (
      <div className="space-y-6">
        {/* Team Members Overview - Show when no filter selected */}
        {showTeamOverview && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Our Human Agents</h2>
              <Badge variant="secondary" className="text-sm">
                {analyticsData.length} Team {analyticsData.length === 1 ? 'Member' : 'Members'}
              </Badge>
            </div>

            {/* Team Members Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {analyticsData.map((member) => (
                <Card 
                  key={member.teamMemberId} 
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => setSelectedSalesperson(member.teamMemberId)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{member.teamMemberName}</CardTitle>
                          <Badge variant="outline" className="mt-1 text-xs">
                            {member.teamMemberRole}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Quick Stats */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-500" />
                        <span className="text-muted-foreground">Leads:</span>
                        <span className="font-semibold">{member.leadsAssigned}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-muted-foreground">F-ups:</span>
                        <span className="font-semibold">{member.followUpsCompleted}/{member.followUpsAssigned}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-purple-500" />
                        <span className="text-muted-foreground">Calls:</span>
                        <span className="font-semibold">{member.manualCallsLogged}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Award className="h-4 w-4 text-orange-500" />
                        <span className="text-muted-foreground">Demos:</span>
                        <span className="font-semibold">{member.demosScheduled}</span>
                      </div>
                    </div>

                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full mt-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSalesperson(member.teamMemberId);
                      }}
                    >
                      View Details
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Individual Salesperson Detailed Analytics */}
        {!showTeamOverview && displayData.map((member) => (
          <div key={member.teamMemberId} className="space-y-4">
            {/* Salesperson Header with Back Button */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setSelectedSalesperson("")}
                >
                  ← Back to All Agents
                </Button>
                <div>
                  <h3 className="text-lg font-semibold">{member.teamMemberName}</h3>
                  <Badge variant="outline" className="mt-1">
                    {member.teamMemberRole}
                  </Badge>
                </div>
              </div>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Leads Assigned */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-500" />
                    Leads Assigned
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{member.leadsAssigned}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {member.leadsActive} active, {member.qualifiedLeads} qualified
                  </p>
                </CardContent>
              </Card>

              {/* Follow-ups */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-green-500" />
                    Follow-ups
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{member.followUpsCompleted}/{member.followUpsAssigned}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {member.followUpsPending} pending
                  </p>
                </CardContent>
              </Card>

              {/* Manual Calls */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Phone className="h-4 w-4 text-purple-500" />
                    Manual Calls
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{member.manualCallsLogged}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Logged via Lead Intelligence
                  </p>
                </CardContent>
              </Card>

              {/* Demos Scheduled */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Award className="h-4 w-4 text-orange-500" />
                    Demos Scheduled
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{member.demosScheduled}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Total demos booked
                  </p>
                </CardContent>
              </Card>

              {/* Activity Metrics */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Edit className="h-4 w-4 text-indigo-500" />
                    Lead Edits
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{member.leadEdits}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Intelligence updates
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4 text-teal-500" />
                    Notes Added
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{member.notesAdded}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Total notes added
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-pink-500" />
                    Status Changes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{member.statusChanges}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Lead status updates
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderActivityLogs = () => {
    if (!selectedSalesperson) {
      return (
        <div className="text-center py-12">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Select a salesperson to view activity logs</p>
        </div>
      );
    }

    if (activityLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-sm text-muted-foreground">Loading activity log...</p>
          </div>
        </div>
      );
    }

    if (activityLog.length === 0) {
      return (
        <div className="text-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No activity logs found</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {activityLog.map((activity) => (
          <Card key={activity.id}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  {activity.activityType === 'call' && <Phone className="h-5 w-5 text-purple-500" />}
                  {activity.activityType === 'edit' && <Edit className="h-5 w-5 text-indigo-500" />}
                  {activity.activityType === 'note' && <FileText className="h-5 w-5 text-teal-500" />}
                  {activity.activityType === 'assign' && <Users className="h-5 w-5 text-blue-500" />}
                  {activity.activityType === 'status_change' && <TrendingUp className="h-5 w-5 text-pink-500" />}
                  {activity.activityType === 'follow_up' && <Calendar className="h-5 w-5 text-green-500" />}
                </div>
                <div className="flex-grow">
                  <p className="font-medium">{activity.activityDescription}</p>
                  {activity.leadName && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Lead: {activity.leadName} ({activity.leadPhone})
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    {format(new Date(activity.timestamp), "PPpp")}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {activity.activityType}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderSubTabContent = () => {
    switch (activeSubTab) {
      case "analytics":
        return renderAnalytics();
      case "activity-logs":
        return renderActivityLogs();
      default:
        return renderAnalytics();
    }
  };

  return (
    <div
      className={`p-6 space-y-6 ${
        theme === "dark" ? "bg-black text-white" : "bg-white text-gray-900"
      }`}
    >
      {/* Salesperson Filter */}
      <div className="flex items-center gap-4 p-4 border rounded-lg">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">Filter by Salesperson:</span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="justify-between min-w-[200px]">
                {getSelectedSalesperson()?.teamMemberName || "All Salespersons"}
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>Select Salesperson</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                key="all-salespersons"
                checked={selectedSalesperson === ""}
                onCheckedChange={() => setSelectedSalesperson("")}
              >
                All Salespersons
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />

              {analyticsData.map((member) => (
                <DropdownMenuCheckboxItem
                  key={member.teamMemberId}
                  checked={selectedSalesperson === member.teamMemberId}
                  onCheckedChange={() => setSelectedSalesperson(member.teamMemberId)}
                >
                  {member.teamMemberName} ({member.teamMemberRole})
                </DropdownMenuCheckboxItem>
              ))}

              {analyticsData.length === 0 && (
                <div className="p-2 text-sm text-gray-500 text-center">
                  No salespersons found
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {selectedSalesperson && getSelectedSalesperson() && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {getSelectedSalesperson()?.teamMemberName}
            </Badge>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-h-[600px]">{renderSubTabContent()}</div>
    </div>
  );
};

export default SalespersonAgent;
