// ============================================================================
// USE KELI SCALE — Web Serial API hook for Keli D2008FA indicator
// File: src/hooks/useKeliScale.ts
// Doc truc tiep tu dau can Keli qua cong RS232/USB, khong can gateway server
// Ho tro: Chrome 89+, Edge 89+
// ============================================================================
//
// Keli D2008FA protocol:
//   Continuous output mode: ST,GS,+  12345 kg\r\n
//   Format: [Status],[Mode],[Sign][Weight] [Unit]\r\n
//   Status: ST=Stable, US=Unstable
//   Mode: GS=Gross, NT=Net, TR=Tare
//   Weight: 8 chars right-aligned with spaces
//   Unit: kg, lb, t
//
// Some Keli models use simpler format:
//   +  12345\r\n  (just sign + weight)
//
// This hook handles both formats.
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react'

// ============================================================================
// WEB SERIAL API TYPE DECLARATIONS (not in default TS lib)
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Navigator {
    serial?: {
      requestPort(options?: any): Promise<any>
      getPorts(): Promise<any[]>
    }
  }
}

type SerialPort = any
type ParityType = 'none' | 'even' | 'odd'
type FlowControlType = 'none' | 'hardware'

// ============================================================================
// TYPES
// ============================================================================

export interface ScaleReading {
  weight: number
  unit: string
  stable: boolean
  timestamp: number
}

export interface KeliScaleConfig {
  baudRate: number
  dataBits: number
  stopBits: number
  parity: ParityType
  flowControl: FlowControlType
}

export interface UseKeliScaleReturn {
  /** Whether Web Serial API is supported in this browser */
  supported: boolean
  /** Whether scale is connected and reading */
  connected: boolean
  /** Current live weight reading */
  liveWeight: ScaleReading | null
  /** Connect to scale — opens browser serial port picker */
  connect: () => Promise<boolean>
  /** Disconnect from scale */
  disconnect: () => void
  /** Read single weight (for manual trigger) */
  readOnce: () => Promise<ScaleReading | null>
  /** Check if port is still open */
  checkStatus: () => Promise<boolean>
  /** Error message if any */
  error: string | null
  /** Scale config */
  config: KeliScaleConfig
  /** Update config */
  setConfig: (config: Partial<KeliScaleConfig>) => void
}

// ============================================================================
// DEFAULT CONFIG — Keli D2008FA standard RS232 settings
// ============================================================================

const DEFAULT_CONFIG: KeliScaleConfig = {
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'even' as ParityType,
  flowControl: 'none' as FlowControlType,
}

// Configs to try when auto-detecting (most common for weighbridge scales)
// Order: most common truck scales first → small scales
// Some 120T truck scales use 7 data bits + even parity + 2 stop bits
const AUTO_DETECT_CONFIGS: Array<{ baudRate: number; parity: ParityType; dataBits?: number; stopBits?: number; label: string }> = [
  // 8 data bits (most common)
  { baudRate: 9600, parity: 'even', label: '9600/8/Even/1 (XK3190-A9/A9+/QS-D)' },
  { baudRate: 9600, parity: 'none', label: '9600/8/None/1 (D2008FA/DS3/DS6)' },
  // 7 data bits + even parity (common for large truck scales 120T)
  { baudRate: 9600, parity: 'even', dataBits: 7, stopBits: 2, label: '9600/7/Even/2 (120T truck scale)' },
  { baudRate: 9600, parity: 'even', dataBits: 7, stopBits: 1, label: '9600/7/Even/1 (truck scale)' },
  { baudRate: 9600, parity: 'none', dataBits: 7, stopBits: 2, label: '9600/7/None/2' },
  { baudRate: 9600, parity: 'odd', label: '9600/8/Odd/1' },
  { baudRate: 2400, parity: 'none', label: '2400/8/None/1 (XK3118T1)' },
  { baudRate: 2400, parity: 'even', dataBits: 7, stopBits: 2, label: '2400/7/Even/2 (old truck scale)' },
  { baudRate: 2400, parity: 'even', label: '2400/8/Even/1' },
  { baudRate: 4800, parity: 'none', label: '4800/8/None/1 (XK3190-A12E)' },
  { baudRate: 4800, parity: 'even', label: '4800/8/Even/1' },
  { baudRate: 4800, parity: 'even', dataBits: 7, stopBits: 2, label: '4800/7/Even/2' },
  { baudRate: 19200, parity: 'none', label: '19200/8/None/1 (high-speed)' },
  { baudRate: 1200, parity: 'none', label: '1200/8/None/1 (legacy)' },
  { baudRate: 1200, parity: 'even', dataBits: 7, stopBits: 2, label: '1200/7/Even/2 (legacy)' },
  { baudRate: 115200, parity: 'none', label: '115200/8/None/1 (modern)' },
]

