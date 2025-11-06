import { CallCampaignModel } from '../models/CallCampaign';
import { CallQueueModel } from '../models/CallQueue';
import { userService } from './userService';
import { 
  CallCampaign, 
  CreateCampaignRequest,
  UpdateCampaignRequest,
  CampaignStatus,
  CampaignAnalytics
} from '../types/campaign';

export class CallCampaignService {
  /**
   * Create a new campaign with contacts
   */
  static async createCampaign(
    userId: string, 
    data: CreateCampaignRequest
  ): Promise<CallCampaign> {
    // Check if user has negative or zero credits - block campaign creation
    const user = await userService.getUserProfile(userId);
    if (!user || user.credits <= 0) {
      throw new Error(
        user?.credits === 0 
          ? 'Cannot create campaign with zero credits. Please purchase credits first.'
          : 'Cannot create campaign with negative credits. Please purchase credits first.'
      );
    }

    // Validate time window
    this.validateTimeWindow(data.first_call_time, data.last_call_time);

    // Validate dates
    this.validateDates(data.start_date, data.end_date);

    // Create campaign
    const campaign = await CallCampaignModel.create(userId, data);

    // Add contacts to queue
    if (data.contact_ids && data.contact_ids.length > 0) {
      await this.addContactsToQueue(
        userId,
        campaign.id,
        data.agent_id,
        data.contact_ids,
        data.next_action,
        data.start_date
      );
    }

    return campaign;
  }

  /**
   * Get campaign by ID
   */
  static async getCampaign(id: string, userId: string): Promise<CallCampaign | null> {
    return await CallCampaignModel.findById(id, userId);
  }

