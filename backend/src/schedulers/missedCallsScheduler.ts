import { logger } from '../utils/logger';

// No-op scheduler retained for compatibility; functionality removed.
export class NotConnectedCallsScheduler {
  start(): void {
    logger.info('NotConnectedCallsScheduler is disabled (Twilio missed-call removal)');
  }
  async testConnection(): Promise<boolean> { return false; }
  async runImmediately(): Promise<void> { /* no-op */ }
  isProcessing(): boolean { return false; }
}