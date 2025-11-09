/**
 * Google Calendar OAuth Callback Handler
 * 
 * This component handles the OAuth redirect from Google after the user authorizes calendar access.
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { toast } from "sonner";

const GoogleCalendarCallback = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [message, setMessage] = useState("Processing Google Calendar authorization...");

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const error = searchParams.get("error");

      // Check for OAuth error
      if (error) {
        setStatus("error");
        setMessage(
          error === "access_denied"
            ? "You denied access to Google Calendar. Please try again if you'd like to connect."
            : `Authorization failed: ${error}`
        );
        toast.error("Failed to connect Google Calendar");
        setTimeout(() => navigate("/integrations"), 3000);
        return;
      }

      // Check for required parameters
      if (!code || !state) {
        setStatus("error");
        setMessage("Invalid callback parameters. Please try connecting again.");
        toast.error("Invalid callback from Google");
        setTimeout(() => navigate("/integrations"), 3000);
        return;
      }

      // Exchange code for tokens via backend
      const token = localStorage.getItem("auth_token");
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/integrations/google/callback?code=${code}&state=${state}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setStatus("success");
        setMessage(`Successfully connected to Google Calendar! (${data.google_email})`);
        toast.success("Google Calendar connected successfully!");
        
        // Redirect to integrations page after 2 seconds
        setTimeout(() => navigate("/integrations"), 2000);
      } else {
        const errorData = await response.json();
        setStatus("error");
        setMessage(errorData.message || "Failed to connect Google Calendar");
        toast.error("Failed to connect Google Calendar");
        setTimeout(() => navigate("/integrations"), 3000);
      }
    } catch (error) {
      console.error("Callback error:", error);
      setStatus("error");
      setMessage("An unexpected error occurred. Please try again.");
      toast.error("Failed to connect Google Calendar");
      setTimeout(() => navigate("/integrations"), 3000);
    }
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center ${
        theme === "dark" ? "bg-black" : "bg-gray-50"
      }`}
    >
      <div
        className={`max-w-md w-full mx-4 p-8 rounded-lg shadow-lg border ${
          theme === "dark"
            ? "bg-gray-800 border-gray-700"
            : "bg-white border-gray-200"
        }`}
      >
        <div className="text-center">
          {/* Status Icon */}
          <div className="flex justify-center mb-4">
            {status === "processing" && (
              <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
            )}
            {status === "success" && (
              <CheckCircle className="w-16 h-16 text-green-500" />
            )}
            {status === "error" && (
              <XCircle className="w-16 h-16 text-red-500" />
            )}
          </div>

          {/* Title */}
          <h2
            className={`text-2xl font-bold mb-2 ${
              theme === "dark" ? "text-white" : "text-gray-900"
            }`}
          >
            {status === "processing" && "Connecting..."}
            {status === "success" && "Connection Successful!"}
            {status === "error" && "Connection Failed"}
          </h2>

          {/* Message */}
          <p
            className={`text-sm ${
              theme === "dark" ? "text-slate-400" : "text-gray-600"
            }`}
          >
            {message}
          </p>

          {/* Redirect Notice */}
          <p
            className={`text-xs mt-4 ${
              theme === "dark" ? "text-slate-500" : "text-gray-500"
            }`}
          >
            Redirecting to integrations page...
          </p>
        </div>
      </div>
    </div>
  );
};

export default GoogleCalendarCallback;
