import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { apiService } from '@/services/apiService';
import { Loader2 } from 'lucide-react';

const LEVEL_OPTIONS = ['High', 'Medium', 'Low'] as const;
const LEAD_TAG_OPTIONS = ['Hot', 'Warm', 'Cold'] as const;
const INTERACTION_PLATFORM_OPTIONS = ['Call', 'WhatsApp', 'Email'] as const;

export interface LeadIntelligenceData {
  intent_level: string;
  urgency_level: string;
  budget_constraint: string;
  fit_alignment: string;
  engagement_health: string;
  lead_status_tag?: string;
  custom_cta?: string;
  requirements?: string;
  contact_notes?: string;  // Notes stored in contacts table
  assigned_to?: { id: string; name: string } | null;
  interaction_platform?: string;  // Platform for manual interaction (Call/WhatsApp/Email)
}

interface EditLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phoneNumber: string;
  leadName?: string;
  currentData: LeadIntelligenceData;
  onSave?: (data: LeadIntelligenceData) => void;
}

// Normalize value for display
const normalizeValue = (v: string): string => {
  if (!v) return 'Medium';
  const lower = v.toLowerCase();
  if (lower === 'high' || lower === 'strong') return 'High';
  if (lower === 'low' || lower === 'weak') return 'Low';
  return 'Medium';
};

