/**
 * Google Auth Service
 * 
 * Handles OAuth 2.0 authentication flow for Google Calendar integration.
 * Manages token lifecycle including acquisition, refresh, and revocation.
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { UserModel } from '../models/User';
import { logger } from '../utils/logger';
import axios from 'axios';
import {
  GoogleOAuthTokens,
  GoogleTokenRefreshResponse,
  GoogleUserInfo,
  CalendarConnectionStatus,
  ConnectCalendarResponse,
  OAuthCallbackResult,
  OAuthError,
  GOOGLE_OAUTH_SCOPES
} from '../types/googleCalendar';

class GoogleAuthService {
  private oauth2Client: OAuth2Client;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor() {
    // Load credentials from environment variables
    this.clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || '';
    this.clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '';
    this.redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || '';

    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      logger.warn('⚠️ Google Calendar OAuth credentials not configured in .env');
    }

    // Initialize OAuth2 client
    this.oauth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );
  }

  /**
   * Sync Google Calendar tokens to external microservice
   * This is called after successfully saving tokens to the main database
   */
  private async syncTokensToMicroservice(
    userId: string,
    accessToken: string,
    refreshToken: string,
    tokenExpiry: Date,
    scope: string
  ): Promise<void> {
    const microserviceUrl = process.env.CHAT_AGENT_SERVER_URL;
    
    if (!microserviceUrl) {
      logger.warn('⚠️ CHAT_AGENT_SERVER_URL not configured, skipping token sync to chat agent server', { userId });
      return;
    }

    try {
      logger.info('🔄 Syncing Google Calendar tokens to chat agent server', { 
        userId,
        chatAgentServerUrl: microserviceUrl 
      });

      const response = await axios.post(
        `${microserviceUrl}/api/users/${userId}/google-calendar/connect`,
        {
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expiry: tokenExpiry.toISOString(),
          scope: scope
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000 // 10 second timeout
        }
      );

      if (response.data.success) {
        logger.info('✅ Tokens synced to chat agent server successfully', {
          userId,
          tokenExpiry: response.data.token_expiry
        });
      } else {
        logger.error('❌ Chat agent server returned unsuccessful response', {
          userId,
          response: response.data
        });
      }
    } catch (error) {
      // Log error but don't throw - main OAuth flow should succeed even if sync fails
      logger.error('❌ Failed to sync tokens to chat agent server', {
        userId,
        chatAgentServerUrl: microserviceUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: axios.isAxiosError(error) ? {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        } : undefined
      });
    }
  }

  /**
   * Delete Google Calendar tokens from chat agent server
   * Called when user disconnects Google Calendar
   */
  private async deleteTokensFromMicroservice(userId: string): Promise<void> {
    const microserviceUrl = process.env.CHAT_AGENT_SERVER_URL;
    
    if (!microserviceUrl) {
      return;
    }

    try {
      logger.info('🔄 Deleting Google Calendar tokens from chat agent server', { userId });

      await axios.delete(
        `${microserviceUrl}/api/google-tokens/${userId}`,
        {
          timeout: 10000
        }
      );

      logger.info('✅ Tokens deleted from chat agent server successfully', { userId });
    } catch (error) {
      // Log but don't throw - disconnection should succeed even if chat agent server fails
      logger.error('❌ Failed to delete tokens from chat agent server', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Initiate OAuth flow and generate authorization URL
   */
  async initiateOAuthFlow(userId: string): Promise<ConnectCalendarResponse> {
    try {
      logger.info('🔐 Initiating Google Calendar OAuth flow', { userId });

      // Generate state parameter for CSRF protection
      const state = this.generateStateToken(userId);

      // Generate authorization URL
      const authUrl = this.oauth2Client.generateAuthUrl({
        access_type: 'offline', // Request refresh token
        scope: GOOGLE_OAUTH_SCOPES,
        state: state,
        prompt: 'consent' // Force consent screen to get refresh token
      });

      logger.info('✅ OAuth authorization URL generated', {
        userId,
        hasState: !!state
      });

      return {
        success: true,
        auth_url: authUrl,
        state: state
      };
    } catch (error) {
      logger.error('❌ Failed to initiate OAuth flow', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw new OAuthError(
        'Failed to initiate Google Calendar OAuth flow',
        'OAUTH_INIT_FAILED',
        { userId, error }
      );
    }
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleOAuthCallback(
    code: string,
    state: string
  ): Promise<OAuthCallbackResult> {
    try {
      // Verify state and extract user ID
      const userId = this.verifyStateToken(state);

      logger.info('🔄 Processing OAuth callback', {
        userId,
        hasCode: !!code
      });

      // Exchange authorization code for tokens
      const { tokens } = await this.oauth2Client.getToken(code);

      // Log the scopes received from Google to verify gmail.send is included
      logger.info('📝 OAuth tokens received from Google', {
        userId,
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        scopeReceived: tokens.scope,
        hasGmailScope: tokens.scope?.includes('gmail.send') || false,
        expiryDate: tokens.expiry_date
      });

      if (!tokens.access_token || !tokens.refresh_token) {
        logger.error('❌ Missing tokens from Google OAuth', {
          userId,
          hasAccessToken: !!tokens.access_token,
          hasRefreshToken: !!tokens.refresh_token,
          hint: 'If refresh_token is missing, user may need to revoke app access at https://myaccount.google.com/permissions'
        });
        throw new OAuthError(
          'Failed to obtain access or refresh token. If reconnecting, please revoke app access at https://myaccount.google.com/permissions first.',
          'TOKEN_MISSING'
        );
      }

      // Set credentials to get user info
      this.oauth2Client.setCredentials(tokens);

      // Get user's Google account info
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const userInfoResponse = await oauth2.userinfo.get();
      const userInfo: GoogleUserInfo = userInfoResponse.data as GoogleUserInfo;

      if (!userInfo.email) {
        throw new OAuthError(
          'Failed to obtain user email from Google',
          'USER_INFO_MISSING'
        );
      }

      // Calculate token expiry
      const tokenExpiry = tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : new Date(Date.now() + 3600 * 1000); // Default 1 hour

      // Update user record with Google Calendar credentials
      const userModel = new UserModel();
      await userModel.update(userId, {
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token,
        google_token_expiry: tokenExpiry,
        google_calendar_connected: true,
        google_calendar_id: 'primary',
        google_email: userInfo.email
      });

      logger.info('✅ Google Calendar connected successfully', {
        userId,
        googleEmail: userInfo.email
      });

      // Sync tokens to external microservice (non-blocking)
      const scopeString = tokens.scope || GOOGLE_OAUTH_SCOPES.join(' ');
      await this.syncTokensToMicroservice(
        userId,
        tokens.access_token,
        tokens.refresh_token,
        tokenExpiry,
        scopeString
      );

      return {
        success: true,
        user_id: userId,
        google_email: userInfo.email,
        message: 'Google Calendar connected successfully'
      };
    } catch (error) {
      logger.error('❌ OAuth callback failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      if (error instanceof OAuthError) {
        throw error;
      }

      throw new OAuthError(
        'Failed to complete Google Calendar OAuth',
        'OAUTH_CALLBACK_FAILED',
        { error }
      );
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<GoogleTokenRefreshResponse> {
    try {
      logger.info('🔄 Refreshing Google access token');

      this.oauth2Client.setCredentials({
        refresh_token: refreshToken
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new OAuthError(
          'Failed to refresh access token',
          'TOKEN_REFRESH_FAILED'
        );
      }

      logger.info('✅ Access token refreshed successfully');

      return {
        access_token: credentials.access_token,
        expires_in: credentials.expiry_date 
          ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
          : 3600,
        scope: credentials.scope || GOOGLE_OAUTH_SCOPES.join(' '),
        token_type: credentials.token_type || 'Bearer'
      };
    } catch (error) {
      logger.error('❌ Failed to refresh access token', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw new OAuthError(
        'Failed to refresh Google access token',
        'TOKEN_REFRESH_ERROR',
        { error }
      );
    }
  }

  /**
   * Ensure user has valid access token (refresh if needed)
   */
  async ensureValidToken(userId: string): Promise<string> {
    try {
      const userModel = new UserModel();
      const user = await userModel.findById(userId);

      if (!user) {
        throw new OAuthError('User not found', 'USER_NOT_FOUND', { userId });
      }

      if (!user.google_calendar_connected || !user.google_refresh_token) {
        throw new OAuthError(
          'Google Calendar not connected',
          'CALENDAR_NOT_CONNECTED',
          { userId }
        );
      }

      // Check if token is expired or will expire in next 5 minutes
      const expiryBuffer = 5 * 60 * 1000; // 5 minutes
      const now = new Date();
      const expiryTime = user.google_token_expiry 
        ? new Date(user.google_token_expiry)
        : new Date(0);

      if (expiryTime.getTime() - now.getTime() < expiryBuffer) {
        logger.info('🔄 Access token expired or expiring soon, refreshing', {
          userId,
          expiryTime: expiryTime.toISOString()
        });

        // Token expired or expiring soon, refresh it
        const newTokens = await this.refreshAccessToken(user.google_refresh_token);

        // Update database with new token
        await userModel.update(userId, {
          google_access_token: newTokens.access_token,
          google_token_expiry: new Date(Date.now() + newTokens.expires_in * 1000)
        });

        return newTokens.access_token;
      }

      // Token is still valid
      return user.google_access_token!;
    } catch (error) {
      logger.error('❌ Failed to ensure valid token', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      if (error instanceof OAuthError) {
        throw error;
      }

      throw new OAuthError(
        'Failed to validate Google Calendar token',
        'TOKEN_VALIDATION_FAILED',
        { userId, error }
      );
    }
  }

  /**
   * Disconnect Google Calendar integration
   */
  async disconnectCalendar(userId: string): Promise<void> {
    try {
      logger.info('🔌 Disconnecting Google Calendar', { userId });

      const userModel = new UserModel();
      const user = await userModel.findById(userId);

      if (!user) {
        throw new OAuthError('User not found', 'USER_NOT_FOUND', { userId });
      }

      // Revoke BOTH access token and refresh token with Google
      // This ensures when user reconnects, they get a completely new token with new scopes
      if (user.google_refresh_token) {
        try {
          await this.oauth2Client.revokeToken(user.google_refresh_token);
          logger.info('✅ Google refresh token revoked', { userId });
        } catch (revokeError) {
          // Log but don't fail - we still want to clear our database
          logger.warn('⚠️ Failed to revoke Google refresh token', {
            userId,
            error: revokeError instanceof Error ? revokeError.message : 'Unknown'
          });
        }
      }
      
      if (user.google_access_token) {
        try {
          await this.oauth2Client.revokeToken(user.google_access_token);
          logger.info('✅ Google access token revoked', { userId });
        } catch (revokeError) {
          // Log but don't fail - we still want to clear our database
          logger.warn('⚠️ Failed to revoke Google access token', {
            userId,
            error: revokeError instanceof Error ? revokeError.message : 'Unknown'
          });
        }
      }

      // Clear Google Calendar data from database
      await userModel.update(userId, {
        google_access_token: null,
        google_refresh_token: null,
        google_token_expiry: null,
        google_calendar_connected: false,
        google_calendar_id: null,
        google_email: null
      });

      // Delete tokens from external microservice
      await this.deleteTokensFromMicroservice(userId);

      logger.info('✅ Google Calendar disconnected successfully', { userId });
    } catch (error) {
      logger.error('❌ Failed to disconnect Google Calendar', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      if (error instanceof OAuthError) {
        throw error;
      }

      throw new OAuthError(
        'Failed to disconnect Google Calendar',
        'DISCONNECT_FAILED',
        { userId, error }
      );
    }
  }

  /**
   * Get Google Calendar connection status for a user
   */
  async getConnectionStatus(userId: string): Promise<CalendarConnectionStatus> {
    try {
      const userModel = new UserModel();
      const user = await userModel.findById(userId);

      if (!user) {
        return {
          connected: false,
          needs_refresh: false
        };
      }

      if (!user.google_calendar_connected || !user.google_refresh_token) {
        return {
          connected: false,
          needs_refresh: false
        };
      }

      // Check if token needs refresh
      const expiryBuffer = 5 * 60 * 1000; // 5 minutes
      const now = new Date();
      const expiryTime = user.google_token_expiry 
        ? new Date(user.google_token_expiry)
        : new Date(0);
      
      const needsRefresh = expiryTime.getTime() - now.getTime() < expiryBuffer;

      return {
        connected: true,
        email: user.google_email || undefined,
        calendar_id: user.google_calendar_id || undefined,
        token_expiry: user.google_token_expiry || undefined,
        needs_refresh: needsRefresh
      };
    } catch (error) {
      logger.error('❌ Failed to get connection status', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        connected: false,
        needs_refresh: false
      };
    }
  }

  /**
   * Generate state token for CSRF protection
   * Format: base64(userId:timestamp:randomString)
   */
  private generateStateToken(userId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const stateData = `${userId}:${timestamp}:${random}`;
    return Buffer.from(stateData).toString('base64');
  }

  /**
   * Verify state token and extract user ID
   */
  private verifyStateToken(state: string): string {
    try {
      const decoded = Buffer.from(state, 'base64').toString('utf-8');
      const [userId, timestamp] = decoded.split(':');

      // Check if state is not too old (30 minutes max)
      const stateAge = Date.now() - parseInt(timestamp);
      const maxAge = 30 * 60 * 1000; // 30 minutes

      if (stateAge > maxAge) {
        throw new OAuthError(
          'OAuth state token expired',
          'STATE_EXPIRED'
        );
      }

      if (!userId) {
        throw new OAuthError(
          'Invalid OAuth state token',
          'STATE_INVALID'
        );
      }

      return userId;
    } catch (error) {
      logger.error('❌ Failed to verify state token', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw new OAuthError(
        'Invalid or expired OAuth state token',
        'STATE_VERIFICATION_FAILED',
        { error }
      );
    }
  }

  /**
   * Get OAuth2 client with credentials for a user
   */
  async getAuthenticatedClient(userId: string): Promise<OAuth2Client> {
    const accessToken = await this.ensureValidToken(userId);
    
    const client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );

    client.setCredentials({
      access_token: accessToken
    });

    return client;
  }
}

// Export singleton instance
export default new GoogleAuthService();
export { GoogleAuthService };