// Config key in localStorage
const CONFIG_KEY = 'keli_scale_config'

// ============================================================================
// PARSER — Parse Keli output formats (text + binary)
// ============================================================================

function parseKeliOutput(line: string): ScaleReading | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length < 3) return null

  // Format 1: "ST,GS,+  12345 kg" (full Keli protocol)
  const fullMatch = trimmed.match(
    /^(ST|US|OL),\s*(GS|NT|TR),\s*([+-])\s*([\d.]+)\s*(kg|lb|t|g)?/i
  )
  if (fullMatch) {
    const statusCode = fullMatch[1].toUpperCase()
    const stable = statusCode === 'ST'
    const overload = statusCode === 'OL'
    const sign = fullMatch[3] === '-' ? -1 : 1
    const weight = parseFloat(fullMatch[4]) * sign
    const unit = (fullMatch[5] || 'kg').toLowerCase()

    if (overload) {
      console.error(`[KeliScale] ⚠️ OVERLOAD (OL) detected! Weight: ${weight} ${unit} — Cân quá tải!`)
    }

    if (isNaN(weight)) return null

    return {
      weight: Math.round(weight * 100) / 100,
      unit,
      stable,
      timestamp: Date.now(),
    }
  }

  // Format 2: "=0000.54(kg)" or "=12345.6(kg)" (Keli XK3118T1 format)
  const xk3118Match = trimmed.match(/^=\s*([\d.]+)\s*\(?(kg|lb|t|g)?\)?$/i)
  if (xk3118Match) {
    const weight = parseFloat(xk3118Match[1])
    const unit = (xk3118Match[2] || 'kg').toLowerCase()

    if (isNaN(weight)) return null

    return {
      weight: Math.round(weight * 100) / 100,
      unit,
      stable: true,
      timestamp: Date.now(),
    }
  }

  // Format 3: "+  12345" or "  12345" (simple weight only)
  const simpleMatch = trimmed.match(/^([+-])?\s*([\d.]+)\s*(kg|lb|t|g)?$/i)
  if (simpleMatch) {
    const sign = simpleMatch[1] === '-' ? -1 : 1
    const weight = parseFloat(simpleMatch[2]) * sign
    const unit = (simpleMatch[3] || 'kg').toLowerCase()

    if (isNaN(weight)) return null

    return {
      weight: Math.round(weight * 100) / 100,
      unit,
      stable: true, // assume stable in simple format
      timestamp: Date.now(),
    }
  }

  // Format 4: "12345.5" (just a number)
  const numOnly = parseFloat(trimmed)
  if (!isNaN(numOnly) && trimmed.match(/^[+-]?[\d.]+$/)) {
    return {
      weight: Math.round(numOnly * 100) / 100,
      unit: 'kg',
      stable: true,
      timestamp: Date.now(),
    }
  }

  return null
}

// ============================================================================
// BINARY FRAME PARSER — Parse STX/ETX binary protocol (120T truck scales)
// ============================================================================
// Many large Keli indicators (XK3190-A9, D2008FA) use binary continuous output:
//   Frame: STX(0x02) + [status] + [sign] + [weight digits] + [dp] + ETX(0x03)
//   Or:    STX(0x02) + [6-8 data bytes] + ETX(0x03) + optional CR LF
//
// Some variants:
//   - 0x02 SS DD DD DD DD DD DD PP 0x03  (10 bytes: STX + status + 6 digits + decimal_pos + ETX)
//   - Weight digits are ASCII '0'-'9' (0x30-0x39) or BCD encoded

