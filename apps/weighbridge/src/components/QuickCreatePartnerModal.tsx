// ============================================================================
// QUICK CREATE PARTNER MODAL — Tạo đại lý B2B mới (cá nhân hoặc DN)
// File: apps/weighbridge/src/components/QuickCreatePartnerModal.tsx
// ============================================================================

import { useState } from 'react'
import { Modal, Form, Input, Radio, Select, Button, message, Alert } from 'antd'
import { UserOutlined, ShopOutlined } from '@ant-design/icons'
import {
  b2bPartnerCreateService,
  type CreatedPartner,
  type B2BPartnerKind,
} from '@erp/services/b2b/b2bPartnerCreateService'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (partner: CreatedPartner) => void
  /** Pre-fill phone/name from current weighbridge form (nếu có). */
  prefill?: { name?: string; phone?: string }
}

export default function QuickCreatePartnerModal({ open, onClose, onCreated, prefill }: Props) {
  const [form] = Form.useForm()
  const [kind, setKind] = useState<B2BPartnerKind>('individual')
  const [saving, setSaving] = useState(false)

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const result = await b2bPartnerCreateService.create({
        kind,
        name: values.name,
        phone: values.phone,
        national_id: kind === 'individual' ? values.national_id : undefined,
        tax_code: kind === 'company' ? values.tax_code : undefined,
        address: values.address,
        email: values.email,
        partner_type: values.partner_type,
        tier: 'new',
      })
      if (result.is_new) {
        message.success(`Đã tạo đại lý: ${result.name} (${result.code})`)
      } else {
        message.info(`Đại lý đã tồn tại — reuse: ${result.name} (${result.code})`)
      }
      onCreated(result)
      form.resetFields()
    } catch (e) {
      if ((e as { errorFields?: unknown[] }).errorFields) return // antd validation
      message.error(`Lỗi: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Tạo đại lý B2B mới"
      open={open}
      onCancel={() => {
        form.resetFields()
        onClose()
      }}
      footer={[
        <Button key="cancel" onClick={onClose}>Huỷ</Button>,
        <Button key="ok" type="primary" loading={saving} onClick={handleOk}>
          Tạo
        </Button>,
      ]}
      width={500}
      destroyOnClose
    >
      <Alert
        message="Mã HAC-13 sẽ tự sinh sau khi tạo"
        description="Hệ thống tự sinh mã định danh 13 số (8999...) cho đại lý mới. Bạn không cần nhập."
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          name: prefill?.name ?? '',
          phone: prefill?.phone ?? '',
          partner_type: 'household',
        }}
      >
        <Form.Item label="Loại đại lý">
          <Radio.Group
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            buttonStyle="solid"
          >
            <Radio.Button value="individual">
              <UserOutlined /> Cá nhân (CCCD)
            </Radio.Button>
            <Radio.Button value="company">
              <ShopOutlined /> Doanh nghiệp (MST)
            </Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          label="Tên đại lý"
          name="name"
          rules={[
            { required: true, message: 'Bắt buộc' },
            { min: 2, message: 'Tối thiểu 2 ký tự' },
          ]}
        >
          <Input placeholder={kind === 'individual' ? 'Nguyễn Văn A' : 'Công ty TNHH XYZ'} />
        </Form.Item>

        {kind === 'individual' ? (
          <Form.Item
            label="CCCD (12 chữ số)"
            name="national_id"
            rules={[
              { required: true, message: 'Bắt buộc' },
              { pattern: /^\d{12}$/, message: 'CCCD phải đúng 12 chữ số' },
            ]}
          >
            <Input maxLength={12} placeholder="012345678901" />
          </Form.Item>
        ) : (
          <Form.Item
            label="Mã số thuế (10 hoặc 13 chữ số)"
            name="tax_code"
            rules={[
              { required: true, message: 'Bắt buộc' },
              { pattern: /^\d{10}(\d{3})?$/, message: 'MST 10 hoặc 13 chữ số' },
            ]}
          >
            <Input maxLength={13} placeholder="0301234567" />
          </Form.Item>
        )}

        <Form.Item
          label="Số điện thoại"
          name="phone"
          rules={[
            { required: true, message: 'Bắt buộc' },
            { pattern: /^(\+84|0)\d{9}$/, message: 'Format VN: 0xxx 10 số' },
          ]}
        >
          <Input placeholder="0901234567" maxLength={12} />
        </Form.Item>

        <Form.Item label="Loại đối tác" name="partner_type">
          <Select
            options={[
              { value: 'household', label: 'Hộ nông dân' },
              { value: 'dealer',    label: 'Đại lý thu mua' },
              { value: 'supplier',  label: 'Nhà cung cấp' },
              { value: 'processor', label: 'Nhà chế biến' },
            ]}
          />
        </Form.Item>

        <Form.Item label="Địa chỉ (tuỳ chọn)" name="address">
          <Input.TextArea rows={2} placeholder="Số nhà, đường, xã/phường, huyện, tỉnh" />
        </Form.Item>

        <Form.Item label="Email (tuỳ chọn)" name="email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
          <Input placeholder="email@example.com" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
