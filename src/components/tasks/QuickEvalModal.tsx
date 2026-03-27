import { useState } from 'react'
import { Modal, Rate, Input, Button, Typography, Space, message } from 'antd'
import { StarFilled } from '@ant-design/icons'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

const { Text, Title } = Typography
const { TextArea } = Input

interface QuickEvalModalProps {
  open: boolean
  onClose: () => void
  task: { id: string; code: string; name: string } | null
  onSuccess?: () => void
}

const STAR_LABELS = ['', 'Chưa tốt', 'Cần cải thiện', 'Trung bình', 'Tốt', 'Xuất sắc']
const STAR_TO_SCORE = [0, 20, 40, 60, 80, 100]

export default function QuickEvalModal({ open, onClose, task, onSuccess }: QuickEvalModalProps) {
  const { user } = useAuthStore()
  const [stars, setStars] = useState(0)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!task || stars === 0) {
      message.warning('Vui lòng chọn số sao')
      return
    }

    try {
      setLoading(true)
      const score = STAR_TO_SCORE[stars]

      // Save self-evaluation
      await supabase.from('task_self_evaluations').insert({
        task_id: task.id,
        employee_id: user?.id,
        score,
        rating: stars >= 4 ? 'excellent' : stars >= 3 ? 'good' : stars >= 2 ? 'average' : 'below_average',
        notes: notes || null,
        submitted_at: new Date().toISOString(),
      })

      // Update task evaluation_status
      await supabase.from('tasks').update({
        evaluation_status: 'pending_approval',
        self_score: score,
      }).eq('id', task.id)

      message.success('Đã gửi đánh giá!')
      setStars(0)
      setNotes('')
      onSuccess?.()
      onClose()
    } catch (err: any) {
      console.error('Eval error:', err)
      message.error(err.message || 'Không thể gửi đánh giá')
    } finally {
      setLoading(false)
    }
  }

  const handleSkip = async () => {
    if (!task) return
    try {
      // Skip with default score 60 (average)
      await supabase.from('tasks').update({
        evaluation_status: 'pending_approval',
        self_score: 60,
      }).eq('id', task.id)

      message.info('Đã bỏ qua đánh giá (mặc định: Trung bình)')
      onClose()
      onSuccess?.()
    } catch { /* ignore */ }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={420}
      centered
      closable={false}
    >
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <StarFilled style={{ fontSize: 32, color: '#faad14', marginBottom: 8 }} />
        <Title level={4} style={{ margin: '8px 0' }}>Tự đánh giá công việc</Title>

        {task && (
          <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
            {task.code}: {task.name}
          </Text>
        )}

        <div style={{ marginBottom: 24 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>Bạn tự chấm:</Text>
          <Rate
            value={stars}
            onChange={setStars}
            style={{ fontSize: 36 }}
          />
          {stars > 0 && (
            <div style={{ marginTop: 8 }}>
              <Text style={{
                fontSize: 16, fontWeight: 600,
                color: stars >= 4 ? '#52c41a' : stars >= 3 ? '#faad14' : '#ff4d4f',
              }}>
                {STAR_LABELS[stars]} ({STAR_TO_SCORE[stars]} điểm)
              </Text>
            </div>
          )}
        </div>

        <TextArea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Ghi chú (tùy chọn)..."
          rows={2}
          style={{ marginBottom: 24 }}
        />

        <Space size={12}>
          <Button onClick={handleSkip} disabled={loading}>
            Bỏ qua
          </Button>
          <Button
            type="primary"
            onClick={handleSubmit}
            loading={loading}
            disabled={stars === 0}
            style={{ background: '#1B4D3E', borderColor: '#1B4D3E', minWidth: 120 }}
            icon={<StarFilled />}
          >
            Gửi đánh giá
          </Button>
        </Space>
      </div>
    </Modal>
  )
}
