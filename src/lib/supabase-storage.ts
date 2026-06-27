/**
 * Supabase Storage integration for persistent backups on Vercel.
 *
 * Vercel's filesystem is read-only except /tmp, and /tmp is wiped on
 * cold starts. To make backups persistent across serverless invocations,
 * we upload them to Supabase Storage (free tier: 1 GB).
 *
 * The flow:
 *   1. Backup route writes JSON + Excel to /tmp/liafon-backups (fast, local)
 *   2. After successful write, this module uploads both files to Supabase Storage
 *   3. The "list backups" endpoint reads from Supabase Storage (not /tmp)
 *
 * Falls back gracefully: if SUPABASE_BUCKET_NAME isn't configured, backups
 * stay in /tmp only (with a warning in the API response). This keeps the
 * existing UX working during migration.
 *
 * Setup:
 *   1. In your Supabase project dashboard: Storage → New bucket
 *      - Name: liafon-backups
 *      - Public: NO (these contain customer data)
 *      - File size limit: 50 MB
 *   2. Add env vars to Vercel:
 *      SUPABASE_URL=https://xxxxxx.supabase.co
 *      SUPABASE_SERVICE_ROLE_KEY=ey...    (Project Settings → API → service_role)
 *      SUPABASE_BUCKET_NAME=liafon-backups
 *
 *   The service_role key bypasses RLS — required because the API runs
 *   server-side and has no user JWT. NEVER expose this key to the client.
 */

import { StorageClient } from '@supabase/storage-js'
import { promises as fs } from 'fs'
import path from 'path'

let cachedClient: StorageClient | null = null

interface SupabaseStorageConfig {
  url: string
  serviceRoleKey: string
  bucketName: string
}

function getConfig(): SupabaseStorageConfig | null {
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const bucketName = process.env.SUPABASE_BUCKET_NAME
  if (!url || !serviceRoleKey || !bucketName) return null
  return { url, serviceRoleKey, bucketName }
}

function getClient(): StorageClient | null {
  if (cachedClient) return cachedClient
  const config = getConfig()
  if (!config) return null
  // StorageClient constructor: (url, headers)
  // The service_role key goes in the Authorization header.
  cachedClient = new StorageClient(config.url, {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
  })
  return cachedClient
}

/** Check whether Supabase Storage is configured (used to add a warning to API responses). */
export function isSupabaseStorageConfigured(): boolean {
  return getConfig() !== null
}

interface UploadResult {
  path: string
  size: number
  url: string | null   // Signed URL (valid for the requested duration)
}

/**
 * Upload a single file from the local filesystem to Supabase Storage.
 *
 * @param localPath  Absolute path to the local file (e.g. /tmp/liafon-backups/backup_full_...json)
 * @param remotePath Path within the bucket (e.g. "backups/backup_full_...json")
 * @returns          Upload result with size + signed URL
 */
