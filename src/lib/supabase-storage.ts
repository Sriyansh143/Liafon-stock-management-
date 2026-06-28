import { StorageClient } from '@supabase/storage-js'
import { promises as fs } from 'fs'
import path from 'path'

let cachedClient: StorageClient | null = null

function getConfig() {
  const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY; const bucket = process.env.SUPABASE_BUCKET_NAME
  if (!url || !key || !bucket) return null
  return { url, key, bucket }
}

function getClient(): StorageClient | null {
  if (cachedClient) return cachedClient
  const config = getConfig()
  if (!config) return null
  cachedClient = new StorageClient(config.url, { apikey: config.key, Authorization: `Bearer ${config.key}` })
  return cachedClient
}

export function isSupabaseStorageConfigured(): boolean { return getConfig() !== null }

export async function uploadBackupFile(localPath: string, remotePath: string) {
  const client = getClient(); if (!client) throw new Error('Supabase Storage not configured')
  const bucket = process.env.SUPABASE_BUCKET_NAME!
  const buffer = await fs.readFile(localPath); const stat = await fs.stat(localPath)
  const { error } = await client.from(bucket).upload(remotePath, buffer, { upsert: true, contentType: 'application/octet-stream', cacheControl: '3600' })
  if (error) throw new Error(`Upload failed: ${error.message}`)
  const { data: signed } = await client.from(bucket).createSignedUrl(remotePath, 3600)
  return { path: remotePath, size: stat.size, url: signed?.signedUrl ?? null }
}

export async function uploadBackupPair(localJsonPath: string, localExcelPath: string | null) {
  const jsonRemote = `backups/${path.basename(localJsonPath)}`
  const jsonResult = await uploadBackupFile(localJsonPath, jsonRemote)
  let excelResult = null
  if (localExcelPath) { try { await fs.access(localExcelPath); excelResult = await uploadBackupFile(localExcelPath, `backups/${path.basename(localExcelPath)}`) } catch {} }
  return { json: jsonResult, excel: excelResult }
}

export async function listRemoteBackups() {
  const client = getClient(); if (!client) return []
  const bucket = process.env.SUPABASE_BUCKET_NAME!
  const { data, error } = await client.from(bucket).list('backups', { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } })
  if (error) return []
  return (data || []).filter(i => i.name !== '.emptyFolderPlaceholder').map(i => ({ name: i.name, size: i.metadata?.size ?? 0, lastModified: i.updated_at || i.created_at || new Date().toISOString(), path: `backups/${i.name}` }))
}

export async function getSignedDownloadUrl(remotePath: string, expiresInSec = 3600) {
  const client = getClient(); if (!client) return null
  const { data } = await client.from(process.env.SUPABASE_BUCKET_NAME!).createSignedUrl(remotePath, expiresInSec)
  return data?.signedUrl ?? null
}

export async function deleteRemoteBackup(remotePath: string) {
  const client = getClient(); if (!client) return false
  const { error } = await client.from(process.env.SUPABASE_BUCKET_NAME!).remove([remotePath])
  return !error
}
