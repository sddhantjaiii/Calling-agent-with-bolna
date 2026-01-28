import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/components/theme/ThemeProvider";
import API_ENDPOINTS from "@/config/api";
import { authenticatedFetch } from "@/utils/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DialerAnalyticsSummary = {
  totalCalls: number;
  answeredCalls: number;
  completedCalls: number;
  failedCalls: number;
  totalDurationSeconds: number;
  averageDurationSeconds: number;
  recordingsAvailable: number;
  transcriptsCompleted: number;
};

function fmtSeconds(seconds: number): string {
  if (!seconds || seconds <= 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m <= 0) return `${s}s`;
  return `${m}m ${s}s`;
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
        <h2 className="text-xl font-semibold">Dialer Analysis</h2>
        <p className="text-sm text-muted-foreground">
          KPIs computed from the plivo_calls table (manual browser dialer).
        </p>
      </div>

      {isLoading ? <div>Loading...</div> : null}
      {error ? <div className="text-sm text-red-500">{String(error)}</div> : null}

      {data ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
            <CardHeader>
              <CardTitle className="text-sm">Total calls</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{data.totalCalls}</div>
            </CardContent>
          </Card>

          <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
            <CardHeader>
              <CardTitle className="text-sm">Answered</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{data.answeredCalls}</div>
            </CardContent>
          </Card>

          <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
            <CardHeader>
              <CardTitle className="text-sm">Total talk time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{fmtSeconds(data.totalDurationSeconds)}</div>
            </CardContent>
          </Card>

          <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
            <CardHeader>
              <CardTitle className="text-sm">Avg duration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{fmtSeconds(data.averageDurationSeconds)}</div>
            </CardContent>
          </Card>

          <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
            <CardHeader>
              <CardTitle className="text-sm">Recordings available</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{data.recordingsAvailable}</div>
            </CardContent>
          </Card>

          <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
            <CardHeader>
              <CardTitle className="text-sm">Transcripts completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{data.transcriptsCompleted}</div>
            </CardContent>
          </Card>

          <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
            <CardHeader>
              <CardTitle className="text-sm">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{data.completedCalls}</div>
            </CardContent>
          </Card>

          <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
            <CardHeader>
              <CardTitle className="text-sm">Failed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{data.failedCalls}</div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
