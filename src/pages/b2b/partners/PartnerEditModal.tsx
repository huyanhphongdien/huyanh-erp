// ============================================================================
// PARTNER EDIT MODAL — Bổ sung / sửa thông tin định danh đại lý B2B
// File: src/pages/b2b/partners/PartnerEditModal.tsx
//
// Chỉ ADMIN mở được (gate ở PartnerListPage). CHỈ sửa thông tin master an toàn
// (tên, SĐT, CCCD, địa chỉ, email, loại, hạng) — KHÔNG đụng dữ liệu xuất nhập /
// công nợ (các bảng đó tham chiếu partner qua id, không đổi). Mã HAC-13 không sửa.
// ============================================================================
import { useEffect, useState } from 'react'
import { Modal, Form, Input, Select, Row, Col, Alert, message } from 'antd'
import { EditOutlined } from '@ant-design/icons'
import { partnerService, type Partner } from '../../../services/b2b/partnerService'
import { supabase } from '../../../lib/supabase'

interface Props {
  open: boolean
  partner: Partner | null
  onClose: () => void
  onSaved: () => void   // refetch danh sách
}

const PARTNER_TYPE_OPTIONS = [
  { value: 'household', label: 'Hộ nông dân' },
  { value: 'dealer', label: 'Đại lý' },
  { value: 'supplier', label: 'Nhà cung cấp' },
  { value: 'processor', label: 'Cơ sở gia công' },
  { value: 'both', label: 'Đại lý & NCC' },
]

const TIER_OPTIONS = [
  { value: 'new', label: '🆕 Mới' },
  { value: 'bronze', label: '🥉 Đồng' },
  { value: 'silver', label: '🥈 Bạc' },
  { value: 'gold', label: '🥇 Vàng' },
  { value: 'diamond', label: '💎 Kim cương' },
]

export default function PartnerEditModal({ open, partner, onClose, onSaved }: Props) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  // Nạp dữ liệu khi mở (CCCD không có trong Partner type → fetch riêng)
  useEffect(() => {
    if (!open || !partner) return
    form.setFieldsValue({
      name: partner.name,
      phone: partner.phone || '',
      address: partner.address || '',
      email: partner.email || '',
      partner_type: partner.partner_type,
      tier: partner.tier,
      national_id: '',
    })
    ;(async () => {
      const { data } = await supabase
        .from('b2b_partners').select('national_id').eq('id', partner.id).maybeSingle()
      if (data && (data as any).national_id) form.setFieldValue('national_id', (data as any).national_id)
    })()
  }, [open, partner, form])

  const handleClose = () => {
    form.resetFields()
    onClose()
  }

  const handleSubmit = async () => {
    if (!partner) return
    try {
      const v = await form.validateFields()
      setSubmitting(true)
      await partnerService.updateInfo(partner.id, {
        name: v.name?.trim(),
        phone: v.phone?.trim() || null,
        national_id: v.national_id?.trim() || null,
        address: v.address?.trim() || null,
        email: v.email?.trim() || null,
        partner_type: v.partner_type,
        tier: v.tier,
      })
      message.success(`Đã cập nhật đại lý ${v.name}`)
      handleClose()
      onSaved()
    } catch (e: any) {
      if (e?.errorFields) return // form validation
      // CCCD trùng (partial unique index ở DB)
      const msg = String(e?.message || '')
      if (e?.code === '23505' || msg.includes('uq_b2b_partners_national_id') || msg.toLowerCase().includes('duplicate')) {
        message.error('CCCD này đã thuộc đại lý khác — không thể trùng.')
      } else {
        message.error(msg || 'Không cập nhật được đại lý')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      width={640}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
          <EditOutlined style={{ color: '#1B4D3E' }} />
          Sửa / bổ sung thông tin đại lý
        </span>
      }
      onCancel={handleClose}
      onOk={handleSubmit}
      confirmLoading={submitting}
      okText="Lưu thay đổi"
      cancelText="Hủy"
      okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}
      destroyOnClose
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={`Mã: ${partner?.code ?? ''} (không đổi)`}
        description="Chỉ bổ sung/sửa thông tin định danh. Dữ liệu xuất–nhập, công nợ, deal KHÔNG bị ảnh hưởng (tham chiếu theo mã nội bộ)."
      />

      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Tên đại lý" rules={[{ required: true, message: 'Nhập tên đại lý' }, { min: 2, message: 'Tối thiểu 2 ký tự' }]}>
          <Input placeholder="Nguyễn Văn A" allowClear />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="national_id"
              label="CCCD (12 chữ số) — tuỳ chọn"
              rules={[{ pattern: /^\d{12}$/, message: 'CCCD phải đúng 12 chữ số' }]}
            >
              <Input placeholder="012345678901" allowClear maxLength={12} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="phone"
              label="Số điện thoại — tuỳ chọn"
              rules={[{ pattern: /^(\+84|0)\d{9}$/, message: 'SĐT: 0xxx (10 số)' }]}
            >
              <Input placeholder="0901234567" allowClear />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="partner_type" label="Loại đối tác">
              <Select options={PARTNER_TYPE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="tier" label="Hạng">
              <Select options={TIER_OPTIONS} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="address" label="Địa chỉ (tuỳ chọn)" style={{ marginBottom: 12 }}>
          <Input.TextArea rows={2} placeholder="Số nhà, đường, xã/phường, huyện, tỉnh" />
        </Form.Item>

        <Form.Item name="email" label="Email (tuỳ chọn)" rules={[{ type: 'email', message: 'Email không hợp lệ' }]} style={{ marginBottom: 0 }}>
          <Input placeholder="email@example.com" allowClear />
        </Form.Item>
      </Form>
    </Modal>
  )
}