function parseBinaryFrame(rawBytes: number[]): ScaleReading | null {
  // Look for STX (0x02) ... ETX (0x03) frame
  const stxIdx = rawBytes.indexOf(0x02)
  if (stxIdx === -1) return null

  const etxIdx = rawBytes.indexOf(0x03, stxIdx + 1)
  if (etxIdx === -1) return null

  const frame = rawBytes.slice(stxIdx + 1, etxIdx)
  const frameHex = frame.map(b => b.toString(16).padStart(2, '0')).join(' ')
  console.log(`[KeliScale] 🔍 Binary frame (${frame.length} bytes): ${frameHex}`)

  // Try to extract weight from frame
  // Method 1: ASCII digits in frame (most common)
  const asciiChars = frame.filter(b => b >= 0x20 && b <= 0x7E).map(b => String.fromCharCode(b)).join('')
  console.log(`[KeliScale] 🔍 Frame ASCII: "${asciiChars}"`)

  // Extract sign
  const sign = asciiChars.includes('-') ? -1 : 1

  // Extract digits and decimal point
  const digitMatch = asciiChars.match(/([+-])?\s*([\d.]+)/)
  if (digitMatch) {
    const weight = parseFloat(digitMatch[2]) * sign
    if (!isNaN(weight)) {
      // Check stability from status byte (bit patterns vary by model)
      const statusByte = frame[0]
      const stable = statusByte !== undefined ? (statusByte & 0x20) !== 0 || (statusByte & 0x40) !== 0 : true

      console.log(`[KeliScale] ✅ Binary parsed: ${weight} kg (stable: ${stable})`)
      return {
        weight: Math.round(weight * 100) / 100,
        unit: 'kg',
        stable,
        timestamp: Date.now(),
      }
    }
  }

  // Method 2: BCD encoded weight (each nibble = one digit)
  // Common in older Keli indicators: 6 bytes = 12 BCD digits
  if (frame.length >= 4) {
    const bcdDigits: number[] = []
    for (const byte of frame) {
      const hi = (byte >> 4) & 0x0F
      const lo = byte & 0x0F
      if (hi <= 9 && lo <= 9) {
        bcdDigits.push(hi, lo)
      }
    }
    if (bcdDigits.length >= 4) {
      const bcdStr = bcdDigits.join('')
      const bcdWeight = parseInt(bcdStr, 10)
      if (!isNaN(bcdWeight) && bcdWeight > 0) {
        console.log(`[KeliScale] ✅ BCD parsed: ${bcdWeight} (raw: ${bcdStr})`)
        return {
          weight: bcdWeight,
          unit: 'kg',
          stable: true,
          timestamp: Date.now(),
        }
      }
    }
  }

  return null
}

// Extract binary frames from raw byte buffer, returns { readings, remainingBytes }
function extractBinaryFrames(rawBytes: number[]): { readings: ScaleReading[]; remaining: number[] } {
  const readings: ScaleReading[] = []
  let searchFrom = 0

  while (searchFrom < rawBytes.length) {
    const stxIdx = rawBytes.indexOf(0x02, searchFrom)
    if (stxIdx === -1) break

    const etxIdx = rawBytes.indexOf(0x03, stxIdx + 1)
    if (etxIdx === -1) {
      // Incomplete frame — keep from STX onward for next read
      return { readings, remaining: rawBytes.slice(stxIdx) }
    }

    const reading = parseBinaryFrame(rawBytes.slice(stxIdx, etxIdx + 1))
    if (reading) readings.push(reading)
    searchFrom = etxIdx + 1
  }

  // Keep last 50 bytes max as potential partial frame
  const keepFrom = Math.max(0, rawBytes.length - 50)
  const lastStx = rawBytes.lastIndexOf(0x02, rawBytes.length - 1)
  const remaining = lastStx >= keepFrom ? rawBytes.slice(lastStx) : []

  return { readings, remaining }
}

// ============================================================================
// HELPER — Try to open port with a config, read for a short time, check data
// ============================================================================

