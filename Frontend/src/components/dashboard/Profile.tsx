import { useState, useEffect } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  Clock,
  Shield,
  Bell,
  Moon,
  Sun,
  Settings,
  Crown,
  Zap,
  Loader2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { apiService } from "@/services/apiService";
import { User as UserType, CreditBalance, CreditStats } from "@/types/api";
import { toast } from "sonner";
import SettingsCard from "./SettingsCard";
import { OpenAIPromptsConfig } from "./OpenAIPromptsConfig";

const Profile = () => {
  const { theme, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserType | null>(null);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [creditStats, setCreditStats] = useState<CreditStats | null>(null);

  const [notificationPrefs, setNotificationPrefs] = useState({
    lowCreditAlerts: true,
    campaignSummaryEmails: true,
  });
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Fetch user data on component mount
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        console.log('Starting to fetch user data...');

        // Fetch user profile, credits, credit stats, and notification preferences in parallel
        const [profileResponse, creditsResponse, statsResponse, prefsResponse] = await Promise.all([
          apiService.getUserProfile(),
          apiService.getUserCredits(),
          apiService.getCreditStats(),
          fetch(`${import.meta.env.VITE_API_BASE_URL}/api/user-notifications/preferences`, {
            headers: { 
              'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
              'Content-Type': 'application/json'
            },
          }).then(res => res.json()).catch(() => null),
        ]);

        console.log('Profile Response:', profileResponse);
        console.log('Credits Response:', creditsResponse);
        console.log('Stats Response:', statsResponse);
        console.log('Notification Preferences Response:', prefsResponse);

        // Handle different response formats from backend
        if (profileResponse.success && profileResponse.data) {
          // Standard ApiResponse format: { success: true, data: { user: {...} } }
          const userData = (profileResponse.data as any).user || profileResponse.data;
          console.log('Setting user profile from ApiResponse:', userData);
          setUserProfile(userData as UserType);
        } else if ((profileResponse as any).user) {
          // Direct response format: { user: {...} }
          console.log('Setting user profile from direct response:', (profileResponse as any).user);
          setUserProfile((profileResponse as any).user as UserType);
        } else {
          console.error('Profile response failed:', profileResponse);
        }

        if (creditsResponse.success && creditsResponse.data) {
          setCreditBalance(creditsResponse.data);
        } else if ((creditsResponse as any).credits !== undefined) {
          // Handle direct response format
          setCreditBalance(creditsResponse as any);
        }

        if (statsResponse.success && statsResponse.data) {
          setCreditStats(statsResponse.data);
        } else if ((statsResponse as any).currentBalance !== undefined) {
          // Handle direct response format
          setCreditStats(statsResponse as any);
        }

        // Load notification preferences
        if (prefsResponse?.preferences) {
          setNotificationPrefs({
            lowCreditAlerts: prefsResponse.preferences.low_credit_alerts,
            campaignSummaryEmails: prefsResponse.preferences.campaign_summary_emails,
          });
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        // Use setTimeout to avoid setState during render
        setTimeout(() => {
          toast.error('Failed to load profile data');
        }, 0);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  const handlePurchaseCredits = () => {
    // Navigate to billing page or open credit purchase modal
    toast.info("Redirecting to credit purchase...");
  };

  const handleUpgradePlan = () => {
    // Navigate to billing/subscription page
    toast.info("Redirecting to plan upgrade...");
  };

  const handleProfileSave = async (data: any) => {
    try {
      const response = await apiService.updateUserProfile(data);
      if (response.success && response.data) {
        setUserProfile(response.data);
        toast.success("Profile updated successfully!");
      }
    } catch (error) {
      console.error('Failed to update profile:', error);
      toast.error('Failed to update profile');
    }
  };

  const handleNotificationPrefsUpdate = async (key: keyof typeof notificationPrefs, value: boolean) => {
    try {
      setSavingPrefs(true);
      
      // Update local state immediately for better UX
      const updatedPrefs = { ...notificationPrefs, [key]: value };
      setNotificationPrefs(updatedPrefs);

      // Map to backend format
      const backendPrefs = {
        low_credit_alerts: updatedPrefs.lowCreditAlerts,
        campaign_summary_emails: updatedPrefs.campaignSummaryEmails,
      };

      // Send to backend
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/user-notifications/preferences`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(backendPrefs),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update preferences');
      }

      toast.success("Notification preferences updated!");
    } catch (error) {
      console.error('Failed to update notification preferences:', error);
      // Revert on error
      setNotificationPrefs(notificationPrefs);
      toast.error('Failed to update notification preferences');
    } finally {
      setSavingPrefs(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" role="status" aria-label="Loading profile data" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground">
            Manage your account and preferences
          </p>
        </div>
        <Settings className="w-8 h-8 text-muted-foreground" />
      </div>

      {/* Integrated Settings Card with real profile data */}
      {userProfile && (
        <div className="max-w-4xl">
          <SettingsCard
            profileData={{
              name: userProfile.name || "",
              email: userProfile.email || "",
              company: userProfile.company || "",
              website: userProfile.website || "",
              location: userProfile.location || "",
              bio: userProfile.bio || "",
              phone: userProfile.phone || "",
            }}
            onSave={handleProfileSave}
          />
        </div>
      )}

      {!userProfile && !loading && (
        <div className="max-w-4xl">
          <Card>
            <CardContent className="p-6">
              <div className="text-center text-muted-foreground">
                Failed to load profile data. Please refresh the page.
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* OpenAI Analysis Configuration */}
      <div className="max-w-4xl">
        <OpenAIPromptsConfig />
      </div>

      {/* Subscription & Usage - Real Data */}
      <div className="max-w-4xl">
        <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-yellow-500" />
            Subscription & Usage
          </CardTitle>
          <CardDescription>
            Monitor your credit usage and account status
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div>
              <h3 className="font-semibold text-lg">
                Current Plan: {userProfile?.role === 'admin' ? 'Admin' : 'Standard'}
              </h3>
              <p className="text-sm text-muted-foreground">
                Account Status: {userProfile?.isActive ? 'Active' : 'Inactive'} •
                Member since {userProfile?.createdAt ? (() => {
                  try {
                    const date = new Date(userProfile.createdAt);
                    return isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleDateString();
                  } catch {
                    return 'Invalid date';
                  }
                })() : 'Loading...'}
              </p>
            </div>
            <Button
              onClick={handleUpgradePlan}
              variant="outline"
              className="gap-2"
            >
              <Zap className="w-4 h-4" />
              Manage Plan
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Credits - Real Data */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-blue-500" />
                    <span className="font-medium">Credits</span>
                  </div>
                  <Badge variant="secondary">
                    {Number(creditBalance?.credits || userProfile?.credits || 0)} available
                  </Badge>
                </div>
                <div className="space-y-3">
                  {creditStats && (
                    <>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(
                              Math.round(((creditStats.currentBalance || 0) / Math.max(creditStats.totalPurchased || 1, 100)) * 100),
                              100
                            )}%`,
                          }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>{Number(creditStats.currentBalance || 0)} / {Number(creditStats.totalPurchased || creditStats.currentBalance || 0)}</span>
                        <span>Used: {Number(creditStats.totalUsed || 0)}</span>
                      </div>
                      {creditStats.projectedRunoutDate && (
                        <p className="text-xs text-muted-foreground">
                          Projected runout: {(() => {
                            try {
                              const date = new Date(creditStats.projectedRunoutDate);
                              return isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleDateString();
                            } catch {
                              return 'Invalid date';
                            }
                          })()}
                        </p>
                      )}
                    </>
                  )}
                  <Button
                    onClick={handlePurchaseCredits}
                    size="sm"
                    className="w-full"
                  >
                    Purchase More Credits
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Usage Stats */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-green-500" />
                    <span className="font-medium">Usage Stats</span>
                  </div>
                  <Badge variant="secondary">
                    {Number(creditStats?.transactionCount || 0)} transactions
                  </Badge>
                </div>
                <div className="space-y-3">
                  {creditStats && (
                    <>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Total Purchased:</span>
                          <span className="font-medium">{Number(creditStats.totalPurchased || 0)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Total Used:</span>
                          <span className="font-medium">{Number(creditStats.totalUsed || 0)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Daily Average:</span>
                          <span className="font-medium">{Number(creditStats.averageUsagePerDay || 0).toFixed(1)}</span>
                        </div>
                        {Number(creditStats.totalBonus || 0) > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Bonus Credits:</span>
                            <span className="font-medium text-green-600">{Number(creditStats.totalBonus || 0)}</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  <Button
                    onClick={() => toast.info("Viewing usage history...")}
                    size="sm"
                    className="w-full"
                    variant="outline"
                  >
                    View Usage History
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
      </div>

      {/* Quick Preferences */}
      <div className="max-w-4xl">
        <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Quick Preferences
          </CardTitle>
          <CardDescription>
            Quick access to common settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Theme Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {theme === "dark" ? (
                <Moon className="w-5 h-5" />
              ) : (
                <Sun className="w-5 h-5" />
              )}
              <div>
                <p className="text-base font-medium">Theme</p>
                <p className="text-sm text-muted-foreground">
                  Choose between light and dark mode
                </p>
              </div>
            </div>
            <Button onClick={toggleTheme} variant="outline" size="sm">
              {theme === "dark" ? "Switch to Light" : "Switch to Dark"}
            </Button>
          </div>

          <Separator />

          {/* Email Notifications - Low Credits Alert and Campaign Summary */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              <p className="text-base font-medium">Email Notifications</p>
            </div>

            <div className="space-y-4 ml-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Low Credits Alert</p>
                  <p className="text-sm text-muted-foreground">
                    Receive email alerts when credits are running low
                  </p>
                </div>
                <Switch
                  checked={notificationPrefs.lowCreditAlerts}
                  onCheckedChange={(checked) => handleNotificationPrefsUpdate('lowCreditAlerts', checked)}
                  disabled={savingPrefs}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Campaign Summary</p>
                  <p className="text-sm text-muted-foreground">
                    Receive email summaries when campaigns complete
                  </p>
                </div>
                <Switch
                  checked={notificationPrefs.campaignSummaryEmails}
                  onCheckedChange={(checked) => handleNotificationPrefsUpdate('campaignSummaryEmails', checked)}
                  disabled={savingPrefs}
                />
              </div>
            </div>
          </div>

          {savingPrefs && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving preferences...</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Account Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Account Information
          </CardTitle>
          <CardDescription>
            View your account details and security status
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {userProfile ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Account ID</p>
                  <p className="text-sm font-mono bg-muted px-2 py-1 rounded">
                    {String(userProfile.id).substring(0, 8)}...
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Email Verified</p>
                  <Badge variant={userProfile.emailVerified ? "default" : "destructive"}>
                    {userProfile.emailVerified ? "Verified" : "Not Verified"}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Auth Provider</p>
                  <Badge variant="outline" className="capitalize">
                    {userProfile.authProvider}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Account Role</p>
                  <Badge variant="outline" className="capitalize">
                    {userProfile.role}
                  </Badge>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Account Created</p>
                <p className="text-sm">
                  {(() => {
                    try {
                      const date = new Date(userProfile.createdAt);
                      return isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      });
                    } catch {
                      return 'Invalid date';
                    }
                  })()}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Last Updated</p>
                <p className="text-sm">
                  {(() => {
                    try {
                      const date = new Date(userProfile.updatedAt);
                      return isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      });
                    } catch {
                      return 'Invalid date';
                    }
                  })()}
                </p>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading account information...</span>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
};

export default Profile;
