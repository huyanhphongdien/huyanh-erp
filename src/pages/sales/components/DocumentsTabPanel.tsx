// ============================================================================
// DocumentsTabPanel — tab "Chứng từ" DÙNG CHUNG cho 2 dạng xem (trang chi tiết + drawer/Split),
// như mọi tab khác (Info/Quality/Finance/Shipping/Production/Packing/Contract/History).
// Audit 17/11/2026: trước đây full page tự render 4 dòng COA/PKL/Invoice/BL còn drawer render
// 1 nút to + checklist — hai bản lệch nhau; và hàng COA nút "Tạo" đá người dùng sang trang sinh
// chứng từ, nơi tab COA chỉ bảo "đính kèm ở tab Chứng từ → Checklist" (vòng tròn).
// Luật (owner đã chốt): Invoice / Packing List = HỆ THỐNG SINH (trang /documents);
// COA / B/L (+ C/O, Bảo hiểm) = FILE ĐÍNH KÈM ở Checklist ngay bên dưới.
// ============================================================================
import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Checkbox, Space, Tag, Typography } from 'antd'
import { FolderOpenOutlined, PaperClipOutlined } from '@ant-design/icons'
import type { SalesOrder } from '../../../services/sales/salesTypes'
import { soDisplayCode } from '../../../services/sales/salesTypes'
import DocumentChecklistTab from './DocumentChecklistTab'

const { Text } = Typography

type DocRow =
  | { key: string; label: string; kind: 'generated'; done: boolean }
  | { key: string; label: string; kind: 'attach'; docType: string }

export default function DocumentsTabPanel({ order }: { order: SalesOrder }) {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)

  const rows: DocRow[] = [
    { key: 'coa', label: 'COA (Certificate of Analysis)', kind: 'attach', docType: 'coa' },
    { key: 'packing_list', label: 'Packing List', kind: 'generated', done: !!order.packing_list_generated },
    { key: 'invoice', label: 'Commercial Invoice', kind: 'generated', done: !!order.invoice_generated },
    { key: 'bl', label: 'Bill of Lading (B/L)', kind: 'attach', docType: 'bl' },
  ]

  const openDocsPage = () => navigate(`/sales/orders/${order.id}/documents`)

  /** Cuộn tới đúng dòng chứng từ trong Checklist bên dưới (dòng có data-doc-type) + nháy nền. */
  const scrollToChecklistRow = (docType: string) => {
    let tries = 0
    const tick = () => {
      const el = rootRef.current?.querySelector<HTMLElement>(`[data-doc-type="${docType}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        const prev = el.style.background
        el.style.transition = 'background 0.4s'
        el.style.background = '#fffbe6'
        setTimeout(() => { el.style.background = prev }, 1500)
        return
      }
      // Checklist nạp bất đồng bộ — thử lại tối đa ~1,5 giây
      if (++tries < 10) setTimeout(tick, 150)
    }
    tick()
  }

  return (
    <div ref={rootRef}>
      <Button
        type="primary"
        icon={<FolderOpenOutlined />}
        style={{ marginBottom: 12, background: '#1B4D3E', borderColor: '#1B4D3E', whiteSpace: 'normal', height: 'auto' }}
        onClick={openDocsPage}
      >
        Mở trang Sinh chứng từ (Invoice · Packing List · Weight List · Hối phiếu · Đơn chiết khấu)
      </Button>

      <Card title="Trạng thái chứng từ" size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((doc) => (
            <div
              key={doc.key}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                padding: '10px 12px', border: '1px solid #f0f0f0', borderRadius: 8,
                background: doc.kind === 'generated' && doc.done ? '#f6ffed' : '#fff',
              }}
            >
              <Space wrap>
                {doc.kind === 'generated'
                  ? <Checkbox checked={doc.done} disabled />
                  : <PaperClipOutlined style={{ color: '#8c8c8c' }} />}
                <Text strong={doc.kind === 'generated' && doc.done}>{doc.label}</Text>
                {doc.kind === 'generated'
                  ? <Tag color={doc.done ? 'green' : 'default'} style={{ margin: 0 }}>{doc.done ? 'Đã sinh' : 'Chưa sinh'}</Tag>
                  : <Tag style={{ margin: 0 }}>File đính kèm</Tag>}
              </Space>
              {doc.kind === 'generated' ? (
                <Button size="small" type="link" onClick={openDocsPage}>
                  {doc.done ? 'Xem' : 'Tạo'}
                </Button>
              ) : (
                <Button size="small" type="link" onClick={() => scrollToChecklistRow(doc.docType)}>
                  Đính kèm ↓
                </Button>
              )}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
          COA, B/L, C/O, Bảo hiểm là file đính kèm — tải lên ở Checklist bên dưới (trạng thái đã nhận hiện ở từng dòng).
        </div>
      </Card>

      {/* Upload + Checklist chứng từ gốc */}
      <DocumentChecklistTab
        orderId={order.id}
        orderCode={soDisplayCode(order)}
        readonly={['draft', 'cancelled'].includes(order.status)}
      />
    </div>
  )
}
