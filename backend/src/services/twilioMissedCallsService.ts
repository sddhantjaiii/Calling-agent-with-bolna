// Removed: Twilio missed-call integration has been deprecated.
// Placeholder export to avoid import errors if any stale references exist.
export class TwilioNotConnectedService {
  async processUnansweredCalls(): Promise<void> { /* no-op */ }
  async getProcessingStats(): Promise<{ totalProcessed: number; recentProcessed: number; contactsWithNotConnected: number; }> {
    return { totalProcessed: 0, recentProcessed: 0, contactsWithNotConnected: 0 };
  }
  async testConnection(): Promise<boolean> { return false; }
}