import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { databaseService } from './databaseService';
import { emailService } from './emailService';
import { configService } from './configService';
import { chatAgentUserSyncService } from './chatAgentUserSyncService';
import database from '../config/database';

export interface User {
  id: string;
  email: string;
  name: string;
  credits: number;
  isActive: boolean;
  emailVerified: boolean;
  role: string;
  authProvider: string;
  timezone?: string;
  timezone_auto_detected?: boolean;
  timezone_manually_set?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface JWTPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
  type?: 'access' | 'refresh';
}

interface LoginAttempt {
  email: string;
  ipAddress?: string;
  success: boolean;
  failureReason?: string;
}

class AuthService {
  private readonly JWT_SECRET: string;
  private readonly JWT_REFRESH_EXPIRES_IN = '7d'; // 7 days for refresh tokens
  private readonly SALT_ROUNDS = 12;
  private sessionCleanupInterval: NodeJS.Timeout | null = null;
  private readonly SESSION_RETENTION_DAYS = 15; // Keep sessions for 15 days

  constructor() {
    this.JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
    
    if (!process.env.JWT_SECRET) {
      console.warn('JWT_SECRET not set in environment variables. Using default (not secure for production)');
    }
  }

  /**
   * Hash password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT access token
   */
  generateToken(user: User): string {
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      type: 'access',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (configService.get('session_duration_hours') * 60 * 60), // From config
    };

