// ============================================================================
// VỐN VAY — Khu ĐÍNH KÈM TÀI LIỆU dùng chung (Đợt 3b)
// File: src/pages/finance/FinanceAttachments.tsx
// Nhúng vào bất kỳ modal/drawer: <FinanceAttachments entityType entityId />
// ============================================================================
import { useEffect, useState, useCallback } from 'react'
import { Upload, Button, List, Select, Tag, Typography, Popconfirm, message, Spin, Space } from 'antd'
import { UploadOutlined, DownloadOutlined, DeleteOutlined, PaperClipOutlined, FileTextOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { attachmentService, DOC_TYPES, type AttachEntity, type FinAttachment } from '../../services/finance/attachmentService'
import { useAuthStore } from '../../stores/authStore'

const { Text } = Typography
const fmtSize = (n?: number | null) => {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function FinanceAttachments({ entityType, entityId, onCountChange }: {
  entityType: AttachEntity
  entityId: string
  onCountChange?: (n: number) => void
}) {
  const user = useAuthStore((s) => s.user)
  const uploadedBy = user?.employee_id || user?.id || null
  const [rows, setRows] = useState<FinAttachment[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [docType, setDocType] = useState<string>(DOC_TYPES[entityType]?.[0] || 'Khác')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await attachmentService.list(entityType, entityId)
      setRows(data); onCountChange?.(data.length)
    } catch (e: any) { message.error('Lỗi tải file: ' + (e?.message || e)) }
    setLoading(false)
  }, [entityType, entityId, onCountChange])
  useEffect(() => { load() }, [load])

  const doUpload = async (file: File) => {
    setUploading(true)
    try {
      await attachmentService.upload(file, { entityType, entityId, docType, uploadedBy })
      message.success('Đã tải lên')
      load()
    } catch (e: any) { message.error('Lỗi tải lên: ' + (e?.message || e)) }
    setUploading(false)
  }

  const download = async (att: FinAttachment) => {
    try {
      const url = await attachmentService.signedUrl(att.file_path)
      window.open(url, '_blank')
    } catch (e: any) { message.error('Lỗi mở file: ' + (e?.message || e)) }
  }
  const del = async (att: FinAttachment) => {
    try { await attachmentService.remove(att); message.success('Đã xoá'); load() }
    catch (e: any) { message.error('Lỗi xoá: ' + (e?.message || e)) }
  }

  return (
    <div>
      <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
        <Select value={docType} onChange={setDocType} style={{ width: 200 }} size="small"
          options={(DOC_TYPES[entityType] || ['Khác']).map((t) => ({ value: t, label: t }))} />
        <Upload showUploadList={false} beforeUpload={(file) => { doUpload(file as File); return false }}>
          <Button size="small" type="primary" icon={<UploadOutlined />} loading={uploading} style={{ background: '#1E3A5F', borderColor: '#1E3A5F' }}>
            Tải lên ({docType})
          </Button>
        </Upload>
      </Space.Compact>

      {loading ? <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
        : rows.length === 0
          ? <Text type="secondary" style={{ fontSize: 12 }}><PaperClipOutlined /> Chưa có tài liệu. Chọn loại rồi bấm "Tải lên".</Text>
          : <List size="small" dataSource={rows} renderItem={(att) => (
              <List.Item style={{ padding: '6px 0' }}
                actions={[
                  <Button key="dl" type="text" size="small" icon={<DownloadOutlined />} onClick={() => download(att)} title="Xem / Tải" />,
                  <Popconfirm key="del" title="Xoá tài liệu này?" okText="Xoá" cancelText="Huỷ" onConfirm={() => del(att)}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>,
                ]}>
                <List.Item.Meta
                  avatar={<FileTextOutlined style={{ fontSize: 18, color: '#1E3A5F' }} />}
                  title={<span style={{ fontSize: 13 }}>{att.file_name} {att.doc_type ? <Tag color="blue" style={{ marginLeft: 4 }}>{att.doc_type}</Tag> : null}</span>}
                  description={<Text type="secondary" style={{ fontSize: 11 }}>{fmtSize(att.file_size)} · {dayjs(att.uploaded_at).format('DD/MM/YYYY HH:mm')}</Text>}
                />
              </List.Item>
            )} />}
    </div>
  )
}
