// ============================================================================
// LC NEGOTIATION TAB — Đơn đề nghị chiết khấu / thương lượng L/C (GĐ 4)
// File: src/pages/sales/components/LcNegotiationTab.tsx
//
// Form nhập điều kiện (bank, L/C, %, lãi, hạn) + sinh văn bản đề nghị (mẫu BM03)
// + BẢNG KÊ SỐ BẢN chứng từ (từ checklist khách — GĐ1). In→PDF + Tải Word.
// ============================================================================

import { useState, useEffect } from 'react'
import {
  Card, Form, Input, InputNumber, DatePicker, Select, Button, Space, Table,
  Typography, Spin, message, Row, Col, Divider,
} from 'antd'
import { SaveOutlined, PrinterOutlined, FileWordOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { documentService, type InvoiceData } from '../../../services/sales/documentService'
import { lcNegotiationService, type LcNegotiation } from '../../../services/sales/lcNegotiationService'
import customerExportProfileService, {
  EXPORT_DOC_TYPES, type CompanyBank, type CustomerExportProfile,
} from '../../../services/sales/customerExportProfileService'
import type { SalesOrder } from '../../../services/sales/salesTypes'
import { soDisplayCode } from '../../../services/sales/salesTypes'
import { downloadElementAsWord } from '../../../lib/htmlToWord'

const { Title, Text, Paragraph } = Typography

const COMPANY = {
  name: 'CÔNG TY TNHH MỘT THÀNH VIÊN CAO SU HUY ANH PHONG ĐIỀN',
  rep: 'Ông Lê Xuân Hồng Trung',
  title: 'Phó Giám Đốc',
}
const DOC_LABEL = (k: string) => EXPORT_DOC_TYPES.find((d) => d.key === k)?.label || k
const fmtUSD = (v: number) => (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function LcNegotiationTab(
  { orderId, order, onSaved }: { orderId: string; order: SalesOrder; onSaved?: () => void },
) {
  const [form] = Form.useForm()
  const watched = Form.useWatch([], form)   // để văn bản cập nhật live khi sửa form
  const [inv, setInv] = useState<InvoiceData | null>(null)
  const [profile, setProfile] = useState<CustomerExportProfile | null>(null)
  const [banks, setBanks] = useState<CompanyBank[]>([])
  const [neg, setNeg] = useState<LcNegotiation | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [i, p, b, n] = await Promise.all([
          documentService.getInvoiceData(orderId),
          customerExportProfileService.getByCustomer(order.customer_id),
          customerExportProfileService.listBanks(),
          lcNegotiationService.getByOrder(orderId),
        ])
        if (cancelled) return
        setInv(i); setProfile(p); setBanks(b); setNeg(n)
        form.setFieldsValue({
          bank_id: n?.bank_id || p?.preferred_bank_id || null,
          issuing_bank: n?.issuing_bank || i?.consignee || '',
          lc_number: n?.lc_number || i?.lc_number || '',
          lc_date: n?.lc_date ? dayjs(n.lc_date) : null,
          negotiate_pct: n?.negotiate_pct ?? 90,
          negotiate_amount: n?.negotiate_amount ?? Math.round((i?.total || 0) * 0.9),
          interest_rate: n?.interest_rate ?? null,
          term_days: n?.term_days ?? null,
          submitted_date: n?.submitted_date ? dayjs(n.submitted_date) : dayjs(),
          status: n?.status || 'draft',
        })
      } catch (e: any) {
        if (!cancelled) message.error(e?.message || 'Lỗi tải đơn chiết khấu')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [orderId, order.customer_id, form])

  // Tự tính số tiền thương lượng khi đổi %
  const onPctChange = (pct: number | null) => {
    const total = inv?.total || 0
    if (pct != null && total > 0) form.setFieldsValue({ negotiate_amount: Math.round(total * pct / 100) })
  }

  const handleSave = async () => {
    let v: any
    try { v = await form.validateFields() } catch { return }
    setSaving(true)
    try {
      const saved = await lcNegotiationService.upsert(orderId, {
        bank_id: v.bank_id || null,
        issuing_bank: v.issuing_bank || null,
        lc_number: v.lc_number || null,
        lc_date: v.lc_date ? v.lc_date.format('YYYY-MM-DD') : null,
        negotiate_pct: v.negotiate_pct ?? null,
        negotiate_amount: v.negotiate_amount ?? null,
        interest_rate: v.interest_rate ?? null,
        term_days: v.term_days ?? null,
        submitted_date: v.submitted_date ? v.submitted_date.format('YYYY-MM-DD') : null,
        status: v.status || 'draft',
      })
      setNeg(saved)
      message.success('Đã lưu đơn chiết khấu')
      onSaved?.()   // báo BOE nạp lại (số L/C, tenor, ngân hàng phát hành)
    } catch (e: any) {
      message.error(e?.message || 'Lỗi lưu')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spin tip="Loading..." />

  const v = watched || form.getFieldsValue()
  const bank = banks.find((b) => b.id === v.bank_id) || null
  const checklist = (profile?.doc_checklist || []).filter((c) => (c.originals || 0) > 0 || (c.copies || 0) > 0)

  return (
    <div>
      {/* ── Form nhập (không in) ── */}
      <Card size="small" className="no-print" style={{ marginBottom: 16 }}
        title="Điều kiện thương lượng / chiết khấu (nhập rồi Lưu)"
        extra={<Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave} style={{ background: '#1B4D3E' }}>Lưu</Button>}>
        <Form form={form} layout="vertical" size="small" onValuesChange={(chg) => { if ('negotiate_pct' in chg) onPctChange(chg.negotiate_pct) }}>
          <Row gutter={12}>
            <Col xs={24} md={12}><Form.Item label="Ngân hàng chiết khấu (của Huy Anh)" name="bank_id">
              <Select allowClear showSearch optionFilterProp="label"
                options={banks.map((b) => ({ value: b.id, label: `${b.swift_code || ''} — ${b.bank_name}` }))} />
            </Form.Item></Col>
            <Col xs={24} md={12}><Form.Item label="Ngân hàng phát hành L/C (của khách)" name="issuing_bank"><Input /></Form.Item></Col>
            <Col xs={12} md={6}><Form.Item label="Số L/C" name="lc_number"><Input /></Form.Item></Col>
            <Col xs={12} md={6}><Form.Item label="Ngày L/C" name="lc_date"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={12} md={6}><Form.Item label="Tỷ lệ TL (%)" name="negotiate_pct"><InputNumber min={0} max={100} style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={12} md={6}><Form.Item label="Số tiền TL (USD)" name="negotiate_amount"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={12} md={6}><Form.Item label="Lãi suất (%/năm)" name="interest_rate"><InputNumber min={0} step={0.1} style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={12} md={6}><Form.Item label="Thời hạn (ngày)" name="term_days"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={12} md={6}><Form.Item label="Ngày nộp NH" name="submitted_date"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={12} md={6}><Form.Item label="Trạng thái" name="status">
              <Select options={[
                { value: 'draft', label: 'Nháp' },
                { value: 'submitted', label: 'Đã nộp NH' },
                { value: 'financed', label: 'Đã ứng tiền' },
                { value: 'settled', label: 'Đã tất toán' },
              ]} />
            </Form.Item></Col>
          </Row>
          {checklist.length === 0 && (
            <Text type="warning" style={{ fontSize: 12 }}>
              ⚠ Khách chưa có checklist số bản chứng từ. Vào Khách hàng → tab "Hồ sơ chứng từ" để nhập → bảng kê bên dưới mới đủ.
            </Text>
          )}
        </Form>
      </Card>

      {/* ── Văn bản đề nghị (in được) ── */}
      <div className="doc-print-area" id="dnck-print">
        <Title level={4} style={{ textAlign: 'center', marginBottom: 2 }}>
          GIẤY ĐỀ NGHỊ KIÊM HỢP ĐỒNG THƯƠNG LƯỢNG THANH TOÁN
        </Title>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <Text>Số: {soDisplayCode(order)}/TLTT</Text>
        </div>

        <Paragraph><strong>Kính gửi:</strong> Ngân hàng {bank?.bank_name || '.....................'}</Paragraph>

        <Title level={5}>A. ĐỀ NGHỊ CỦA KHÁCH HÀNG</Title>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
          <tbody>
            <tr><td style={{ padding: '4px 8px', width: '32%', color: '#444' }}>Khách hàng</td><td style={{ padding: '4px 8px' }}>: {COMPANY.name}</td></tr>
            <tr><td style={{ padding: '4px 8px', color: '#444' }}>Tài khoản</td><td style={{ padding: '4px 8px' }}>: {bank?.account_no || '—'} tại {bank?.bank_name || '—'}</td></tr>
            <tr><td style={{ padding: '4px 8px', color: '#444' }}>Người đại diện</td><td style={{ padding: '4px 8px' }}>: {COMPANY.rep} — {COMPANY.title}</td></tr>
          </tbody>
        </table>

        <Title level={5}>NỘI DUNG ĐỀ NGHỊ</Title>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
          <tbody>
            <tr><td style={{ padding: '4px 8px', width: '32%', color: '#444' }}>L/C số</td><td style={{ padding: '4px 8px' }}>: {v.lc_number || '—'}{v.lc_date ? `   ngày ${dayjs(v.lc_date).format('DD/MM/YYYY')}` : ''}</td></tr>
            <tr><td style={{ padding: '4px 8px', color: '#444' }}>Ngân hàng phát hành</td><td style={{ padding: '4px 8px' }}>: {v.issuing_bank || '—'}</td></tr>
            <tr><td style={{ padding: '4px 8px', color: '#444' }}>Loại hàng</td><td style={{ padding: '4px 8px' }}>: NATURAL RUBBER {order.grade?.replace(/_/g, ' ')}</td></tr>
            <tr><td style={{ padding: '4px 8px', color: '#444' }}>Số hợp đồng</td><td style={{ padding: '4px 8px' }}>: {order.contract_no || soDisplayCode(order)}</td></tr>
            <tr><td style={{ padding: '4px 8px', color: '#444' }}>Trị giá hóa đơn</td><td style={{ padding: '4px 8px' }}>: USD {fmtUSD(inv?.total || 0)}</td></tr>
          </tbody>
        </table>

        <Title level={5}>BỘ CHỨNG TỪ ĐỀ NGHỊ THƯƠNG LƯỢNG (số bản)</Title>
        <Table
          size="small" bordered pagination={false} rowKey="doc"
          dataSource={checklist}
          columns={[
            { title: 'Chứng từ', dataIndex: 'doc', key: 'doc', render: (k: string) => DOC_LABEL(k) },
            { title: 'Bản gốc', dataIndex: 'originals', key: 'o', align: 'center', width: 100 },
            { title: 'Bản copy', dataIndex: 'copies', key: 'c', align: 'center', width: 100 },
          ]}
          locale={{ emptyText: '(Chưa nhập checklist ở Hồ sơ chứng từ khách)' }}
        />

        <Divider />
        <Title level={5}>ĐIỀU KIỆN THƯƠNG LƯỢNG</Title>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            <tr><td style={{ padding: '4px 8px', width: '32%', color: '#444' }}>Tỷ lệ thương lượng</td><td style={{ padding: '4px 8px' }}>: {v.negotiate_pct ?? '—'}%  = USD {fmtUSD(v.negotiate_amount || 0)}</td></tr>
            <tr><td style={{ padding: '4px 8px', color: '#444' }}>Lãi suất</td><td style={{ padding: '4px 8px' }}>: {v.interest_rate ?? '—'} %/năm</td></tr>
            <tr><td style={{ padding: '4px 8px', color: '#444' }}>Thời hạn</td><td style={{ padding: '4px 8px' }}>: {v.term_days ?? '—'} ngày</td></tr>
            <tr><td style={{ padding: '4px 8px', color: '#444' }}>Ngày nộp</td><td style={{ padding: '4px 8px' }}>: {v.submitted_date ? dayjs(v.submitted_date).format('DD/MM/YYYY') : '—'}</td></tr>
          </tbody>
        </table>

        <div style={{ marginTop: 40, textAlign: 'right' }}>
          <Text strong>{COMPANY.name}</Text>
          <div style={{ height: 56 }} />
          <Text strong>{COMPANY.title}</Text>
        </div>
      </div>

      <div className="no-print" style={{ marginTop: 16, textAlign: 'center' }}>
        <Space>
          <Button type="primary" icon={<PrinterOutlined />} size="large" onClick={() => window.print()}>In / Lưu PDF</Button>
          <Button icon={<FileWordOutlined />} size="large" onClick={() => downloadElementAsWord('dnck-print', `${soDisplayCode(order)}_DNCK`)}>Tải Word (.doc)</Button>
        </Space>
      </div>
    </div>
  )
}