// D2008FA query commands — some indicators only respond to commands, not continuous output
const QUERY_COMMANDS = ['CP\r\n', 'R\r\n', 'W\r\n', 'P\r\n']

async function sendCommand(port: SerialPort, cmd: string): Promise<void> {
  if (!port.writable) return
  const writer = port.writable.getWriter()
  try {
    await writer.write(new TextEncoder().encode(cmd))
  } finally {
    writer.releaseLock()
  }
}

async function tryConfigOnPort(
  port: SerialPort,
  cfg: { baudRate: number; parity: ParityType; dataBits?: number; stopBits?: number },
  timeoutMs = 4000
): Promise<'ok' | 'parity' | 'no_data' | 'garbled' | 'error'> {
  try {
    await port.open({
      baudRate: cfg.baudRate,
      dataBits: cfg.dataBits ?? 8,
      stopBits: cfg.stopBits ?? 1,
      parity: cfg.parity,
      flowControl: 'none',
    })
  } catch {
    return 'error'
  }

  let result: 'ok' | 'parity' | 'no_data' | 'garbled' = 'no_data'

  try {
    if (!port.readable) {
      await port.close()
      return 'error'
    }

    // Send query commands to wake up indicators in command mode (D2008FA)
    for (const cmd of QUERY_COMMANDS) {
      try { await sendCommand(port, cmd) } catch { /* ignore */ }
    }

    const reader = port.readable.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let totalBytesReceived = 0
    const rawByteBuffer: number[] = []

    // Read with timeout
    const deadline = Date.now() + timeoutMs
    try {
      while (Date.now() < deadline) {
        const readPromise = reader.read()
        const timeoutPromise = new Promise<{ value: undefined; done: true }>(resolve =>
          setTimeout(() => resolve({ value: undefined, done: true }), deadline - Date.now())
        )
        const { value, done } = await Promise.race([readPromise, timeoutPromise])
        if (done || !value) break

        totalBytesReceived += value.length

        // Collect raw bytes for binary frame detection
        for (let i = 0; i < value.length; i++) rawByteBuffer.push(value[i])

        buffer += decoder.decode(value, { stream: true })

        // Check text lines
        const lines = buffer.split(/\r\n|\r|\n/)
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.trim() && parseKeliOutput(line)) {
            result = 'ok'
            break
          }
        }
        if (result === 'ok') break

        // Check binary frames (STX/ETX)
        const { readings } = extractBinaryFrames(rawByteBuffer)
        if (readings.length > 0) {
          result = 'ok'
          break
        }
      }
    } catch (err: any) {
      if (err.name === 'ParityError' || (err.message && err.message.includes('Parity'))) {
        result = 'parity'
      }
    } finally {
      try { await reader.cancel() } catch { /* ignore */ }
      try { reader.releaseLock() } catch { /* ignore */ }
    }

    // If we received bytes but couldn't parse any lines or frames → garbled
    if (result === 'no_data' && totalBytesReceived > 10) {
      const hexSample = rawByteBuffer.slice(0, 30).map(b => b.toString(16).padStart(2, '0')).join(' ')
      console.log(`[KeliScale] tryConfig: ${totalBytesReceived} bytes, no valid data. Sample: ${hexSample}`)
      result = 'garbled'
    }
  } finally {
    await new Promise(r => setTimeout(r, 100))
    try { await port.close() } catch { /* ignore */ }
  }

  return result
}

// ============================================================================
// HOOK
// ============================================================================

