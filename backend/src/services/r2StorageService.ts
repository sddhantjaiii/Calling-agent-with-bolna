import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import path from 'path';

/**
 * Cloudflare R2 Storage Service
 * 
 * Handles media file uploads for WhatsApp templates (images, videos, documents)
 * R2 is S3-compatible, so we use AWS SDK v3
 * 
 * Features:
 * - Upload files to R2 bucket
 * - Generate unique filenames
 * - Return public URLs
 * - Delete files from R2
 * - Type validation (IMAGE, VIDEO, DOCUMENT)
 */

// R2 Configuration from environment
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'calling-agent';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

// Validate R2 configuration
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_PUBLIC_URL) {
  logger.error('❌ R2 Storage: Missing required environment variables', {
    hasAccountId: !!R2_ACCOUNT_ID,
    hasAccessKey: !!R2_ACCESS_KEY_ID,
    hasSecretKey: !!R2_SECRET_ACCESS_KEY,
    hasPublicUrl: !!R2_PUBLIC_URL,
  });
}

// Initialize R2 client
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
  },
});

// Supported media types for WhatsApp templates
export const WHATSAPP_MEDIA_TYPES = {
  IMAGE: {
    mimeTypes: ['image/jpeg', 'image/jpg', 'image/png'],
    extensions: ['.jpg', '.jpeg', '.png'],
    maxSize: 5 * 1024 * 1024, // 5MB
  },
  VIDEO: {
    mimeTypes: ['video/mp4'],
    extensions: ['.mp4'],
    maxSize: 16 * 1024 * 1024, // 16MB
  },
  DOCUMENT: {
    mimeTypes: ['application/pdf'],
    extensions: ['.pdf'],
    maxSize: 100 * 1024 * 1024, // 100MB
  },
};

interface UploadResult {
  success: boolean;
  url?: string;
  filename?: string;
  size?: number;
  error?: string;
}

interface FileInfo {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
}

/**
 * Generate unique filename for uploaded file
 */
function generateUniqueFilename(originalName: string): string {
  const timestamp = Date.now();
  const randomHash = crypto.randomBytes(8).toString('hex');
  const extension = path.extname(originalName).toLowerCase();
  const sanitizedName = path.basename(originalName, extension).replace(/[^a-z0-9]/gi, '_');
  
  return `templates/${timestamp}-${randomHash}-${sanitizedName}${extension}`;
}

/**
 * Validate file type and size for WhatsApp templates
 */
