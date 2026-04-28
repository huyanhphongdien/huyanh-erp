import { useState } from 'react'
import { Modal, Rate, Input, Button, Typography, message } from 'antd'
import { StarFilled } from '@ant-design/icons'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { insertAutoApproval, type AutoApproveSource } from '../../services/approvalService'

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

const SOURCE_INFO: Record<string, { label: string; coeff: number; color: string }> = {
  self: { label: 'Tự giao', coeff: 0.85, color: '#1890ff' },
  recurring: { label: 'Định kỳ', coeff: 0.8, color: '#722ed1' },
  project: { label: 'Dự án', coeff: 0.9, color: '#fa8c16' },
  assigned: { label: 'Được giao', coeff: 1.0, color: '#52c41a' },
}

export default function QuickEvalModal({ open, onClose, task, onSuccess }: QuickEvalModalProps) {
  const { user } = useAuthStore()
  const [stars, setStars] = useState(0)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [taskSource, setTaskSource] = useState<string>('assigned')

  // ★ Fetch task_source khi mở modal
  useState(() => {
    if (!task?.id || !open) return
    supabase.from('tasks').select('task_source, is_self_assigned').eq('id', task.id).single()
      .then(({ data }) => {
        if (data) setTaskSource(data.task_source || (data.is_self_assigned ? 'self' : 'assigned'))
      })
  })

  const sourceInfo = SOURCE_INFO[taskSource] || SOURCE_INFO.assigned
  const isAutoApprove = ['self', 'recurring', 'project'].includes(taskSource)
  const previewScore = stars > 0 ? Math.round(STAR_TO_SCORE[stars] * sourceInfo.coeff) : 0

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
        employee_id: user?.employee_id || user?.id,
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

      if (source === 'self' || source === 'recurring' || source === 'project') {
        // AUTO APPROVE — no manager needed
        const coefficient = source === 'self' ? 0.85 : source === 'project' ? 0.9 : 0.8 // self=85%, recurring=80%, project=90%
        const finalScore = Math.round(score * coefficient)

        await supabase.from('tasks').update({
          status: 'finished',
          progress: 100,
          completed_date: new Date().toISOString().split('T')[0],
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

        // Insert task_approvals → trigger update_participant_scores_on_approval
        // lan tỏa shared_score cho mọi participant
        const approverId = user?.employee_id || (user as any)?.id
        if (approverId) {
          await insertAutoApproval({
            task_id: task.id,
            approver_id: approverId,
            source: source as AutoApproveSource,
            self_score: score,
          })
        }

        message.success(`Đã tự động duyệt! Điểm: ${finalScore}`)
      } else {
        // SEND TO MANAGER — 48h deadline
        await supabase.from('tasks').update({
          status: 'finished',
          progress: 100,
          completed_date: new Date().toISOString().split('T')[0],
          self_score: score,
          evaluation_status: 'pending_approval',
        }).eq('id', task.id)

        message.success('Đã gửi đánh giá cho quản lý duyệt')

        // ★ Thông báo QL: có task chờ duyệt
        try {
          const { data: taskFull } = await supabase.from('tasks').select('assigner_id, name, department_id').eq('id', task.id).single()
          if (taskFull?.assigner_id) {
            const { notify } = await import('../../services/notificationHelper')
            await notify({
              recipientId: taskFull.assigner_id,
              senderId: user?.employee_id || undefined,
              module: 'task',
              type: 'task_approval_pending',
              title: `Chờ phê duyệt: ${task.name}`,
              message: `${user?.full_name || 'Nhân viên'} đã tự đánh giá ${stars}★ (${score}đ)`,
              referenceUrl: '/tasks/approve-batch',
              priority: 'high',
            })
          }
        } catch (e) { console.error('[notify] eval pending:', e) }
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
      closable={true}
      maskClosable={true}
      keyboard={true}
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

          {/* ★ Hiện hệ số + điểm cuối */}
          {stars > 0 && isAutoApprove && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#f0f5ff', borderRadius: 8, border: '1px solid #d6e4ff', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: '#666' }}>Loại công việc:</Text>
                <span style={{ fontSize: 12, fontWeight: 600, color: sourceInfo.color, background: `${sourceInfo.color}15`, padding: '2px 8px', borderRadius: 4 }}>{sourceInfo.label}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: '#666' }}>Điểm tự chấm:</Text>
                <Text style={{ fontSize: 13, fontWeight: 600 }}>{STAR_TO_SCORE[stars]} điểm</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: '#666' }}>Hệ số áp dụng:</Text>
                <Text style={{ fontSize: 13, fontWeight: 600, color: sourceInfo.color }}>× {Math.round(sourceInfo.coeff * 100)}%</Text>
              </div>
              <div style={{ borderTop: '1px solid #d6e4ff', paddingTop: 6, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text strong style={{ fontSize: 13 }}>Điểm cuối cùng:</Text>
                <Text strong style={{ fontSize: 18, color: previewScore >= 75 ? '#52c41a' : previewScore >= 60 ? '#faad14' : '#ff4d4f' }}>{previewScore} điểm</Text>
              </div>
            </div>
          )}

          {stars > 0 && !isAutoApprove && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#fff7e6', borderRadius: 8, border: '1px solid #ffd591', textAlign: 'left' }}>
              <Text style={{ fontSize: 12, color: '#d48806' }}>
                📋 Công việc được giao — sẽ gửi cho Quản lý phê duyệt.
              </Text>
              <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                Điểm cuối = Tự chấm ({STAR_TO_SCORE[stars]}đ) × 40% + QL chấm × 60%
              </div>
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

        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            onClick={onClose}
            style={{ flex: 1 }}
          >
            Để sau
          </Button>
          <Button
            type="primary"
            onClick={handleSubmit}
            loading={loading}
            disabled={!isValid}
            style={{ flex: 2, background: '#1B4D3E', borderColor: '#1B4D3E' }}
            icon={<StarFilled />}
          >
            Gửi đánh giá
          </Button>
        </div>

        <div style={{ marginTop: 12, padding: '8px 12px', background: '#f6f6f6', borderRadius: 8 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Chọn sao + ghi chú (tối thiểu 10 ký tự) để gửi đánh giá.
            Nếu chưa sẵn sàng, bấm "Để sau" — đánh giá sẽ không được lưu và bạn có thể đánh giá lại từ "Công việc của tôi".
          </Text>
        </div>
      </div>
    </Modal>
  )
}
