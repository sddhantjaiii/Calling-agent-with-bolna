import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Play, 
  Webhook, 
  Search, 
  CheckCircle, 
  XCircle, 
  Loader2,
  AlertTriangle,
  Copy,
  FileJson
} from 'lucide-react';
import { apiService } from '@/services/apiService';
import { toast } from 'sonner';

interface CallDetails {
  call_id: string;
  execution_id: string;
  user_id: string;
  agent_id: string;
  phone_number: string;
  status: string;
  call_lifecycle_status: string;
  duration_seconds: number;
  recording_url?: string;
  has_transcript: boolean;
  transcript?: {
    id: string;
    content_length: number;
    preview: string;
  };
  created_at: string;
  completed_at?: string;
}

interface AnalysisResult {
  success: boolean;
  message: string;
  call?: {
    call_id: string;
    execution_id: string;
    status: string;
    [key: string]: any;
  };
  analysis?: {
    individual_analysis?: any;
    complete_analysis?: any;
  };
  data?: {
    call_id: string;
    execution_id: string;
    transcript_id: string;
    individual_analysis?: any;
    complete_analysis?: any;
  };
  error?: string;
}

interface WebhookResult {
  success: boolean;
  message: string;
  stages_processed: string[];
  call?: {
    call_id: string;
    execution_id: string;
    status: string;
    [key: string]: any;
  };
  analysis?: {
    individual_analysis?: any;
    complete_analysis?: any;
  };
  data?: {
    execution_id: string;
    call_id?: string;
    transcript_saved?: boolean;
    analysis_triggered?: boolean;
  };
  error?: string;
}

const SAMPLE_WEBHOOK_PAYLOAD = `{
  "id": "your-execution-id-here",
  "agent_id": "your-bolna-agent-id-here",
  "status": "completed",
  "conversation_duration": 120,
  "transcript": "assistant: Hello, how can I help you?\\nuser: I need some information...",
  "telephony_data": {
    "duration": "120",
    "to_number": "+1234567890",
    "from_number": "+0987654321",
    "recording_url": "https://example.com/recording.mp3",
    "call_type": "outbound",
    "provider": "twilio"
  },
  "context_details": {
    "recipient_data": {
      "lead_name": "John Doe",
      "email": "john@example.com"
    },
    "recipient_phone_number": "+1234567890"
  }
}`;

