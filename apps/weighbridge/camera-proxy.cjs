/**
 * Camera Proxy Server (dùng curl)
 * Chạy trên máy trạm cân, proxy request từ browser đến camera Dahua.
 *
 * Cách chạy: node camera-proxy.cjs
 * Port: 3456
 *
 * Browser gọi: http://localhost:3456/snapshot?ip=192.168.1.176&port=80&channel=1&user=admin&pass=xxx
 */

const http = require('http')
const { execFile } = require('child_process')

const PORT = 3456

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (url.pathname === '/snapshot') {
    const ip = url.searchParams.get('ip')
    const port = url.searchParams.get('port') || '80'
    const channel = url.searchParams.get('channel') || '1'
    const user = url.searchParams.get('user') || 'admin'
    const pass = url.searchParams.get('pass') || ''

    if (!ip) {
      res.writeHead(400, { 'Content-Type': 'text/plain' })
      res.end('Missing ip parameter')
      return
    }

    const camUrl = `http://${ip}:${port}/cgi-bin/snapshot.cgi?channel=${channel}`

    // Use curl with --digest auth (proven to work)
    const args = [
      '-s',                    // silent
      '--digest',              // Digest authentication
      '-u', `${user}:${pass}`, // credentials
      '--max-time', '8',       // timeout 8s
      '-o', '-',               // output to stdout
      camUrl,
    ]

    execFile('curl', args, { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.error(`Camera ${ip} error:`, err.message)
        res.writeHead(502, { 'Content-Type': 'text/plain' })
        res.end(`Camera error: ${err.message}`)
        return
      }

      if (!stdout || stdout.length < 100) {
        console.error(`Camera ${ip}: empty or too small response (${stdout?.length} bytes)`)
        res.writeHead(502, { 'Content-Type': 'text/plain' })
        res.end(`Camera error: empty response`)
        return
      }

      // Check if it's JPEG (starts with FF D8)
      const isJpeg = stdout[0] === 0xFF && stdout[1] === 0xD8
      const contentType = isJpeg ? 'image/jpeg' : 'application/octet-stream'

      console.log(`✅ Camera ${ip}: ${stdout.length} bytes`)
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store',
      })
      res.end(stdout)
    })
    return
  }

  // Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found. Use /snapshot?ip=...&port=...&channel=...&user=...&pass=...')
})

server.listen(PORT, () => {
  console.log(`📷 Camera Proxy chạy tại http://localhost:${PORT}`)
  console.log(`   Dùng curl --digest để gọi camera Dahua`)
  console.log(`   Health: http://localhost:${PORT}/health`)
})
