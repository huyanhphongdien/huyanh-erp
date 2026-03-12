/**
 * VoiceRecorder Component
 * Ghi âm và gửi tin nhắn thoại
 * 
 * Features:
 * - Record audio với MediaRecorder
 * - Visualize audio waveform
 * - Playback before send
 * - Cancel recording
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Space, Typography, Progress } from 'antd';
import {
  AudioOutlined,
  DeleteOutlined,
  SendOutlined,
  PauseOutlined,
  PlayCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { colors } from '../../config/antdTheme';

const { Text } = Typography;

// ==========================================
// TYPES
// ==========================================

export interface VoiceRecorderProps {
  onSend: (blob: Blob) => void;
  onCancel: () => void;
  maxDuration?: number; // seconds
}

type RecordingState = 'idle' | 'recording' | 'paused' | 'recorded';

// ==========================================
// VOICE RECORDER COMPONENT
// ==========================================

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onSend,
  onCancel,
  maxDuration = 120, // 2 minutes default
}) => {
  // State
  const [state, setState] = useState<RecordingState>('idle');
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Setup audio analyser for visualization
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Setup MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4',
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setState('recorded');
      };

      mediaRecorder.start();
      setState('recording');

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration((prev) => {
          if (prev >= maxDuration) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

      // Start visualization
      visualize();
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  }, [maxDuration]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }, [state]);

  // Visualize audio waveform
  const visualize = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;

        ctx.fillStyle = colors.primary;
        ctx.fillRect(
          x,
          canvas.height / 2 - barHeight / 2,
          barWidth,
          barHeight
        );

        x += barWidth + 1;
      }
    };

    draw();
  }, []);

  // Handle send
  const handleSend = () => {
    if (chunksRef.current.length > 0 && mediaRecorderRef.current) {
      const blob = new Blob(chunksRef.current, {
        type: mediaRecorderRef.current.mimeType,
      });
      onSend(blob);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    stopRecording();
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    onCancel();
  };

  // Toggle playback
  const togglePlayback = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // Auto start recording on mount
  useEffect(() => {
    startRecording();

    return () => {
      stopRecording();
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, []);

  // Audio element for playback
  useEffect(() => {
    if (audioUrl && !audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }
  }, [audioUrl]);

  return (
    <div
      style={{
        padding: '12px 16px',
        background: '#fff',
        borderTop: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {/* Cancel button */}
      <Button
        danger
        icon={<DeleteOutlined />}
        onClick={handleCancel}
      />

      {/* Waveform / Progress */}
      <div style={{ flex: 1 }}>
        {state === 'recording' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Recording indicator */}
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: '#ff4d4f',
                animation: 'pulse 1s infinite',
              }}
            />
            
            {/* Canvas for waveform */}
            <canvas
              ref={canvasRef}
              width={200}
              height={40}
              style={{ borderRadius: 4, background: '#f5f5f5' }}
            />
            
            {/* Duration */}
            <Text style={{ minWidth: 50 }}>{formatDuration(duration)}</Text>
            
            {/* Max duration progress */}
            <Progress
              percent={(duration / maxDuration) * 100}
              showInfo={false}
              strokeColor={duration > maxDuration * 0.8 ? '#ff4d4f' : colors.primary}
              style={{ flex: 1, maxWidth: 100 }}
            />
          </div>
        ) : state === 'recorded' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Play/Pause button */}
            <Button
              type="text"
              icon={isPlaying ? <PauseOutlined /> : <PlayCircleOutlined />}
              onClick={togglePlayback}
              style={{ fontSize: 20 }}
            />
            
            {/* Duration */}
            <Text>{formatDuration(duration)}</Text>
            
            {/* Simple progress bar */}
            <div
              style={{
                flex: 1,
                height: 4,
                background: '#f0f0f0',
                borderRadius: 2,
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: colors.primary,
                  borderRadius: 2,
                }}
              />
            </div>
          </div>
        ) : (
          <Text type="secondary">Đang chuẩn bị...</Text>
        )}
      </div>

      {/* Action buttons */}
      {state === 'recording' ? (
        <Button
          type="primary"
          icon={<StopOutlined />}
          onClick={stopRecording}
          style={{ background: '#ff4d4f', borderColor: '#ff4d4f' }}
        >
          Dừng
        </Button>
      ) : state === 'recorded' ? (
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          style={{ background: colors.primary }}
        >
          Gửi
        </Button>
      ) : null}

      {/* CSS for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

export default VoiceRecorder;

export { VoiceRecorder };
