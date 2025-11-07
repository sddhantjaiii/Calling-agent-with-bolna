import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/components/theme/ThemeProvider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Upload, X, FileText, CheckCircle, AlertCircle, Download, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { authenticatedFetch, getAuthHeaders } from '@/utils/auth';
import { CampaignCreditEstimator } from '@/components/campaigns/CampaignCreditEstimator';
import { useCreditToasts } from '@/components/ui/ToastProvider';
import * as XLSX from 'xlsx';

interface CreateCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  preSelectedContacts?: string[]; // For bulk call button integration
}

interface CsvUploadResult {
  campaignId: string;
  totalRows: number;
  contactsCreated: number;
  contactsSkipped: number;
  invalidRows: number;
  skippedContacts?: Array<{
    row: number;
    phone: string;
    reason: string;
  }>;
}

const CreateCampaignModal: React.FC<CreateCampaignModalProps> = ({
  isOpen,
  onClose,
  preSelectedContacts = [],
}) => {
  const { theme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [maxConcurrentCalls, setMaxConcurrentCalls] = useState('1');
  const [firstCallTime, setFirstCallTime] = useState('09:00');
  const [lastCallTime, setLastCallTime] = useState('17:00');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [nextAction, setNextAction] = useState('call');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<CsvUploadResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedContactCount, setParsedContactCount] = useState(0);
  
  // Credit estimation states
  const [showEstimator, setShowEstimator] = useState(false);
  const [estimatedContactCount, setEstimatedContactCount] = useState(0);
  const [pendingCampaignData, setPendingCampaignData] = useState<any>(null);
  
  // Updated credits toast hook signature (remove non-existent showCreditInsufficient)
  const { showInsufficientCreditsToast } = useCreditToasts();

  // Fetch agents for selection
  const { data: agentsData } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const response = await authenticatedFetch('/api/agents');
      if (!response.ok) throw new Error('Failed to fetch agents');
      return response.json();
    },
  });

  const agents = (agentsData?.data || []).filter(
    (agent: any) => agent.type === 'CallAgent' || agent.agent_type === 'call'
  );

  // Fetch user's concurrency settings
  const { data: concurrencySettings } = useQuery({
    queryKey: ['concurrency-settings'],
    queryFn: async () => {
      const response = await authenticatedFetch('/api/settings/concurrency');
      if (!response.ok) throw new Error('Failed to fetch settings');
      return response.json();
    },
  });

  const userConcurrencyLimit = concurrencySettings?.settings?.user_concurrent_calls_limit || 10;
  const availableSlots = concurrencySettings?.settings?.user_available_slots || 10;

  // Create campaign mutation (for contact-based campaigns)
  const createMutation = useMutation({
    mutationFn: async (data: { 
      name: string; 
      agent_id: string; 
      max_concurrent_calls: number; 
      contact_ids: string[];
      first_call_time: string;
      last_call_time: string;
      start_date: string;
      end_date?: string;
      next_action: string;
    }) => {
      const response = await authenticatedFetch('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || 'Failed to create campaign');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast({
        title: 'Campaign Created',
        description: 'Campaign has been created successfully',
      });
      setShowEstimator(false);
      setPendingCampaignData(null);
      setEstimatedContactCount(0);
      setIsUploading(false);
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      setShowEstimator(false);
      setIsUploading(false);
    },
  });

  // CSV upload mutation
  const uploadCsvMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await authenticatedFetch('/api/campaigns/upload-csv', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        // Try to parse error JSON; fallback to text
        let errMsg = 'Failed to upload file';
        try {
          const error = await response.json();
          errMsg = error.message || error.error || errMsg;
        } catch {
          const text = await response.text();
          if (text) errMsg = text;
        }
        throw new Error(errMsg);
      }
      return response.json();
    },
    onSuccess: (data: CsvUploadResult) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setUploadResult(data);
      toast({
        title: 'Campaign Created from CSV',
        description: `Created campaign with ${data.totalRows} contacts`,
      });
      setShowEstimator(false);
      setPendingCampaignData(null);
      setEstimatedContactCount(0);
      setIsUploading(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'CSV Upload Error',
        description: error.message,
        variant: 'destructive',
      });
      setShowEstimator(false);
      setIsUploading(false);
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!(/\.(csv|xlsx|xls)$/i).test(file.name)) {
        toast({
          title: 'Invalid File',
          description: 'Please select an Excel (.xlsx/.xls) or CSV (.csv) file',
          variant: 'destructive',
        });
        return;
      }
      
      // Parse file to count valid contacts
      try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array', raw: false });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as any[][];
        
        if (jsonData.length < 2) {
          setParsedContactCount(0);
        } else {
          // Get headers
          const headers = jsonData[0].map((h: any) => 
            h?.toString().toLowerCase().trim().replace(/\s+/g, '_')
          );
          
          // Find phone column index
          const phoneIndex = headers.findIndex((h: string) => 
            ['phone', 'phone_number', 'mobile', 'cell', 'phonenumber'].includes(h)
          );
          
          if (phoneIndex === -1) {
            toast({
              title: 'Invalid Template',
              description: 'Phone number column not found in the file',
              variant: 'destructive',
            });
            return;
          }
          
          // Count valid contacts (skip header, count rows with valid phone numbers)
          let validCount = 0;
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            
            // Skip empty rows
            if (!row || row.length === 0) continue;
            const hasContent = row.some((cell: any) => cell && cell.toString().trim() !== '');
            if (!hasContent) continue;
            
            // Check if phone number is valid
            const phone = row[phoneIndex];
            if (!phone) continue;
            
            const phoneStr = phone.toString().trim();
            const cleanPhone = phoneStr.replace(/\s+/g, '');
            
            // Skip rows without digits (instruction rows won't have phone numbers)
            if (!cleanPhone || !/\d/.test(cleanPhone)) continue;
            
            const digitCount = (cleanPhone.match(/\d/g) || []).length;
            if (digitCount < 10) continue;
            
            validCount++;
          }
          
          setParsedContactCount(validCount);
        }
      } catch (error) {
        console.error('Error parsing file:', error);
        toast({
          title: 'Parse Error',
          description: 'Failed to parse the file. Please ensure it\'s a valid Excel or CSV file.',
          variant: 'destructive',
        });
        return;
      }
      
      setCsvFile(file);
      setUploadResult(null);
    }
  };

  const handleRemoveFile = () => {
    setCsvFile(null);
    setParsedContactCount(0);
    setUploadResult(null);
  };

  const handleDownloadTemplate = async () => {
    try {
      // Use backend template endpoint (same as contacts)
      const response = await authenticatedFetch('/api/campaigns/template');
      
      if (!response.ok) {
        throw new Error('Failed to download template');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'campaign_contacts_template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: 'Template Downloaded',
        description: 'Excel template downloaded successfully. Phone numbers are pre-formatted to prevent Excel errors.',
      });
    } catch (error) {
      console.error('Failed to download campaign template:', error);
      toast({
        title: 'Download Failed',
        description: 'Failed to download template. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Campaign name is required',
        variant: 'destructive',
      });
      return;
    }

    if (!agentId) {
      toast({
        title: 'Validation Error',
        description: 'Please select an agent',
        variant: 'destructive',
      });
      return;
    }

    // Validate max concurrent calls doesn't exceed user limit
    const concurrentCallsNum = parseInt(maxConcurrentCalls);
    if (concurrentCallsNum > userConcurrencyLimit) {
      toast({
        title: 'Validation Error',
        description: `Max concurrent calls cannot exceed your limit of ${userConcurrencyLimit}`,
        variant: 'destructive',
      });
      return;
    }

    // Calculate contact count and show credit estimator
    let contactCount = 0;
    let campaignData: any = null;

    if (csvFile) {
      // Use the parsed contact count from file analysis
      contactCount = parsedContactCount;
      campaignData = {
        type: 'csv',
        name,
        agent_id: agentId,
        max_concurrent_calls: maxConcurrentCalls,
        first_call_time: firstCallTime,
        last_call_time: lastCallTime,
        start_date: startDate,
        end_date: endDate || undefined,
        next_action: nextAction,
        csvFile
      };
    } else if (preSelectedContacts.length > 0) {
      contactCount = preSelectedContacts.length;
      campaignData = {
        type: 'contacts',
        name,
        agent_id: agentId,
        max_concurrent_calls: parseInt(maxConcurrentCalls),
        contact_ids: preSelectedContacts,
        first_call_time: firstCallTime,
        last_call_time: lastCallTime,
        start_date: startDate,
        end_date: endDate || undefined,
        next_action: nextAction,
      };
    } else {
      toast({
        title: 'Validation Error',
        description: 'Please upload a CSV file or select contacts',
        variant: 'destructive',
      });
      return;
    }

    // Store data and show credit estimator
    setEstimatedContactCount(contactCount);
    setPendingCampaignData(campaignData);
    setShowEstimator(true);
  };

  // New function to handle confirmed campaign creation
  const handleEstimatorConfirm = async () => {
    if (!pendingCampaignData) return;

    try {
      if (pendingCampaignData.type === 'csv') {
        // Handle CSV upload
        setIsUploading(true);
        const formData = new FormData();
        // Use field name 'file' to match backend upload middleware
        formData.append('file', pendingCampaignData.csvFile);
        formData.append('name', pendingCampaignData.name);
        formData.append('agent_id', pendingCampaignData.agent_id);
        formData.append('max_concurrent_calls', pendingCampaignData.max_concurrent_calls);
        formData.append('first_call_time', pendingCampaignData.first_call_time);
        formData.append('last_call_time', pendingCampaignData.last_call_time);
        formData.append('start_date', pendingCampaignData.start_date);
        formData.append('next_action', pendingCampaignData.next_action);
        if (pendingCampaignData.end_date) {
          formData.append('end_date', pendingCampaignData.end_date);
        }
        
        uploadCsvMutation.mutate(formData);
      } else {
        // Handle contact-based campaign
        createMutation.mutate(pendingCampaignData);
      }
      
      setShowEstimator(false);
    } catch (error: any) {
      if (error.message.includes('insufficient credits')) {
        showInsufficientCreditsToast(0, 0);
      }
      setShowEstimator(false);
    }
  };

  const handleEstimatorCancel = () => {
    setShowEstimator(false);
    setPendingCampaignData(null);
    setEstimatedContactCount(0);
    setIsUploading(false);
  };

  const handleClose = () => {
    setName('');
    setAgentId('');
    setMaxConcurrentCalls('1');
    setFirstCallTime('09:00');
    setLastCallTime('17:00');
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate('');
    setNextAction('call');
    setCsvFile(null);
    setUploadResult(null);
    setIsUploading(false);
    setShowEstimator(false);
    setPendingCampaignData(null);
    setEstimatedContactCount(0);
    onClose();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className={`max-w-2xl ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
          <DialogHeader>
            <DialogTitle>Create New Campaign</DialogTitle>
            <DialogDescription>
              Create a new calling campaign by uploading a CSV file or selecting contacts
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 thin-scrollbar">
          {/* Campaign Name */}
          <div>
            <Label htmlFor="name">Campaign Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Q4 Outreach Campaign"
              className="mt-1"
            />
          </div>

          {/* Agent Selection */}
          <div>
            <Label htmlFor="agent">Select Agent *</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choose a calling agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent: any) => (
                  <SelectItem key={agent.id} value={agent.id.toString()}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Max Concurrent Calls */}
          <div>
            <div className="flex items-center gap-2">
              <Label htmlFor="concurrency">Max Concurrent Calls *</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="w-4 h-4 text-gray-400" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">Maximum number of simultaneous calls for this campaign. Your current limit: {userConcurrencyLimit}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              id="concurrency"
              type="number"
              min="1"
              max={userConcurrencyLimit}
              value={maxConcurrentCalls}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 1;
                setMaxConcurrentCalls(Math.min(val, userConcurrencyLimit).toString());
              }}
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              Your limit: {userConcurrencyLimit} | Available: {availableSlots}
            </p>
          </div>

          {/* Call Time Window */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstCallTime">First Call Time *</Label>
              <Input
                id="firstCallTime"
                type="time"
                value={firstCallTime}
                onChange={(e) => setFirstCallTime(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="lastCallTime">Last Call Time *</Label>
              <Input
                id="lastCallTime"
                type="time"
                value={lastCallTime}
                onChange={(e) => setLastCallTime(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startDate">Start Date *</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="endDate">End Date (Optional)</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="mt-1"
              />
            </div>
          </div>

          {/* Next Action */}
          <div>
            <Label htmlFor="nextAction">Next Action *</Label>
            <Select value={nextAction} onValueChange={setNextAction}>
              <SelectTrigger id="nextAction" className="mt-1">
                <SelectValue placeholder="Select next action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="call">Call</SelectItem>
                <SelectItem value="message">Message</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* File Upload Section */}
          {preSelectedContacts.length === 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Upload Contacts (Excel/CSV)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Template
                </Button>
              </div>
              <div
                className={`mt-2 border-2 border-dashed rounded-lg p-6 text-center ${
                  theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-300 bg-gray-50'
                }`}
              >
                {!csvFile ? (
                  <>
                    <Upload className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                    <p className="mb-2">Drop your Excel or CSV file here or click to browse</p>
                    <p className="text-sm text-gray-500 mb-4">
                      Supports .xlsx, .xls, and .csv files. Only phone_number is required.
                    </p>
                    <Input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="csv-upload"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('csv-upload')?.click()}
                    >
                      Select File
                    </Button>
                  </>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <FileText className="w-8 h-8 mr-3 text-blue-500" />
                      <div className="text-left">
                        <p className="font-medium">{csvFile.name}</p>
                        <p className="text-sm text-gray-500">
                          {(csvFile.size / 1024).toFixed(2)} KB
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveFile}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pre-selected Contacts Info */}
          {preSelectedContacts.length > 0 && (
            <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-blue-50'}`}>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                <span className="font-medium">
                  {preSelectedContacts.length} contacts selected
                </span>
              </div>
            </div>
          )}

          {/* Upload Result */}
          {uploadResult && (
            <div className={`p-4 rounded-lg space-y-2 ${theme === 'dark' ? 'bg-gray-800' : 'bg-green-50'}`}>
              <div className="flex items-center font-medium text-green-600">
                <CheckCircle className="w-5 h-5 mr-2" />
                Campaign Created Successfully!
              </div>
              <div className="text-sm space-y-1">
                <p>Total rows processed: {uploadResult.totalRows}</p>
                <p>New contacts created: {uploadResult.contactsCreated}</p>
                {uploadResult.contactsSkipped > 0 && (
                  <p className="text-yellow-600">
                    Contacts skipped (already exist): {uploadResult.contactsSkipped}
                  </p>
                )}
                {uploadResult.invalidRows > 0 && (
                  <p className="text-red-600">
                    Invalid rows: {uploadResult.invalidRows}
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              {uploadResult ? 'Close' : 'Cancel'}
            </Button>
            {!uploadResult && (
              <Button
                type="submit"
                disabled={createMutation.isPending || isUploading}
                style={{ backgroundColor: '#1A6262' }}
                className="text-white"
              >
                {isUploading ? 'Creating...' : 'Create Campaign'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    {/* Credit Estimator Dialog */}
    <Dialog open={showEstimator} onOpenChange={handleEstimatorCancel}>
      <DialogContent className={`max-w-2xl ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
        <DialogHeader>
          <DialogTitle>Campaign Cost Estimate</DialogTitle>
          <DialogDescription>
            Review the estimated cost for your campaign before proceeding
          </DialogDescription>
        </DialogHeader>
        
        <CampaignCreditEstimator
          contactCount={estimatedContactCount}
          showDetailedBreakdown={true}
          estimateOnly={false}
        />
        
        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={handleEstimatorCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleEstimatorConfirm}
            disabled={createMutation.isPending || isUploading}
            style={{ backgroundColor: '#1A6262' }}
            className="text-white"
          >
            {isUploading || createMutation.isPending ? 'Creating...' : 'Confirm & Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  );
};

export default CreateCampaignModal;
