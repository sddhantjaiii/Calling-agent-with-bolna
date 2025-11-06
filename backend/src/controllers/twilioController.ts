import { Request, Response } from 'express';

// Stub controller retained for compatibility; all endpoints have been removed.
export class TwilioController {
  async testConnection(_req: Request, res: Response): Promise<void> {
    res.status(410).json({ success: false, message: 'Twilio feature removed' });
  }

  async processNotConnectedCalls(_req: Request, res: Response): Promise<void> {
    res.status(410).json({ success: false, message: 'Twilio feature removed' });
  }

  async getStats(_req: Request, res: Response): Promise<void> {
    res.status(410).json({ success: false, message: 'Twilio feature removed' });
  }

  async getContactsWithNotConnectedCalls(_req: Request, res: Response): Promise<void> {
    res.status(410).json({ success: false, message: 'Twilio feature removed' });
  }
}