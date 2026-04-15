/**
 * Camera Proxy Server (pure Node, không phụ thuộc curl)
 * Chạy trên máy trạm cân, proxy request từ browser đến camera Dahua.
 *
 * Cách chạy: node camera-proxy.cjs
 * Port: 3456
 *
 * Browser gọi: http://localhost:3456/snapshot?ip=192.168.1.176&port=80&channel=1&user=admin&pass=xxx
 *
 * Lịch sử: phiên bản cũ dùng execFile('curl', ...) nhưng Win 7 không có
 * curl.exe sẵn → rewrite dùng Node's http + HTTP Digest Auth tự implement
 * theo RFC 2617 để bỏ dependency ngoài.
 */

const http = require('http')
const crypto = require('crypto')

const PORT = 3456
const TIMEOUT_MS = 8000

// ============================================================
// HTTP Digest Auth client (RFC 2617) — pure Node, không cần curl
// ============================================================

function md5(s) {
  return crypto.createHash('md5').update(s).digest('hex')
}

function parseDigestChallenge(header) {
  // Header dạng: Digest realm="Login", nonce="abc", qop="auth", algorithm=MD5
  const parts = {}
  const re = /(\w+)=(?:"([^"]*)"|([^\s,]*))/g
  let m
  while ((m = re.exec(header)) !== null) {
    parts[m[1]] = m[2] !== undefined ? m[2] : m[3]
  }
  return parts
}

function buildDigestAuth(params) {
  const { username, password, method, uri, realm, nonce, qop, opaque, nc, cnonce, algorithm } = params
  const ha1 = md5(username + ':' + realm + ':' + password)
  const ha2 = md5(method + ':' + uri)
  const response = qop
    ? md5(ha1 + ':' + nonce + ':' + nc + ':' + cnonce + ':' + qop + ':' + ha2)
    : md5(ha1 + ':' + nonce + ':' + ha2)

  let auth = 'Digest username="' + username + '"'
  auth += ', realm="' + realm + '"'
  auth += ', nonce="' + nonce + '"'
  auth += ', uri="' + uri + '"'
  auth += ', response="' + response + '"'
  if (algorithm) auth += ', algorithm=' + algorithm
  if (qop) {
    auth += ', qop=' + qop
    auth += ', nc=' + nc
    auth += ', cnonce="' + cnonce + '"'
  }
  if (opaque) auth += ', opaque="' + opaque + '"'
  return auth
}

/**
 * Fetch 1 snapshot từ camera với HTTP Digest Auth.
 * Luồng: GET lần 1 → 401 kèm challenge → compute response → GET lần 2
 * với Authorization header → nhận ảnh JPEG.
 */
function fetchWithDigest(opts, callback) {
  const { host, port, path, user, pass } = opts
  const method = 'GET'
  let done = false
  const finish = (err, data) => {
    if (done) return
    done = true
    callback(err, data)
  }

  const doRequest = (authHeader, isRetry) => {
    const reqOpts = {
      host: host,
      port: port,
      path: path,
      method: method,
      headers: {
        'User-Agent': 'CameraProxy/1.0',
        'Accept': '*/*',
      },
      timeout: TIMEOUT_MS,
    }
    if (authHeader) reqOpts.headers['Authorization'] = authHeader

    const req = http.request(reqOpts, (res) => {
      // Nhận 401 lần đầu → parse challenge và retry với auth
      if (res.statusCode === 401 && !isRetry) {
        const wwwAuth = res.headers['www-authenticate'] || ''
        res.resume() // drain body

        if (!/^Digest/i.test(wwwAuth)) {
          // Camera dùng Basic auth hoặc gì khác — thử Basic fallback
          if (/^Basic/i.test(wwwAuth)) {
            const basic = 'Basic ' + Buffer.from(user + ':' + pass).toString('base64')
            doRequest(basic, true)
            return
          }
          finish(new Error('Unsupported auth: ' + wwwAuth))
          return
        }

        const challenge = parseDigestChallenge(wwwAuth)
        const nc = '00000001'
        const cnonce = crypto.randomBytes(8).toString('hex')
        const auth = buildDigestAuth({
          username: user,
          password: pass,
          method: method,
          uri: path,
          realm: challenge.realm || '',
          nonce: challenge.nonce || '',
          qop: challenge.qop,
          opaque: challenge.opaque,
          algorithm: challenge.algorithm,
          nc: nc,
          cnonce: cnonce,
        })
        doRequest(auth, true)
        return
      }

      if (res.statusCode !== 200) {
        finish(new Error('HTTP ' + res.statusCode + ' từ camera'))
        res.resume()
        return
      }

      // Đọc body (JPEG binary)
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => finish(null, Buffer.concat(chunks)))
      res.on('error', (err) => finish(err))
    })

    req.on('error', (err) => finish(err))
    req.on('timeout', () => {
      req.destroy()
      finish(new Error('Timeout ' + TIMEOUT_MS + 'ms'))
    })
    req.end()
  }

  doRequest(null, false)
}

// ============================================================
// HTTP proxy server
// ============================================================

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

  const url = new URL(req.url, 'http://localhost:' + PORT)

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

    const camPath = '/cgi-bin/snapshot.cgi?channel=' + channel

    fetchWithDigest(
      { host: ip, port: Number(port), path: camPath, user: user, pass: pass },
      (err, data) => {
        if (err) {
          console.error('Camera ' + ip + ' error: ' + err.message)
          res.writeHead(502, { 'Content-Type': 'text/plain' })
          res.end('Camera error: ' + err.message)
          return
        }

        if (!data || data.length < 100) {
          const len = data ? data.length : 0
          console.error('Camera ' + ip + ': empty or too small response (' + len + ' bytes)')
          res.writeHead(502, { 'Content-Type': 'text/plain' })
          res.end('Camera error: empty response')
          return
        }

        // Check JPEG magic bytes (FF D8)
        const isJpeg = data[0] === 0xFF && data[1] === 0xD8
        const contentType = isJpeg ? 'image/jpeg' : 'application/octet-stream'

        console.log('OK Camera ' + ip + ': ' + data.length + ' bytes')
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store',
        })
        res.end(data)
      }
    )
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
  console.log('Camera Proxy chay tai http://localhost:' + PORT)
  console.log('  Pure Node HTTP Digest Auth (khong can curl)')
  console.log('  Health: http://localhost:' + PORT + '/health')
})
