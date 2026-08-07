// ============================================================================
// CUSTOMER EXPORT PROFILE TAB — Hồ sơ chứng từ theo khách (GĐ 1)
// File: src/pages/sales/components/CustomerExportProfileTab.tsx
//
// Phần cố định theo khách của bộ chứng từ xuất khẩu: buyer/consignee/notify,
// shipping mark, ngân hàng thụ hưởng, checklist số bản. Dùng trong tab của
// CustomerDetailPage. Lưu vào sales_customer_export_profiles.
// ============================================================================

import { useState, useEffect } from 'react'
import {
  Card, Form, Input, Select, Button, Table, InputNumber, message, Spin, Row, Col,
} from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import customerExportProfileService, {
  EXPORT_DOC_TYPES, type CompanyBank, type DocChecklistItem,
} from '../../../services/sales/customerExportProfileService'

const { TextArea } = Input

type CellMap = Record<string, { originals: number; copies: number }>

export default function CustomerExportProfileTab({ customerId }: { customerId: string }) {
  const [form] = Form.useForm()
  const [banks, setBanks] = useState<CompanyBank[]>([])
  const [checklist, setChecklist] = useState<CellMap>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [bankList, profile] = await Promise.all([
          customerExportProfileService.listBanks(),
          customerExportProfileService.getByCustomer(customerId),
        ])
        if (cancelled) return
        setBanks(bankList)
        if (profile) {
          form.setFieldsValue({
            buyer_legal_name: profile.buyer_legal_name,
            buyer_address: profile.buyer_address,
            consignee_name: profile.consignee_name,
            consignee_address: profile.consignee_address,
            notify_party: profile.notify_party,
            notify_address: profile.notify_address,
            shipping_marks: profile.shipping_marks,
            attn_contacts: profile.attn_contacts,
            preferred_bank_id: profile.preferred_bank_id,
            default_payment_term: profile.default_payment_term,
            special_instructions: profile.special_instructions,
          })
          const cl: CellMap = {}
          for (const it of profile.doc_checklist || []) {
            cl[it.doc] = { originals: it.originals || 0, copies: it.copies || 0 }
          }
          setChecklist(cl)
        }
      } catch (e: any) {
        message.error(e?.message || 'Lỗi tải hồ sơ chứng từ')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [customerId, form])

  const setCell = (doc: string, field: 'originals' | 'copies', val: number) => {
    setChecklist((prev) => ({
      ...prev,
      [doc]: {
        originals: prev[doc]?.originals || 0,
        copies: prev[doc]?.copies || 0,
        [field]: val,
      },
    }))
  }

  const handleSave = async () => {
    let vals: any
    try {
      vals = await form.validateFields()
    } catch {
      return
    }
    setSaving(true)
    try {
      const doc_checklist: DocChecklistItem[] = EXPORT_DOC_TYPES
        .map((d) => ({
          doc: d.key,
          originals: checklist[d.key]?.originals || 0,
          copies: checklist[d.key]?.copies || 0,
        }))
        .filter((x) => x.originals > 0 || x.copies > 0)
      await customerExportProfileService.upsert(customerId, { ...vals, doc_checklist })
      message.success('Đã lưu hồ sơ chứng từ')
    } catch (e: any) {
      message.error(e?.message || 'Lỗi lưu hồ sơ')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>

  const checklistCols = [
    { title: 'Chứng từ', dataIndex: 'label', key: 'label' },
    {
      title: 'Số bản gốc', key: 'orig', width: 140,
      render: (_: unknown, r: { key: string }) => (
        <InputNumber min={0} value={checklist[r.key]?.originals || 0}
          onChange={(v) => setCell(r.key, 'originals', Number(v) || 0)} style={{ width: '100%' }} />
      ),
    },
    {
      title: 'Số bản copy', key: 'copy', width: 140,
      render: (_: unknown, r: { key: string }) => (
        <InputNumber min={0} value={checklist[r.key]?.copies || 0}
          onChange={(v) => setCell(r.key, 'copies', Number(v) || 0)} style={{ width: '100%' }} />
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <span style={{ color: '#888', fontSize: 13 }}>
          Phần cố định theo khách — dùng để tự sinh bộ chứng từ xuất khẩu cho các đơn của khách này.
        </span>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}
          style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>
          Lưu hồ sơ
        </Button>
      </div>

      <Form form={form} layout="vertical" size="small">
        <Card size="small" title="Người mua (Buyer) & Nhận hàng (Consignee)" style={{ marginBottom: 12 }}>
          <Row gutter={16}>
            <Col xs={24} md={12}><Form.Item label="Buyer (tên pháp lý)" name="buyer_legal_name"><Input /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item label="Buyer — địa chỉ" name="buyer_address"><TextArea autoSize={{ minRows: 1, maxRows: 3 }} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item label="Consignee" name="consignee_name"><Input placeholder="VD: THE ORDER OF ... BANK PLC" /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item label="Consignee — địa chỉ" name="consignee_address"><TextArea autoSize={{ minRows: 1, maxRows: 3 }} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item label="Notify party" name="notify_party"><Input /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item label="Notify — địa chỉ" name="notify_address"><TextArea autoSize={{ minRows: 1, maxRows: 3 }} /></Form.Item></Col>
          </Row>
        </Card>

        <Card size="small" title="Vận chuyển & Ngân hàng" style={{ marginBottom: 12 }}>
          <Row gutter={16}>
            <Col xs={24} md={12}><Form.Item label="Shipping mark" name="shipping_marks"><TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="Nhãn hiệu vận chuyển in trên bao bì" /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item label="Người nhận (Attn: tên + SĐT)" name="attn_contacts"><TextArea autoSize={{ minRows: 2, maxRows: 6 }} /></Form.Item></Col>
            <Col xs={24} md={12}>
              <Form.Item label="Ngân hàng thụ hưởng" name="preferred_bank_id">
                <Select allowClear showSearch optionFilterProp="label" placeholder="Chọn 1 trong 7 tài khoản"
                  options={banks.map((b) => ({ value: b.id, label: `${b.swift_code || ''} — ${b.bank_name}` }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}><Form.Item label="Điều khoản thanh toán mặc định" name="default_payment_term"><Input placeholder="VD: LC 90 days from B/L date" /></Form.Item></Col>
          </Row>
        </Card>

        <Card size="small" title="Checklist chứng từ (số bản khách / ngân hàng yêu cầu)" style={{ marginBottom: 12 }}>
          <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 6, padding: '6px 10px', marginBottom: 8, fontSize: 12, color: '#874d00' }}>
            📌 <b>Số bản gốc/copy do NGÂN HÀNG phát hành L/C quy định</b> — nằm ở trường <b>46A "Documents Required"</b> trong L/C.
            Đọc từ L/C của khách rồi nhập vào đây (hệ KHÔNG tự sinh). Đây là bản mặc định dùng cho các lô của khách;
            lô nào có L/C yêu cầu khác thì phải chỉnh theo đúng L/C của lô đó, kẻo bộ chứng từ bị bắt lỗi (discrepancy).
          </div>
          <Table rowKey="key" dataSource={EXPORT_DOC_TYPES} columns={checklistCols} pagination={false} size="small" />
        </Card>

        <Card size="small" title="Ghi chú đặc thù của khách">
          <Form.Item name="special_instructions" noStyle>
            <TextArea autoSize={{ minRows: 2, maxRows: 6 }}
              placeholder="VD: ghi PI#+PO# lên hóa đơn; bắt buộc phyto + hun trùng; gửi copy sau khi tàu chạy..." />
          </Form.Item>
        </Card>
      </Form>
    </div>
  )
}
