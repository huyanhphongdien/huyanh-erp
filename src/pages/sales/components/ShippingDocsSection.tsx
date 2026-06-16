// ============================================================================
// SHIPPING DOCS SECTION — Đính kèm tài liệu vận chuyển (Booking / B/L / SI…)
// File: src/pages/sales/components/ShippingDocsSection.tsx
//
// Upload nhiều file (PDF/ảnh) vào bucket 'sales-documents' + lưu vào
// sales_order_documents (doc_type='shipping'). Xem/tải/xóa tại chỗ.
// Mức 1 của cải tiến tab Vận chuyển — đính kèm file, KHÔNG thay ô số liệu.
// ============================================================================
import { useEffect, useState, useRef, useCallback } from 'react'
import { Button, Tooltip, message, Popconfirm, Spin } from 'antd'
import { FilePdfOutlined, PaperClipOutlined, EyeOutlined, DeleteOutlined, InboxOutlined } from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'

interface ShipDoc {
  id: string
  doc_name: string | null
  file_name: string | null
  file_url: string | null
  file_size: number | null
  created_at: string
}

const fmtSize = (b?: number | null) => (b ? `${Math.round(b / 1024)} KB` : '')
const fmtTime = (s: string) => new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const isImg = (n?: string | null) => /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(n || '')

export default function ShippingDocsSection({ orderId, canEdit }: { orderId: string; canEdit: boolean }) {
  const [docs, setDocs] = useState<ShipDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('sales_order_documents')
      .select('id, doc_name, file_name, file_url, file_size, created_at')
      .eq('sales_order_id', orderId)
      .eq('doc_type', 'shipping')
      .order('created_at', { ascending: false })
    setDocs((data as ShipDoc[]) || [])
    setLoading(false)
  }, [orderId])

  useEffect(() => { load() }, [load])

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return
    setUploading(true)
    let ok = 0
    for (const f of files) {
      try {
        const ext = (f.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'
        const rand = Math.random().toString(36).slice(2, 7)
        const path = `orders/${orderId}/shipping_${Date.now()}_${rand}.${ext}`
        const { error: upErr } = await supabase.storage.from('sales-documents').upload(path, f, { upsert: false })
        if (upErr) throw upErr
        const { data: { publicUrl } } = supabase.storage.from('sales-documents').getPublicUrl(path)
        const { error: insErr } = await supabase.from('sales_order_documents').insert({
          sales_order_id: orderId,
          doc_type: 'shipping',
          doc_name: f.name,
          file_url: publicUrl,
          file_name: f.name,
          file_size: f.size,
          is_received: true,
          received_at: new Date().toISOString(),
          sort_order: 50,
        })
        if (insErr) throw insErr
        ok++
      } catch (e: unknown) {
        message.error(`Upload "${f.name}" lỗi: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    setUploading(false)
    if (ok > 0) { message.success(`Đã tải lên ${ok} tài liệu vận chuyển`); load() }
  }

  const handleDelete = async (d: ShipDoc) => {
    const { error } = await supabase.from('sales_order_documents').delete().eq('id', d.id)
    if (error) { message.error('Xóa lỗi: ' + error.message); return }
    message.success('Đã xóa')
    load()
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 700, color: '#d48806', marginBottom: 8, fontSize: 13 }}>
        📎 TÀI LIỆU VẬN CHUYỂN (Booking / B/L / SI…)
      </div>

      {canEdit && (
        <>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,image/*,.docx,.xlsx"
            style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files) handleFiles(Array.from(e.target.files)); e.target.value = '' }}
          />
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault() }}
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) handleFiles(Array.from(e.dataTransfer.files)) }}
            style={{
              border: '2px dashed #ffd591', borderRadius: 8, padding: 14, textAlign: 'center',
              background: '#fffbe6', cursor: 'pointer', marginBottom: 10,
            }}
          >
            <InboxOutlined style={{ fontSize: 22, color: '#d48806' }} />
            <div style={{ fontSize: 13, color: '#874d00', marginTop: 4 }}>
              {uploading ? <span><Spin size="small" /> Đang tải lên…</span> : 'Kéo thả hoặc bấm để tải file (Booking confirmation, B/L, SI…)'}
            </div>
            <div style={{ fontSize: 11, color: '#bf976a' }}>PDF · ảnh · Word · Excel · nhiều file một lúc</div>
          </div>
        </>
      )}

      {loading ? (
        <div style={{ padding: 16, textAlign: 'center' }}><Spin size="small" /></div>
      ) : docs.length === 0 ? (
        <div style={{ fontSize: 12, color: '#bfbfbf', padding: '6px 0' }}>Chưa có tài liệu vận chuyển.</div>
      ) : (
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
          {docs.map((d, i) => (
            <div key={d.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              borderBottom: i < docs.length - 1 ? '1px solid #f5f5f5' : 'none',
            }}>
              {isImg(d.file_name) ? (
                <img src={d.file_url || ''} alt="" style={{ width: 30, height: 30, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <FilePdfOutlined style={{ fontSize: 22, color: '#cf1322', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {d.doc_name || d.file_name || 'Tài liệu'}
                </div>
                <div style={{ fontSize: 11, color: '#8c8c8c' }}>{fmtSize(d.file_size)} · {fmtTime(d.created_at)}</div>
              </div>
              <Tooltip title="Xem / tải">
                <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => d.file_url && window.open(d.file_url, '_blank')} />
              </Tooltip>
              {canEdit && (
                <Popconfirm title="Xóa tài liệu này?" okText="Xóa" cancelText="Hủy" onConfirm={() => handleDelete(d)}>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
