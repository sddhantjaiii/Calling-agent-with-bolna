import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/components/theme/ThemeProvider";
import API_ENDPOINTS from "@/config/api";
import { authenticatedFetch } from "@/utils/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

type PhoneNumber = {
  id: string;
  name: string;
  phoneNumber: string;
  isActive: boolean;
  agentName?: string | null;
};

type PlivoDialerTokenResponse = {
  token: string;
  plivoNumber: string;
  exp: number;
};

function stripSpaces(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function getBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const s = status.toLowerCase();
  // Successful calls
  if (s === "completed") return "secondary";
  // Active call states
  if (s.includes("ring") || s.includes("progress") || s.includes("answer") || 
      s === "initiating" || s === "calling" || s === "in-progress") return "default";
  // Failed/Error states
  if (s.includes("fail") || s.includes("error") || s === "rejected" || s === "invalid_number") return "destructive";
  // No answer / Busy states
  if (s === "busy" || s === "no_answer" || s === "not_answered") return "outline";
  // Logged in/idle states
  if (s === "logged-in" || s === "idle") return "secondary";
  return "outline";
}

function getStatusLabel(status: string): string {
  const s = status.toLowerCase();
  const statusMap: Record<string, string> = {
    'completed': 'Completed',
    'busy': 'Busy',
    'no_answer': 'No Answer',
    'not_answered': 'Not Answered',
    'rejected': 'Rejected',
    'failed': 'Failed',
    'network_error': 'Network Error',
    'invalid_number': 'Invalid Number',
    'initiating': 'Initiating',
    'ringing': 'Ringing',
    'in-progress': 'In Progress',
    'in_progress': 'In Progress',
    'answered': 'Answered',
    'calling': 'Calling',
    'idle': 'Idle',
    'logged-in': 'Logged In',
    'login-failed': 'Login Failed',
    'hangup': 'Hung Up'
  };
  return statusMap[s] || status;
}