export const EditLeadModal: React.FC<EditLeadModalProps> = ({
  open,
  onOpenChange,
  phoneNumber,
  leadName,
  currentData,
  onSave,
}) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);

  // Form state
  const [formData, setFormData] = useState<LeadIntelligenceData>({
    intent_level: normalizeValue(currentData.intent_level),
    urgency_level: normalizeValue(currentData.urgency_level),
    budget_constraint: normalizeValue(currentData.budget_constraint),
    fit_alignment: normalizeValue(currentData.fit_alignment),
    engagement_health: normalizeValue(currentData.engagement_health),
    lead_status_tag: currentData.lead_status_tag || 'Cold',
    custom_cta: currentData.custom_cta || '',
    requirements: currentData.requirements || '',
    contact_notes: currentData.contact_notes || '',
    assigned_to: currentData.assigned_to || null,
    interaction_platform: currentData.interaction_platform || 'Call',
  });

  // Reset form when modal opens or currentData changes
  useEffect(() => {
    if (open) {
      setFormData({
        intent_level: normalizeValue(currentData.intent_level),
        urgency_level: normalizeValue(currentData.urgency_level),
        budget_constraint: normalizeValue(currentData.budget_constraint),
        fit_alignment: normalizeValue(currentData.fit_alignment),
        engagement_health: normalizeValue(currentData.engagement_health),
        lead_status_tag: currentData.lead_status_tag || 'Cold',
        custom_cta: currentData.custom_cta || '',
        requirements: currentData.requirements || '',
        contact_notes: currentData.contact_notes || '',
        assigned_to: currentData.assigned_to || null,
        interaction_platform: currentData.interaction_platform || 'Call',
      });
    }
  }, [open, currentData]);

  // Load team members when modal opens
  useEffect(() => {
    if (open) {
      loadTeamMembers();
    }
  }, [open]);

  const loadTeamMembers = async () => {
    setLoadingTeam(true);
    try {
      // Use getTeamMembersForAssignment which allows managers to access
      const response = await apiService.getTeamMembersForAssignment();
      console.log('Team members response:', response);
      
      // Handle both response.data.team_members and response.team_members structures
      const members = response.data?.team_members || (response as any).team_members || [];
      console.log('Parsed team members:', members);
      
      if (members.length > 0) {
        setTeamMembers(members.map((m: any) => ({
          id: m.id,
          name: m.name,
          role: m.role,
        })));
      }
    } catch (err) {
      console.error('Failed to load team members:', err);
    } finally {
      setLoadingTeam(false);
    }
  };

  const handleSave = async () => {
    if (!phoneNumber) {
      toast({
        title: 'Error',
        description: 'Phone number is required to save changes',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      // Prepare the update payload
      const updatePayload: Record<string, string | null> = {
        intent_level: formData.intent_level,
        urgency_level: formData.urgency_level,
        budget_constraint: formData.budget_constraint,
        fit_alignment: formData.fit_alignment,
        engagement_health: formData.engagement_health,
        lead_status_tag: formData.lead_status_tag || 'Cold',
        custom_cta: formData.custom_cta || '',
        requirements: formData.requirements || '',
        contact_notes: formData.contact_notes || '',  // Notes saved to contacts table
        interaction_platform: formData.interaction_platform || 'Call',  // Platform for manual interaction
      };

      // Add assigned_to if changed (backend expects assigned_to_team_member_id)
      if (formData.assigned_to?.id) {
        updatePayload.assigned_to_team_member_id = formData.assigned_to.id;
      } else if (formData.assigned_to === null) {
        // Explicitly set to null to unassign
        updatePayload.assigned_to_team_member_id = null;
      }

      const res = await apiService.editLeadIntelligence(phoneNumber, updatePayload);

      // Check for success - backend returns message on success, or success: true
      const isSuccess = res.success || (res as any).message || (res as any).lead_analytics_id;
      
      if (isSuccess) {
        toast({
          title: 'Success',
          description: 'Lead intelligence updated successfully',
        });
        onSave?.(formData);
        onOpenChange(false);
      } else {
        toast({
          title: 'Error',
          description: res.error?.message || 'Failed to update lead intelligence',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message || 'Failed to update lead intelligence',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleFieldChange = (field: keyof LeadIntelligenceData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAssigneeChange = (memberId: string) => {
    if (memberId === 'unassigned') {
      setFormData((prev) => ({ ...prev, assigned_to: null }));
    } else {
      const member = teamMembers.find((m) => m.id === memberId);
      if (member) {
        setFormData((prev) => ({
          ...prev,
          assigned_to: { id: member.id, name: member.name },
        }));
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            Edit Lead Intelligence
            {leadName && <span className="text-gray-400 ml-2">- {leadName}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
          {/* Interaction Platform (Call/WhatsApp/Email) */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="interaction_platform" className="text-right text-gray-300">
              Interaction Mode
            </Label>
            <Select
              value={formData.interaction_platform || 'Call'}
              onValueChange={(v) => handleFieldChange('interaction_platform', v)}
              disabled={saving}
            >
              <SelectTrigger className="col-span-3 bg-gray-800 border-gray-600">
                <SelectValue placeholder="Select interaction platform" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                {INTERACTION_PLATFORM_OPTIONS.map((platform) => (
                  <SelectItem key={platform} value={platform}>
                    {platform}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lead Tag (Hot/Warm/Cold) */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="lead_status_tag" className="text-right text-gray-300">
              Lead Tag
            </Label>
            <Select
              value={formData.lead_status_tag || 'Cold'}
              onValueChange={(v) => handleFieldChange('lead_status_tag', v)}
              disabled={saving}
            >
              <SelectTrigger className="col-span-3 bg-gray-800 border-gray-600">
                <SelectValue placeholder="Select lead tag" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                {LEAD_TAG_OPTIONS.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    <span className={`${tag === 'Hot' ? 'text-red-400' : tag === 'Warm' ? 'text-orange-400' : 'text-blue-400'}`}>
                      {tag}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Intent Level */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="intent_level" className="text-right text-gray-300">
              Intent Level
            </Label>
            <Select
              value={formData.intent_level}
              onValueChange={(v) => handleFieldChange('intent_level', v)}
              disabled={saving}
            >
              <SelectTrigger className="col-span-3 bg-gray-800 border-gray-600">
                <SelectValue placeholder="Select intent level" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                {LEVEL_OPTIONS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Urgency Level */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="urgency_level" className="text-right text-gray-300">
              Urgency Level
            </Label>
            <Select
              value={formData.urgency_level}
              onValueChange={(v) => handleFieldChange('urgency_level', v)}
              disabled={saving}
            >
              <SelectTrigger className="col-span-3 bg-gray-800 border-gray-600">
                <SelectValue placeholder="Select urgency level" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                {LEVEL_OPTIONS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Budget Constraint */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="budget_constraint" className="text-right text-gray-300">
              Budget
            </Label>
            <Select
              value={formData.budget_constraint}
              onValueChange={(v) => handleFieldChange('budget_constraint', v)}
              disabled={saving}
            >
              <SelectTrigger className="col-span-3 bg-gray-800 border-gray-600">
                <SelectValue placeholder="Select budget constraint" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                {LEVEL_OPTIONS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fit Alignment */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="fit_alignment" className="text-right text-gray-300">
              Fit Alignment
            </Label>
            <Select
              value={formData.fit_alignment}
              onValueChange={(v) => handleFieldChange('fit_alignment', v)}
              disabled={saving}
            >
              <SelectTrigger className="col-span-3 bg-gray-800 border-gray-600">
                <SelectValue placeholder="Select fit alignment" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                {LEVEL_OPTIONS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Engagement Health */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="engagement_health" className="text-right text-gray-300">
              Engagement
            </Label>
            <Select
              value={formData.engagement_health}
              onValueChange={(v) => handleFieldChange('engagement_health', v)}
              disabled={saving}
            >
              <SelectTrigger className="col-span-3 bg-gray-800 border-gray-600">
                <SelectValue placeholder="Select engagement health" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                {LEVEL_OPTIONS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom CTA */}
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="custom_cta" className="text-right text-gray-300 pt-2">
              Custom CTA
            </Label>
            <Textarea
              id="custom_cta"
              value={formData.custom_cta || ''}
              onChange={(e) => handleFieldChange('custom_cta', e.target.value)}
              disabled={saving}
              placeholder="Enter custom call-to-action..."
              className="col-span-3 bg-gray-800 border-gray-600 text-white min-h-[80px]"
            />
          </div>

          {/* Requirements */}
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="requirements" className="text-right text-gray-300 pt-2">
              Requirements
            </Label>
            <Textarea
              id="requirements"
              value={formData.requirements || ''}
              onChange={(e) => handleFieldChange('requirements', e.target.value)}
              disabled={saving}
              placeholder="Enter lead requirements or notes..."
              className="col-span-3 bg-gray-800 border-gray-600 text-white min-h-[80px]"
            />
          </div>

          {/* Contact Notes */}
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="contact_notes" className="text-right text-gray-300 pt-2">
              Notes
            </Label>
            <Textarea
              id="contact_notes"
              value={formData.contact_notes || ''}
              onChange={(e) => handleFieldChange('contact_notes', e.target.value)}
              disabled={saving}
              placeholder="Add your notes about this lead..."
              className="col-span-3 bg-gray-800 border-gray-600 text-white min-h-[80px]"
            />
          </div>

          {/* Assigned To */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="assigned_to" className="text-right text-gray-300">
              Assigned To
            </Label>
            <Select
              value={formData.assigned_to?.id || 'unassigned'}
              onValueChange={handleAssigneeChange}
              disabled={saving || loadingTeam}
            >
              <SelectTrigger className="col-span-3 bg-gray-800 border-gray-600">
                <SelectValue placeholder={loadingTeam ? 'Loading...' : 'Select team member'} />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {teamMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name} ({member.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="border-gray-600 text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditLeadModal;