  /**
   * Get all campaigns for user
   */
  static async getUserCampaigns(
    userId: string,
    filters?: {
      status?: CampaignStatus | CampaignStatus[];
      agent_id?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ campaigns: CallCampaign[]; total: number }> {
    const campaigns = await CallCampaignModel.findByUserId(userId, filters);
    
    // Get total count (without pagination)
    const allCampaigns = await CallCampaignModel.findByUserId(userId, {
      status: filters?.status,
      agent_id: filters?.agent_id
    });

    return {
      campaigns,
      total: allCampaigns.length
    };
  }

  /**
   * Update campaign
   */
  static async updateCampaign(
    id: string,
    userId: string,
    updates: UpdateCampaignRequest
  ): Promise<CallCampaign | null> {
    // Validate time window if provided
    if (updates.first_call_time || updates.last_call_time) {
      const campaign = await CallCampaignModel.findById(id, userId);
      if (!campaign) return null;

      const firstTime = updates.first_call_time || campaign.first_call_time;
      const lastTime = updates.last_call_time || campaign.last_call_time;
      this.validateTimeWindow(firstTime, lastTime);
    }

    // Validate dates if provided
    if (updates.start_date || updates.end_date) {
      const campaign = await CallCampaignModel.findById(id, userId);
      if (!campaign) return null;

      const startDate = updates.start_date || campaign.start_date;
      const endDate = updates.end_date || campaign.end_date;
      this.validateDates(startDate, endDate);
    }

    return await CallCampaignModel.update(id, userId, updates);
  }

  /**
   * Delete campaign
   */
  static async deleteCampaign(id: string, userId: string): Promise<boolean> {
    const campaign = await CallCampaignModel.findById(id, userId);
    if (!campaign) return false;

    // Only allow deletion of draft or cancelled campaigns
    if (campaign.status !== 'draft' && campaign.status !== 'cancelled') {
      throw new Error(`Cannot delete campaign with status: ${campaign.status}`);
    }

    return await CallCampaignModel.delete(id, userId);
  }

  /**
   * Start campaign
   */
  static async startCampaign(id: string, userId: string): Promise<CallCampaign | null> {
    const campaign = await CallCampaignModel.findById(id, userId);
    if (!campaign) return null;

    // Check if user has sufficient credits to start/resume campaign
    const user = await userService.getUserProfile(userId);
    if (!user || user.credits <= 0) {
      throw new Error(
        user?.credits === 0 
          ? 'Cannot start campaign with zero credits. Please purchase credits first.'
          : 'Cannot start campaign with negative credits. Please purchase credits first.'
      );
    }

    // Validate can start
    const validation = await CallCampaignModel.canStart(id, userId);
    if (!validation.can_start) {
      throw new Error(validation.reason || 'Cannot start campaign');
    }

    // Update to active status
    return await CallCampaignModel.updateStatus(id, userId, 'active', {
      started_at: new Date()
    });
  }

  /**
   * Pause campaign
   */
  static async pauseCampaign(id: string, userId: string): Promise<CallCampaign | null> {
    const campaign = await CallCampaignModel.findById(id, userId);
    if (!campaign) return null;

    if (campaign.status !== 'active') {
      throw new Error('Can only pause active campaigns');
    }

    return await CallCampaignModel.updateStatus(id, userId, 'paused');
  }

  /**
   * Resume campaign
   */
  static async resumeCampaign(id: string, userId: string): Promise<CallCampaign | null> {
    const campaign = await CallCampaignModel.findById(id, userId);
    if (!campaign) return null;

    if (campaign.status !== 'paused') {
      throw new Error('Can only resume paused campaigns');
    }

    return await CallCampaignModel.updateStatus(id, userId, 'active');
  }

  /**
   * Cancel campaign
   */
  static async cancelCampaign(id: string, userId: string): Promise<CallCampaign | null> {
    const campaign = await CallCampaignModel.findById(id, userId);
    if (!campaign) return null;

    if (campaign.status === 'completed' || campaign.status === 'cancelled') {
      throw new Error(`Campaign is already ${campaign.status}`);
    }

    // Cancel all queued items
    await CallQueueModel.deleteByCampaign(id, userId);

    return await CallCampaignModel.updateStatus(id, userId, 'cancelled', {
      completed_at: new Date()
    });
  }

  /**
   * Get campaign analytics
   */
  static async getCampaignAnalytics(
    id: string, 
    userId: string
  ): Promise<CampaignAnalytics | null> {
    return await CallCampaignModel.getAnalytics(id, userId);
  }

  /**
   * Get campaign statistics
   */
  static async getCampaignStatistics(id: string, userId: string) {
    return await CallCampaignModel.getStatistics(id, userId);
  }

  /**
   * Add contacts to campaign queue
   */
  private static async addContactsToQueue(
    userId: string,
    campaignId: string,
    agentId: string,
    contactIds: string[],
    nextAction: string,
    startDate: string
  ): Promise<void> {
    // Import Contact model to get contact details
    const { ContactModel } = await import('../models/Contact');
    const contactModel = new ContactModel();

    const queueItems = [];
    
    for (let i = 0; i < contactIds.length; i++) {
      const contact = await contactModel.findById(contactIds[i]);
      if (!contact || contact.user_id !== userId) continue;

      // Calculate priority (contacts with names get +100)
      const priority = contact.name ? 100 : 0;

      queueItems.push({
        user_id: userId,
        campaign_id: campaignId,
        agent_id: agentId,
        contact_id: contact.id,
        phone_number: contact.phone_number,
        contact_name: contact.name || undefined,
        user_data: {
          summary: '', // Will be populated from contact's last conversation if needed
          next_action: nextAction,
          email: contact.email || '',
          company: contact.company || '',
          notes: contact.notes || ''
        },
        priority,
        position: i + 1,
        scheduled_for: new Date(startDate)
      });
    }

    if (queueItems.length > 0) {
      await CallQueueModel.createBulk(queueItems);
      
      // Update campaign's total_contacts count
      await CallCampaignModel.updateTotalContacts(campaignId, queueItems.length);
    }
  }

  /**
   * Validate time window
   */
  private static validateTimeWindow(firstTime: string, lastTime: string): void {
    if (!firstTime || !lastTime) {
      throw new Error('first_call_time and last_call_time are required');
    }

    const first = this.parseTime(firstTime);
    const last = this.parseTime(lastTime);

    if (first >= last) {
      throw new Error('first_call_time must be before last_call_time');
    }

    // Ensure at least 1 hour window
    if ((last - first) < 3600000) {
      throw new Error('Time window must be at least 1 hour');
    }
  }

  /**
   * Validate dates
   */
  private static validateDates(startDate: string, endDate?: string): void {
    const start = new Date(startDate);
    
    if (isNaN(start.getTime())) {
      throw new Error('Invalid start_date format');
    }

    if (endDate) {
      const end = new Date(endDate);
      
      if (isNaN(end.getTime())) {
        throw new Error('Invalid end_date format');
      }

      if (end <= start) {
        throw new Error('end_date must be after start_date');
      }
    }
  }

  /**
   * Parse time string to milliseconds
   */
  private static parseTime(timeStr: string): number {
    if (!timeStr || typeof timeStr !== 'string') {
      throw new Error('Invalid time format. Expected HH:MM or HH:MM:SS');
    }

    const parts = timeStr.split(':');
    if (parts.length < 2 || parts.length > 3) {
      throw new Error('Invalid time format. Expected HH:MM or HH:MM:SS');
    }

    const [hours, minutes, seconds = 0] = parts.map(Number);
    
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) {
      throw new Error('Invalid time format. Expected HH:MM or HH:MM:SS');
    }

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
      throw new Error('Invalid time values. Hours: 0-23, Minutes: 0-59, Seconds: 0-59');
    }

    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }

  /**
   * Get campaigns summary count by status
   */
  static async getCampaignsSummary(userId: string) {
    return await CallCampaignModel.countByStatus(userId);
  }
}
