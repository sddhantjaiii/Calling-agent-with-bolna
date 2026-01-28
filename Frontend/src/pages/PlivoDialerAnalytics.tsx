import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/components/theme/ThemeProvider";
import API_ENDPOINTS from "@/config/api";
import { authenticatedFetch } from "@/utils/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PhoneCall, PhoneIncoming, PhoneMissed, PhoneOff, AlertCircle, Signal, Clock, Mic, FileText } from "lucide-react";

type DialerAnalyticsSummary = {
  totalCalls: number;
  answeredCalls: number;
  completedCalls: number;
  statusBreakdown: {
    completed: number;
    busy: number;
    noAnswer: number;
    notAnswered: number;
    rejected: number;
    networkError: number;
    invalidNumber: number;
    failed: number;
    inProgress: number;
  };
  totalDurationSeconds: number;
  averageDurationSeconds: number;
  maxDurationSeconds: number;
  minDurationSeconds: number;
  recordingsAvailable: number;
  transcriptsCompleted: number;
  answerRatePercentage: number;
  connectionRatePercentage: number;
};

function fmtSeconds(seconds: number): string {
  if (!seconds || seconds <= 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m <= 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function fmtHoursMinutes(seconds: number): string {
  if (!seconds || seconds <= 0) return "0h 0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export default function PlivoDialerAnalytics() {
  const { theme } = useTheme();

  const { data, isLoading, error } = useQuery({
    queryKey: ["dialer", "analytics", "summary"],
    queryFn: async (): Promise<DialerAnalyticsSummary> => {
      const resp = await authenticatedFetch(API_ENDPOINTS.PLIVO_DIALER.ANALYTICS_SUMMARY);
      if (!resp.ok) {
        throw new Error(`Failed to load dialer analytics (${resp.status})`);
      }
      const json = await resp.json();
      return (json?.data || {}) as DialerAnalyticsSummary;
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Dialer Analytics</h2>
        <p className="text-sm text-muted-foreground">
          Comprehensive KPIs from manual browser dialer calls with detailed status breakdown.
        </p>
      </div>

      {isLoading ? <div>Loading...</div> : null}
      {error ? <div className="text-sm text-red-500">{String(error)}</div> : null}

      {data ? (
        <div className="space-y-6">
          {/* Overview Cards */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Overview</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
                  <PhoneCall className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.totalCalls}</div>
                  <p className="text-xs text-muted-foreground mt-1">All dialer calls made</p>
                </CardContent>
              </Card>

              <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Answer Rate</CardTitle>
                  <PhoneIncoming className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-emerald-600">{data.answerRatePercentage.toFixed(1)}%</div>
                  <p className="text-xs text-muted-foreground mt-1">{data.answeredCalls} of {data.totalCalls} answered</p>
                </CardContent>
              </Card>

              <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Connection Rate</CardTitle>
                  <Signal className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{data.connectionRatePercentage.toFixed(1)}%</div>
                  <p className="text-xs text-muted-foreground mt-1">Successfully connected calls</p>
                </CardContent>
              </Card>

              <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Talk Time</CardTitle>
                  <Clock className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{fmtHoursMinutes(data.totalDurationSeconds)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Combined call duration</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Call Status Breakdown */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Call Status Breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    Completed
                    <Badge variant="secondary" className="ml-auto">{data.statusBreakdown.completed}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground">Successfully completed calls</div>
                </CardContent>
              </Card>

              <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    Busy
                    <Badge variant="outline" className="ml-auto text-yellow-600 border-yellow-600">{data.statusBreakdown.busy}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground">User was busy</div>
                </CardContent>
              </Card>

              <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    No Answer
                    <Badge variant="outline" className="ml-auto text-orange-600 border-orange-600">{data.statusBreakdown.noAnswer + data.statusBreakdown.notAnswered}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground">Call not picked up</div>
                </CardContent>
              </Card>

              <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    Rejected
                    <Badge variant="destructive" className="ml-auto">{data.statusBreakdown.rejected}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground">Call declined</div>
                </CardContent>
              </Card>

              <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    Failed
                    <Badge variant="destructive" className="ml-auto">{data.statusBreakdown.failed + data.statusBreakdown.networkError + data.statusBreakdown.invalidNumber}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground">Network/system errors</div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Duration & Performance Metrics */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Call Duration Metrics</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Average Duration</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{fmtSeconds(data.averageDurationSeconds)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Per answered call</p>
                </CardContent>
              </Card>

              <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Longest Call</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{fmtSeconds(data.maxDurationSeconds)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Maximum duration</p>
                </CardContent>
              </Card>

              <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Shortest Call</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{fmtSeconds(data.minDurationSeconds)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Minimum duration</p>
                </CardContent>
              </Card>

              <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total Duration</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{fmtHoursMinutes(data.totalDurationSeconds)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Combined talk time</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Recording & AI Metrics */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Recording & AI Processing</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Recordings</CardTitle>
                  <Mic className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.recordingsAvailable}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {data.answeredCalls > 0 ? `${Math.round((data.recordingsAvailable / data.answeredCalls) * 100)}% of answered calls` : 'No answered calls yet'}
                  </p>
                </CardContent>
              </Card>

              <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Transcripts</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.transcriptsCompleted}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {data.recordingsAvailable > 0 ? `${Math.round((data.transcriptsCompleted / data.recordingsAvailable) * 100)}% of recordings` : 'No recordings yet'}
                  </p>
                </CardContent>
              </Card>

              <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">In Progress</CardTitle>
                  <AlertCircle className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.statusBreakdown.inProgress}</div>
                  <p className="text-xs text-muted-foreground mt-1">Active or processing calls</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
