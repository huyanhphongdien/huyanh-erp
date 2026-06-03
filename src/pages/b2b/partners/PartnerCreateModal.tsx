// ============================================================================
// PARTNER CREATE MODAL — Tạo đại lý B2B (cá nhân CCCD / doanh nghiệp MST)
// File: src/pages/b2b/partners/PartnerCreateModal.tsx
//
// Chỉ ADMIN mở được (gate ở PartnerListPage). Dùng b2bPartnerCreateService.create
// — tự validate phone/CCCD/MST + de-dup theo CCCD/MST + trigger DB sinh mã HAC-13.
// ============================================================================
import { useState } from 'react'
import { Modal, Form, Input, Select, Segmented, Alert, message } from 'antd'
import { IdcardOutlined, BankOutlined } from '@ant-design/icons'
import { b2bPartnerCreateService, type B2BPartnerKind } from '../../../services/b2b/b2bPartnerCreateService'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void   // refetch danh sách
}

const PARTNER_TYPE_OPTIONS = [
  { value: 'household', label: 'Hộ nông dân' },
  { value: 'dealer', label: 'Đại lý' },
  { value: 'supplier', label: 'Nhà cung cấp' },
  { value: 'processor', label: 'Cơ sở gia công' },
]

const TIER_OPTIONS = [
  { value: 'new', label: '🆕 Mới' },
  { value: 'bronze', label: '🥉 Đồng' },
  { value: 'silver', label: '🥈 Bạc' },
  { value: 'gold', label: '🥇 Vàng' },
  { value: 'diamond', label: '💎 Kim cương' },
]

export default function PartnerCreateModal({ open, onClose, onCreated }: Props) {
  const [form] = Form.useForm()
  const [kind, setKind] = useState<B2BPartnerKind>('individual')
  const [submitting, setSubmitting] = useState(false)

  const handleClose = () => {
    form.resetFields()
    setKind('individual')
    onClose()
  }

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()

      // Cảnh báo trùng TÊN (mềm — KHÔNG chặn, vì 2 người khác nhau có thể cùng tên).
      // Trùng CCCD/MST/SĐT thì create() tự chặn cứng (trả về existing).
      const sameName = await b2bPartnerCreateService.findByName(v.name)
      if (sameName.length > 0) {
        const ok = await new Promise<boolean>((resolve) => {
          Modal.confirm({
            title: 'Đã có đại lý TRÙNG TÊN',
            content: `Hệ thống đã có ${sameName.length} đại lý tên "${v.name}" (mã: ${sameName.map((p) => p.code).join(', ')}). Nếu đây là NGƯỜI KHÁC thì cứ tạo; nếu trùng thì huỷ để kiểm tra lại.`,
            okText: 'Vẫn tạo (người khác)',
            cancelText: 'Huỷ — kiểm tra lại',
            okButtonProps: { danger: true },
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          })
        })
        if (!ok) return
      }

      setSubmitting(true)
      const result = await b2bPartnerCreateService.create({
        kind,
        name: v.name,
        phone: v.phone,
        national_id: kind === 'individual' ? v.national_id : undefined,
        tax_code: kind === 'company' ? v.tax_code : undefined,
        partner_type: v.partner_type,
        tier: v.tier,
        address: v.address,
        email: v.email,
      })
      if (result.is_new) {
        message.success(`Đã tạo đại lý ${result.name} — mã ${result.code}`)
      } else {
        message.warning(`Đại lý đã tồn tại: ${result.name} (mã ${result.code}). Không tạo trùng.`)
      }
      handleClose()
      onCreated()
    } catch (e: any) {
      if (e?.errorFields) return // form validation
      message.error(e?.message || 'Không tạo được đại lý')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Tạo đại lý B2B mới"
      onCancel={handleClose}
      onOk={handleSubmit}
      confirmLoading={submitting}
      okText="Tạo"
      cancelText="Hủy"
      destroyOnClose
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Mã HAC-13 tự sinh"
        description="Hệ thống tự sinh mã định danh 13 số (8999…) sau khi tạo. Bạn không cần nhập. Trùng CCCD/MST sẽ bị chặn."
      />

      <Form form={form} layout="vertical" initialValues={{ partner_type: 'household', tier: 'new' }}>
        <Form.Item label="Loại đại lý">
          <Segmented
            block
            value={kind}
            onChange={(val) => setKind(val as B2BPartnerKind)}
            options={[
              { value: 'individual', label: 'Cá nhân (CCCD)', icon: <IdcardOutlined /> },
              { value: 'company', label: 'Doanh nghiệp (MST)', icon: <BankOutlined /> },
            ]}
          />
        </Form.Item>

        <Form.Item name="name" label="Tên đại lý" rules={[{ required: true, message: 'Nhập tên đại lý' }, { min: 2, message: 'Tối thiểu 2 ký tự' }]}>
          <Input placeholder="Nguyễn Văn A" allowClear />
        </Form.Item>

        {kind === 'individual' ? (
          <Form.Item
            name="national_id"
            label="CCCD (12 chữ số)"
            rules={[{ required: true, message: 'Nhập CCCD' }, { pattern: /^\d{12}$/, message: 'CCCD phải đúng 12 chữ số' }]}
          >
            <Input placeholder="012345678901" allowClear maxLength={12} />
          </Form.Item>
        ) : (
          <Form.Item
            name="tax_code"
            label="MST (10 hoặc 13 chữ số)"
            rules={[{ required: true, message: 'Nhập MST' }, { pattern: /^\d{10}(\d{3})?$/, message: 'MST phải 10 hoặc 13 chữ số' }]}
          >
            <Input placeholder="0101234567" allowClear maxLength={13} />
          </Form.Item>
        )}

        <Form.Item
          name="phone"
          label="Số điện thoại"
          rules={[{ required: true, message: 'Nhập SĐT' }, { pattern: /^(\+84|0)\d{9}$/, message: 'SĐT VN: 0xxx (10 số) hoặc +84xxx' }]}
        >
          <Input placeholder="0901234567" allowClear />
        </Form.Item>

        <Form.Item name="partner_type" label="Loại đối tác">
          <Select options={PARTNER_TYPE_OPTIONS} />
        </Form.Item>

        <Form.Item name="tier" label="Hạng">
          <Select options={TIER_OPTIONS} />
        </Form.Item>

        <Form.Item name="address" label="Địa chỉ (tuỳ chọn)">
          <Input.TextArea rows={2} placeholder="Số nhà, đường, xã/phường, huyện, tỉnh" />
        </Form.Item>

        <Form.Item name="email" label="Email (tuỳ chọn)" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
          <Input placeholder="email@example.com" allowClear />
        </Form.Item>
      </Form>
    </Modal>
  )
}