export async function uploadBackupFile(
  localPath: string,
  remotePath: string
): Promise<UploadResult> {
  const client = getClient()
  if (!client) {
    throw new Error('Supabase Storage is not configured. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_BUCKET_NAME.')
  }
  const bucketName = process.env.SUPABASE_BUCKET_NAME!

  // Read the file into a buffer (we already wrote it to /tmp, so it's local + fast)
  const buffer = await fs.readFile(localPath)
  const stat = await fs.stat(localPath)

  // Upload — upsert:true so re-uploads replace (idempotent for retries)
  // StorageClient is itself the file API (it extends StorageBucketApi which
  // exposes .from(bucketName).upload(...)). No `.storage` wrapper needed
  // (that's the @supabase/supabase-js wrapper, not @supabase/storage-js).
  const { error } = await client
    .from(bucketName)
    .upload(remotePath, buffer, {
      upsert: true,
      contentType: guessContentType(localPath),
      cacheControl: '3600',
    })

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`)
  }

  // Generate a short-lived signed URL so the user can download the backup
  // without making the bucket public. 1-hour expiry matches Vercel's
  // typical session length.
  const { data: signedUrlData, error: signedUrlError } = await client
    .from(bucketName)
    .createSignedUrl(remotePath, 60 * 60)   // 1 hour

  return {
    path: remotePath,
    size: stat.size,
    url: signedUrlError ? null : signedUrlData?.signedUrl ?? null,
  }
}

/**
 * Upload both JSON + Excel backup files (the typical pair) to Supabase Storage.
 * Files are uploaded under `backups/<filename>` to keep the bucket organized.
 *
 * Returns the upload results for each file that existed. Missing files are skipped.
 */
export async function uploadBackupPair(
  localJsonPath: string,
  localExcelPath: string | null
): Promise<{ json: UploadResult; excel: UploadResult | null }> {
  const jsonRemote = `backups/${path.basename(localJsonPath)}`
  const jsonResult = await uploadBackupFile(localJsonPath, jsonRemote)

  let excelResult: UploadResult | null = null
  if (localExcelPath) {
    try {
      await fs.access(localExcelPath)
      const excelRemote = `backups/${path.basename(localExcelPath)}`
      excelResult = await uploadBackupFile(localExcelPath, excelRemote)
    } catch {
      // Excel file doesn't exist (e.g. for sales-only backups). Skip.
    }
  }

  return { json: jsonResult, excel: excelResult }
}

interface RemoteBackupMeta {
  name: string
  size: number
  /** ISO timestamp of last modification. */
  lastModified: string
  /** Path within the bucket (e.g. "backups/backup_full_...json"). */
  path: string
}

/**
 * List all backup files in the Supabase Storage bucket.
 * Used by the GET /api/backup endpoint to populate the backups list.
 */
export async function listRemoteBackups(): Promise<RemoteBackupMeta[]> {
  const client = getClient()
  if (!client) return []
  const bucketName = process.env.SUPABASE_BUCKET_NAME!

  const { data, error } = await client
    .from(bucketName)
    .list('backups', {
      limit: 1000,
      sortBy: { column: 'created_at', order: 'desc' },
    })

  if (error) {
    console.error('[supabase-storage] listRemoteBackups error:', error.message)
    return []
  }

  if (!data) return []

  return data
    .filter((item) => item.name !== '.emptyFolderPlaceholder')
    .map((item) => ({
      name: item.name,
      size: item.metadata?.size ?? 0,
      lastModified: item.updated_at || item.created_at || new Date().toISOString(),
      path: `backups/${item.name}`,
    }))
}

/**
 * Generate a fresh signed URL for downloading a backup.
 * Used when the user clicks "Download" in the backups list.
 */
export async function getSignedDownloadUrl(
  remotePath: string,
  expiresInSec: number = 60 * 60
): Promise<string | null> {
  const client = getClient()
  if (!client) return null
  const bucketName = process.env.SUPABASE_BUCKET_NAME!

  const { data, error } = await client
    .from(bucketName)
    .createSignedUrl(remotePath, expiresInSec)

  if (error) {
    console.error('[supabase-storage] getSignedDownloadUrl error:', error.message)
    return null
  }
  return data?.signedUrl ?? null
}

/**
 * Delete a backup file from Supabase Storage.
 * Used when the user clicks "Delete" in the backups list.
 */
export async function deleteRemoteBackup(remotePath: string): Promise<boolean> {
  const client = getClient()
  if (!client) return false
  const bucketName = process.env.SUPABASE_BUCKET_NAME!

  const { error } = await client
    .from(bucketName)
    .remove([remotePath])

  if (error) {
    console.error('[supabase-storage] deleteRemoteBackup error:', error.message)
    return false
  }
  return true
}

function guessContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.json': return 'application/json'
    case '.xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case '.xls':  return 'application/vnd.ms-excel'
    case '.csv':  return 'text/csv'
    case '.pdf':  return 'application/pdf'
    default:      return 'application/octet-stream'
  }
}
