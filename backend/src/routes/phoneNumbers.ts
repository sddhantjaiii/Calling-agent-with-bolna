import { Router } from 'express';
import { PhoneNumberController } from '../controllers/phoneNumberController';
import { logAdminAction } from '../middleware/adminAuth';

const router = Router();

// All routes require authentication and admin privileges (applied via admin.ts)

// GET /api/admin/phone-numbers - List all phone numbers with agent details
router.get(
  '/',
  logAdminAction('LIST_PHONE_NUMBERS', 'phone_number'),
  PhoneNumberController.listPhoneNumbers
);

// GET /api/admin/phone-numbers/unassigned - List unassigned phone numbers
router.get(
  '/unassigned',
  logAdminAction('LIST_UNASSIGNED_PHONE_NUMBERS', 'phone_number'),
  PhoneNumberController.listUnassignedPhoneNumbers
);

// GET /api/admin/phone-numbers/:id - Get phone number by ID
router.get(
  '/:id',
  logAdminAction('VIEW_PHONE_NUMBER', 'phone_number'),
  PhoneNumberController.getPhoneNumber
);

// POST /api/admin/phone-numbers - Create new phone number
router.post(
  '/',
  logAdminAction('CREATE_PHONE_NUMBER', 'phone_number'),
  PhoneNumberController.createPhoneNumber
);

// PUT /api/admin/phone-numbers/:id - Update phone number
router.put(
  '/:id',
  logAdminAction('UPDATE_PHONE_NUMBER', 'phone_number'),
  PhoneNumberController.updatePhoneNumber
);

// POST /api/admin/phone-numbers/:id/assign - Assign phone number to agent
router.post(
  '/:id/assign',
  logAdminAction('ASSIGN_PHONE_NUMBER', 'phone_number'),
  PhoneNumberController.assignToAgent
);

// POST /api/admin/phone-numbers/:id/unassign - Unassign phone number from agent
router.post(
  '/:id/unassign',
  logAdminAction('UNASSIGN_PHONE_NUMBER', 'phone_number'),
  PhoneNumberController.unassignFromAgent
);

// POST /api/admin/phone-numbers/:id/activate - Activate deactivated phone number
router.post(
  '/:id/activate',
  logAdminAction('ACTIVATE_PHONE_NUMBER', 'phone_number'),
  PhoneNumberController.activatePhoneNumber
);

// POST /api/admin/phone-numbers/:id/reassign-user - Reassign phone number to different user
router.post(
  '/:id/reassign-user',
  logAdminAction('REASSIGN_PHONE_NUMBER_USER', 'phone_number'),
  PhoneNumberController.reassignToUser
);

// DELETE /api/admin/phone-numbers/:id - Deactivate phone number (soft delete)
router.delete(
  '/:id',
  logAdminAction('DELETE_PHONE_NUMBER', 'phone_number'),
  PhoneNumberController.deletePhoneNumber
);

// DELETE /api/admin/phone-numbers/:id/permanent - Permanently delete inactive phone number
router.delete(
  '/:id/permanent',
  logAdminAction('PERMANENT_DELETE_PHONE_NUMBER', 'phone_number'),
  PhoneNumberController.permanentlyDeletePhoneNumber
);

// GET /api/admin/agents/:agentId/phone-number - Get phone number assigned to agent
router.get(
  '/agents/:agentId/phone-number',
  logAdminAction('VIEW_AGENT_PHONE_NUMBER', 'phone_number'),
  PhoneNumberController.getAgentPhoneNumber
);

export default router;