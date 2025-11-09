import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { userService, ProfileUpdateData, ValidationError } from '../services/userService';
import { authService } from '../services/authService';

export class UserController {
  /**
   * Validate and sanitize profile update request data
   */
  private static validateProfileUpdateRequest(body: any): { 
    isValid: boolean; 
    updates: ProfileUpdateData; 
    errors: string[] 
  } {
    const errors: string[] = [];
    const updates: ProfileUpdateData = {};

    // Extract and validate each field with enhanced validation
    const { name, email, company, website, location, bio, phone } = body;

    // Enhanced validation for name
    if (name !== undefined) {
      if (typeof name !== 'string') {
        errors.push('Name must be a string');
      } else if (name.trim().length === 0) {
        errors.push('Name cannot be empty');
      } else if (name.trim().length > 255) {
        errors.push('Name cannot exceed 255 characters');
      } else {
        updates.name = name.trim();
      }
    }

    // Enhanced validation for email
    if (email !== undefined) {
      if (typeof email !== 'string') {
        errors.push('Email must be a string');
      } else if (email.trim().length === 0) {
        errors.push('Email cannot be empty');
      } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const trimmedEmail = email.trim().toLowerCase();
        if (!emailRegex.test(trimmedEmail)) {
          errors.push('Please provide a valid email address');
        } else {
          updates.email = trimmedEmail;
        }
      }
    }

    // Enhanced validation for company
    if (company !== undefined) {
      if (company !== null && typeof company !== 'string') {
        errors.push('Company must be a string or null');
      } else if (company !== null) {
        const trimmedCompany = company.trim();
        if (trimmedCompany.length > 255) {
          errors.push('Company name cannot exceed 255 characters');
        } else {
          updates.company = trimmedCompany || null;
        }
      } else {
        updates.company = null;
      }
    }

    // Enhanced validation for website
    if (website !== undefined) {
      if (website !== null && typeof website !== 'string') {
        errors.push('Website must be a string or null');
      } else if (website !== null) {
        const trimmedWebsite = website.trim();
        if (trimmedWebsite.length === 0) {
          updates.website = null;
        } else if (trimmedWebsite.length > 500) {
          errors.push('Website URL cannot exceed 500 characters');
        } else {
          // Basic URL validation
          const urlRegex = /^https?:\/\/.+/;
          if (!urlRegex.test(trimmedWebsite)) {
            errors.push('Website must be a valid URL starting with http:// or https://');
          } else {
            updates.website = trimmedWebsite;
          }
        }
      } else {
        updates.website = null;
      }
    }

    // Enhanced validation for location
    if (location !== undefined) {
      if (location !== null && typeof location !== 'string') {
        errors.push('Location must be a string or null');
      } else if (location !== null) {
        const trimmedLocation = location.trim();
        if (trimmedLocation.length > 255) {
          errors.push('Location cannot exceed 255 characters');
        } else {
          updates.location = trimmedLocation || null;
        }
      } else {
        updates.location = null;
      }
    }

    // Enhanced validation for bio
    if (bio !== undefined) {
      if (bio !== null && typeof bio !== 'string') {
        errors.push('Bio must be a string or null');
      } else if (bio !== null) {
        const trimmedBio = bio.trim();
        if (trimmedBio.length > 1000) {
          errors.push('Bio cannot exceed 1000 characters');
        } else {
          updates.bio = trimmedBio || null;
        }
      } else {
        updates.bio = null;
      }
    }

    // Enhanced validation for phone
    if (phone !== undefined) {
      if (phone !== null && typeof phone !== 'string') {
        errors.push('Phone must be a string or null');
      } else if (phone !== null) {
        const trimmedPhone = phone.trim();
        if (trimmedPhone.length === 0) {
          updates.phone = null;
        } else {
          // Phone number validation (international format support)
          const phoneRegex = /^[+]?[0-9\s\-()]{7,20}$/;
          if (!phoneRegex.test(trimmedPhone)) {
            errors.push('Phone number must be 7-20 characters and contain only numbers, spaces, hyphens, parentheses, and optional + prefix');
          } else {
            updates.phone = trimmedPhone;
          }
        }
      } else {
        updates.phone = null;
      }
    }

    // Check if at least one field is provided
    if (Object.keys(updates).length === 0) {
      errors.push('At least one field is required for update');
    }

