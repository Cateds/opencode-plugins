import { copyFile, mkdir } from 'node:fs/promises'
import { glob } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const srcDir = 'src'
const distDir = 'dist/src'

async function copyTxtFiles() {
  const files = await Array.fromAsync(glob('**/*.txt', { cwd: srcDir }))
  
  for (const file of files) {
    const srcPath = join(srcDir, file)
    const distPath = join(distDir, file)
    
    await mkdir(dirname(distPath), { recursive: true })
    await copyFile(srcPath, distPath)
    console.log(`Copied: ${srcPath} -> ${distPath}`)
  }
  
  console.log(`Copied ${files.length} .txt files`)
}

copyTxtFiles().catch(err => {
  console.error('Error copying .txt files:', err)
  process.exit(1)
})
