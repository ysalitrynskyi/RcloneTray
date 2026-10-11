'use strict'

// Download the rclone binaries RcloneTray bundles, verified against rclone's
// published SHA256SUMS.
//
//   node scripts/fetch-rclone.js                      host platform and arch
//   node scripts/fetch-rclone.js --platform win32 --arch all
//   node scripts/fetch-rclone.js --platform darwin --arch amd64,arm64
//
// The version comes from RCLONE_VERSION, else package.json "rcloneVersion".

const crypto = require('crypto')
const fs = require('fs')
const https = require('https')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
const nodeArchToRclone = { x64: 'amd64', ia32: '386', arm64: 'arm64', arm: 'arm-v7' }
const platformArches = {
  darwin: ['amd64', 'arm64'],
  win32: ['amd64', 'arm64'],
  linux: ['amd64', 'arm64', 'arm-v7']
}
const rcloneOsName = { darwin: 'osx', win32: 'windows', linux: 'linux' }
const RequestTimeoutMs = 60 * 1000

function parseArgs(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--platform' || arg === '--arch') {
      options[arg.slice(2)] = argv[++index]
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return options
}

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'RcloneTray-build' } }, (response) => {
      const status = response.statusCode || 0
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume()
        if (redirects > 5) {
          reject(new Error(`Too many redirects for ${url}`))
          return
        }
        get(new URL(response.headers.location, url).toString(), redirects + 1).then(resolve, reject)
        return
      }
      if (status !== 200) {
        response.resume()
        reject(new Error(`HTTP ${status} for ${url}`))
        return
      }
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve(Buffer.concat(chunks)))
      response.on('error', reject)
    })
    request.setTimeout(RequestTimeoutMs, () => {
      request.destroy(new Error(`Timed out downloading ${url}`))
    })
    request.on('error', reject)
  })
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

function extract(zipPath, outDir) {
  if (process.platform === 'win32') {
    const result = spawnSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Expand-Archive -LiteralPath $env:RT_ZIP -DestinationPath $env:RT_OUT -Force'
    ], { stdio: 'inherit', env: { ...process.env, RT_ZIP: zipPath, RT_OUT: outDir } })
    return result.status === 0
  }
  const result = spawnSync('unzip', ['-q', '-o', zipPath, '-d', outDir], { stdio: 'inherit' })
  return result.status === 0
}

function resolveVersion() {
  const raw = process.env.RCLONE_VERSION || require(path.join(root, 'package.json')).rcloneVersion
  if (!raw) {
    throw new Error('Set RCLONE_VERSION or package.json "rcloneVersion".')
  }
  return raw.startsWith('v') ? raw : `v${raw}`
}

async function fetchOne(version, sums, platform, arch) {
  const binaryName = platform === 'win32' ? 'rclone.exe' : 'rclone'
  const dest = path.join(root, 'rclone', platform, arch)
  const stamp = path.join(dest, '.version')
  if (fs.existsSync(path.join(dest, binaryName)) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === version) {
    console.log(`rclone ${version} ${platform}/${arch} already present`)
    return
  }
  const fileName = `rclone-${version}-${rcloneOsName[platform]}-${arch}.zip`
  const line = sums.split(/\r?\n/).map((entry) => entry.trim()).find((entry) => entry.endsWith(` ${fileName}`))
  if (!line) {
    throw new Error(`No checksum published for ${fileName}`)
  }
  const want = line.split(/\s+/)[0].toLowerCase()
  const zip = await get(`https://downloads.rclone.org/${version}/${fileName}`)
  const got = crypto.createHash('sha256').update(zip).digest('hex')
  if (got !== want) {
    throw new Error(`Checksum mismatch for ${fileName}`)
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rclone-fetch-'))
  try {
    const zipPath = path.join(work, fileName)
    fs.writeFileSync(zipPath, zip)
    const outDir = path.join(work, 'out')
    if (!extract(zipPath, outDir)) {
      throw new Error(`Could not extract ${fileName}`)
    }
    const binary = findFile(outDir, binaryName)
    if (!binary) {
      throw new Error(`${binaryName} was not in ${fileName}`)
    }
    fs.mkdirSync(dest, { recursive: true })
    const target = path.join(dest, binaryName)
    fs.copyFileSync(binary, target)
    if (platform !== 'win32') {
      fs.chmodSync(target, 0o755)
    }
    if (platform === 'darwin' && process.platform === 'darwin') {
      spawnSync('xattr', ['-dr', 'com.apple.quarantine', dest], { stdio: 'ignore' })
      spawnSync('codesign', ['--force', '--sign', '-', target], { stdio: 'ignore' })
    }
    fs.writeFileSync(stamp, `${version}\n`)
    console.log(`Fetched ${fileName}`)
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

async function main() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
  if (proxy && !process.env.NODE_USE_ENV_PROXY) {
    const rerun = spawnSync(process.execPath, process.argv.slice(1), {
      stdio: 'inherit',
      env: { ...process.env, NODE_USE_ENV_PROXY: '1' }
    })
    process.exit(rerun.status === null ? 1 : rerun.status)
  }

  const options = parseArgs(process.argv.slice(2))
  const platform = options.platform || process.platform
  if (!platformArches[platform]) {
    throw new Error(`Unsupported platform: ${platform}`)
  }
  const arches = !options.arch
    ? [nodeArchToRclone[process.arch] || process.arch]
    : options.arch === 'all'
      ? platformArches[platform]
      : options.arch.split(',').map((arch) => arch.trim()).filter(Boolean)
  const version = resolveVersion()
  const sums = (await get(`https://downloads.rclone.org/${version}/SHA256SUMS`)).toString('utf8')
  for (const arch of arches) {
    await fetchOne(version, sums, platform, arch)
  }
  const license = await get(`https://raw.githubusercontent.com/rclone/rclone/${version}/COPYING`)
  fs.mkdirSync(path.join(root, 'rclone'), { recursive: true })
  fs.writeFileSync(path.join(root, 'rclone', 'LICENSE'), license)
  fs.writeFileSync(path.join(root, 'rclone', 'version.txt'), `${version}\n`)
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error)
  process.exit(1)
})