    return jwt.sign(payload, this.JWT_SECRET);
  }

  /**
   * Generate JWT refresh token
   */
  generateRefreshToken(user: User): string {
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
    };

    return jwt.sign(payload, this.JWT_SECRET);
  }

  /**
   * Verify JWT token
   */
  async verifyToken(token: string): Promise<JWTPayload | null> {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET) as JWTPayload;
      return decoded;
    } catch (error) {
      console.error('JWT verification failed:', error);
      return null;
    }
  }

  /**
   * Generate secure random token for password reset/email verification
   */
  generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Register new user
   */
  async register(
    email: string, 
    password: string, 
    name: string,
    options?: {
      timezone?: string;
      timezoneAutoDetected?: boolean;
    }
  ): Promise<{ user: User; token: string; refreshToken: string } | null> {
    // Check if user already exists
    const existingUser = await this.getUserByEmail(email);
    if (existingUser) {
      throw new Error('User already exists with this email');
    }

    // Hash password
    const passwordHash = await this.hashPassword(password);

    // Prepare timezone data
    const timezone = options?.timezone || 'UTC';
    const timezoneAutoDetected = options?.timezoneAutoDetected ?? false;

    // Create user with timezone
    const query = `
      INSERT INTO users (
        email, name, password_hash, credits, is_active, email_verified, 
        auth_provider, role, timezone, timezone_auto_detected, 
        timezone_manually_set, timezone_updated_at
      )
      VALUES ($1, $2, $3, 15, true, false, 'email', 'user', $4, $5, $6, NOW())
      RETURNING id, email, name, credits, is_active, email_verified, role, 
                auth_provider, timezone, created_at, updated_at
    `;

    const result = await databaseService.query(query, [
      email, 
      name, 
      passwordHash,
      timezone,
      timezoneAutoDetected,
      !timezoneAutoDetected
    ]);
    
    if (result.rows.length === 0) {
      throw new Error('Failed to create user');
    }

    const userData = result.rows[0];
    const user: User = {
      id: userData.id,
      email: userData.email,
      name: userData.name,
      credits: userData.credits,
      isActive: userData.is_active,
      emailVerified: userData.email_verified,
      role: userData.role,
      authProvider: userData.auth_provider,
      createdAt: userData.created_at,
      updatedAt: userData.updated_at,
    };

    // Generate JWT tokens
    const token = this.generateToken(user);
    const refreshToken = this.generateRefreshToken(user);

    // Create session with both tokens
    await this.createSession(user.id, token, undefined, undefined, refreshToken);

    // Send email verification for new users (async, don't wait)
    if (emailService.isEmailConfigured()) {
      this.sendEmailVerificationToNewUser(user).catch(error => {
        console.error('Failed to send verification email to new user:', error);
      });
    }

    // Sync user to Chat Agent Server for WhatsApp features (async, non-blocking)
    // Retry schedule: immediate → 60 minutes → 12 hours
    chatAgentUserSyncService.syncNewUser(user.id, user.email).catch(error => {
      console.error('Failed to sync user to Chat Agent Server:', error);
    });

    // Log successful registration
    await this.logLoginAttempt({
      email,
      success: true,
    });

    return { user, token, refreshToken };
  }

  /**
   * Login user
   */
  async login(email: string, password: string, ipAddress?: string): Promise<{ user: User; token: string; refreshToken: string } | null> {
    try {
      // Check for account lockout
      const isLocked = await this.isAccountLocked(email);
      if (isLocked) {
        await this.createSessionAndLogLogin('', '', email, false, ipAddress, 'account_locked');
        throw new Error('Account is temporarily locked due to too many failed attempts');
      }

      // Get user and password hash in a single query for better performance
      const userQuery = `
        SELECT id, email, name, credits, is_active, email_verified, role, auth_provider, 
               created_at, updated_at, password_hash
        FROM users 
        WHERE email = $1
      `;
      
      const userResult = await databaseService.query(userQuery, [email]);
      
      if (userResult.rows.length === 0) {
        await this.createSessionAndLogLogin('', '', email, false, ipAddress, 'user_not_found');
        throw new Error('Invalid email or password');
      }

      const userData = userResult.rows[0];
      const passwordHash = userData.password_hash;
      
      // Create user object
      const user: User = {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        credits: userData.credits,
        isActive: userData.is_active,
        emailVerified: userData.email_verified,
        role: userData.role,
        authProvider: userData.auth_provider,
        createdAt: userData.created_at,
        updatedAt: userData.updated_at,
      };
      
      // Verify password
      const isValidPassword = await this.verifyPassword(password, passwordHash);
      if (!isValidPassword) {
        await this.createSessionAndLogLogin('', '', email, false, ipAddress, 'invalid_password');
        throw new Error('Invalid email or password');
      }

      // Check if user is active
      if (!user.isActive) {
        await this.createSessionAndLogLogin('', '', email, false, ipAddress, 'account_inactive');
        throw new Error('Account is deactivated');
      }

      // Generate JWT tokens
      const token = this.generateToken(user);
      const refreshToken = this.generateRefreshToken(user);

      // Create session and log login attempt in a single transaction for better performance
      await this.createSessionAndLogLogin(user.id, token, email, true, ipAddress, undefined, refreshToken);

      return { user, token, refreshToken };
    } catch (error) {
      console.error('Login failed:', error);
      return null;
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const query = `
        SELECT id, email, name, credits, is_active, email_verified, role, auth_provider, 
               timezone, timezone_auto_detected, timezone_manually_set, created_at, updated_at
        FROM users 
        WHERE email = $1
      `;
      
      const result = await databaseService.query(query, [email]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const userData = result.rows[0];
      return {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        credits: userData.credits,
        isActive: userData.is_active,
        emailVerified: userData.email_verified,
        role: userData.role,
        authProvider: userData.auth_provider,
        timezone: userData.timezone,
        timezone_auto_detected: userData.timezone_auto_detected,
        timezone_manually_set: userData.timezone_manually_set,
        createdAt: userData.created_at,
        updatedAt: userData.updated_at,
      };
    } catch (error) {
      console.error('Error getting user by email:', error);
      return null;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    try {
      const query = `
        SELECT id, email, name, credits, is_active, email_verified, role, auth_provider, 
               timezone, timezone_auto_detected, timezone_manually_set, created_at, updated_at
        FROM users 
        WHERE id = $1
      `;
      
      const result = await databaseService.query(query, [userId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const userData = result.rows[0];
      return {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        credits: userData.credits,
        isActive: userData.is_active,
        emailVerified: userData.email_verified,
        role: userData.role,
        authProvider: userData.auth_provider,
        timezone: userData.timezone,
        timezone_auto_detected: userData.timezone_auto_detected,
        timezone_manually_set: userData.timezone_manually_set,
        createdAt: userData.created_at,
        updatedAt: userData.updated_at,
      };
    } catch (error) {
      console.error('Error getting user by ID:', error);
      return null;
    }
  }

  /**
   * Validate session token
   */
  async validateSession(token: string): Promise<User | null> {
    try {
      const payload = await this.verifyToken(token);
      if (!payload) {
        return null;
      }

      // Check if session exists and is active
      const sessionQuery = `
        SELECT user_id FROM user_sessions 
        WHERE token_hash = $1 AND is_active = true AND expires_at > CURRENT_TIMESTAMP
      `;
      
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const sessionResult = await databaseService.query(sessionQuery, [tokenHash]);
      
      if (sessionResult.rows.length === 0) {
        return null;
      }

      // Get user data
      const user = await this.getUserById(payload.userId);
      
      if (user && user.isActive) {
        // Update session last used time
        await this.updateSessionActivity(payload.userId, tokenHash);
        return user;
      }

      return null;
    } catch (error) {
      console.error('Session validation failed:', error);
      return null;
    }
  }

  /**
   * Create user session
   */
  async createSession(userId: string, token: string, ipAddress?: string, userAgent?: string, refreshToken?: string): Promise<void> {
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const refreshTokenHash = refreshToken ? crypto.createHash('sha256').update(refreshToken).digest('hex') : null;
      const sessionHours = configService.get('session_duration_hours');
      const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000); // From config
      const refreshExpiresAt = refreshToken ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null; // 7 days

      const query = `
        INSERT INTO user_sessions (user_id, token_hash, refresh_token_hash, expires_at, refresh_expires_at, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      await databaseService.query(query, [userId, tokenHash, refreshTokenHash, expiresAt, refreshExpiresAt, ipAddress, userAgent]);
    } catch (error) {
      console.error('Error creating session:', error);
    }
  }

  /**
   * Create session and log login attempt in a single transaction for better performance
   */
  async createSessionAndLogLogin(userId: string, token: string, email: string, success: boolean, ipAddress?: string, failureReason?: string, refreshToken?: string): Promise<void> {
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const refreshTokenHash = refreshToken ? crypto.createHash('sha256').update(refreshToken).digest('hex') : null;
      const sessionHours = configService.get('session_duration_hours');
      const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000); // From config
      const refreshExpiresAt = refreshToken ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null; // 7 days

      // Use a transaction to combine both operations
      await database.transaction(async (client) => {
        // Create session
        if (success) {
          await client.query(
            'INSERT INTO user_sessions (user_id, token_hash, refresh_token_hash, expires_at, refresh_expires_at, ip_address) VALUES ($1, $2, $3, $4, $5, $6)',
            [userId, tokenHash, refreshTokenHash, expiresAt, refreshExpiresAt, ipAddress]
          );
          
          // Update last_login timestamp for successful logins
          await client.query(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [userId]
          );
        }

        // Log login attempt
        await client.query(
          'INSERT INTO login_attempts (email, ip_address, success, failure_reason) VALUES ($1, $2, $3, $4)',
          [email, ipAddress, success, failureReason]
        );
      });
    } catch (error) {
      console.error('Error creating session and logging login:', error);
    }
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(userId: string, tokenHash: string): Promise<void> {
    try {
      const query = `
        UPDATE user_sessions 
        SET last_used_at = CURRENT_TIMESTAMP 
        WHERE user_id = $1 AND token_hash = $2 AND is_active = true
      `;

      await databaseService.query(query, [userId, tokenHash]);
    } catch (error) {
      console.error('Error updating session activity:', error);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<{ user: User; token: string; refreshToken: string } | null> {
    try {
      // Verify refresh token
      const payload = await this.verifyToken(refreshToken);
      if (!payload || payload.type !== 'refresh') {
        return null;
      }

      // Check if refresh token exists and is active
      const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const sessionQuery = `
        SELECT user_id FROM user_sessions 
        WHERE refresh_token_hash = $1 AND is_active = true AND refresh_expires_at > CURRENT_TIMESTAMP
      `;
      
      const sessionResult = await databaseService.query(sessionQuery, [refreshTokenHash]);
      
      if (sessionResult.rows.length === 0) {
        return null;
      }

      // Get user data
      const user = await this.getUserById(payload.userId);
      
      if (!user || !user.isActive) {
        return null;
      }

      // Generate new tokens
      const newToken = this.generateToken(user);
      const newRefreshToken = this.generateRefreshToken(user);

      // Update session with new tokens
      const newTokenHash = crypto.createHash('sha256').update(newToken).digest('hex');
      const newRefreshTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
      const sessionHours = configService.get('session_duration_hours');
      const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000); // From config
      const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const updateQuery = `
        UPDATE user_sessions 
        SET token_hash = $1, refresh_token_hash = $2, expires_at = $3, refresh_expires_at = $4, last_used_at = CURRENT_TIMESTAMP
        WHERE refresh_token_hash = $5 AND is_active = true
      `;

      await databaseService.query(updateQuery, [
        newTokenHash, 
        newRefreshTokenHash, 
        expiresAt, 
        refreshExpiresAt, 
        refreshTokenHash
      ]);

      return { user, token: newToken, refreshToken: newRefreshToken };
    } catch (error) {
      console.error('Token refresh failed:', error);
      return null;
    }
  }

  /**
   * Logout user (invalidate session)
   */
  async logout(token: string): Promise<void> {
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      
      const query = `
        UPDATE user_sessions 
        SET is_active = false 
        WHERE token_hash = $1 OR refresh_token_hash = $1
      `;

      await databaseService.query(query, [tokenHash]);
    } catch (error) {
      console.error('Error during logout:', error);
    }
  }

  /**
   * Log login attempt for security monitoring
   */
  async logLoginAttempt(attempt: LoginAttempt): Promise<void> {
    try {
      const query = `
        INSERT INTO login_attempts (email, ip_address, success, failure_reason)
        VALUES ($1, $2, $3, $4)
      `;

      await databaseService.query(query, [
        attempt.email,
        attempt.ipAddress,
        attempt.success,
        attempt.failureReason,
      ]);
    } catch (error) {
      console.error('Error logging login attempt:', error);
    }
  }

  /**
   * Check if account is locked due to failed attempts
   */
  async isAccountLocked(email: string): Promise<boolean> {
    try {
      const lockoutMinutes = configService.get('lockout_duration_minutes');
      const query = `
        SELECT COUNT(*) as failed_count
        FROM login_attempts 
        WHERE email = $1 
          AND success = false 
          AND attempted_at > CURRENT_TIMESTAMP - INTERVAL '${lockoutMinutes} minutes'
      `;

      const result = await databaseService.query(query, [email]);
      const failedCount = parseInt(result.rows[0].failed_count);

      const maxAttempts = configService.get('max_login_attempts');
      return failedCount >= maxAttempts;
    } catch (error) {
      console.error('Error checking account lock status:', error);
      return false;
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }

  /**
   * Clean up old sessions (older than 15 days)
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const query = `
        DELETE FROM user_sessions 
        WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '${this.SESSION_RETENTION_DAYS} days'
      `;

      const result = await databaseService.query(query);
      const deletedCount = result.rowCount || 0;
      
      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} session(s) older than ${this.SESSION_RETENTION_DAYS} days`);
      }
      
      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up old sessions:', error);
      return 0;
    }
  }

  /**
   * Calculate milliseconds until next 12 AM
   */
  private getMillisecondsUntilMidnight(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.getTime() - now.getTime();
  }

  /**
   * Start automatic session cleanup (runs daily at 12 AM)
   */
  startSessionCleanup(): void {
    if (this.sessionCleanupInterval) {
      console.log('⚠️ Session cleanup already running');
      return;
    }

    console.log('🔄 Starting automatic session cleanup (runs daily at 12 AM)');
    
    // Run cleanup immediately on startup
    this.cleanupExpiredSessions().catch(error => {
      console.error('Initial session cleanup failed:', error);
    });

    // Schedule daily cleanup at 12 AM
    const scheduleNextCleanup = () => {
      const msUntilMidnight = this.getMillisecondsUntilMidnight();
      console.log(`⏰ Next session cleanup scheduled in ${Math.round(msUntilMidnight / 1000 / 60 / 60)} hours`);
      
      this.sessionCleanupInterval = setTimeout(() => {
        this.cleanupExpiredSessions().catch(error => {
          console.error('Scheduled session cleanup failed:', error);
        });
        // Schedule next cleanup
        scheduleNextCleanup();
      }, msUntilMidnight);
    };

    scheduleNextCleanup();
  }

  /**
   * Stop automatic session cleanup
   */
  stopSessionCleanup(): void {
    if (this.sessionCleanupInterval) {
      clearTimeout(this.sessionCleanupInterval);
      this.sessionCleanupInterval = null;
      console.log('🛑 Stopped automatic session cleanup');
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStatistics(): Promise<{
    total: number;
    active: number;
    expired: number;
  }> {
    try {
      const statsQuery = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE is_active = true AND expires_at > CURRENT_TIMESTAMP) as active,
          COUNT(*) FILTER (WHERE expires_at < CURRENT_TIMESTAMP OR is_active = false) as expired
        FROM user_sessions
      `;
      
      const result = await databaseService.query(statsQuery);
      
      if (result.rows.length > 0) {
        return {
          total: parseInt(result.rows[0].total, 10),
          active: parseInt(result.rows[0].active, 10),
          expired: parseInt(result.rows[0].expired, 10)
        };
      }
      
      return { total: 0, active: 0, expired: 0 };
    } catch (error) {
      console.error('Error getting session statistics:', error);
      return { total: 0, active: 0, expired: 0 };
    }
  }

  /**
   * Find or create user from Google OAuth profile
   * Handles account linking for existing email users
   */
  async findOrCreateGoogleUser(googleProfile: {
    googleId: string;
    email: string;
    name: string;
    profilePicture?: string;
    firstName?: string;
    lastName?: string;
  }): Promise<{ user: User; isNewUser: boolean } | null> {
    try {
      // First, check if user already exists by email (for account linking)
      const existingUser = await this.getUserByEmail(googleProfile.email);
      
      if (existingUser) {
        // User exists with this email - link Google account
        const updateQuery = `
          UPDATE users 
          SET google_id = $1, profile_picture = $2, updated_at = CURRENT_TIMESTAMP
          WHERE email = $3
          RETURNING id, email, name, credits, is_active, email_verified, role, auth_provider, created_at, updated_at
        `;
        
        const result = await databaseService.query(updateQuery, [
          googleProfile.googleId,
          googleProfile.profilePicture,
          googleProfile.email
        ]);
        
        if (result.rows.length > 0) {
          const userData = result.rows[0];
          console.log('Successfully linked Google account to existing user:', userData.id);
          
          return {
            user: {
              id: userData.id,
              email: userData.email,
              name: userData.name,
              credits: userData.credits,
              isActive: userData.is_active,
              emailVerified: userData.email_verified,
              role: userData.role,
              authProvider: userData.auth_provider,
              createdAt: userData.created_at,
              updatedAt: userData.updated_at,
            },
            isNewUser: false
          };
        }
      }
      
      // Check if user already exists by Google ID
      const googleUserQuery = `
        SELECT id, email, name, credits, is_active, email_verified, role, auth_provider, created_at, updated_at
        FROM users 
        WHERE google_id = $1
      `;
      
      const googleUserResult = await databaseService.query(googleUserQuery, [googleProfile.googleId]);
      
      if (googleUserResult.rows.length > 0) {
        // User exists with this Google ID
        const userData = googleUserResult.rows[0];
        return {
          user: {
            id: userData.id,
            email: userData.email,
            name: userData.name,
            credits: userData.credits,
            isActive: userData.is_active,
            emailVerified: userData.email_verified,
            role: userData.role,
            authProvider: userData.auth_provider,
            createdAt: userData.created_at,
            updatedAt: userData.updated_at,
          },
          isNewUser: false
        };
      }
      
      // Create new user from Google profile
      const createUserQuery = `
        INSERT INTO users (
          email, name, google_id, profile_picture, credits, is_active, 
          email_verified, auth_provider, role
        )
        VALUES ($1, $2, $3, $4, 15, true, true, 'google', 'user')
        RETURNING id, email, name, credits, is_active, email_verified, role, auth_provider, created_at, updated_at
      `;
      
      const createResult = await databaseService.query(createUserQuery, [
        googleProfile.email,
        googleProfile.name,
        googleProfile.googleId,
        googleProfile.profilePicture
      ]);
      
      if (createResult.rows.length > 0) {
        const userData = createResult.rows[0];
        console.log('Successfully created new user from Google profile:', userData.id);
        
        return {
          user: {
            id: userData.id,
            email: userData.email,
            name: userData.name,
            credits: userData.credits,
            isActive: userData.is_active,
            emailVerified: userData.email_verified,
            role: userData.role,
            authProvider: userData.auth_provider,
            createdAt: userData.created_at,
            updatedAt: userData.updated_at,
          },
          isNewUser: true
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error finding or creating Google user:', error);
      return null;
    }
  }

  /**
   * Send email verification to newly registered user
   */
  private async sendEmailVerificationToNewUser(user: User): Promise<void> {
    try {
      if (!emailService.isEmailConfigured()) {
        console.log('Email service not configured, skipping verification email');
        return;
      }

      // Use verification service to generate JWT-based verification URL
      const { verificationService } = await import('./verificationService');
      const verificationUrl = verificationService.generateVerificationUrl(user.id, user.email);

      const sent = await emailService.sendVerificationEmail({
        userEmail: user.email,
        userName: user.name,
        verificationUrl: verificationUrl,
      });

      if (sent) {
        console.log(`Email verification sent to: ${user.email}`);
      } else {
        console.error('Email service returned false while sending verification email');
      }
    } catch (error) {
      // Do not block registration on email send failure
      console.error('Failed to send verification email (continuing registration):', error);
    }
  }
}

export const authService = new AuthService();
export type { JWTPayload, LoginAttempt };