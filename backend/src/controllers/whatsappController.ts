import { Request, Response } from 'express';
import multer from 'multer';
import { logger } from '../utils/logger';
import { uploadToR2, deleteFromR2, getMediaType, WHATSAPP_MEDIA_TYPES } from '../services/r2StorageService';
import { whatsappService, CreateTemplateRequest } from '../services/whatsappService';

/**
 * WhatsApp Template Controller
 * 
 * Handles template CRUD operations with media upload support
 * Flow: Frontend → This Controller → R2 Upload → WhatsApp Microservice → Meta API
 * 
 * Features:
 * - Upload media to R2 before template creation
 * - Proxy requests to WhatsApp microservice
 * - Handle button click analytics
 * - Sync templates from Meta
 */

// Configure multer for in-memory file storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max (for PDFs)
  },
}).single('media'); // Expect single file with field name 'media'

/**
 * List all templates
 * GET /api/whatsapp/templates
 */
export const listTemplates = async (req: Request, res: Response) => {
  try {
    const { limit, offset, status } = req.query;
    
    const response = await whatsappService.listTemplates({
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      status: status as any,
    });
    
    res.json(response);
  } catch (error: any) {
    logger.error('❌ List templates failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch templates',
      message: error.message,
    });
  }
};

/**
 * Get single template
 * GET /api/whatsapp/templates/:templateId
 */
export const getTemplate = async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    
    const response = await whatsappService.getTemplate(templateId);
    
    res.json(response);
  } catch (error: any) {
    logger.error('❌ Get template failed', {
      templateId: req.params.templateId,
      error: error.message,
    });
    
    res.status(404).json({
      success: false,
      error: 'Template not found',
      message: error.message,
    });
  }
};

/**
 * Create template with optional media upload
 * POST /api/whatsapp/templates
 * 
 * Accepts multipart/form-data:
 * - media: File (optional) - IMAGE, VIDEO, or DOCUMENT
 * - templateData: JSON string - Template configuration
 */
export const createTemplate = (req: Request, res: Response): void => {
  upload(req, res, async (err): Promise<void> => {
    if (err) {
      logger.error('❌ File upload error', { error: err.message });
      res.status(400).json({
        success: false,
        error: 'File upload failed',
        message: err.message,
      });
      return;
    }
    
    try {
      // Parse template data from form
      const templateDataStr = req.body.templateData;
      if (!templateDataStr) {
        res.status(400).json({
          success: false,
          error: 'Missing template data',
          message: 'templateData is required',
        });
        return;
      }
      
      let templateData: CreateTemplateRequest;
      try {
        templateData = JSON.parse(templateDataStr);
      } catch (parseError) {
        res.status(400).json({
          success: false,
          error: 'Invalid template data',
          message: 'templateData must be valid JSON',
        });
        return;
      }
      
      const userId = req.userId || templateData.user_id;
      
      // Handle media upload if file is present
      if (req.file) {
        const file = req.file;
        const mediaType = getMediaType(file.mimetype);
        
        if (!mediaType) {
          res.status(400).json({
            success: false,
            error: 'Invalid file type',
            message: `Unsupported file type: ${file.mimetype}. Supported: IMAGE (jpg, png), VIDEO (mp4), DOCUMENT (pdf)`,
          });
          return;
        }
        
        logger.info('📤 Uploading media to R2', {
          userId,
          mediaType,
          filename: file.originalname,
          size: file.size,
        });
        
        // Upload to R2
        const uploadResult = await uploadToR2(
          {
            buffer: file.buffer,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
          },
          mediaType,
          userId
        );
        
        if (!uploadResult.success) {
          res.status(400).json({
            success: false,
            error: 'Media upload failed',
            message: uploadResult.error,
          });
          return;
        }
        
        // Find HEADER component and add media URL
        const headerComponent = templateData.components.find(c => c.type === 'HEADER');
        if (headerComponent) {
          headerComponent.format = mediaType;
          headerComponent.example = {
            header_handle: [uploadResult.url],
          };
        } else {
          // Create HEADER component if doesn't exist
          templateData.components.unshift({
            type: 'HEADER',
            format: mediaType,
            example: {
              header_handle: [uploadResult.url],
            },
          });
        }
        
        logger.info('✅ Media uploaded to R2', {
          userId,
          mediaType,
          url: uploadResult.url,
        });
      }
      
      // Create template in WhatsApp microservice
      const response = await whatsappService.createTemplate(templateData);
      
      res.status(201).json(response);
    } catch (error: any) {
      logger.error('❌ Create template failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to create template',
        message: error.message,
      });
    }
  });
};

/**
 * Delete template
 * DELETE /api/whatsapp/templates/:templateId
 */
