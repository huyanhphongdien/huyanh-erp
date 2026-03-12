// ============================================================================
// VOICE RECORDER — Component ghi âm tin nhắn thoại
// File: src/components/b2b/chat/VoiceRecorder.tsx
// Phase: E1.2.5
// ============================================================================

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Button,
  Modal,
  Space,
  Typography,
  Progress,
  message,
  Tooltip,
} from 'antd'
import {
  AudioOutlined,
  PauseOutlined,
  DeleteOutlined,
  SendOutlined,
  CloseOutlined,
  SoundOutlined,
} from '@ant-design/icons'
import { chatAttachmentService } from '../../services/b2b/chatAttachmentService'
import { ChatAttachment } from '../../services/b2b/chatMessageService'

const { Text, Title } = Typography

// ============================================
// TYPES
// ============================================

interface VoiceRecorderProps {
  roomId: string
  onSend: (attachment: ChatAttachment) => void
  onCancel?: () => void
}

type RecordingState = 'idle' | 'recording' | 'paused' | 'recorded'

// ============================================
// CONSTANTS
// ============================================

const MAX_DURATION = 120 // 2 minutes max
const MIME_TYPE = 'audio/webm;codecs=opus'
const FALLBACK_MIME_TYPE = 'audio/webm'

// ============================================
// HELPER FUNCTIONS
// ============================================

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// ============================================
// AUDIO VISUALIZER COMPONENT
// ============================================

interface AudioVisualizerProps {
  analyser: AnalyserNode | null
  isRecording: boolean
}

const AudioVisualizer = ({ analyser, isRecording }: AudioVisualizerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()

  useEffect(() => {
    if (!analyser || !isRecording || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw)

      analyser.getByteFrequencyData(dataArray)

      ctx.fillStyle = '#f5f5f5'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const barWidth = (canvas.width / bufferLength) * 2.5
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.8

        // Gradient color based on height
        const hue = 200 + (dataArray[i] / 255) * 60 // Blue to purple
        ctx.fillStyle = `hsl(${hue}, 70%, 50%)`

        ctx.fillRect(
          x,
          canvas.height - barHeight,
          barWidth - 1,
          barHeight
        )

        x += barWidth
      }
    }

    draw()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [analyser, isRecording])

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={60}
      style={{
        borderRadius: 8,
        backgroundColor: '#f5f5f5',
      }}
    />
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

