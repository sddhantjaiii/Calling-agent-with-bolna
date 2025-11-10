import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Mail, Bell, TrendingUp, Shield, Megaphone, Calendar } from 'lucide-react';
import { apiService } from '@/services/apiService';

interface NotificationPreference {
  id: string;
  user_id: string;
  low_credit_alerts: boolean;
  credits_added_emails: boolean;
  campaign_summary_emails: boolean;
  meeting_booked_notifications: boolean;
  email_verification_reminders: boolean;
  marketing_emails: boolean;
  created_at: string;
  updated_at: string;
}

interface PreferenceItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

const PreferenceItem: React.FC<PreferenceItemProps> = ({
  icon,
  title,
  description,
  enabled,
  onChange,
  disabled = false,
}) => {
  return (
    <div className="flex items-start justify-between py-4 border-b last:border-0">
      <div className="flex items-start space-x-4 flex-1">
        <div className="mt-1 text-muted-foreground">{icon}</div>
        <div className="flex-1 space-y-1">
          <Label htmlFor={title} className="text-sm font-medium cursor-pointer">
            {title}
          </Label>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch
        id={title}
        checked={enabled}
        onCheckedChange={onChange}
        disabled={disabled}
        className="ml-4"
      />
    </div>
  );
};

export const NotificationPreferences: React.FC = () => {
  const [preferences, setPreferences] = useState<NotificationPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();

  // Local state for preferences
  const [localPrefs, setLocalPrefs] = useState({
    low_credit_alerts: true,
    credits_added_emails: true,
    campaign_summary_emails: true,
    meeting_booked_notifications: true,
    email_verification_reminders: true,
    marketing_emails: true,
  });

  // Fetch preferences on mount
  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      setLoading(true);
      
      const response = await apiService.get('/user-notifications/preferences');

      if (response.preferences) {
        setPreferences(response.preferences);
        setLocalPrefs({
          low_credit_alerts: response.preferences.low_credit_alerts,
          credits_added_emails: response.preferences.credits_added_emails,
          campaign_summary_emails: response.preferences.campaign_summary_emails,
          meeting_booked_notifications: response.preferences.meeting_booked_notifications,
          email_verification_reminders: response.preferences.email_verification_reminders,
          marketing_emails: response.preferences.marketing_emails,
        });
      }
    } catch (error: any) {
      console.error('Error fetching notification preferences:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load notification preferences',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePreferenceChange = (key: keyof typeof localPrefs, value: boolean) => {
    setLocalPrefs((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const response = await apiService.put('/user-notifications/preferences', localPrefs);

      if (response.preferences) {
        setPreferences(response.preferences);
        setHasChanges(false);
        toast({
          title: 'Success',
          description: 'Notification preferences updated successfully',
        });
      }
    } catch (error: any) {
      console.error('Error updating notification preferences:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update notification preferences',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (preferences) {
      setLocalPrefs({
        low_credit_alerts: preferences.low_credit_alerts,
        credits_added_emails: preferences.credits_added_emails,
        campaign_summary_emails: preferences.campaign_summary_emails,
        meeting_booked_notifications: preferences.meeting_booked_notifications,
        email_verification_reminders: preferences.email_verification_reminders,
        marketing_emails: preferences.marketing_emails,
      });
      setHasChanges(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Email Notification Preferences
        </CardTitle>
        <CardDescription>
          Manage your email notification settings. You can opt in or out of different types of
          notifications at any time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <PreferenceItem
            icon={<TrendingUp className="h-5 w-5" />}
            title="Low Credit Alerts"
            description="Get notified when your credit balance is running low (15, 5, or 0 credits remaining)"
            enabled={localPrefs.low_credit_alerts}
            onChange={(value) => handlePreferenceChange('low_credit_alerts', value)}
          />

          <PreferenceItem
            icon={<Mail className="h-5 w-5" />}
            title="Credits Added Emails"
            description="Receive confirmation emails when credits are added to your account"
            enabled={localPrefs.credits_added_emails}
            onChange={(value) => handlePreferenceChange('credits_added_emails', value)}
          />

          <PreferenceItem
            icon={<TrendingUp className="h-5 w-5" />}
            title="Campaign Summary Emails"
            description="Get detailed summaries with hot leads and statistics when campaigns complete"
            enabled={localPrefs.campaign_summary_emails}
            onChange={(value) => handlePreferenceChange('campaign_summary_emails', value)}
          />

          <PreferenceItem
            icon={<Calendar className="h-5 w-5" />}
            title="Meeting Booked Notifications"
            description="Get notified with full call details when AI agents schedule meetings with leads"
            enabled={localPrefs.meeting_booked_notifications}
            onChange={(value) => handlePreferenceChange('meeting_booked_notifications', value)}
          />

          <PreferenceItem
            icon={<Shield className="h-5 w-5" />}
            title="Email Verification Reminders"
            description="Receive reminders to verify your email address (important for account security)"
            enabled={localPrefs.email_verification_reminders}
            onChange={(value) => handlePreferenceChange('email_verification_reminders', value)}
          />

          <PreferenceItem
            icon={<Megaphone className="h-5 w-5" />}
            title="Marketing Emails"
            description="Receive product updates, tips, and promotional offers (coming soon)"
            enabled={localPrefs.marketing_emails}
            onChange={(value) => handlePreferenceChange('marketing_emails', value)}
          />
        </div>

        {hasChanges && (
          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={saving}
            >
              Reset
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        )}

        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            <strong>Note:</strong> Email verification notifications cannot be disabled as they are
            required for account security. All emails respect system-wide notification settings
            configured by administrators.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default NotificationPreferences;
