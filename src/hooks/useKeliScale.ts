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
  baudRate: 2400,
  dataBits: 8,
  stopBits: 1,
  parity: 'none' as ParityType,
  flowControl: 'none' as FlowControlType,
}

// Config key in localStorage
const CONFIG_KEY = 'keli_scale_config'

// ============================================================================
// PARSER — Parse Keli output formats
// ============================================================================

function parseKeliOutput(line: string): ScaleReading | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length < 3) return null

  // Format 1: "ST,GS,+  12345 kg" (full Keli protocol)
  const fullMatch = trimmed.match(
    /^(ST|US|OL),\s*(GS|NT|TR),\s*([+-])\s*([\d.]+)\s*(kg|lb|t|g)?/i
  )
  if (fullMatch) {
    const stable = fullMatch[1].toUpperCase() === 'ST'
    const sign = fullMatch[3] === '-' ? -1 : 1
    const weight = parseFloat(fullMatch[4]) * sign
    const unit = (fullMatch[5] || 'kg').toLowerCase()

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

  // Format 3: "12345.5" (just a number)
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

  // Save config
  const setConfig = useCallback((partial: Partial<KeliScaleConfig>) => {
    setConfigState(prev => {
      const next = { ...prev, ...partial }
      try { localStorage.setItem(CONFIG_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  // --------------------------------------------------------------------------
  // READ LOOP — Continuously read from serial port
  // --------------------------------------------------------------------------

  // Debug mode: bật bằng console: window.__SCALE_DEBUG = true
  const isDebug = () => typeof window !== 'undefined' && (window as any).__SCALE_DEBUG === true

  const startReading = useCallback(async (port: SerialPort) => {
    if (readingRef.current) return
    readingRef.current = true
    bufferRef.current = ''

    let consecutiveErrors = 0
    const MAX_CONSECUTIVE_ERRORS = 5

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

            const rawText = decoder.decode(value, { stream: true })
            if (isDebug()) console.log('[KeliScale] Raw chunk:', JSON.stringify(rawText))
            bufferRef.current += rawText

            // Process complete lines (separated by \r\n, \n, or \r)
            const lines = bufferRef.current.split(/\r\n|\r|\n/)
            bufferRef.current = lines.pop() || ''

            for (const line of lines) {
              if (line.trim()) {
                if (isDebug()) console.log('[KeliScale] Line:', JSON.stringify(line))
                const reading = parseKeliOutput(line)
                if (reading) {
                  if (isDebug()) console.log('[KeliScale] Parsed:', reading.weight, reading.unit)
                  setLiveWeight(reading)
                }
              }
            }
          }
        } catch (err: any) {
          // ParityError — parity config doesn't match the scale hardware
          if (err.name === 'ParityError' || (err.message && err.message.includes('Parity'))) {
            console.error('[KeliScale] Parity error — cài đặt parity không khớp đầu cân. Hãy đổi parity trong Cài đặt.')
            setError('Lỗi Parity: cài đặt không khớp đầu cân. Vào Cài đặt → đổi Parity (thử Even hoặc Odd) rồi kết nối lại.')
            readingRef.current = false
            setConnected(false)
            // Close port so user can reconnect with correct config
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
  // CONNECT — Open browser serial port picker
  // --------------------------------------------------------------------------

  const connect = useCallback(async (): Promise<boolean> => {
    if (!supported) {
      setError('Trình duyệt không hỗ trợ Web Serial API. Dùng Chrome hoặc Edge.')
      return false
    }

    try {
      setError(null)

      // Close existing connection cleanly
      if (portRef.current) {
        readingRef.current = false
        if (readerRef.current) {
          try { await readerRef.current.cancel() } catch { /* ignore */ }
          try { readerRef.current.releaseLock() } catch { /* ignore */ }
          readerRef.current = null
        }
        await new Promise(r => setTimeout(r, 100))
        try { await portRef.current.close() } catch { /* ignore */ }
        portRef.current = null
      }

      // Request port from user (browser shows picker dialog)
      const port = await (navigator as any).serial.requestPort()

      // Open port with Keli config
      await port.open({
        baudRate: config.baudRate,
        dataBits: config.dataBits,
        stopBits: config.stopBits,
        parity: config.parity,
        flowControl: config.flowControl,
      })

      portRef.current = port
      setConnected(true)
      setError(null)
      console.log('[KeliScale] Connected to serial port')

      // Start reading
      startReading(port)

      // Listen for disconnect
      port.addEventListener('disconnect', () => {
        console.log('[KeliScale] Port disconnected')
        setConnected(false)
        setLiveWeight(null)
        readingRef.current = false
        portRef.current = null
      })

      return true
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        // User cancelled the picker — not an error
        return false
      }
      console.error('[KeliScale] Connect error:', err)
      setError(err.message || 'Không thể kết nối đầu cân')
      setConnected(false)
      return false
    }
  }, [supported, config, startReading])

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
  // AUTO-RECONNECT to previously paired port
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!supported) return

    const tryAutoConnect = async () => {
      try {
        const ports = await (navigator as any).serial.getPorts()
        if (ports.length > 0 && !portRef.current) {
          const port = ports[0]
          try {
            await port.open({
              baudRate: config.baudRate,
              dataBits: config.dataBits,
              stopBits: config.stopBits,
              parity: config.parity,
              flowControl: config.flowControl,
            })
            portRef.current = port
            setConnected(true)
            console.log('[KeliScale] Auto-reconnected to previously paired port')
            startReading(port)

            port.addEventListener('disconnect', () => {
              setConnected(false)
              setLiveWeight(null)
              readingRef.current = false
              portRef.current = null
            })
          } catch {
            // Port may be in use or unavailable
          }
        }
      } catch {
        // getPorts() may fail
      }
    }

    tryAutoConnect()
  }, [supported, config, startReading])

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