const VoiceRecorder = ({ roomId, onSend, onCancel }: VoiceRecorderProps) => {
  // State
  const [state, setState] = useState<RecordingState>('idle')
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  // ============================================
  // CLEANUP
  // ============================================

  const cleanup = useCallback(() => {
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    // Stop stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    // Revoke audio URL
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }

    setAnalyser(null)
  }, [audioUrl])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  // ============================================
  // RECORDING FUNCTIONS
  // ============================================

  const startRecording = async () => {
    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Setup audio analyser for visualization
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      const source = audioContext.createMediaStreamSource(stream)
      const analyserNode = audioContext.createAnalyser()
      analyserNode.fftSize = 64
      source.connect(analyserNode)
      setAnalyser(analyserNode)

      // Determine supported MIME type
      const mimeType = MediaRecorder.isTypeSupported(MIME_TYPE)
        ? MIME_TYPE
        : FALLBACK_MIME_TYPE

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        setState('recorded')
      }

      // Start recording
      mediaRecorder.start(100) // Collect data every 100ms
      setState('recording')

      // Start timer
      setDuration(0)
      timerRef.current = setInterval(() => {
        setDuration((prev) => {
          if (prev >= MAX_DURATION) {
            stopRecording()
            return prev
          }
          return prev + 1
        })
      }, 1000)
    } catch (error) {
      console.error('Error starting recording:', error)
      message.error('Không thể truy cập microphone. Vui lòng cấp quyền.')
    }
  }

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
    }

    setAnalyser(null)
  }

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause()
      setState('paused')
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume()
      setState('recording')
      timerRef.current = setInterval(() => {
        setDuration((prev) => {
          if (prev >= MAX_DURATION) {
            stopRecording()
            return prev
          }
          return prev + 1
        })
      }, 1000)
    }
  }

  const discardRecording = () => {
    cleanup()
    setAudioBlob(null)
    setAudioUrl(null)
    setDuration(0)
    setState('idle')
    audioChunksRef.current = []
  }

  const sendRecording = async () => {
    if (!audioBlob) return

    try {
      setUploading(true)

      // Upload to storage
      const attachment = await chatAttachmentService.uploadAudio(roomId, audioBlob)
      
      // Update duration
      attachment.duration = duration

      // Callback
      onSend(attachment)

      // Cleanup
      discardRecording()
    } catch (error) {
      console.error('Error uploading audio:', error)
      message.error('Không thể gửi tin nhắn thoại')
    } finally {
      setUploading(false)
    }
  }

  // ============================================
  // RENDER
  // ============================================

  // Idle state - just the microphone button
  if (state === 'idle') {
    return (
      <Tooltip title="Ghi âm tin nhắn thoại">
        <Button
          type="text"
          icon={<AudioOutlined />}
          onClick={startRecording}
        />
      </Tooltip>
    )
  }

  // Recording / Paused / Recorded states - show modal-like UI
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: '16px 24px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        zIndex: 1000,
        minWidth: 320,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <SoundOutlined style={{ color: '#1677ff', fontSize: 18 }} />
          <Text strong>
            {state === 'recording' && 'Đang ghi âm...'}
            {state === 'paused' && 'Tạm dừng'}
            {state === 'recorded' && 'Tin nhắn thoại'}
          </Text>
        </Space>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          onClick={() => {
            discardRecording()
            onCancel?.()
          }}
        />
      </div>

      {/* Visualizer / Audio Player */}
      <div style={{ marginBottom: 16 }}>
        {(state === 'recording' || state === 'paused') && (
          <AudioVisualizer analyser={analyser} isRecording={state === 'recording'} />
        )}
        
        {state === 'recorded' && audioUrl && (
          <audio
            controls
            src={audioUrl}
            style={{ width: '100%', height: 40 }}
          />
        )}
      </div>

      {/* Duration */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <Text
          style={{
            fontSize: 24,
            fontWeight: 600,
            fontFamily: 'JetBrains Mono, monospace',
            color: state === 'recording' ? '#ff4d4f' : '#333',
          }}
        >
          {formatTime(duration)}
        </Text>
        {state === 'recording' && (
          <div style={{ marginTop: 4 }}>
            <Progress
              percent={(duration / MAX_DURATION) * 100}
              showInfo={false}
              size="small"
              strokeColor="#ff4d4f"
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              Tối đa {formatTime(MAX_DURATION)}
            </Text>
          </div>
        )}
      </div>

      {/* Controls */}
      <Space style={{ width: '100%', justifyContent: 'center' }} size={16}>
        {/* Discard */}
        <Tooltip title="Hủy">
          <Button
            shape="circle"
            size="large"
            icon={<DeleteOutlined />}
            onClick={discardRecording}
            disabled={uploading}
          />
        </Tooltip>

        {/* Recording controls */}
        {state === 'recording' && (
          <>
            <Tooltip title="Tạm dừng">
              <Button
                shape="circle"
                size="large"
                icon={<PauseOutlined />}
                onClick={pauseRecording}
              />
            </Tooltip>
            <Tooltip title="Dừng & Gửi">
              <Button
                type="primary"
                shape="circle"
                size="large"
                icon={<SendOutlined />}
                onClick={stopRecording}
                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
              />
            </Tooltip>
          </>
        )}

        {state === 'paused' && (
          <>
            <Tooltip title="Tiếp tục">
              <Button
                type="primary"
                shape="circle"
                size="large"
                danger
                icon={<AudioOutlined />}
                onClick={resumeRecording}
              />
            </Tooltip>
            <Tooltip title="Dừng">
              <Button
                shape="circle"
                size="large"
                icon={<SendOutlined />}
                onClick={stopRecording}
                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', color: '#fff' }}
              />
            </Tooltip>
          </>
        )}

        {state === 'recorded' && (
          <Tooltip title="Gửi">
            <Button
              type="primary"
              shape="circle"
              size="large"
              icon={<SendOutlined />}
              onClick={sendRecording}
              loading={uploading}
              style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
            />
          </Tooltip>
        )}
      </Space>
    </div>
  )
}

export default VoiceRecorder