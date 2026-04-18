// ============================================================================
// RAISE DISPUTE MODAL — Partner tạo khiếu nại DRC
// File: src/components/b2b/RaiseDisputeModal.tsx
//
// Dùng bởi: DealCard khi partner bấm "Khiếu nại DRC" (hoặc tương đương portal).
// Backend: drcDisputeService.raiseDispute() → RPC partner_raise_drc_dispute.
// ============================================================================

import { useState } from 'react'
import {
  Modal,
  Form,
  Input,
  Upload,
  Button,
  message,
  Typography,
  Alert,
} from 'antd'
import { UploadOutlined, WarningOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd/es/upload/interface'
import { drcDisputeService } from '../../services/b2b/drcDisputeService'

const { TextArea } = Input
const { Text } = Typography

interface RaiseDisputeModalProps {
  open: boolean
  onClose: () => void
  dealId: string
  dealNumber: string
  expectedDrc: number
  actualDrc: number
  /** Khi dispute được tạo thành công — caller refresh UI */
  onSuccess?: (disputeId: string) => void
  /** Optional uploader — nếu chưa có storage flow thì truyền undefined, modal sẽ ẩn field */
  uploadFile?: (file: File) => Promise<{ url: string; name: string }>
}

const RaiseDisputeModal = ({
  open,
  onClose,
  dealId,
  dealNumber,
  expectedDrc,
  actualDrc,
  onSuccess,
  uploadFile,
}: RaiseDisputeModalProps) => {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [uploadedEvidence, setUploadedEvidence] = useState<{ url: string; name: string }[]>([])

  const variance = actualDrc - expectedDrc
  const variancePct = variance.toFixed(1)

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      const evidence = uploadedEvidence.length > 0
        ? { files: uploadedEvidence }
        : undefined

      const disputeId = await drcDisputeService.raiseDispute(
        dealId,
        values.reason,
        evidence,
      )

      message.success(`Đã gửi khiếu nại cho Deal ${dealNumber}`)
      form.resetFields()
      setFileList([])
      setUploadedEvidence([])
      onSuccess?.(disputeId)
      onClose()
    } catch (err: any) {
      if (err?.errorFields) return  // form validation lỗi — đã hiện inline
      message.error(err?.message || 'Không thể gửi khiếu nại')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpload = async (file: File) => {
    if (!uploadFile) return false
    try {
      const result = await uploadFile(file)
      setUploadedEvidence((prev) => [...prev, result])
      return false  // ngăn default upload behavior
    } catch (err: any) {
      message.error(`Upload lỗi: ${err?.message || 'thất bại'}`)
      return false
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <span>
          <WarningOutlined style={{ color: '#f59e0b', marginRight: 8 }} />
          Khiếu nại kết quả DRC — Deal {dealNumber}
        </span>
      }
      onOk={handleSubmit}
      okText="Gửi khiếu nại"
      cancelText="Hủy"
      confirmLoading={submitting}
      okButtonProps={{ danger: true }}
      width={520}
    >
      <Alert
        type="warning"
        showIcon
        message={
          <span>
            DRC thực tế <b>{actualDrc}%</b> {variance < 0 ? 'thấp hơn' : 'cao hơn'} dự kiến{' '}
            <b>{expectedDrc}%</b> ({variance > 0 ? '+' : ''}{variancePct}%)
          </span>
        }
        description="Vui lòng nêu rõ lý do khiếu nại. Nhà máy sẽ xem xét và phản hồi."
        style={{ marginBottom: 16 }}
      />

      <Form form={form} layout="vertical">
        <Form.Item
          name="reason"
          label="Lý do khiếu nại"
          rules={[
            { required: true, message: 'Vui lòng nhập lý do' },
            { min: 10, message: 'Lý do phải có ít nhất 10 ký tự' },
            { max: 1000, message: 'Tối đa 1000 ký tự' },
          ]}
        >
          <TextArea
            rows={5}
            placeholder="Ví dụ: Lô hàng gốc được đo DRC 62% tại nhà vườn, thấp hơn kết quả 58% có thể do lấy mẫu không đại diện..."
            showCount
            maxLength={1000}
          />
        </Form.Item>

        {uploadFile && (
          <Form.Item label="Bằng chứng đính kèm (tuỳ chọn)">
            <Upload
              fileList={fileList}
              beforeUpload={handleUpload}
              onRemove={(file) => {
                setFileList((prev) => prev.filter((f) => f.uid !== file.uid))
                setUploadedEvidence((prev) => prev.filter((e) => e.name !== file.name))
              }}
              multiple
              accept="image/*,application/pdf"
            >
              <Button icon={<UploadOutlined />}>Tải lên ảnh / PDF</Button>
            </Upload>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
              Ảnh mẫu lô hàng, kết quả DRC tự đo, chứng từ giao nhận...
            </Text>
          </Form.Item>
        )}
      </Form>
    </Modal>
  )
}

export default RaiseDisputeModal
