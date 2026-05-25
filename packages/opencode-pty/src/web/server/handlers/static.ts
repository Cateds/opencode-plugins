import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ASSET_CONTENT_TYPES } from '../../shared/constants.ts'

const MODULE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const PROJECT_ROOT = MODULE_DIR.replace(/[\\/]dist$/, '')
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
} as const
const STATIC_DIR = join(PROJECT_ROOT, 'dist/web')

export interface StaticFile {
  body: Buffer
  headers: Record<string, string>
}

export async function buildStaticRoutes(): Promise<Record<string, StaticFile>> {
  const routes: Record<string, StaticFile> = {}
  const files = await readdir(STATIC_DIR, { recursive: true })
  for (const file of files) {
    if (typeof file === 'string') {
      const fullPath = join(STATIC_DIR, file)
      const fileStat = await stat(fullPath)
      if (!fileStat.isDirectory()) {
        const ext = extname(file)
        const routeKey = `/${file.replace(/\\/g, '/')}`
        const contentType = ASSET_CONTENT_TYPES[ext] || 'application/octet-stream'
        const body = await readFile(fullPath)

        routes[routeKey] = {
          body,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
            ...SECURITY_HEADERS,
          },
        }
      }
    }
  }
  return routes
}
