import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export function loadTextFile(importMetaUrl: string, filename: string): string {
  const currentFile = fileURLToPath(importMetaUrl)
  const currentDir = dirname(currentFile)
  const filePath = join(currentDir, filename)
  return readFileSync(filePath, 'utf-8')
}