export function useKeliScale(): UseKeliScaleReturn {
  // Check browser support
  const supported = typeof navigator !== 'undefined' && 'serial' in navigator

  const [connected, setConnected] = useState(false)
  const [liveWeight, setLiveWeight] = useState<ScaleReading | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [config, setConfigState] = useState<KeliScaleConfig>(() => {
    try {
      const saved = localStorage.getItem(CONFIG_KEY)
      if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) }
    } catch { /* ignore */ }
    return DEFAULT_CONFIG
  })

  const portRef = useRef<SerialPort | null>(null)
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const readingRef = useRef(false)
  const bufferRef = useRef('')
  const rawByteBufferRef = useRef<number[]>([])
  // Prevent auto-reconnect after fatal error (ParityError, etc.)
  const fatalErrorRef = useRef(false)

  // Save config
  const setConfig = useCallback((partial: Partial<KeliScaleConfig>) => {
    setConfigState(prev => {
      const next = { ...prev, ...partial }
      try { localStorage.setItem(CONFIG_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
    // Clear fatal error flag when user changes config
    fatalErrorRef.current = false
  }, [])

  // --------------------------------------------------------------------------
  // READ LOOP — Continuously read from serial port
  // --------------------------------------------------------------------------

  const startReading = useCallback(async (port: SerialPort) => {
    if (readingRef.current) return
    readingRef.current = true
    bufferRef.current = ''
    rawByteBufferRef.current = []

    let consecutiveErrors = 0
    const MAX_CONSECUTIVE_ERRORS = 5

    // Send query commands for D2008FA command mode
    for (const cmd of QUERY_COMMANDS) {
      try { await sendCommand(port, cmd) } catch { /* ignore */ }
    }

    try {
      while (port.readable && readingRef.current) {
        const reader = port.readable.getReader()
        readerRef.current = reader

        try {
          const decoder = new TextDecoder()

          while (readingRef.current) {
            const { value, done } = await reader.read()
            if (done) break

            // Reset error counter on successful read
            consecutiveErrors = 0

            // Collect raw bytes for binary frame detection
            const bytes = new Uint8Array(value)
            for (let i = 0; i < bytes.length; i++) rawByteBufferRef.current.push(bytes[i])
            // Keep buffer bounded (max 500 bytes)
            if (rawByteBufferRef.current.length > 500) {
              rawByteBufferRef.current = rawByteBufferRef.current.slice(-200)
            }

            const rawText = decoder.decode(value, { stream: true })
            const rawHex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ')
            console.log(`[KeliScale] 📥 Raw (${bytes.length} bytes):`, JSON.stringify(rawText), '| HEX:', rawHex)
            bufferRef.current += rawText

            // === Method 1: Text lines (separated by \r\n, \n, or \r) ===
            const lines = bufferRef.current.split(/\r\n|\r|\n/)
            bufferRef.current = lines.pop() || ''
            let textParsed = false

            for (const line of lines) {
              if (line.trim()) {
                const reading = parseKeliOutput(line)
                if (reading) {
                  console.log(`[KeliScale] ✅ Weight: ${reading.weight} ${reading.unit} | Stable: ${reading.stable} | Line: ${JSON.stringify(line)}`)
                  setLiveWeight(reading)
                  textParsed = true
                } else {
                  console.warn(`[KeliScale] ❌ Cannot parse text: ${JSON.stringify(line)}`)
                }
              }
            }

            // === Method 2: Binary frames (STX/ETX) — fallback for D2008FA binary mode ===
            if (!textParsed) {
              const { readings, remaining } = extractBinaryFrames(rawByteBufferRef.current)
              rawByteBufferRef.current = remaining
              for (const reading of readings) {
                console.log(`[KeliScale] ✅ Binary weight: ${reading.weight} ${reading.unit}`)
                setLiveWeight(reading)
              }
            }
          }
        } catch (err: any) {
          // ParityError — parity config doesn't match the scale hardware
          if (err.name === 'ParityError' || (err.message && err.message.includes('Parity'))) {
            console.error('[KeliScale] Parity error — cài đặt parity không khớp đầu cân')
            setError('Lỗi Parity — đang tự động dò cấu hình đúng...')
            readingRef.current = false
            setConnected(false)
            fatalErrorRef.current = true
            // Close port so auto-detect can use it
            try { await port.close() } catch { /* ignore */ }
            portRef.current = null
            break
          }

          if (err.name !== 'NetworkError' && readingRef.current) {
            consecutiveErrors++
            console.error(`[KeliScale] Read error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, err)

            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
              console.error('[KeliScale] Too many consecutive errors, stopping read loop')
              setError(`Lỗi đọc cân liên tục: ${err.message || err.name}. Kiểm tra kết nối và cài đặt cân.`)
              readingRef.current = false
              setConnected(false)
              fatalErrorRef.current = true
              try { await port.close() } catch { /* ignore */ }
              portRef.current = null
              break
            }
          }
        } finally {
          reader.releaseLock()
          readerRef.current = null
        }
      }
    } finally {
      readingRef.current = false
    }
  }, [])

  // --------------------------------------------------------------------------
  // AUTO-DETECT — Try different configs to find the right one
  // --------------------------------------------------------------------------

  const autoDetect = useCallback(async (port: SerialPort): Promise<KeliScaleConfig | null> => {
    console.log('[KeliScale] Auto-detecting config...')

    for (const cfg of AUTO_DETECT_CONFIGS) {
      setError(`Đang thử cấu hình ${cfg.label}...`)
      console.log(`[KeliScale] Trying: ${cfg.label}`)

      // Wait for port to be fully released
      await new Promise(r => setTimeout(r, 300))

      const result = await tryConfigOnPort(port, {
        baudRate: cfg.baudRate,
        parity: cfg.parity,
        dataBits: cfg.dataBits,
        stopBits: cfg.stopBits,
      })

      console.log(`[KeliScale] ${cfg.label} → ${result}`)

      if (result === 'ok') {
        const found: KeliScaleConfig = {
          baudRate: cfg.baudRate,
          dataBits: cfg.dataBits ?? 8,
          stopBits: cfg.stopBits ?? 1,
          parity: cfg.parity,
          flowControl: 'none',
        }
        console.log(`[KeliScale] Auto-detect SUCCESS: ${cfg.label}`)
        return found
      }
    }

    return null
  }, [])

  // --------------------------------------------------------------------------
  // CONNECT — Open browser serial port picker
  // --------------------------------------------------------------------------

  const connectWithConfig = useCallback(async (port: SerialPort, cfg: KeliScaleConfig): Promise<boolean> => {
    try {
      await port.open({
        baudRate: cfg.baudRate,
        dataBits: cfg.dataBits,
        stopBits: cfg.stopBits,
        parity: cfg.parity,
        flowControl: cfg.flowControl,
      })

      portRef.current = port
      setConnected(true)
      setError(null)
      fatalErrorRef.current = false
      console.log(`[KeliScale] ✅ Connected — Model: XK3118T1-A3 | Baud: ${cfg.baudRate} | Parity: ${cfg.parity} | DataBits: ${cfg.dataBits} | StopBits: ${cfg.stopBits}`)
      console.log(`[KeliScale] 📡 Listening for weight data... (check console for raw bytes)`)

      startReading(port)

      port.addEventListener('disconnect', () => {
        console.log('[KeliScale] Port disconnected')
        setConnected(false)
        setLiveWeight(null)
        readingRef.current = false
        portRef.current = null
      })

      return true
    } catch (err: any) {
      console.error('[KeliScale] Open error:', err)
      return false
    }
  }, [startReading])

  const connect = useCallback(async (): Promise<boolean> => {
    if (!supported) {
      setError('Trình duyệt không hỗ trợ Web Serial API. Dùng Chrome hoặc Edge.')
      return false
    }

    try {
      setError(null)
      fatalErrorRef.current = false

      // Close existing connection cleanly
      if (portRef.current) {
        readingRef.current = false
        if (readerRef.current) {
          try { await readerRef.current.cancel() } catch { /* ignore */ }
          try { readerRef.current.releaseLock() } catch { /* ignore */ }
          readerRef.current = null
        }
        await new Promise(r => setTimeout(r, 200))
        try { await portRef.current.close() } catch { /* ignore */ }
        portRef.current = null
        await new Promise(r => setTimeout(r, 200))
      }

      // Request port from user (browser shows picker dialog)
      const port = await (navigator as any).serial.requestPort()

      // Always auto-detect first — try all configs to find one that returns valid weight data
      setError('Đang tự động dò cấu hình đầu cân...')

      const detectedConfig = await autoDetect(port)
      if (detectedConfig) {
        // Save detected config
        setConfigState(detectedConfig)
        try { localStorage.setItem(CONFIG_KEY, JSON.stringify(detectedConfig)) } catch { /* ignore */ }

        // Connect with detected config
        await new Promise(r => setTimeout(r, 300))
        const ok = await connectWithConfig(port, detectedConfig)
        if (ok) {
          setError(null)
          return true
        }
      }

      // Fallback: try current config directly (user may have set it manually)
      console.log('[KeliScale] Auto-detect failed, trying saved config...')
      await new Promise(r => setTimeout(r, 300))
      try { await port.close() } catch { /* ignore */ }
      await new Promise(r => setTimeout(r, 300))
      const success = await connectWithConfig(port, config)
      if (success) {
        setError(null)
        return true
      }

      setError('Không tìm được cấu hình phù hợp. Kiểm tra kết nối cáp RS232 và đầu cân.')
      return false
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        return false
      }
      console.error('[KeliScale] Connect error:', err)
      setError(err.message || 'Không thể kết nối đầu cân')
      setConnected(false)
      return false
    }
  }, [supported, config, connectWithConfig, autoDetect])

  // --------------------------------------------------------------------------
  // DISCONNECT
  // --------------------------------------------------------------------------

  const disconnect = useCallback(async () => {
    // 1. Stop read loop first
    readingRef.current = false

    // 2. Cancel reader (releases the lock on readable stream)
    if (readerRef.current) {
      try {
        await readerRef.current.cancel()
      } catch { /* already released */ }
      try {
        readerRef.current.releaseLock()
      } catch { /* already released */ }
      readerRef.current = null
    }

    // 3. Small delay to let read loop exit cleanly
    await new Promise(r => setTimeout(r, 100))

    // 4. Close port
    if (portRef.current) {
      try {
        await portRef.current.close()
      } catch { /* already closed */ }
      portRef.current = null
    }

    setConnected(false)
    setLiveWeight(null)
    setError(null)
    console.log('[KeliScale] Disconnected cleanly')
  }, [])

  // --------------------------------------------------------------------------
  // READ ONCE — Return current reading (snapshot)
  // --------------------------------------------------------------------------

  const readOnce = useCallback(async (): Promise<ScaleReading | null> => {
    if (liveWeight && Date.now() - liveWeight.timestamp < 5000) {
      return liveWeight
    }
    return null
  }, [liveWeight])

  // --------------------------------------------------------------------------
  // CHECK STATUS
  // --------------------------------------------------------------------------

  const checkStatus = useCallback(async (): Promise<boolean> => {
    const isOpen = portRef.current !== null && connected
    return isOpen
  }, [connected])

  // --------------------------------------------------------------------------
  // CLEANUP on unmount
  // --------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      readingRef.current = false
      if (readerRef.current) {
        try { readerRef.current.cancel() } catch { /* ignore */ }
        try { readerRef.current.releaseLock() } catch { /* ignore */ }
        readerRef.current = null
      }
      // Delay port close to let reader finish
      const port = portRef.current
      portRef.current = null
      if (port) {
        setTimeout(async () => {
          try { await port.close() } catch { /* ignore */ }
        }, 150)
      }
    }
  }, [])

  // --------------------------------------------------------------------------
  // AUTO-RECONNECT to previously paired port (skip if fatal error)
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!supported || fatalErrorRef.current) return

    const tryAutoConnect = async () => {
      try {
        const ports = await (navigator as any).serial.getPorts()
        if (ports.length > 0 && !portRef.current && !fatalErrorRef.current) {
          const port = ports[0]
          const success = await connectWithConfig(port, config)
          if (!success) {
            // Don't auto-detect on auto-reconnect — just silently fail
            console.log('[KeliScale] Auto-reconnect failed, user can connect manually')
          }
        }
      } catch {
        // getPorts() may fail
      }
    }

    tryAutoConnect()
    // Only run on mount, not on config changes (to avoid reconnect loops)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported])

  return {
    supported,
    connected,
    liveWeight,
    connect,
    disconnect,
    readOnce,
    checkStatus,
    error,
    config,
    setConfig,
  }
}

export default useKeliScale
