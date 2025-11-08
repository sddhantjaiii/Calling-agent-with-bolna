import { Router, Request, Response } from 'express';
import { pool } from '../config/database';

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

/**
 * GET /api/phone-numbers
 * Get all phone numbers for the authenticated user (non-admin route)
 */
router.get('/', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user?.id;

  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  try {
    // Get all phone numbers owned by this user with their assigned agent info
    const query = `
      SELECT 
        pn.id,
        pn.name,
        pn.phone_number,
        pn.assigned_to_agent_id,
        pn.is_active,
        pn.created_at,
        a.name as agent_name
      FROM phone_numbers pn
      LEFT JOIN agents a ON pn.assigned_to_agent_id = a.id AND a.user_id = pn.user_id
      WHERE pn.user_id = $1
      ORDER BY pn.created_at DESC
    `;

    const result = await pool.query(query, [userId]);

    const phoneNumbers = result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      phoneNumber: row.phone_number,
      assignedToAgentId: row.assigned_to_agent_id,
      agentName: row.agent_name,
      isActive: row.is_active,
      createdAt: row.created_at,
    }));

    res.json({
      success: true,
      data: phoneNumbers,
    });
  } catch (error) {
    console.error('Error fetching phone numbers:', error);
    res.status(500).json({ error: 'Failed to fetch phone numbers' });
  }
});

export default router;
