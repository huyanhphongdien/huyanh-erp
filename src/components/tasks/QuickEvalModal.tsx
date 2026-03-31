import { useState } from 'react'
import { Modal, Rate, Input, Button, Typography, message } from 'antd'
import { StarFilled, WarningOutlined } from '@ant-design/icons'
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

  const isValid = stars > 0 && notes.trim().length >= 10

  const handleSubmit = async () => {
    if (!task || !isValid) {
      if (stars === 0) message.warning('Vui lòng chọn số sao')
      if (notes.trim().length < 10) message.warning('Ghi chú phải có tối thiểu 10 ký tự')
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

      // Check task_source to decide auto vs manual approve
      const { data: taskData } = await supabase
        .from('tasks')
        .select('task_source, is_self_assigned')
        .eq('id', task.id)
        .single()

      const source = taskData?.task_source || (taskData?.is_self_assigned ? 'self' : 'assigned')

      if (source === 'self' || source === 'recurring') {
        // AUTO APPROVE — no manager needed
        const coefficient = source === 'self' ? 0.7 : 0.8
        const finalScore = Math.round(score * coefficient)

        await supabase.from('tasks').update({
          self_score: score,
          final_score: finalScore,
          evaluation_status: 'approved',
        }).eq('id', task.id)

        // Create evaluation record
        await supabase.from('task_evaluations').insert({
          task_id: task.id,
          employee_id: user?.id || (user as any)?.employee_id,
          evaluator_id: user?.id || (user as any)?.employee_id,
          score: finalScore,
          rating: finalScore >= 90 ? 'excellent' : finalScore >= 75 ? 'good' : finalScore >= 60 ? 'average' : 'below_average',
        })

        message.success(`Đã tự động duyệt! Điểm: ${finalScore}`)
      } else {
        // SEND TO MANAGER — 48h deadline
        await supabase.from('tasks').update({
          self_score: score,
          evaluation_status: 'pending_approval',
        }).eq('id', task.id)

        message.success('Đã gửi đánh giá cho quản lý duyệt')
      }

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

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={420}
      centered
      closable={false}
      maskClosable={false}
      keyboard={false}
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
          {stars === 0 && (
            <div style={{ marginTop: 4 }}>
              <Text type="danger" style={{ fontSize: 12 }}>Vui lòng chọn số sao</Text>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <TextArea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Ghi chú đánh giá..."
            rows={3}
            style={{ marginBottom: 4 }}
          />
          <Text type="secondary" style={{ fontSize: 12, display: 'block', textAlign: 'left' }}>
            (Tối thiểu 10 ký tự){notes.trim().length > 0 && notes.trim().length < 10 && (
              <Text type="danger" style={{ fontSize: 12, marginLeft: 8 }}>
                — còn thiếu {10 - notes.trim().length} ký tự
              </Text>
            )}
          </Text>
        </div>

        <Button
          type="primary"
          onClick={handleSubmit}
          loading={loading}
          disabled={!isValid}
          style={{ background: '#1B4D3E', borderColor: '#1B4D3E', minWidth: 160 }}
          icon={<StarFilled />}
          block
        >
          Gửi đánh giá
        </Button>

        <div style={{ marginTop: 16 }}>
          <Text type="warning" style={{ fontSize: 13 }}>
            <WarningOutlined style={{ marginRight: 4 }} />
            Bạn phải đánh giá để tiếp tục
          </Text>
        </div>
      </div>
    </Modal>
  )
}