export const deleteTemplate = async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    
    // Get template to check for media URL
    const templateResponse = await whatsappService.getTemplate(templateId);
    
    if (templateResponse.success && templateResponse.data?.template?.header_media_url) {
      // Delete media from R2
      const mediaUrl = templateResponse.data.template.header_media_url;
      const userId = req.userId || 'system';
      
      logger.info('🗑️ Deleting media from R2', { templateId, mediaUrl });
      await deleteFromR2(mediaUrl, userId);
    }
    
    // Delete template from microservice
    const response = await whatsappService.deleteTemplate(templateId);
    
    res.json(response);
  } catch (error: any) {
    logger.error('❌ Delete template failed', {
      templateId: req.params.templateId,
      error: error.message,
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to delete template',
      message: error.message,
    });
  }
};

/**
 * Submit template to Meta for approval
 * POST /api/whatsapp/templates/:templateId/submit
 */
export const submitTemplate = async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    
    const response = await whatsappService.submitTemplate(templateId);
    
    res.json(response);
  } catch (error: any) {
    logger.error('❌ Submit template failed', {
      templateId: req.params.templateId,
      error: error.message,
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to submit template to Meta',
      message: error.message,
    });
  }
};

/**
 * Sync templates from Meta
 * POST /api/whatsapp/templates/sync
 */
export const syncTemplates = async (req: Request, res: Response): Promise<void> => {
  try {
    const { user_id, phone_number_id } = req.body;
    
    if (!user_id || !phone_number_id) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'user_id and phone_number_id are required',
      });
      return;
    }
    
    const response = await whatsappService.syncTemplates(user_id, phone_number_id);
    
    res.json(response);
  } catch (error: any) {
    logger.error('❌ Sync templates failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to sync templates from Meta',
      message: error.message,
    });
  }
};

/**
 * Get button clicks for a template
 * GET /api/whatsapp/templates/:templateId/button-clicks
 */
export const getButtonClicks = async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    
    const response = await whatsappService.getButtonClicks(templateId);
    
    res.json(response);
  } catch (error: any) {
    logger.error('❌ Get button clicks failed', {
      templateId: req.params.templateId,
      error: error.message,
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch button clicks',
      message: error.message,
    });
  }
};

/**
 * List all button clicks
 * GET /api/whatsapp/button-clicks
 */
export const listButtonClicks = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, templateId, limit, offset } = req.query;
    
    if (!userId) {
      res.status(400).json({
        success: false,
        error: 'Missing userId',
        message: 'userId query parameter is required',
      });
      return;
    }
    
    const response = await whatsappService.listButtonClicks({
      userId: userId as string,
      templateId: templateId as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    
    res.json(response);
  } catch (error: any) {
    logger.error('❌ List button clicks failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch button clicks',
      message: error.message,
    });
  }
};

/**
 * Get lead button activity
 * GET /api/whatsapp/leads/:customerPhone/button-activity
 */
export const getLeadButtonActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { customerPhone } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
      res.status(400).json({
        success: false,
        error: 'Missing userId',
        message: 'userId query parameter is required',
      });
      return;
    }
    
    const response = await whatsappService.getLeadButtonActivity(
      customerPhone,
      userId as string
    );
    
    res.json(response);
  } catch (error: any) {
    logger.error('❌ Get lead button activity failed', {
      customerPhone: req.params.customerPhone,
      error: error.message,
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch lead button activity',
      message: error.message,
    });
  }
};

/**
 * Upload media file to R2
 * POST /api/whatsapp/media/upload
 * 
 * Returns public URL for use in template creation
 */
export const uploadMedia = (req: Request, res: Response): void => {
  upload(req, res, async (err): Promise<void> => {
    if (err) {
      logger.error('❌ File upload error', { error: err.message });
      res.status(400).json({
        success: false,
        error: 'File upload failed',
        message: err.message,
      });
      return;
    }
    
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'No file provided',
          message: 'Please upload a media file',
        });
        return;
      }
      
      const file = req.file;
      const userId = req.userId || req.body.userId || 'anonymous';
      const mediaType = getMediaType(file.mimetype);
      
      if (!mediaType) {
        res.status(400).json({
          success: false,
          error: 'Invalid file type',
          message: `Unsupported file type: ${file.mimetype}. Supported: IMAGE (jpg, png), VIDEO (mp4), DOCUMENT (pdf)`,
        });
        return;
      }
      
      logger.info('📤 Uploading media to R2', {
        userId,
        mediaType,
        filename: file.originalname,
        size: file.size,
      });
      
      // Upload to R2
      const uploadResult = await uploadToR2(
        {
          buffer: file.buffer,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
        },
        mediaType,
        userId
      );
      
      if (!uploadResult.success) {
        res.status(400).json({
          success: false,
          error: 'Media upload failed',
          message: uploadResult.error,
        });
        return;
      }
      
      logger.info('✅ Media uploaded to R2', {
        userId,
        mediaType,
        url: uploadResult.url,
      });
      
      res.json({
        success: true,
        url: uploadResult.url,
        mediaType,
        filename: file.originalname,
        size: file.size,
      });
    } catch (error: any) {
      logger.error('❌ Media upload failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to upload media',
        message: error.message,
      });
    }
  });
};
