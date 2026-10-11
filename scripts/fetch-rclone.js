'use strict'

const crypto = require('crypto')
const fs = require('fs')
const https = require('https')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
const archMap = { x64: 'amd64', ia32: '386', arm64: 'arm64', arm: 'arm-v7' }

function get(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        get(response.headers.location).then(resolve, reject)
        return
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} for ${url}`))
        response.resume()
        return
      }
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve(Buffer.concat(chunks)))
    })
    request.on('error', reject)
  })
}

async function main() {
  const versionText = process.env.RCLONE_VERSION
    ? process.env.RCLONE_VERSION
    : (await get('https://downloads.rclone.org/version.txt')).toString('utf8').trim().split(/\s+/).pop()
  const version = versionText.startsWith('v') ? versionText : `v${versionText}`
  const platform = process.platform
  const osName = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'osx' : 'linux'
  const folder = platform === 'darwin' ? 'darwin' : platform
  const arch = archMap[process.arch] || process.arch
  const fileName = `rclone-${version}-${osName}-${arch}.zip`
  const sums = (await get(`https://downloads.rclone.org/${version}/SHA256SUMS`)).toString('utf8')
  const expected = sums.split(/\r?\n/).map((line) => line.trim()).find((line) => line.endsWith(`  ${fileName}`) || line.endsWith(` ${fileName}`))
  if (!expected) {
    throw new Error(`No checksum published for ${fileName}`)
  }
  const want = expected.split(/\s+/)[0].toLowerCase()
  const zip = await get(`https://downloads.rclone.org/${version}/${fileName}`)
  const got = crypto.createHash('sha256').update(zip).digest('hex')
  if (got !== want) {
    throw new Error(`Checksum mismatch for ${fileName}`)
  }
  const work = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rclone-fetch-'))
  const zipPath = path.join(work, fileName)
  fs.writeFileSync(zipPath, zip)
  const dest = path.join(root, 'rclone', folder, arch)
  fs.mkdirSync(dest, { recursive: true })
  if (platform === 'win32') {
    const expanded = path.join(work, 'out')
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${expanded}' -Force`], { stdio: 'inherit' })
    if (result.status !== 0) {
      throw new Error('Could not extract rclone')
    }
    const exe = findFile(expanded, 'rclone.exe')
    if (!exe) {
      throw new Error('rclone.exe was not in the archive')
    }
    fs.copyFileSync(exe, path.join(dest, 'rclone.exe'))
  } else {
    const result = spawnSync('unzip', ['-q', '-o', zipPath, '-d', work], { stdio: 'inherit' })
    if (result.status !== 0) {
      throw new Error('Could not extract rclone')
    }
    const binary = findFile(work, 'rclone')
    if (!binary) {
      throw new Error('rclone was not in the archive')
    }
    const target = path.join(dest, 'rclone')
    fs.copyFileSync(binary, target)
    fs.chmodSync(target, 0o755)
  }
  fs.writeFileSync(path.join(root, 'rclone', 'version.txt'), `${version}\n`)
  console.log(`Fetched ${fileName}`)
}

function findFile(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findFile(full, name)
      if (found) {
        return found
      }
    } else if (entry.name === name) {
      return full
    }
  }
  return ''
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