export default function ManualTriggers() {
  const [activeTab, setActiveTab] = useState('analysis');
  
  // Analysis state
  const [executionId, setExecutionId] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [callDetails, setCallDetails] = useState<CallDetails | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Webhook state
  const [webhookPayload, setWebhookPayload] = useState(SAMPLE_WEBHOOK_PAYLOAD);
  const [isSimulating, setIsSimulating] = useState(false);
  const [webhookResult, setWebhookResult] = useState<WebhookResult | null>(null);
  const [webhookError, setWebhookError] = useState<string | null>(null);

  // Lookup call by execution ID
  const handleLookup = async () => {
    if (!executionId.trim()) {
      toast.error('Please enter an execution ID');
      return;
    }

    setIsLookingUp(true);
    setCallDetails(null);
    setLookupError(null);
    setAnalysisResult(null);

    try {
      const response = await apiService.getCallByExecutionId(executionId.trim());
      
      if (response.success && response.data) {
        setCallDetails(response.data);
        toast.success('Call found');
      } else {
        setLookupError(response.message || 'Call not found');
        toast.error(response.message || 'Call not found');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to lookup call';
      setLookupError(message);
      toast.error(message);
    } finally {
      setIsLookingUp(false);
    }
  };

  // Trigger OpenAI analysis
  const handleTriggerAnalysis = async () => {
    if (!executionId.trim()) {
      toast.error('Please enter an execution ID');
      return;
    }

    setIsTriggering(true);
    setAnalysisResult(null);

    try {
      const response = await apiService.triggerAnalysis(executionId.trim());
      
      // Extract data from ApiResponse wrapper
      const result = {
        success: response.success,
        message: response.message || (response.success ? 'Analysis completed' : 'Analysis failed'),
        analysis: (response.data as any)?.analysis,
        call: (response.data as any)?.call,
        error: response.error?.message
      };
      
      setAnalysisResult(result);
      
      if (response.success) {
        toast.success('Analysis completed successfully');
      } else {
        toast.error(response.message || response.error?.message || 'Analysis failed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to trigger analysis';
      setAnalysisResult({
        success: false,
        message: 'Analysis failed',
        error: message
      });
      toast.error(message);
    } finally {
      setIsTriggering(false);
    }
  };

  // Simulate webhook
  const handleSimulateWebhook = async () => {
    setWebhookError(null);
    setWebhookResult(null);

    // Validate JSON
    let payload;
    try {
      payload = JSON.parse(webhookPayload);
    } catch (e) {
      setWebhookError('Invalid JSON payload');
      toast.error('Invalid JSON payload');
      return;
    }

    // Validate required fields
    if (!payload.id && !payload.execution_id) {
      setWebhookError('Payload must have "id" or "execution_id" field');
      toast.error('Missing execution ID in payload');
      return;
    }

    if (!payload.agent_id) {
      setWebhookError('Payload must have "agent_id" field');
      toast.error('Missing agent_id in payload');
      return;
    }

    setIsSimulating(true);

    try {
      const response = await apiService.simulateWebhook(payload);
      
      // Extract data from ApiResponse wrapper
      const responseData = response.data as any;
      const result: WebhookResult = {
        success: response.success,
        message: response.message || (response.success ? 'Webhook simulation completed' : 'Simulation failed'),
        stages_processed: responseData?.stages_processed || [],
        call: responseData?.call,
        analysis: responseData?.analysis,
        error: response.error?.message
      };
      
      setWebhookResult(result);
      
      if (response.success) {
        toast.success(`Webhook simulation completed! Processed ${result.stages_processed.length} stages.`);
      } else {
        toast.error(response.message || response.error?.message || 'Webhook simulation failed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to simulate webhook';
      setWebhookResult({
        success: false,
        message: 'Simulation failed',
        stages_processed: [],
        error: message
      });
      toast.error(message);
    } finally {
      setIsSimulating(false);
    }
  };

  // Format JSON for display
  const formatPayload = () => {
    try {
      const parsed = JSON.parse(webhookPayload);
      setWebhookPayload(JSON.stringify(parsed, null, 2));
      toast.success('Payload formatted');
    } catch (e) {
      toast.error('Invalid JSON - cannot format');
    }
  };

  // Copy sample payload
  const copySamplePayload = () => {
    setWebhookPayload(SAMPLE_WEBHOOK_PAYLOAD);
    toast.success('Sample payload loaded');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Manual Triggers</h2>
          <p className="text-muted-foreground">
            Manually trigger OpenAI analysis or simulate Bolna webhooks
          </p>
        </div>
        <Badge variant="outline" className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Admin Only
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="analysis" className="flex items-center gap-2">
            <Play className="h-4 w-4" />
            Trigger Analysis
          </TabsTrigger>
          <TabsTrigger value="webhook" className="flex items-center gap-2">
            <Webhook className="h-4 w-4" />
            Simulate Webhook
          </TabsTrigger>
        </TabsList>

        {/* Trigger Analysis Tab */}
        <TabsContent value="analysis" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Trigger OpenAI Analysis</CardTitle>
              <CardDescription>
                Manually run OpenAI analysis for an existing call. Use this when a call has a transcript but analysis was skipped.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor="executionId">Execution ID</Label>
                  <Input
                    id="executionId"
                    placeholder="e.g., 3fbdaf3c-78fc-4185-8ad9-17c85ec968f4"
                    value={executionId}
                    onChange={(e) => setExecutionId(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    variant="outline"
                    onClick={handleLookup}
                    disabled={isLookingUp || !executionId.trim()}
                  >
                    {isLookingUp ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    <span className="ml-2">Lookup</span>
                  </Button>
                </div>
              </div>

              {lookupError && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{lookupError}</AlertDescription>
                </Alert>
              )}

              {callDetails && (
                <Card className="bg-muted/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Call Found
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className="text-muted-foreground">Call ID:</span> <code className="text-xs">{callDetails.call_id}</code></div>
                      <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline">{callDetails.status}</Badge></div>
                      <div><span className="text-muted-foreground">Phone:</span> {callDetails.phone_number}</div>
                      <div><span className="text-muted-foreground">Duration:</span> {callDetails.duration_seconds}s</div>
                      <div><span className="text-muted-foreground">Has Transcript:</span> 
                        {callDetails.has_transcript ? (
                          <Badge variant="default" className="ml-1 bg-green-500">Yes</Badge>
                        ) : (
                          <Badge variant="destructive" className="ml-1">No</Badge>
                        )}
                      </div>
                      <div><span className="text-muted-foreground">Recording:</span> 
                        {callDetails.recording_url ? (
                          <Badge variant="default" className="ml-1 bg-green-500">Available</Badge>
                        ) : (
                          <Badge variant="outline" className="ml-1">None</Badge>
                        )}
                      </div>
                    </div>
                    {callDetails.transcript && (
                      <div className="mt-2">
                        <span className="text-muted-foreground">Transcript Preview:</span>
                        <pre className="mt-1 p-2 bg-background rounded text-xs overflow-auto max-h-32">
                          {callDetails.transcript.preview}
                        </pre>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Button
                onClick={handleTriggerAnalysis}
                disabled={isTriggering || !executionId.trim()}
                className="w-full"
              >
                {isTriggering ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Running Analysis...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Trigger OpenAI Analysis
                  </>
                )}
              </Button>

              {analysisResult && (
                <Alert variant={analysisResult.success ? "default" : "destructive"}>
                  {analysisResult.success ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <AlertTitle>{analysisResult.success ? 'Success' : 'Failed'}</AlertTitle>
                  <AlertDescription>
                    <p>{analysisResult.message}</p>
                    {analysisResult.error && <p className="text-red-500 mt-1">{analysisResult.error}</p>}
                    {analysisResult.data?.individual_analysis && (
                      <div className="mt-2 p-2 bg-background rounded text-xs">
                        <p><strong>Lead Status:</strong> {analysisResult.data.individual_analysis.lead_status_tag}</p>
                        <p><strong>Total Score:</strong> {analysisResult.data.individual_analysis.total_score}</p>
                        {analysisResult.data.individual_analysis.demo_book_datetime && (
                          <p><strong>Demo Booked:</strong> {analysisResult.data.individual_analysis.demo_book_datetime}</p>
                        )}
                        {analysisResult.data.individual_analysis.extraction?.name && (
                          <p><strong>Name:</strong> {analysisResult.data.individual_analysis.extraction.name}</p>
                        )}
                        {analysisResult.data.individual_analysis.extraction?.email_address && (
                          <p><strong>Email:</strong> {analysisResult.data.individual_analysis.extraction.email_address}</p>
                        )}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Simulate Webhook Tab */}
        <TabsContent value="webhook" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Simulate Bolna Webhook</CardTitle>
              <CardDescription>
                Process a Bolna webhook payload manually. The system will automatically process through the required stages (call-disconnected for transcript, completed for analysis).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={copySamplePayload}>
                  <Copy className="h-4 w-4 mr-1" />
                  Load Sample
                </Button>
                <Button variant="outline" size="sm" onClick={formatPayload}>
                  <FileJson className="h-4 w-4 mr-1" />
                  Format JSON
                </Button>
              </div>

              <div>
                <Label htmlFor="webhookPayload">Webhook Payload (JSON)</Label>
                <Textarea
                  id="webhookPayload"
                  placeholder="Paste your Bolna webhook payload here..."
                  value={webhookPayload}
                  onChange={(e) => setWebhookPayload(e.target.value)}
                  className="font-mono text-xs min-h-[300px]"
                />
              </div>

              {webhookError && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Validation Error</AlertTitle>
                  <AlertDescription>{webhookError}</AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleSimulateWebhook}
                disabled={isSimulating}
                className="w-full"
              >
                {isSimulating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Processing Webhook...
                  </>
                ) : (
                  <>
                    <Webhook className="h-4 w-4 mr-2" />
                    Simulate Webhook
                  </>
                )}
              </Button>

              {webhookResult && (
                <Alert variant={webhookResult.success ? "default" : "destructive"}>
                  {webhookResult.success ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <AlertTitle>{webhookResult.success ? 'Success' : 'Failed'}</AlertTitle>
                  <AlertDescription>
                    <p>{webhookResult.message}</p>
                    {webhookResult.error && <p className="text-red-500 mt-1">{webhookResult.error}</p>}
                    {webhookResult.stages_processed.length > 0 && (
                      <div className="mt-2">
                        <p className="font-medium">Stages Processed:</p>
                        <div className="flex gap-2 mt-1">
                          {webhookResult.stages_processed.map((stage, index) => (
                            <Badge key={index} variant="outline">{stage}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {webhookResult.data && (
                      <div className="mt-2 p-2 bg-background rounded text-xs">
                        <p><strong>Execution ID:</strong> {webhookResult.data.execution_id}</p>
                        {webhookResult.data.call_id && <p><strong>Call ID:</strong> {webhookResult.data.call_id}</p>}
                        <p><strong>Transcript Saved:</strong> {webhookResult.data.transcript_saved ? 'Yes' : 'No'}</p>
                        <p><strong>Analysis Triggered:</strong> {webhookResult.data.analysis_triggered ? 'Yes' : 'No'}</p>
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