function validateFile(file: FileInfo, mediaType: keyof typeof WHATSAPP_MEDIA_TYPES): { valid: boolean; error?: string } {
  const typeConfig = WHATSAPP_MEDIA_TYPES[mediaType];
  
  if (!typeConfig) {
    return { valid: false, error: `Invalid media type: ${mediaType}` };
  }
  
  // Check MIME type
  if (!typeConfig.mimeTypes.includes(file.mimeType.toLowerCase())) {
    return {
      valid: false,
      error: `Invalid file type. Expected: ${typeConfig.mimeTypes.join(', ')}. Got: ${file.mimeType}`,
    };
  }
  
  // Check file extension
  const extension = path.extname(file.originalName).toLowerCase();
  if (!typeConfig.extensions.includes(extension)) {
    return {
      valid: false,
      error: `Invalid file extension. Expected: ${typeConfig.extensions.join(', ')}. Got: ${extension}`,
    };
  }
  
  // Check file size
  if (file.size > typeConfig.maxSize) {
    const maxSizeMB = typeConfig.maxSize / (1024 * 1024);
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File too large. Max size: ${maxSizeMB}MB. Got: ${fileSizeMB}MB`,
    };
  }
  
  return { valid: true };
}

/**
 * Upload file to R2 storage
 * 
 * @param file - File information (buffer, name, mime type, size)
 * @param mediaType - WhatsApp media type (IMAGE, VIDEO, DOCUMENT)
 * @param userId - User ID for logging/tracking
 * @returns Upload result with public URL
 */
export async function uploadToR2(
  file: FileInfo,
  mediaType: keyof typeof WHATSAPP_MEDIA_TYPES,
  userId: string
): Promise<UploadResult> {
  const startTime = Date.now();
  
  try {
    // Validate R2 configuration
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_PUBLIC_URL) {
      logger.error('❌ R2 Storage: Not configured', { userId });
      return {
        success: false,
        error: 'R2 storage not configured. Please check environment variables.',
      };
    }
    
    // Validate file
    const validation = validateFile(file, mediaType);
    if (!validation.valid) {
      logger.warn('⚠️ R2 Upload: File validation failed', {
        userId,
        mediaType,
        error: validation.error,
        filename: file.originalName,
        size: file.size,
      });
      return {
        success: false,
        error: validation.error,
      };
    }
    
    // Generate unique filename
    const filename = generateUniqueFilename(file.originalName);
    
    // Upload to R2
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: filename,
      Body: file.buffer,
      ContentType: file.mimeType,
      ContentLength: file.size,
      // Make file publicly accessible
      CacheControl: 'public, max-age=31536000', // 1 year
    });
    
    await r2Client.send(command);
    
    // Generate public URL
    const publicUrl = `${R2_PUBLIC_URL}/${filename}`;
    
    const duration = Date.now() - startTime;
    logger.info('✅ R2 Upload: Success', {
      userId,
      mediaType,
      filename,
      size: file.size,
      url: publicUrl,
      duration,
    });
    
    return {
      success: true,
      url: publicUrl,
      filename,
      size: file.size,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('❌ R2 Upload: Failed', {
      userId,
      mediaType,
      error: error.message,
      stack: error.stack,
      duration,
    });
    
    return {
      success: false,
      error: `Failed to upload file: ${error.message}`,
    };
  }
}

/**
 * Delete file from R2 storage
 * 
 * @param url - Public URL of the file to delete
 * @param userId - User ID for logging
 * @returns Success boolean
 */
export async function deleteFromR2(url: string, userId: string): Promise<boolean> {
  try {
    // Extract filename from URL
    const filename = url.replace(`${R2_PUBLIC_URL}/`, '');
    
    if (!filename || filename === url) {
      logger.warn('⚠️ R2 Delete: Invalid URL format', { userId, url });
      return false;
    }
    
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: filename,
    });
    
    await r2Client.send(command);
    
    logger.info('✅ R2 Delete: Success', { userId, filename, url });
    return true;
  } catch (error: any) {
    logger.error('❌ R2 Delete: Failed', {
      userId,
      url,
      error: error.message,
    });
    return false;
  }
}

/**
 * Check if file exists in R2
 * 
 * @param url - Public URL to check
 * @returns Boolean indicating existence
 */
export async function fileExistsInR2(url: string): Promise<boolean> {
  try {
    const filename = url.replace(`${R2_PUBLIC_URL}/`, '');
    
    if (!filename || filename === url) {
      return false;
    }
    
    const command = new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: filename,
    });
    
    await r2Client.send(command);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get media type from file extension or MIME type
 */
export function getMediaType(mimeType: string): keyof typeof WHATSAPP_MEDIA_TYPES | null {
  const mime = mimeType.toLowerCase();
  
  if (WHATSAPP_MEDIA_TYPES.IMAGE.mimeTypes.includes(mime)) {
    return 'IMAGE';
  }
  if (WHATSAPP_MEDIA_TYPES.VIDEO.mimeTypes.includes(mime)) {
    return 'VIDEO';
  }
  if (WHATSAPP_MEDIA_TYPES.DOCUMENT.mimeTypes.includes(mime)) {
    return 'DOCUMENT';
  }
  
  return null;
}

export const R2StorageService = {
  uploadToR2,
  deleteFromR2,
  fileExistsInR2,
  getMediaType,
  WHATSAPP_MEDIA_TYPES,
};