    return {
      isValid: errors.length === 0,
      updates,
      errors
    };
  }
  /**
   * Get current user profile
   * GET /api/user/profile
   */
  static async getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
            timestamp: new Date(),
          },
        });
        return;
      }

      const profile = await userService.getUserProfile(req.userId);
      
      if (!profile) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User profile not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      res.json({
        user: profile,
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        error: {
          code: 'PROFILE_ERROR',
          message: 'Failed to fetch user profile',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Update user profile
   * PUT /api/user/profile
   */
  static async updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Validate and sanitize request data
      const validation = UserController.validateProfileUpdateRequest(req.body);
      
      if (!validation.isValid) {
        res.status(400).json({
          error: {
            code: 'INVALID_INPUT',
            message: validation.errors.join('; '),
            timestamp: new Date(),
          },
        });
        return;
      }

      // Log the update attempt for debugging (without sensitive data)
      console.log(`Profile update attempt for user ${req.userId}:`, {
        fieldsToUpdate: Object.keys(validation.updates),
        hasName: !!validation.updates.name,
        hasEmail: !!validation.updates.email,
        hasCompany: !!validation.updates.company,
        hasWebsite: !!validation.updates.website,
        hasLocation: !!validation.updates.location,
        hasBio: !!validation.updates.bio,
        hasPhone: !!validation.updates.phone,
        updateCount: Object.keys(validation.updates).length,
        timestamp: new Date().toISOString(),
      });

      const updatedProfile = await userService.updateUserProfile(req.userId, validation.updates);
      
      if (!updatedProfile) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Log successful update
      console.log(`Profile updated successfully for user ${req.userId}`);

      res.json({
        user: updatedProfile,
        message: 'Profile updated successfully',
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Update profile error:', error);
      
      // Handle validation errors specifically with detailed field information
      if (error instanceof Error && error.message.startsWith('Validation failed:')) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
            details: 'Please check the format and length of your input fields',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Handle email already exists error
      if (error instanceof Error && error.message.includes('already in use')) {
        res.status(409).json({
          error: {
            code: 'EMAIL_EXISTS',
            message: error.message,
            timestamp: new Date(),
          },
        });
        return;
      }

      // Handle database constraint violations
      if (error instanceof Error && error.message.includes('constraint')) {
        res.status(400).json({
          error: {
            code: 'CONSTRAINT_VIOLATION',
            message: 'Invalid data format. Please check your input and try again.',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Handle user not found during update
      if (error instanceof Error && error.message.includes('User not found')) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User account not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Generic server error
      res.status(500).json({
        error: {
          code: 'UPDATE_ERROR',
          message: 'Failed to update user profile',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Update specific profile field (PATCH endpoint for partial updates)
   * PATCH /api/user/profile/:field
   */
  static async updateProfileField(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
            timestamp: new Date(),
          },
        });
        return;
      }

      const { field } = req.params;
      const { value } = req.body;

      // Validate field name
      const allowedFields = ['name', 'email', 'company', 'website', 'location', 'bio', 'phone'];
      if (!allowedFields.includes(field)) {
        res.status(400).json({
          error: {
            code: 'INVALID_FIELD',
            message: `Field '${field}' is not allowed. Allowed fields: ${allowedFields.join(', ')}`,
            timestamp: new Date(),
          },
        });
        return;
      }

      // Create update object with single field
      const updateData = { [field]: value };
      
      // Validate using existing validation logic
      const validation = UserController.validateProfileUpdateRequest(updateData);
      
      if (!validation.isValid) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: validation.errors.join('; '),
            field,
            timestamp: new Date(),
          },
        });
        return;
      }

      console.log(`Single field update for user ${req.userId}: ${field}`);

      const updatedProfile = await userService.updateUserProfile(req.userId, validation.updates);
      
      if (!updatedProfile) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      res.json({
        user: updatedProfile,
        message: `${field.charAt(0).toUpperCase() + field.slice(1)} updated successfully`,
        updatedField: field,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error(`Update profile field error for field '${req.params.field}':`, error);
      
      // Handle specific errors
      if (error instanceof Error && error.message.includes('already in use')) {
        res.status(409).json({
          error: {
            code: 'EMAIL_EXISTS',
            message: error.message,
            field: req.params.field,
            timestamp: new Date(),
          },
        });
        return;
      }

      res.status(500).json({
        error: {
          code: 'UPDATE_ERROR',
          message: `Failed to update ${req.params.field}`,
          field: req.params.field,
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get user statistics
   * GET /api/user/stats
   */
  static async getStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
            timestamp: new Date(),
          },
        });
        return;
      }

      const stats = await userService.getUserStats(req.userId);
      
      if (!stats) {
        res.status(404).json({
          error: {
            code: 'STATS_NOT_FOUND',
            message: 'User statistics not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      res.json({
        stats,
      });
    } catch (error) {
      console.error('Get stats error:', error);
      res.status(500).json({
        error: {
          code: 'STATS_ERROR',
          message: 'Failed to fetch user statistics',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get user credit balance
   * GET /api/user/credits
   */
  static async getCredits(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
            timestamp: new Date(),
          },
        });
        return;
      }

      const credits = await userService.getUserCredits(req.userId);
      
      if (credits === null) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      res.json({
        credits,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Get credits error:', error);
      res.status(500).json({
        error: {
          code: 'CREDITS_ERROR',
          message: 'Failed to fetch user credits',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Initialize user account (called on first login)
   * POST /api/user/initialize
   */
  static async initializeUser(req: Request, res: Response): Promise<void> {
    try {
      const token = authService.extractTokenFromHeader(req.headers.authorization);
      
      if (!token) {
        res.status(401).json({
          error: {
            code: 'MISSING_TOKEN',
            message: 'Authorization token is required',
            timestamp: new Date(),
          },
        });
        return;
      }

      const userProfile = await userService.authenticateUser(token);
      
      if (!userProfile) {
        res.status(401).json({
          error: {
            code: 'AUTHENTICATION_FAILED',
            message: 'Failed to authenticate user',
            timestamp: new Date(),
          },
        });
        return;
      }

      res.json({
        user: userProfile,
        message: 'User initialized successfully',
        isNewUser: userProfile.createdAt.getTime() > (Date.now() - 60000), // Created within last minute
      });
    } catch (error) {
      console.error('Initialize user error:', error);
      res.status(500).json({
        error: {
          code: 'INITIALIZATION_ERROR',
          message: 'Failed to initialize user',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Delete user account
   * DELETE /api/user/account
   */
  static async deleteAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
            timestamp: new Date(),
          },
        });
        return;
      }

      const success = await userService.deleteUser(req.userId);
      
      if (!success) {
        res.status(500).json({
          error: {
            code: 'DELETE_ERROR',
            message: 'Failed to delete user account',
            timestamp: new Date(),
          },
        });
        return;
      }

      res.json({
        message: 'User account deleted successfully',
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Delete account error:', error);
      res.status(500).json({
        error: {
          code: 'DELETE_ERROR',
          message: 'Failed to delete user account',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get profile completion status
   * GET /api/user/profile/completion
   */
  static async getProfileCompletion(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
            timestamp: new Date(),
          },
        });
        return;
      }

      const profile = await userService.getUserProfile(req.userId);
      
      if (!profile) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User profile not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Calculate completion status
      const requiredFields = ['name', 'email'];
      const optionalFields = ['company', 'website', 'location', 'bio', 'phone'];
      
      const completedRequired = requiredFields.filter(field => 
        profile[field as keyof typeof profile] && 
        String(profile[field as keyof typeof profile]).trim().length > 0
      );
      
      const completedOptional = optionalFields.filter(field => 
        profile[field as keyof typeof profile] && 
        String(profile[field as keyof typeof profile]).trim().length > 0
      );

      const totalFields = requiredFields.length + optionalFields.length;
      const completedFields = completedRequired.length + completedOptional.length;
      const completionPercentage = Math.round((completedFields / totalFields) * 100);

      const missingRequired = requiredFields.filter(field => 
        !profile[field as keyof typeof profile] || 
        String(profile[field as keyof typeof profile]).trim().length === 0
      );

      const missingOptional = optionalFields.filter(field => 
        !profile[field as keyof typeof profile] || 
        String(profile[field as keyof typeof profile]).trim().length === 0
      );

      res.json({
        completion: {
          percentage: completionPercentage,
          isComplete: missingRequired.length === 0,
          requiredFieldsComplete: completedRequired.length === requiredFields.length,
          totalFields,
          completedFields,
          requiredFields: {
            total: requiredFields.length,
            completed: completedRequired.length,
            missing: missingRequired,
          },
          optionalFields: {
            total: optionalFields.length,
            completed: completedOptional.length,
            missing: missingOptional,
          },
        },
        profile: {
          hasName: !!profile.name,
          hasEmail: !!profile.email,
          hasCompany: !!profile.company,
          hasWebsite: !!profile.website,
          hasLocation: !!profile.location,
          hasBio: !!profile.bio,
          hasPhone: !!profile.phone,
          emailVerified: profile.emailVerified,
        },
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Get profile completion error:', error);
      res.status(500).json({
        error: {
          code: 'COMPLETION_ERROR',
          message: 'Failed to get profile completion status',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Check credit balance and requirements
   * POST /api/user/check-credits
   */
  static async checkCredits(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
            timestamp: new Date(),
          },
        });
        return;
      }

      const { requiredCredits = 1 } = req.body;
      
      const currentCredits = await userService.getUserCredits(req.userId);
      const hasEnoughCredits = await userService.hasCredits(req.userId, requiredCredits);
      
      res.json({
        currentCredits,
        requiredCredits,
        hasEnoughCredits,
        needsTopUp: !hasEnoughCredits,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Check credits error:', error);
      res.status(500).json({
        error: {
          code: 'CREDITS_CHECK_ERROR',
          message: 'Failed to check credit balance',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Update user password
   * PUT /api/user/password
   */
  static async updatePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
            timestamp: new Date(),
          },
        });
        return;
      }

      const { currentPassword, newPassword } = req.body;

      // Validate input
      if (!currentPassword || !newPassword) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Current password and new password are required',
            timestamp: new Date(),
          },
        });
        return;
      }

      if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Passwords must be strings',
            timestamp: new Date(),
          },
        });
        return;
      }

      if (newPassword.length < 6) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'New password must be at least 6 characters long',
            timestamp: new Date(),
          },
        });
        return;
      }

      if (currentPassword === newPassword) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'New password must be different from current password',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Update password using userService
      const success = await userService.updatePassword(req.userId, currentPassword, newPassword);
      
      if (!success) {
        res.status(400).json({
          error: {
            code: 'INVALID_PASSWORD',
            message: 'Current password is incorrect',
            timestamp: new Date(),
          },
        });
        return;
      }

      console.log(`Password updated successfully for user ${req.userId}`);

      res.json({
        message: 'Password updated successfully',
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Update password error:', error);
      
      if (error instanceof Error && error.message.includes('Current password is incorrect')) {
        res.status(400).json({
          error: {
            code: 'INVALID_PASSWORD',
            message: 'Current password is incorrect',
            timestamp: new Date(),
          },
        });
        return;
      }

      if (error instanceof Error && error.message.includes('User not found')) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User account not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      res.status(500).json({
        error: {
          code: 'PASSWORD_UPDATE_ERROR',
          message: 'Failed to update password',
          timestamp: new Date(),
        },
      });
    }
  }

  // Cache for credit status to prevent excessive database queries
  private static creditStatusCache: Map<string, { data: any; timestamp: number }> = new Map();
  private static readonly CACHE_TTL = 30000; // 30 seconds cache

  /**
   * Get comprehensive credit status for dashboard and warnings
   * GET /api/user/credit-status
   */
  static async getCreditStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
        return;
      }
      const userId = req.user.id;

      // Check cache first
      const cached = UserController.creditStatusCache.get(userId);
      const now = Date.now();
      if (cached && (now - cached.timestamp) < UserController.CACHE_TTL) {
        // Return cached response with updated timestamp
        res.json({
          ...cached.data,
          cached: true,
          timestamp: new Date()
        });
        return;
      }
      
      // Get current credits
      const currentCredits = await userService.getUserCredits(userId);
      
      if (currentCredits === null) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date(),
          },
        });
        return;
      }
      
      // Get user details for warning tracking
      const user = await userService.getUserProfile(userId);
      
      if (!user) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Determine credit status and warning level
      let status: 'healthy' | 'warning' | 'critical' | 'depleted';
      let color: 'green' | 'yellow' | 'orange' | 'red';
      let warningLevel: number;
      let showBanner = false;
      let bannerMessage = '';
      let canInitiateCalls = true;

      if (currentCredits > 15) {
        status = 'healthy';
        color = 'green';
        warningLevel = 0;
      } else if (currentCredits > 5) {
        status = 'warning';
        color = 'yellow';
        warningLevel = 1;
      } else if (currentCredits > 0) {
        status = 'critical';
        color = 'orange';
        warningLevel = 2;
      } else {
        status = 'depleted';
        color = 'red';
        warningLevel = 3;
        showBanner = true;
        canInitiateCalls = false;
        if (currentCredits === 0) {
          bannerMessage = 'Your credit balance is zero. Please purchase more credits to continue making calls.';
        } else {
          bannerMessage = `Your credit balance is negative (${currentCredits}). Please purchase more credits to continue making calls.`;
        }
      }

      const responseData = {
        success: true,
        credits: {
          current: currentCredits,
          status,
          color,
          warningLevel
        },
        capabilities: {
          canInitiateCalls,
          canCreateCampaigns: currentCredits >= 0, // Allow campaign creation even at 0, but not calls
          canStartCampaigns: currentCredits > 0
        },
        warnings: {
          showBanner,
          bannerMessage,
          bannerType: status === 'depleted' ? 'error' : status === 'critical' ? 'warning' : 'info',
          isDismissible: false // Credit warnings should not be dismissible
        },
        recommendations: {
          suggestedTopUp: currentCredits <= 5 ? Math.max(50 - currentCredits, 20) : 0,
          urgency: warningLevel >= 2 ? 'high' : warningLevel === 1 ? 'medium' : 'low'
        },
        cached: false,
        timestamp: new Date()
      };

      // Store in cache
      UserController.creditStatusCache.set(userId, {
        data: responseData,
        timestamp: Date.now()
      });

      res.json(responseData);
    } catch (error) {
      console.error('Get credit status error:', error);
      res.status(500).json({
        error: {
          code: 'CREDIT_STATUS_ERROR',
          message: 'Failed to get credit status',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get credit requirements and warnings for campaign creation
   * POST /api/user/campaign-credit-check
   */
  static async campaignCreditCheck(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
        return;
      }
      const userId = req.user.id;
      const { contactCount, estimateOnly = false } = req.body;

      if (!contactCount || typeof contactCount !== 'number' || contactCount <= 0) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Valid contactCount is required',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Get current credits
      const currentCredits = await userService.getUserCredits(userId);
      
      if (currentCredits === null) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date(),
          },
        });
        return;
      }
      
      // Get cost estimation
      const { CreditEstimationService } = await import('../services/creditEstimationService');
      const estimate = await CreditEstimationService.estimateCreditsForCampaign(userId, contactCount);
      const formatted = CreditEstimationService.formatEstimateForDisplay(estimate);

      // Calculate affordability
      const canAfford = currentCredits >= estimate.estimatedTotalCredits;
      const shortfall = canAfford ? 0 : estimate.estimatedTotalCredits - currentCredits;
      
      // Determine warning messages
      let warningType: 'none' | 'info' | 'warning' | 'error' = 'none';
      let warningMessage = '';
      let canProceed = true;

      if (!canAfford) {
        warningType = 'error';
        warningMessage = `Insufficient credits. You need ${shortfall} more credits to run this campaign.`;
        canProceed = false;
      } else if (currentCredits - estimate.estimatedTotalCredits <= 5) {
        warningType = 'warning';
        warningMessage = `Running this campaign will leave you with ${currentCredits - estimate.estimatedTotalCredits} credits remaining.`;
      } else if (currentCredits - estimate.estimatedTotalCredits <= 15) {
        warningType = 'info';
        warningMessage = `This campaign will use approximately ${estimate.estimatedTotalCredits} credits.`;
      }

      res.json({
        success: true,
        currentCredits,
        estimate,
        formatted,
        affordability: {
          canAfford,
          shortfall,
          remainingAfter: currentCredits - estimate.estimatedTotalCredits,
          canProceed: estimateOnly ? true : canProceed
        },
        warnings: {
          type: warningType,
          message: warningMessage,
          showWarning: warningType !== 'none'
        },
        recommendations: {
          suggestedTopUp: shortfall > 0 ? Math.max(shortfall + 20, 50) : 0
        },
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Campaign credit check error:', error);
      res.status(500).json({
        error: {
          code: 'CAMPAIGN_CREDIT_CHECK_ERROR',
          message: 'Failed to check campaign credit requirements',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get real-time credit alerts and monitoring data
   * GET /api/user/credit-alerts
   */
  static async getCreditAlerts(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
        return;
      }
      const userId = req.user.id;
      
      const { creditMonitoringService } = await import('../services/creditMonitoringService');
      
      // Get current credit status
      const creditStatus = await creditMonitoringService.getCreditStatus(userId);
      
      // Check for immediate attention needs
      const attentionCheck = await creditMonitoringService.checkForImmediateAttention(userId);
      
      res.json({
        success: true,
        creditStatus,
        attention: attentionCheck,
        monitoring: {
          enabled: true,
          lastUpdate: new Date()
        },
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Get credit alerts error:', error);
      res.status(500).json({
        error: {
          code: 'CREDIT_ALERTS_ERROR',
          message: 'Failed to get credit alerts',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Record a credit event (for integration with billing/webhook services)
   * POST /api/user/credit-event
   */
  static async recordCreditEvent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
        return;
      }
      const userId = req.user.id;
      const { type, previousCredits, currentCredits, amount, source, metadata } = req.body;

      if (!type || previousCredits === undefined || currentCredits === undefined || !amount || !source) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Missing required fields: type, previousCredits, currentCredits, amount, source',
            timestamp: new Date(),
          },
        });
        return;
      }

      const { creditMonitoringService } = await import('../services/creditMonitoringService');
      
      await creditMonitoringService.recordCreditEvent({
        type,
        userId,
        previousCredits,
        currentCredits,
        amount,
        source,
        metadata,
        timestamp: new Date()
      });

      res.json({
        success: true,
        message: 'Credit event recorded successfully',
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Record credit event error:', error);
      res.status(500).json({
        error: {
          code: 'CREDIT_EVENT_ERROR',
          message: 'Failed to record credit event',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Get login warnings and credit alerts
   * GET /api/user/login-status
   */
  static async getLoginStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
        return;
      }
      const userId = req.user.id;
      
      // Get current credits and user info
      const currentCredits = await userService.getUserCredits(userId);
      const user = await userService.getUserProfile(userId);
      
      if (!user || currentCredits === null) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date(),
          },
        });
        return;
      }

      // Check if user should see login warnings
      let showLoginBanner = false;
      let loginBannerMessage = '';
      let loginBannerType: 'info' | 'warning' | 'error' = 'info';

      if (currentCredits <= 0) {
        showLoginBanner = true;
        loginBannerType = 'error';
        if (currentCredits === 0) {
          loginBannerMessage = 'Welcome back! Your credit balance is zero. Purchase credits to start making calls.';
        } else {
          loginBannerMessage = `Welcome back! Your credit balance is negative (${currentCredits}). Please purchase credits to continue.`;
        }
      } else if (currentCredits <= 5) {
        showLoginBanner = true;
        loginBannerType = 'warning';
        loginBannerMessage = `Welcome back! You have ${currentCredits} credits remaining. Consider topping up soon.`;
      } else if (currentCredits <= 15) {
        showLoginBanner = true;
        loginBannerType = 'info';
        loginBannerMessage = `Welcome back! You have ${currentCredits} credits remaining.`;
      }

      // Check for recent credit events

      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          credits: currentCredits
        },
        loginWarnings: {
          showBanner: showLoginBanner,
          message: loginBannerMessage,
          type: loginBannerType,
          autoHide: loginBannerType === 'info', // Only info messages auto-hide
          duration: 8000 // 8 seconds for auto-hide
        },
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Get login status error:', error);
      res.status(500).json({
        error: {
          code: 'LOGIN_STATUS_ERROR',
          message: 'Failed to get login status',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Estimate credits needed for a campaign
   */
  static async estimateCredits(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
        return;
      }
      const userId = req.user.id;
      const { contactCount } = req.body;

      if (!contactCount || typeof contactCount !== 'number' || contactCount <= 0) {
        res.status(400).json({
          error: 'Valid contactCount is required'
        });
        return;
      }

      const { CreditEstimationService } = await import('../services/creditEstimationService');
      const estimate = await CreditEstimationService.estimateCreditsForCampaign(userId, contactCount);
      const formatted = CreditEstimationService.formatEstimateForDisplay(estimate);

      res.json({
        success: true,
        estimate,
        formatted
      });
    } catch (error) {
      console.error('Credit estimation error:', error);
      res.status(500).json({
        error: {
          code: 'CREDIT_ESTIMATION_ERROR',
          message: 'Failed to estimate credit requirements',
          timestamp: new Date(),
        },
      });
    }
  }

}

export default UserController;