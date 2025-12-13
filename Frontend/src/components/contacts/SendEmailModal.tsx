import React, { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, Loader2, Send, Paperclip, X, AlertCircle, ExternalLink } from 'lucide-react';
import { API_BASE_URL } from '@/config/api';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/utils/auth';
import type { Contact } from '@/types/api';

interface GmailStatus {
  connected: boolean;
  hasGmailScope: boolean;
  email?: string;
  requiresReconnect?: boolean;
  message: string;
}

interface SendEmailModalProps {
  open: boolean;
  contact: Contact | null;
  onClose: () => void;
  onEmailSent?: (emailId: string) => void;
}

interface Attachment {
  file: File;
  filename: string;
  contentType: string;
  size: number;
}

export function SendEmailModal({
  open,
  contact,
  onClose,
  onEmailSent,
}: SendEmailModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [isCheckingGmail, setIsCheckingGmail] = useState(false);

  // Get contact email
  const contactEmail = contact 
    ? ((contact as any).email || contact.email) 
    : '';

  // Check Gmail connection status when modal opens
  useEffect(() => {
    if (open) {
      checkGmailStatus();
    }
  }, [open]);

  const checkGmailStatus = async () => {
    setIsCheckingGmail(true);
    try {
      const response = await authenticatedFetch('/api/integrations/gmail/status');
      const data = await response.json();
      
      if (data.success) {
        // API returns flat structure: { success, connected, hasGmailScope, ... }
        setGmailStatus({
          connected: data.connected,
          hasGmailScope: data.hasGmailScope,
          requiresReconnect: data.requiresReconnect,
          email: data.email,
          message: data.message
        });
      } else {
        setGmailStatus({
          connected: false,
          hasGmailScope: false,
          message: 'Failed to check Gmail status'
        });
      }
    } catch (error) {
      console.error('Failed to check Gmail status:', error);
      setGmailStatus({
        connected: false,
        hasGmailScope: false,
        message: 'Failed to check Gmail status'
      });
    } finally {
      setIsCheckingGmail(false);
    }
  };

  const handleConnectGmail = () => {
    // Redirect to integrations page for Google reconnection
    window.location.href = '/settings/integrations';
  };

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setSubject('');
      setBody('');
      setCc('');
      setBcc('');
      setShowCc(false);
      setShowBcc(false);
      setAttachments([]);
      setGmailStatus(null);
    }
  }, [open]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const newAttachments: Attachment[] = [];
    const maxFileSize = 10 * 1024 * 1024; // 10MB

    Array.from(files).forEach(file => {
      if (file.size > maxFileSize) {
        toast({
          title: 'File too large',
          description: `${file.name} exceeds 10MB limit`,
          variant: 'destructive',
        });
        return;
      }

      newAttachments.push({
        file,
        filename: file.name,
        contentType: file.type,
        size: file.size,
      });
    });

    setAttachments(prev => [...prev, ...newAttachments]);
    setIsUploading(false);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data:*/*;base64, prefix
        const base64 = result.split(',')[1];
        console.log('📎 FileReader result:', {
          filename: file.name,
          fileSize: file.size,
          dataUrlLength: result.length,
          base64Length: base64?.length || 0,
          expectedBase64Length: Math.ceil(file.size * 4 / 3),
        });
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleSendEmail = async () => {
    if (!contact) {
      toast({
        title: 'No contact selected',
        description: 'Please select a contact to send email to.',
        variant: 'destructive',
      });
      return;
    }

    if (!contactEmail) {
      toast({
        title: 'Missing email address',
        description: 'Contact does not have an email address.',
        variant: 'destructive',
      });
      return;
    }

    if (!subject.trim()) {
      toast({
        title: 'Subject required',
        description: 'Please enter an email subject.',
        variant: 'destructive',
      });
      return;
    }

    if (!body.trim()) {
      toast({
        title: 'Message required',
        description: 'Please enter an email message.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      // Convert attachments to base64
      const attachmentData = await Promise.all(
        attachments.map(async (att) => ({
          filename: att.filename,
          content: await fileToBase64(att.file),
          contentType: att.contentType,
          size: att.size,
        }))
      );

      // Debug: Log attachment sizes before sending
      console.log('📤 Sending email with attachments:', {
        count: attachmentData.length,
        attachments: attachmentData.map(att => ({
          filename: att.filename,
          contentType: att.contentType,
          originalSize: att.size,
          base64Length: att.content?.length || 0,
        })),
      });

      // Parse CC and BCC emails (comma-separated)
      const ccEmails = cc
        .split(',')
        .map(e => e.trim())
        .filter(e => e);
      const bccEmails = bcc
        .split(',')
        .map(e => e.trim())
        .filter(e => e);

      // Convert plain text body to simple HTML
      const bodyHtml = body
        .split('\n')
        .map(line => `<p>${line || '&nbsp;'}</p>`)
        .join('');

      const response = await authenticatedFetch('/api/contact-emails/send', {
        method: 'POST',
        body: JSON.stringify({
          contactId: contact.id,
          to: contactEmail,
          toName: contact.name,
          cc: ccEmails.length > 0 ? ccEmails : undefined,
          bcc: bccEmails.length > 0 ? bccEmails : undefined,
          subject,
          bodyHtml,
          bodyText: body,
          attachments: attachmentData.length > 0 ? attachmentData : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        // Handle Gmail connection errors specifically
        if (data.code === 'GMAIL_NOT_CONNECTED' || data.code === 'GMAIL_RECONNECT_REQUIRED') {
          setGmailStatus({
            connected: false,
            hasGmailScope: false,
            requiresReconnect: data.requiresReconnect,
            message: data.error
          });
          throw new Error(data.error);
        }
        throw new Error(data.error || 'Failed to send email');
      }

      console.log('✅ Email sent successfully:', {
        emailId: data.data.emailId,
        to: contactEmail,
        subject,
        attachments: attachments.length,
      });

      toast({
        title: 'Email sent!',
        description: `Email sent successfully to ${contact.name}`,
      });

      if (onEmailSent) {
        onEmailSent(data.data.emailId);
      }

      onClose();
    } catch (error) {
      console.error('❌ Error sending email:', error);
      toast({
        title: 'Failed to send email',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Send Email
          </DialogTitle>
          <DialogDescription>
            Send an email to {contact?.name || 'contact'}
            {gmailStatus?.connected && gmailStatus?.email && (
              <span className="block text-xs mt-1 text-muted-foreground">
                Sending from: {gmailStatus.email}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Gmail Connection Warning */}
        {isCheckingGmail ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm text-muted-foreground">Checking Gmail connection...</span>
          </div>
        ) : gmailStatus && (!gmailStatus.connected || !gmailStatus.hasGmailScope) ? (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>
                {gmailStatus.requiresReconnect
                  ? 'Please reconnect Google to enable email sending with Gmail scope.'
                  : 'Please connect your Gmail account to send emails.'}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleConnectGmail}
                className="ml-4 whitespace-nowrap"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                {gmailStatus.requiresReconnect ? 'Reconnect Google' : 'Connect Gmail'}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-4">
          {/* To Field (Read-only) */}
          <div>
            <Label htmlFor="to" className="text-sm font-medium">To</Label>
            <Input
              id="to"
              value={contactEmail}
              disabled
              className="bg-muted text-foreground mt-1.5"
            />
          </div>

          {/* CC/BCC Buttons */}
          {!showCc && !showBcc && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowCc(true)}
              >
                Add CC
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowBcc(true)}
              >
                Add BCC
              </Button>
            </div>
          )}

          {/* CC Field */}
          {showCc && (
            <div>
              <Label htmlFor="cc">CC (comma-separated)</Label>
              <Input
                id="cc"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="email1@example.com, email2@example.com"
              />
            </div>
          )}

          {/* BCC Field */}
          {showBcc && (
            <div>
              <Label htmlFor="bcc">BCC (comma-separated)</Label>
              <Input
                id="bcc"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="email1@example.com, email2@example.com"
              />
            </div>
          )}

          {/* Subject Field */}
          <div>
            <Label htmlFor="subject" className="text-sm font-medium">Subject *</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter email subject"
              className="mt-1.5"
              required
            />
          </div>

          {/* Message Body */}
          <div>
            <Label htmlFor="body" className="text-sm font-medium">Message *</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type your message here..."
              className="min-h-[200px] resize-none mt-1.5"
              required
            />
          </div>

          {/* Attachments Section */}
          <div>
            <Label className="text-sm font-medium">Attachments</Label>
            <div className="space-y-2 mt-1.5">
              {/* Attachment List */}
              {attachments.length > 0 && (
                <div className="space-y-2 p-3 bg-muted/50 rounded-lg border">
                  {attachments.map((att, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-background rounded-md border"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Paperclip className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium truncate">{att.filename}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatFileSize(att.size)}
                          </span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveAttachment(index)}
                        className="flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Attachment Button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full"
              >
                <Paperclip className="w-4 h-4 mr-2" />
                {isUploading ? 'Uploading...' : 'Attach Files'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                accept="*/*"
              />
              <p className="text-xs text-gray-500">
                Maximum file size: 10MB per file
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSendEmail}
            disabled={
              isSending || 
              isUploading || 
              isCheckingGmail ||
              !contactEmail || 
              !subject.trim() || 
              !body.trim() ||
              !gmailStatus?.connected ||
              !gmailStatus?.hasGmailScope
            }
            className="gap-2"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send Email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
