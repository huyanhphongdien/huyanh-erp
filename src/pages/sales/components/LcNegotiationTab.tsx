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
import { SaveOutlined, PrinterOutlined, FileWordOutlined, SnippetsOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { documentService, type InvoiceData } from '../../../services/sales/documentService'
import { lcNegotiationService, type LcNegotiation } from '../../../services/sales/lcNegotiationService'
import customerExportProfileService, {
  EXPORT_DOC_TYPES, type CompanyBank, type CustomerExportProfile,
} from '../../../services/sales/customerExportProfileService'
import type { SalesOrder } from '../../../services/sales/salesTypes'
import { soDisplayCode } from '../../../services/sales/salesTypes'
import { lcNegotiationDoc, collectionDiscountDoc, saveDocx } from '../../../services/sales/docxExport'

const { Title, Text, Paragraph } = Typography

const COMPANY = {
  name: 'CÔNG TY TNHH MỘT THÀNH VIÊN CAO SU HUY ANH PHONG ĐIỀN',
  rep: 'Ông Lê Xuân Hồng Trung',
  title: 'Phó Giám Đốc',
}
const DOC_LABEL = (k: string) => EXPORT_DOC_TYPES.find((d) => d.key === k)?.label || k
const fmtUSD = (v: number) => (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function LcNegotiationTab(
  { orderId, order, onSaved, lotNo = 0 }: { orderId: string; order: SalesOrder; onSaved?: () => void; lotNo?: number },
) {
  const [form] = Form.useForm()
  const watched = Form.useWatch([], form)   // để văn bản cập nhật live khi sửa form
  const [inv, setInv] = useState<InvoiceData | null>(null)
  const [profile, setProfile] = useState<CustomerExportProfile | null>(null)
  const [banks, setBanks] = useState<CompanyBank[]>([])
  const [neg, setNeg] = useState<LcNegotiation | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingTpl, setSavingTpl] = useState(false)
  // Số bản riêng đơn (mặc định lấy hồ sơ khách; sửa cho L/C của đơn này)
  const [docCounts, setDocCounts] = useState<Record<string, { originals: number; copies: number }>>({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [i, p, b, n] = await Promise.all([
          documentService.getInvoiceData(orderId, lotNo),
          customerExportProfileService.getByCustomer(order.customer_id),
          customerExportProfileService.listBanks(),
          lcNegotiationService.getByOrder(orderId, lotNo),
        ])
        if (cancelled) return
        setInv(i); setProfile(p); setBanks(b); setNeg(n)
        // Số bản: ưu tiên bản riêng của đơn (neg.doc_checklist), thiếu → hồ sơ khách
        const srcCl = (n?.doc_checklist && n.doc_checklist.length ? n.doc_checklist : p?.doc_checklist) || []
        const cl: Record<string, { originals: number; copies: number }> = {}
        for (const it of srcCl) cl[it.doc] = { originals: it.originals || 0, copies: it.copies || 0 }
        setDocCounts(cl)
        // Ưu tiên: đơn đã lưu → template hồ sơ khách → suy từ payment_terms
        const defaultMethod = n?.method || p?.default_payment_method
          || (/\b(dp|cad|d\/p|nhờ thu|collection)\b/i.test(order.payment_terms || '') ? 'dp' : 'lc')
        const pct = n?.negotiate_pct ?? p?.default_negotiate_pct ?? 90
        form.setFieldsValue({
          method: defaultMethod,
          bank_id: n?.bank_id || p?.preferred_bank_id || null,
          issuing_bank: n?.issuing_bank || p?.default_counterparty_bank || i?.consignee || '',
          lc_number: n?.lc_number || i?.lc_number || '',
          lc_date: n?.lc_date ? dayjs(n.lc_date) : null,
          negotiate_pct: pct,
          negotiate_amount: n?.negotiate_amount ?? Math.round((i?.total || 0) * pct / 100),
          interest_rate: n?.interest_rate ?? p?.default_interest_rate ?? null,
          term_days: n?.term_days ?? p?.default_term_days ?? null,
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
  }, [orderId, order.customer_id, form, lotNo])

  // Tự tính số tiền thương lượng khi đổi %
  const onPctChange = (pct: number | null) => {
    const total = inv?.total || 0
    if (pct != null && total > 0) form.setFieldsValue({ negotiate_amount: Math.round(total * pct / 100) })
  }

  // Số bản của đơn (từ docCounts, bỏ dòng 0)
  const buildDocChecklist = () => EXPORT_DOC_TYPES
    .map((d) => ({ doc: d.key, originals: docCounts[d.key]?.originals || 0, copies: docCounts[d.key]?.copies || 0 }))
    .filter((c) => c.originals > 0 || c.copies > 0)

  const handleSave = async () => {
    let v: any
    try { v = await form.validateFields() } catch { return }
    setSaving(true)
    try {
      const saved = await lcNegotiationService.upsert(orderId, {
        method: v.method || 'lc',
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
        doc_checklist: buildDocChecklist(),
      }, lotNo)
      setNeg(saved)
      message.success('Đã lưu đơn chiết khấu')
      onSaved?.()   // báo BOE nạp lại (số L/C, tenor, ngân hàng phát hành)
    } catch (e: any) {
      message.error(e?.message || 'Lỗi lưu')
    } finally {
      setSaving(false)
    }
  }

  // Lưu điều kiện hiện tại làm MẪU chiết khấu cho khách (đơn sau tự điền)
  const handleSaveTemplate = async () => {
    const v = form.getFieldsValue()
    setSavingTpl(true)
    try {
      await customerExportProfileService.upsert(order.customer_id, {
        default_payment_method: v.method || 'lc',
        default_counterparty_bank: v.issuing_bank || null,
        default_negotiate_pct: v.negotiate_pct ?? null,
        default_interest_rate: v.interest_rate ?? null,
        default_term_days: v.term_days ?? null,
        doc_checklist: buildDocChecklist(),
      })
      message.success('Đã lưu làm mẫu chiết khấu + số bản cho khách — đơn sau tự điền')
    } catch (e: any) {
      message.error(e?.message || 'Lỗi lưu mẫu')
    } finally {
      setSavingTpl(false)
    }
  }

  if (loading) return <Spin tip="Loading..." />

  const v = watched || form.getFieldsValue()
  const bank = banks.find((b) => b.id === v.bank_id) || null
  const checklist = EXPORT_DOC_TYPES
    .map((d) => ({ doc: d.key, originals: docCounts[d.key]?.originals || 0, copies: docCounts[d.key]?.copies || 0 }))
    .filter((c) => c.originals > 0 || c.copies > 0)
  const setDocCell = (doc: string, field: 'originals' | 'copies', val: number) =>
    setDocCounts((prev) => ({ ...prev, [doc]: { originals: prev[doc]?.originals || 0, copies: prev[doc]?.copies || 0, [field]: val } }))
  const method: string = v?.method || 'lc'
  const isDP = method !== 'lc'
  const methodLabel = method === 'dp' ? 'Nhờ thu D/P (URC 522)' : method === 'da' ? 'Nhờ thu D/A (URC 522)' : 'L/C'
  const counterBankLabel = isDP ? 'Ngân hàng nhờ thu (NH người mua)' : 'Ngân hàng phát hành L/C (của khách)'
  // Số tiền đòi qua Hối phiếu = THE COST (đã trừ cước/BH), khớp bộ gốc D/P
  const draftValue = (inv?.the_cost ?? inv?.total) || 0

  return (
    <div>
      {/* ── Form nhập (không in) ── */}
      <Card size="small" className="no-print" style={{ marginBottom: 16 }}
        title="Điều kiện thương lượng / chiết khấu (nhập rồi Lưu)"
        extra={<Space>
          <Button icon={<SnippetsOutlined />} loading={savingTpl} onClick={handleSaveTemplate}
            title="Lưu phương thức + NH + điều kiện hiện tại làm mẫu cho khách này">💾 Lưu làm mẫu cho khách</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave} style={{ background: '#1B4D3E' }}>Lưu</Button>
        </Space>}>
        <Form form={form} layout="vertical" size="small" onValuesChange={(chg) => { if ('negotiate_pct' in chg) onPctChange(chg.negotiate_pct) }}>
          <Row gutter={12}>
            <Col xs={24} md={6}><Form.Item label="Phương thức thanh toán" name="method">
              <Select options={[
                { value: 'lc', label: 'L/C (thư tín dụng) — BM03' },
                { value: 'dp', label: 'Nhờ thu D/P — BM08' },
                { value: 'da', label: 'Nhờ thu D/A — BM08' },
              ]} />
            </Form.Item></Col>
            <Col xs={24} md={6}><Form.Item label="Ngân hàng chiết khấu (của Huy Anh)" name="bank_id">
              <Select allowClear showSearch optionFilterProp="label"
                options={banks.map((b) => ({ value: b.id, label: `${b.swift_code || ''} — ${b.bank_name}` }))} />
            </Form.Item></Col>
            <Col xs={24} md={12}><Form.Item label={counterBankLabel} name="issuing_bank"><Input /></Form.Item></Col>
            <Col xs={12} md={6}><Form.Item label={isDP ? 'Số L/C (bỏ trống)' : 'Số L/C'} name="lc_number"><Input disabled={isDP} /></Form.Item></Col>
            <Col xs={12} md={6}><Form.Item label={isDP ? 'Ngày L/C (bỏ trống)' : 'Ngày L/C'} name="lc_date"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} disabled={isDP} /></Form.Item></Col>
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
          <div style={{ marginTop: 4 }}>
            <Text strong style={{ fontSize: 13 }}>Số bản chứng từ (46A) — riêng đơn này</Text>
            <div style={{ fontSize: 11.5, color: '#1257a8', margin: '2px 0 6px' }}>
              Mặc định lấy từ Hồ sơ chứng từ khách; sửa ở đây nếu L/C của đơn này yêu cầu khác — <b>không đụng hồ sơ khách</b>. Bấm <b>Lưu</b> để áp cho đơn.
            </div>
            <Table size="small" bordered pagination={false} rowKey="key" dataSource={EXPORT_DOC_TYPES}
              columns={[
                { title: 'Chứng từ', dataIndex: 'label', key: 'label' },
                { title: 'Bản gốc', key: 'o', width: 110, align: 'center' as const,
                  render: (_: unknown, r: { key: string }) => (
                    <InputNumber min={0} size="small" value={docCounts[r.key]?.originals || 0}
                      onChange={(val) => setDocCell(r.key, 'originals', Number(val) || 0)} style={{ width: '100%' }} />
                  ) },
                { title: 'Bản copy', key: 'c', width: 110, align: 'center' as const,
                  render: (_: unknown, r: { key: string }) => (
                    <InputNumber min={0} size="small" value={docCounts[r.key]?.copies || 0}
                      onChange={(val) => setDocCell(r.key, 'copies', Number(val) || 0)} style={{ width: '100%' }} />
                  ) },
              ]} />
          </div>
        </Form>
      </Card>

      {/* ── Văn bản đề nghị (in được) ── */}
      <div className="doc-print-area" id="dnck-print">
        <Title level={4} style={{ textAlign: 'center', marginBottom: 2 }}>
          {isDP ? 'GIẤY ĐỀ NGHỊ CHIẾT KHẤU KIÊM PHỤ LỤC HỢP ĐỒNG' : 'GIẤY ĐỀ NGHỊ KIÊM HỢP ĐỒNG THƯƠNG LƯỢNG THANH TOÁN'}
        </Title>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <Text>Số: {isDP ? `${soDisplayCode(order)}/CI-CK` : `${soDisplayCode(order)}/TLTT`}</Text>
          {isDP && <div><Text type="secondary" style={{ fontSize: 12 }}>(Mẫu BM08 — Hối phiếu kèm bộ chứng từ, TRỪ L/C)</Text></div>}
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
            {isDP ? (
              <>
                <tr><td style={{ padding: '4px 8px', width: '32%', color: '#444' }}>Phương thức thanh toán</td><td style={{ padding: '4px 8px' }}>: {methodLabel}</td></tr>
                <tr><td style={{ padding: '4px 8px', color: '#444' }}>Ngân hàng nhờ thu (người mua)</td><td style={{ padding: '4px 8px' }}>: {v.issuing_bank || '—'}</td></tr>
                <tr><td style={{ padding: '4px 8px', color: '#444' }}>Người nhập khẩu / người mua</td><td style={{ padding: '4px 8px' }}>: {inv?.buyer_name || '—'}</td></tr>
              </>
            ) : (
              <>
                <tr><td style={{ padding: '4px 8px', width: '32%', color: '#444' }}>L/C số</td><td style={{ padding: '4px 8px' }}>: {v.lc_number || '—'}{v.lc_date ? `   ngày ${dayjs(v.lc_date).format('DD/MM/YYYY')}` : ''}</td></tr>
                <tr><td style={{ padding: '4px 8px', color: '#444' }}>Ngân hàng phát hành</td><td style={{ padding: '4px 8px' }}>: {v.issuing_bank || '—'}</td></tr>
              </>
            )}
            <tr><td style={{ padding: '4px 8px', color: '#444' }}>Loại hàng</td><td style={{ padding: '4px 8px' }}>: NATURAL RUBBER {order.grade?.replace(/_/g, ' ')}</td></tr>
            <tr><td style={{ padding: '4px 8px', color: '#444' }}>Số hợp đồng</td><td style={{ padding: '4px 8px' }}>: {order.contract_no || soDisplayCode(order)}</td></tr>
            <tr><td style={{ padding: '4px 8px', color: '#444' }}>Trị giá hóa đơn</td><td style={{ padding: '4px 8px' }}>: USD {fmtUSD(inv?.total || 0)}</td></tr>
            {isDP && <tr><td style={{ padding: '4px 8px', color: '#444' }}>Giá trị Hối phiếu (đòi tiền)</td><td style={{ padding: '4px 8px', fontWeight: 600 }}>: USD {fmtUSD(draftValue)}</td></tr>}
          </tbody>
        </table>
        {isDP && (
          <Paragraph style={{ fontSize: 12, fontStyle: 'italic', color: '#555' }}>
            Cam kết xuất trình đầy đủ bộ chứng từ trong vòng 15 ngày làm việc kể từ ngày Ngân hàng thực hiện thương lượng thanh toán.
            Gửi Hối phiếu kèm bộ chứng từ đi nhờ thu theo Quy tắc thống nhất về Nhờ thu (URC 522). Mọi rủi ro &amp; chi phí thuộc về khách hàng.
          </Paragraph>
        )}

        <Title level={5}>BỘ CHỨNG TỪ ĐỀ NGHỊ THƯƠNG LƯỢNG (số bản)</Title>
        <div style={{ fontSize: 12, color: '#874d00', marginBottom: 6 }}>
          📌 Số bản lấy từ <b>Hồ sơ chứng từ khách</b> — vốn là số <b>ngân hàng phát hành L/C yêu cầu (trường 46A)</b>. Sửa ở tab Khách → "Hồ sơ chứng từ".
        </div>
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
          <Button icon={<FileWordOutlined />} size="large" onClick={() => {
            const cl = checklist.map((c) => ({ label: DOC_LABEL(c.doc), originals: c.originals || 0, copies: c.copies || 0 }))
            const common = {
              orderCode: soDisplayCode(order), contractNo: order.contract_no || soDisplayCode(order),
              grade: order.grade || '', invTotal: inv?.total || 0,
              bankName: bank?.bank_name || '', accountNo: bank?.account_no || '',
              negotiatePct: v.negotiate_pct ?? null, negotiateAmount: v.negotiate_amount ?? null,
              interestRate: v.interest_rate ?? null, termDays: v.term_days ?? null,
              submittedDate: v.submitted_date ? dayjs(v.submitted_date).format('DD/MM/YYYY') : '',
              checklist: cl,
            }
            const doc = isDP
              ? collectionDiscountDoc({ ...common, method: (method as 'dp' | 'da'), draftValue,
                  collectingBank: v.issuing_bank || '', buyerName: inv?.buyer_name || '' })
              : lcNegotiationDoc({ ...common, issuingBank: v.issuing_bank || '', lcNumber: v.lc_number || '',
                  lcDate: v.lc_date ? dayjs(v.lc_date).format('DD/MM/YYYY') : '' })
            saveDocx(doc, `${soDisplayCode(order)}_${isDP ? 'CK-DP' : 'DNCK'}`).catch(() => message.error('Lỗi xuất Word'))
          }}>Tải Word (.docx)</Button>
        </Space>
      </div>
    </div>
  )
}