export default function PlivoDialer() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const plivoClientRef = useRef<any | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const [selectedFromId, setSelectedFromId] = useState<string>("");
  const [toPhoneNumber, setToPhoneNumber] = useState<string>("");

  const [sdkReady, setSdkReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [callLogId, setCallLogId] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<string>("idle");

  const { data: phoneNumbersData, isLoading: isLoadingPhoneNumbers } = useQuery({
    queryKey: ["dialer", "phoneNumbers"],
    queryFn: async (): Promise<PhoneNumber[]> => {
      const resp = await authenticatedFetch(API_ENDPOINTS.PHONE_NUMBERS.LIST);
      if (!resp.ok) {
        throw new Error(`Failed to load phone numbers (${resp.status})`);
      }
      const json = await resp.json();
      return (json?.data || []) as PhoneNumber[];
    },
  });

  const activePhoneNumbers = useMemo(() => {
    return (phoneNumbersData || []).filter((p) => p.isActive);
  }, [phoneNumbersData]);

  const selectedFrom = useMemo(() => {
    return activePhoneNumbers.find((p) => p.id === selectedFromId) || null;
  }, [activePhoneNumbers, selectedFromId]);

  useEffect(() => {
    // Plivo SDK is loaded globally via index.html script tag.
    const timer = setInterval(() => {
      const plivo = (window as any).Plivo;
      if (plivo && typeof plivo === "function") {
        setSdkReady(true);
        clearInterval(timer);
      }
    }, 250);

    return () => clearInterval(timer);
  }, []);

  const updateCallStatus = async (id: string, status: string, extra?: Record<string, unknown>) => {
    try {
      await authenticatedFetch(API_ENDPOINTS.PLIVO_DIALER.STATUS(id), {
        method: "POST",
        body: JSON.stringify({ status, ...(extra || {}) }),
      });
    } catch {
      // Status updates are best-effort; don't block the UX.
    }
  };

  // Poll backend to get the actual status saved by hangup webhook
  const fetchActualCallStatus = async (id: string): Promise<string | null> => {
    try {
      // Wait a bit for hangup webhook to process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const resp = await authenticatedFetch(`${API_ENDPOINTS.PLIVO_DIALER.CALLS}?limit=1`);
      if (!resp.ok) return null;
      
      const json = await resp.json();
      const calls = json?.data || [];
      const call = calls.find((c: any) => c.id === id);
      
      return call?.status || null;
    } catch {
      return null;
    }
  };

  // Unlock audio playback on user interaction (browser autoplay policy).
  // IMPORTANT: do NOT play/pause the Plivo tone elements here (race causes AbortError).
  const unlockPlivoAudio = async () => {
    try {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextCtor) {
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContextCtor();
        }
        if (audioContextRef.current.state === "suspended") {
          await audioContextRef.current.resume();
        }
      }
    } catch {
      // ignore
    }

    // Start a muted silent loop to keep audio unlocked.
    try {
      const silentEl = document.getElementById("plivo_silent_tone") as HTMLAudioElement | null;
      if (silentEl) {
        silentEl.muted = true;
        silentEl.loop = true;
        // Ensure it has a source so play() actually starts.
        if (!silentEl.src) {
          silentEl.src = "https://cdn.plivo.com/sdk/browser/audio/silent-audio.mp3";
        }
        await silentEl.play().catch(() => {
          // ignore
        });
      }
    } catch {
      // ignore
    }
  };

  // Best-effort: ensure Plivo can resolve a non-empty sinkId for speaker/ringtone elements.
  // The SDK logs "No speaker element found" when the queried element has a falsy sinkId.
  const ensureDefaultOutputDevice = () => {
    try {
      const els = document.querySelectorAll(
        '[data-devicetype="speakerDevice"], [data-devicetype="ringtoneDevice"]'
      );
      els.forEach((el) => {
        const anyEl = el as any;
        if (anyEl && typeof anyEl.setSinkId === "function") {
          // "default" is a valid sinkId in Chrome and results in a non-empty sinkId.
          anyEl.setSinkId("default").catch(() => {});
        }
      });
    } catch {
      // ignore
    }
  };

  const ensurePlivoClient = async (token: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      // If client exists and already logged in, reuse it
      if (plivoClientRef.current && isLoggedIn) {
        try {
          plivoClientRef.current?.setRingToneBack?.(true);
          plivoClientRef.current?.setConnectTone?.(true);
        } catch {
          // ignore
        }
        resolve();
        return;
      }

      // If client exists but not logged in, wait for re-login
      if (plivoClientRef.current) {
        try {
          plivoClientRef.current?.setRingToneBack?.(true);
          plivoClientRef.current?.setConnectTone?.(true);
        } catch {
          // ignore
        }
        const loginTimeout = setTimeout(() => {
          reject(new Error("Login timeout - please try again"));
        }, 5000);

        const onLoginSuccess = () => {
          clearTimeout(loginTimeout);
          plivoClientRef.current?.off?.("onLogin", onLoginSuccess);
          plivoClientRef.current?.off?.("onLoginFailed", onLoginFailure);
          resolve();
        };

        const onLoginFailure = (reason: any) => {
          clearTimeout(loginTimeout);
          plivoClientRef.current?.off?.("onLogin", onLoginSuccess);
          plivoClientRef.current?.off?.("onLoginFailed", onLoginFailure);
          reject(new Error(reason?.message || "Login failed"));
        };

        plivoClientRef.current.on("onLogin", onLoginSuccess);
        plivoClientRef.current.on("onLoginFailed", onLoginFailure);

        try {
          plivoClientRef.current.loginWithAccessToken(token);
        } catch (error) {
          clearTimeout(loginTimeout);
          reject(error);
        }
        return;
      }

      // Create new client
      const PlivoCtor = (window as any).Plivo;
      if (!PlivoCtor) {
        reject(new Error("Plivo SDK not loaded"));
        return;
      }

      const sdk = new PlivoCtor({
        debug: "ALL",
        permOnClick: true,
        enableTracking: true,
        closeProtection: true,
        enableIPV6: false,
        audioConstraints: { optional: [{ echoCancellation: true }] },
        enableNoiseReduction: false, // Can cause issues with some browsers
        allowMultipleIncomingCalls: false,
      });

      const client = sdk?.client;
      if (!client) {
        reject(new Error("Plivo client not available on SDK instance"));
        return;
      }

      // Ensure tones are enabled for outbound experience (ringback + connect tone).
      // These are best-effort: SDK versions differ.
      try {
        client?.setRingToneBack?.(true);
        client?.setConnectTone?.(true);
      } catch {
        // ignore
      }

      const loginTimeout = setTimeout(() => {
        reject(new Error("Login timeout - please try again"));
      }, 5000);

      client.on("onLogin", () => {
        clearTimeout(loginTimeout);
        setIsLoggedIn(true);
        setIsConnecting(false);
        setLocalStatus("logged-in");
        resolve();
      });

      client.on("onLoginFailed", (reason: any) => {
        clearTimeout(loginTimeout);
        setIsLoggedIn(false);
        setIsConnecting(false);
        setLocalStatus("login-failed");
        toast({
          title: "Plivo login failed",
          description: reason?.message || String(reason || "Authentication error"),
          variant: "destructive",
        });
        reject(new Error(reason?.message || "Login failed"));
      });

    client.on("onCallInitiated", async () => {
      setLocalStatus("initiating");
      if (callLogId) await updateCallStatus(callLogId, "initiating");
    });

    client.on("onCallRemoteRinging", async () => {
      setLocalStatus("ringing");
      if (callLogId) await updateCallStatus(callLogId, "ringing");
    });

    client.on("onCallAnswered", async () => {
      setLocalStatus("in-progress");
      if (callLogId) await updateCallStatus(callLogId, "in-progress");
    });

    client.on("onCallTerminated", async (event: any) => {
      setIsCalling(false);
      setLocalStatus("completed");

      const uuid = event?.callUUID || event?.call_uuid || event?.CallUUID;

      if (callLogId) {
        await updateCallStatus(callLogId, "completed", {
          plivoCallUuid: uuid || null,
        });
        
        // Fetch the actual status from backend (hangup webhook may have set a more specific status)
        const actualStatus = await fetchActualCallStatus(callLogId);
        if (actualStatus && actualStatus !== "completed") {
          setLocalStatus(actualStatus);
        }
      }

      setCallLogId(null);
      queryClient.invalidateQueries({ queryKey: ["dialer", "callLogs"] });
    });

    client.on("onCallFailed", async (reason: any) => {
      setIsCalling(false);
      setLocalStatus("failed");

      const uuid = reason?.callUUID || reason?.call_uuid || reason?.CallUUID;
      const cause = (reason && typeof reason === "object" && "cause" in reason) ? (reason as any).cause : reason;

      if (callLogId) {
        await updateCallStatus(callLogId, "failed", {
          plivoCallUuid: uuid || null,
          hangupReason: cause ? String(cause) : null,
        });
        
        // Fetch the actual status from backend (hangup webhook may have set a more specific status)
        const actualStatus = await fetchActualCallStatus(callLogId);
        if (actualStatus) {
          setLocalStatus(actualStatus);
        }
      }

      setCallLogId(null);
      queryClient.invalidateQueries({ queryKey: ["dialer", "callLogs"] });
    });

    plivoClientRef.current = client;

    try {
      client.loginWithAccessToken(token);
    } catch (error) {
      clearTimeout(loginTimeout);
      reject(error);
    }
  });
};

  const handleStartCall = async () => {
    // Unlock audio on the user's click so Plivo can play ringback/connect tones.
    await unlockPlivoAudio();
    ensureDefaultOutputDevice();
    
    if (!sdkReady) {
      toast({
        title: "Plivo SDK not ready",
        description: "Please wait a moment and try again.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedFrom) {
      toast({
        title: "Select a From number",
        description: "Choose one of your active phone numbers.",
        variant: "destructive",
      });
      return;
    }

    const cleanedTo = stripSpaces(toPhoneNumber);
    if (!cleanedTo) {
      toast({
        title: "Enter a destination",
        description: "Provide a valid phone number (digits with country code).",
        variant: "destructive",
      });
      return;
    }

    setLocalStatus("initiating");

    // 1) Persist call log first (so Answer/Hangup can correlate)
    const createResp = await authenticatedFetch(API_ENDPOINTS.PLIVO_DIALER.CALLS, {
      method: "POST",
      body: JSON.stringify({
        fromPhoneNumberId: selectedFrom.id,
        toPhoneNumber: cleanedTo,
      }),
    });

    if (!createResp.ok) {
      toast({
        title: "Failed to create call log",
        description: `HTTP ${createResp.status}`,
        variant: "destructive",
      });
      setLocalStatus("idle");
      return;
    }

    const createJson = await createResp.json();
    const newCallLogId = createJson?.data?.id as string | undefined;
    if (!newCallLogId) {
      toast({
        title: "Failed to create call log",
        description: "Backend returned no call id.",
        variant: "destructive",
      });
      setLocalStatus("idle");
      return;
    }

    setCallLogId(newCallLogId);

    // 2) Mint Plivo token
    const tokenResp = await authenticatedFetch(API_ENDPOINTS.PLIVO_DIALER.TOKEN);
    if (!tokenResp.ok) {
      toast({
        title: "Failed to mint Plivo token",
        description: `HTTP ${tokenResp.status}`,
        variant: "destructive",
      });
      setLocalStatus("idle");
      return;
    }

    const tokenJson = await tokenResp.json();
    const tokenData = tokenJson?.data as PlivoDialerTokenResponse | undefined;

    if (!tokenData?.token || !tokenData?.plivoNumber) {
      toast({
        title: "Invalid token response",
        description: "Backend response missing token or Plivo number.",
        variant: "destructive",
      });
      setLocalStatus("idle");
      return;
    }

    // 3) Ensure client and login (wait for login to complete)
    setIsConnecting(true);
    try {
      await ensurePlivoClient(tokenData.token);
    } catch (error: any) {
      setIsConnecting(false);
      toast({
        title: "Failed to connect to Plivo",
        description: error?.message || "Unable to establish connection. Please try again.",
        variant: "destructive",
      });
      setLocalStatus("idle");
      setCallLogId(null);
      await updateCallStatus(newCallLogId, "failed", {
        hangupReason: error?.message || "Login failed",
      });
      return;
    }
    setIsConnecting(false);

    // 4) Place call via the Plivo number and pass destination + correlation headers
    const fromDigits = stripSpaces(selectedFrom.phoneNumber);

    try {
      setIsCalling(true);
      setLocalStatus("calling");
      await updateCallStatus(newCallLogId, "calling");

      // Re-assert tone settings right before dialing (helps when SDK reconnects).
      try {
        plivoClientRef.current?.setRingToneBack?.(true);
        plivoClientRef.current?.setConnectTone?.(true);
      } catch {
        // ignore
      }

      plivoClientRef.current.call(tokenData.plivoNumber, {
        "X-PH-Dest": cleanedTo,
        "X-PH-CallLogId": newCallLogId,
        "X-PH-From": fromDigits,
      });
    } catch (error: any) {
      setIsCalling(false);
      setLocalStatus("failed");

      await updateCallStatus(newCallLogId, "failed", {
        hangupReason: error?.message || "Call initiation failed",
      });

      toast({
        title: "Call failed",
        description: error?.message || "Unable to start the call.",
        variant: "destructive",
      });

      setCallLogId(null);
    }
  };

  const handleHangup = async () => {
    try {
      plivoClientRef.current?.hangup?.();
    } catch {
      // ignore
    }

    if (callLogId) {
      await updateCallStatus(callLogId, "hangup");
    }

    setIsCalling(false);
    setLocalStatus("hangup");
    setCallLogId(null);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Make a Call</h2>
          <p className="text-sm text-muted-foreground">
            Browser dialer (Plivo SDK v2) — two-way audio, outbound PSTN.
          </p>
        </div>
        <Badge variant={sdkReady ? "secondary" : "outline"}>
          {sdkReady ? "SDK Ready" : "Loading SDK"}
        </Badge>
      </div>

      <Card className={theme === "dark" ? "bg-black border-slate-700" : ""}>
        <CardHeader>
          <CardTitle className="text-lg">New Call</CardTitle>
          <CardDescription>
            Select a From number, enter a destination number (country code), then click Call.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">From</div>
              <Select value={selectedFromId} onValueChange={setSelectedFromId}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingPhoneNumbers ? "Loading..." : "Select a number"} />
                </SelectTrigger>
                <SelectContent>
                  {activePhoneNumbers.map((pn) => (
                    <SelectItem key={pn.id} value={pn.id}>
                      {pn.name} — {pn.phoneNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedFrom?.agentName ? (
                <div className="text-xs text-muted-foreground">
                  Assigned to agent: {selectedFrom.agentName}
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">To</div>
              <Input
                value={toPhoneNumber}
                onChange={(e) => setToPhoneNumber(e.target.value)}
                placeholder="e.g. +919876543210 or 919876543210"
              />
              <div className="text-xs text-muted-foreground">
                Tip: remove spaces; include country code.
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Status</div>
              <div className="flex items-center gap-2">
                <Badge variant={getBadgeVariant(localStatus)}>{getStatusLabel(localStatus)}</Badge>
                <Badge variant={isLoggedIn ? "secondary" : "outline"}>
                  {isLoggedIn ? "Logged In" : "Not Logged In"}
                </Badge>
                {callLogId ? <Badge variant="outline">Log: {callLogId}</Badge> : null}
              </div>
              <div className="flex gap-2 pt-1">
                {!isCalling ? (
                  <Button 
                    onClick={handleStartCall} 
                    disabled={!sdkReady || isConnecting}
                  >
                    {isConnecting ? "Connecting..." : "Call"}
                  </Button>
                ) : (
                  <Button variant="destructive" onClick={handleHangup}>
                    Hang up
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
