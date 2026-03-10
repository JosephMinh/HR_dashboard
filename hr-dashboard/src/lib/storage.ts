import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

export interface StorageConfig {
  bucket: string
  region?: string
  endpoint?: string
}

export interface StorageConfigStatus {
  configured: boolean
  valid: boolean
  bucket: string | null
  region: string
  endpoint: string | null
  missing: string[]
  issues: string[]
  warnings: string[]
}

interface ResolvedStorageConfig extends StorageConfig {
  region: string
  accessKeyId?: string
  secretAccessKey?: string
}

const UPLOAD_URL_EXPIRY_SECONDS = 15 * 60 // 15 minutes
const DOWNLOAD_URL_EXPIRY_SECONDS = 5 * 60 // 5 minutes
const RESUME_KEY_REGEX = /^resumes\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|doc|docx|txt|rtf)$/i

export class StorageConfigError extends Error {
  readonly missing: string[]
  readonly issues: string[]
  readonly warnings: string[]
  readonly status: StorageConfigStatus

  constructor(status: StorageConfigStatus) {
    const messageParts = [
      status.missing.length > 0
        ? `Missing required storage environment variables: ${status.missing.join(', ')}`
        : null,
      ...status.issues,
      ...status.warnings,
    ].filter((part): part is string => Boolean(part))

    super(
      messageParts.length > 0
        ? `Storage configuration invalid. ${messageParts.join(' ')}`
        : 'Storage configuration invalid.',
    )
    this.name = 'StorageConfigError'
    this.missing = status.missing
    this.issues = status.issues
    this.warnings = status.warnings
    this.status = status
  }
}

export function validateStorageConfig(): StorageConfigStatus {
  const bucket = process.env.STORAGE_BUCKET?.trim() || null
  const region = process.env.STORAGE_REGION?.trim() || 'us-east-1'
  const endpoint = process.env.STORAGE_ENDPOINT?.trim() || null
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim() || ''
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim() || ''

  const missing: string[] = []
  const issues: string[] = []
  const warnings: string[] = []

  if (!bucket) {
    missing.push('STORAGE_BUCKET')
  }

  if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
    issues.push('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must both be set together.')
  }

  if (!endpoint && !accessKeyId && !secretAccessKey) {
    warnings.push(
      'AWS credentials are not explicitly set. Ensure the runtime provides credentials via IAM or the default AWS credential chain.',
    )
  }

  return {
    configured: bucket !== null,
    valid: missing.length === 0 && issues.length === 0,
    bucket,
    region,
    endpoint,
    missing,
    issues,
    warnings,
  }
}

function resolveStorageConfig(): ResolvedStorageConfig {
  const status = validateStorageConfig()

  if (!status.valid || !status.bucket) {
    throw new StorageConfigError(status)
  }

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim() || undefined
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim() || undefined

  return {
    bucket: status.bucket,
    region: status.region,
    endpoint: status.endpoint ?? undefined,
    accessKeyId,
    secretAccessKey,
  }
}

function createStorageContext() {
  const config = resolveStorageConfig()

  const client = new S3Client({
    region: config.region,
    ...(config.endpoint && { endpoint: config.endpoint, forcePathStyle: true }),
    ...(config.accessKeyId && config.secretAccessKey
      ? {
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          },
        }
      : {}),
  })

  return {
    bucket: config.bucket,
    client,
  }
}

/**
 * Generate a unique, unguessable object key for file storage.
 * Pattern: resumes/{uuid}.{extension}
 */
export function generateObjectKey(originalFilename: string): string {
  const uuid = randomUUID()
  const extension = getFileExtension(originalFilename)
  return `resumes/${uuid}${extension ? `.${extension}` : ''}`
}

function getFileExtension(filename: string): string {
  const parts = filename.split('.')
  if (parts.length > 1) {
    const extension = parts[parts.length - 1]?.trim().toLowerCase() || ''
    return /^[a-z0-9]+$/.test(extension) ? extension : ''
  }
  return ''
}

export function isValidResumeKey(key: string): boolean {
  return RESUME_KEY_REGEX.test(key)
}

/**
 * Generate a signed URL for direct file upload.
 * Client can PUT to this URL with the specified content-type.
 *
 * @param key - Object key in storage
 * @param contentType - MIME type of the file
 * @param expiresInSeconds - URL expiration time (default: 15 minutes)
 * @returns Signed upload URL
 */
export async function generateUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = UPLOAD_URL_EXPIRY_SECONDS
): Promise<string> {
  const { client, bucket } = createStorageContext()

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  })

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds })
}

/**
 * Generate a signed URL for file download/viewing.
 *
 * @param key - Object key in storage
 * @param expiresInSeconds - URL expiration time (default: 5 minutes)
 * @returns Signed download URL
 */
export async function generateDownloadUrl(
  key: string,
  expiresInSeconds = DOWNLOAD_URL_EXPIRY_SECONDS
): Promise<string> {
  const { client, bucket } = createStorageContext()

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  })

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds })
}

/**
 * Delete an object from storage.
 *
 * @param key - Object key to delete
 */
export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = createStorageContext()

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  })

  await client.send(command)
}

/**
 * Get the content type for common resume file types.
 * Returns 'application/octet-stream' for unknown types.
 */
export function getContentType(filename: string): string {
  const extension = getFileExtension(filename)

  const contentTypes: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    rtf: 'application/rtf',
  }

  return contentTypes[extension] || 'application/octet-stream'
}

/**
 * Validate that a file is an acceptable resume type.
 */
export function isValidResumeType(filename: string): boolean {
  const extension = getFileExtension(filename)
  const validExtensions = ['pdf', 'doc', 'docx', 'txt', 'rtf']
  return validExtensions.includes(extension)
}

/**
 * Maximum file size for resumes (10MB)
 */
export const MAX_RESUME_SIZE_BYTES = 10 * 1024 * 1024
