// ============================================================================
// OrderPartiesCard — thẻ "CÁC BÊN CỦA ĐƠN": Người mua → Người nhận hàng → chữ in ô Consignee / Notify
// Dùng chung 3 dạng xem (trang đầy đủ, drawer, Split) qua tab Thông tin (OrderInfoTab) — thay thẻ "Khách hàng" cũ.
// File: src/pages/sales/components/OrderPartiesCard.tsx (sales_family_parties_p1, owner duyệt 17/11/2026)
//
// BA VAI, MỖI VAI MỘT CHỖ LƯU:
//   ① Người mua      = customer_id — đứng tên HĐ, trả tiền, công nợ, hoa hồng (KHÔNG sửa ở đây).
//   ② Người nhận hàng = ship_to_customer_id — riêng TỪNG đơn, NULL = chính người mua; luôn là MỘT hồ sơ khách
//                       (chưa có → "+ Thêm người nhận mới…" trong PartyFields).
//   ③ Chữ in ô Consignee/Notify = 4 cột ghi đè (NULL = tự suy) — chỉ để IN.
// Dòng "In ô Consignee/Notify … (nguồn …)" đọc từ MỘT hàm suy resolveOrderParties (orderParties.ts) — CÙNG hàm với
// chứng từ và bảng kiểm, đừng tự suy ở đây. Lưu qua salesOrderService.updateParties (audit tự ghi).
// Quyền sửa = isTabEditable(role, 'contract', …): Sale khi đơn Nháp, XNK/Admin mọi lúc.
// Chưa migration (useFamilyPartiesReady = false) → chỉ vẽ phần Người mua như thẻ "Khách hàng" cũ.
// ============================================================================

import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Divider, Form, Input, Modal, Popconfirm, Space, Tag, Typography, message } from 'antd'
import { EditOutlined, SolutionOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { SalesOrder, CustomerStatus } from '../../../services/sales/salesTypes'
import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_TIER_COLORS,
  CUSTOMER_TIER_LABELS,
  countryFlag,
  countryLabel,
  partyShortName,
} from '../../../services/sales/salesTypes'
import { salesOrderService, type OrderPartiesPatch } from '../../../services/sales/salesOrderService'
import {
  CONSIGNEE_SOURCE_LABELS,
  NOTIFY_SOURCE_LABELS,
  resolveOrderParties,
  type ConsigneePreset,
  type PartyPaymentMethod,
  type PartyWarning,
} from '../../../services/sales/orderParties'
import { customerExportProfileService } from '../../../services/sales/customerExportProfileService'
import { lcNegotiationService } from '../../../services/sales/lcNegotiationService'
import {
  getSalesRole,
  isTabEditable,
  type SalesOrderStatus,
  type SalesRole,
} from '../../../services/sales/salesPermissionService'
import { useAuthStore } from '../../../stores/authStore'
import { useIsPhone } from '../../../hooks/useIsPhone'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import { EnumTag } from '../../../components/common/EnumTag'
import PageState from '../../../components/common/PageState'
import { palette } from '../../../theme/palette'
import PartyFields from './PartyFields'
import { useFamilyPartiesReady } from './OrderFamilyChip'

const { Text } = Typography

/** Cách thanh toán suy được (resolveOrderParties.paymentMethod) → chữ cho câu đề xuất. */
const PAYMENT_METHOD_TEXT: Record<PartyPaymentMethod, string> = {
  lc: 'L/C',
  dp: 'nhờ thu D/P · D/A',
  tt: 'T/T',
}

/** Cảnh báo NHẮC (không phải lỗi) → chữ xám; còn lại chữ vàng. 'consignee_unconfirmed' đã vẽ thành khối chốt riêng. */
const REMINDER_CODES = new Set<PartyWarning['code']>(['lc_check_notify', 'co_third_party'])

type PartiesFormValues = {
  ship_to_customer_id: string | null
  consignee_name: string
  consignee_address: string
  notify_party: string
  notify_address: string
}

const PRINT_KEYS = ['consignee_name', 'consignee_address', 'notify_party', 'notify_address'] as const
const clean = (s?: string | null) => (s ?? '').trim()

export interface OrderPartiesCardProps {
  order: SalesOrder
  /** vai trò Đơn hàng bán — bỏ trống thì tự đọc từ tài khoản đang đăng nhập */
  salesRole?: SalesRole | null
  /** gọi sau khi lưu (nơi gọi tải lại đơn) */
  onSaved?: () => void
}

export default function OrderPartiesCard({ order, salesRole, onSaved }: OrderPartiesCardProps) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const role = salesRole !== undefined ? salesRole : getSalesRole(user)
  const ready = useFamilyPartiesReady()
  const isPhone = useIsPhone()
  const qc = useQueryClient()

  const cust = order.customer
  const shipToId = ready ? order.ship_to_customer_id || null : null
  const shipTo = ready ? order.ship_to ?? null : null
  const canEdit = ready && !!role && isTabEditable(role, 'contract', order.status as SalesOrderStatus, !!order.is_locked)

  // ── Nạp hồ sơ chứng từ người mua / người nhận + bảng thương lượng (L/C) để suy dòng in ──
  const buyerProfileQ = useQuery({
    queryKey: ['sales-customer-export-profile', order.customer_id || null],
    queryFn: () => customerExportProfileService.getByCustomer(order.customer_id),
    enabled: ready && !!order.customer_id,
    staleTime: 60 * 1000,
  })
  const shipToProfileQ = useQuery({
    queryKey: ['sales-customer-export-profile', shipToId],
    queryFn: () => customerExportProfileService.getByCustomer(shipToId as string),
    enabled: ready && !!shipToId,
    staleTime: 60 * 1000,
  })
  const negQ = useQuery({
    queryKey: ['sales-order-lc-negotiation', order.id, 0],
    queryFn: () => lcNegotiationService.getByOrder(order.id, 0),
    enabled: ready,
    staleTime: 60 * 1000,
  })
  const printLoading = buyerProfileQ.isLoading || shipToProfileQ.isLoading || negQ.isLoading
  const printError = buyerProfileQ.error || shipToProfileQ.error || negQ.error
  const retryPrint = () => {
    if (buyerProfileQ.error) void buyerProfileQ.refetch()
    if (shipToProfileQ.error) void shipToProfileQ.refetch()
    if (negQ.error) void negQ.refetch()
  }

  const resolved = useMemo(() => {
    if (!ready || printLoading || printError) return null
    return resolveOrderParties({
      order: {
        customer_id: order.customer_id,
        ship_to_customer_id: shipToId,
        consignee_name: order.consignee_name,
        consignee_address: order.consignee_address,
        notify_party: order.notify_party,
        notify_address: order.notify_address,
        payment_terms: order.payment_terms,
        payment_terms_note: order.payment_terms_note,
      },
      buyer: cust
        ? { id: cust.id, name: cust.name, short_name: cust.short_name, country: cust.country, address: (cust as { address?: string | null }).address }
        : null,
      buyerProfile: buyerProfileQ.data ?? null,
      shipTo,
      shipToProfile: shipToProfileQ.data ?? null,
      negotiation: negQ.data ?? null,
    })
  }, [
    ready, printLoading, printError, order.customer_id, shipToId, order.consignee_name, order.consignee_address,
    order.notify_party, order.notify_address, order.payment_terms, order.payment_terms_note, cust,
    buyerProfileQ.data, shipTo, shipToProfileQ.data, negQ.data,
  ])

  // ── Lưu ──
  const [saving, setSaving] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  // Giá trị đầu của form sửa + khoá dựng lại form mỗi lần mở (form nằm trong Modal destroyOnHidden)
  const [editInit, setEditInit] = useState<PartiesFormValues | null>(null)
  const [editKey, setEditKey] = useState(0)
  const [form] = Form.useForm<PartiesFormValues>()

  const afterSave = () => {
    if (onSaved) onSaved()
    else void qc.invalidateQueries({ queryKey: ['sales-order-family'] })
  }

  const openEditor = (preset?: Partial<PartiesFormValues>) => {
    setEditInit({
      ship_to_customer_id: shipToId,
      consignee_name: order.consignee_name || '',
      consignee_address: order.consignee_address || '',
      notify_party: order.notify_party || '',
      notify_address: order.notify_address || '',
      ...preset,
    })
    setEditKey((k) => k + 1)
    setEditOpen(true)
  }

  const applyPreset = async (p: ConsigneePreset) => {
    setSaving(true)
    try {
      await salesOrderService.updateParties(order.id, { consignee_name: p.name, consignee_address: p.address || null })
      message.success(`Đã chốt ô Consignee: ${p.name}`)
      afterSave()
    } catch (e: unknown) {
      message.error(dichLoiHeThong(e, 'Không chốt được ô Consignee'))
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    let vals: PartiesFormValues
    try {
      vals = await form.validateFields()
    } catch {
      return // lỗi form — antd tự tô đỏ
    }
    // Chỉ gửi ô thực sự đổi (đỡ nhật ký audit rác); chuỗi rỗng = NULL = tự suy (service cũng chuẩn hoá)
    const patch: OrderPartiesPatch = {}
    const nextShip = vals.ship_to_customer_id || null
    if (nextShip !== shipToId) patch.ship_to_customer_id = nextShip
    for (const k of PRINT_KEYS) {
      if (clean(vals[k]) !== clean(order[k])) patch[k] = clean(vals[k]) || null
    }
    if (Object.keys(patch).length === 0) {
      setEditOpen(false)
      message.info('Không có thay đổi')
      return
    }
    setSaving(true)
    try {
      await salesOrderService.updateParties(order.id, patch)
      message.success('Đã lưu các bên của đơn')
      setEditOpen(false)
      afterSave()
    } catch (e: unknown) {
      message.error(dichLoiHeThong(e, 'Không lưu được các bên của đơn'))
    } finally {
      setSaving(false)
    }
  }

  // ── Vẽ ──
  const linkBtn = (label: ReactNode, onClick: () => void, icon?: ReactNode) => (
    <Button size="small" type="link" icon={icon} onClick={onClick} style={{ paddingInline: 4, height: 'auto' }}>
      {label}
    </Button>
  )

  const buyerBlock = cust ? (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 8px' }}>
        <Text strong style={{ wordBreak: 'break-word' }}>{countryFlag(cust.country)} {cust.name}</Text>
        {cust.code ? <Tag style={{ marginInlineEnd: 0 }}>{cust.code}</Tag> : null}
        {cust.tier ? <EnumTag value={cust.tier} labels={CUSTOMER_TIER_LABELS} colors={CUSTOMER_TIER_COLORS} style={{ marginInlineEnd: 0 }} /> : null}
      </div>
      <Text type="secondary" style={{ fontSize: 12 }}>{cust.country ? countryLabel(cust.country) : '—'}</Text>
      <div style={{ display: 'flex', flexWrap: 'wrap', marginInlineStart: -4 }}>
        {linkBtn('Hồ sơ CT', () => navigate(`/sales/customers/${cust.id}?tab=export`), <SolutionOutlined />)}
        {linkBtn('Chi tiết', () => navigate(`/sales/customers/${cust.id}`))}
      </div>
    </div>
  ) : <Text type="secondary">—</Text>

  // Chưa migration → y như thẻ "Khách hàng" cũ (không nút / khối mới)
  if (!ready) {
    return (
      <Card size="small" title="Người mua" style={{ marginBottom: 12 }}>
        {buyerBlock}
      </Card>
    )
  }

  const inactive = shipTo?.status && shipTo.status !== 'active'
  const receiverBlock = shipToId ? (
    shipTo ? (
      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 8px' }}>
          <Text strong style={{ color: palette.brand, wordBreak: 'break-word' }}>→ {countryFlag(shipTo.country)} {shipTo.name}</Text>
          {inactive ? (
            <Tag color="gold" style={{ marginInlineEnd: 0 }}>
              {CUSTOMER_STATUS_LABELS[shipTo.status as CustomerStatus] ?? shipTo.status}
            </Tag>
          ) : null}
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {shipTo.country ? countryLabel(shipTo.country) : '—'} · tên ngắn {partyShortName(shipTo)}
        </Text>
        <div style={{ display: 'flex', flexWrap: 'wrap', marginInlineStart: -4 }}>
          {linkBtn('Hồ sơ CT', () => navigate(`/sales/customers/${shipTo.id}?tab=export`), <SolutionOutlined />)}
          {linkBtn('Chi tiết', () => navigate(`/sales/customers/${shipTo.id}`))}
        </div>
      </div>
    ) : (
      <Text type="warning">Không đọc được hồ sơ người nhận hàng — chọn lại ô Người nhận hàng</Text>
    )
  ) : (
    <Text type="secondary">Chính người mua (mua thẳng — không qua trung gian)</Text>
  )

  // Đơn có người nhận, chưa có chữ ghi đè, không L/C → XNK phải chốt ô Consignee
  const needsChoice = !!resolved && resolved.viaIntermediary && resolved.consignee.source !== 'order_override' && !resolved.lcConsignee
  const hasBankPreset = !!resolved?.consigneePresets.some((p) => p.kind === 'order_of_bank')
  const suggestedKind = resolved?.suggestedConsignee?.kind ?? null
  const suggestBankManual = !!resolved && resolved.paymentMethod === 'lc' && !hasBankPreset
  const lcWithReceiver = !!resolved && resolved.viaIntermediary && resolved.consignee.source === 'lc' && resolved.notify.source === 'receiver'
  const neutralDocs = !!resolved && resolved.viaIntermediary && !resolved.showPartiesBlock
  const otherWarnings = (resolved?.warnings || []).filter((w) => w.code !== 'consignee_unconfirmed')
  const wrapBtn = { whiteSpace: 'normal' as const, height: 'auto', textAlign: 'left' as const, maxWidth: '100%' }

  const choiceBlock = needsChoice && resolved ? (
    <Alert
      type="warning"
      showIcon
      title="Đơn bán qua trung gian — XNK chốt ô Consignee"
      description={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Text style={{ fontSize: 12 }}>
            In thẳng tên người nhận cho đơn D/P có thể để người nhận lấy hàng khi bên mua chưa trả tiền.{' '}
            {resolved.paymentMethod
              ? `Đề xuất theo cách thanh toán ${PAYMENT_METHOD_TEXT[resolved.paymentMethod]}.`
              : 'Chưa rõ cách thanh toán (ô Thanh toán của đơn trống) — XNK tự chọn.'}
          </Text>
          {canEdit ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {resolved.consigneePresets.map((p) => (
                <Popconfirm
                  key={p.kind}
                  title="Chốt ô Consignee của đơn này?"
                  description={<span style={{ whiteSpace: 'pre-line' }}>In: {p.name}{p.address ? `\n${p.address}` : ''}</span>}
                  okText="Chốt"
                  cancelText="Thôi"
                  onConfirm={() => applyPreset(p)}
                >
                  <Button size="small" type={p.kind === suggestedKind ? 'primary' : 'default'} disabled={saving} style={wrapBtn}>
                    {p.label}{p.kind === suggestedKind ? ' · đề xuất' : ''}
                  </Button>
                </Popconfirm>
              ))}
              {!hasBankPreset && (
                <Button
                  size="small"
                  type={suggestBankManual ? 'primary' : 'default'}
                  disabled={saving}
                  style={wrapBtn}
                  onClick={() => openEditor({ consignee_name: 'TO THE ORDER OF ', consignee_address: '' })}
                >
                  TO THE ORDER OF &lt;NH&gt;…{suggestBankManual ? ' · đề xuất' : ''}
                </Button>
              )}
              <Button size="small" disabled={saving} style={wrapBtn} onClick={() => openEditor()}>Gõ tay…</Button>
            </div>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>XNK / Admin (hoặc Sale khi đơn còn Nháp) bấm chốt được.</Text>
          )}
        </div>
      }
    />
  ) : null

  const printBlock = (
    <PageState loading={printLoading} error={printError} onRetry={retryPrint} minHeight={60}>
      {resolved ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PrintLine
            label="In ô Consignee"
            name={resolved.consignee.name}
            address={resolved.consignee.address}
            source={CONSIGNEE_SOURCE_LABELS[resolved.consignee.source]}
            warn={resolved.consignee.needsConfirm}
          />
          <PrintLine
            label="In ô Notify"
            name={resolved.notify.name}
            address={resolved.notify.address}
            source={NOTIFY_SOURCE_LABELS[resolved.notify.source]}
          />
          {lcWithReceiver ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Ô Consignee theo L/C; {resolved.receiverLabel} in ở ô Notify.
            </Text>
          ) : null}
          {neutralDocs ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Hồ sơ người mua bật "chứng từ trung tính" — Invoice / Packing List không in khối người nhận.
            </Text>
          ) : null}
          {choiceBlock}
          {otherWarnings.map((w) => (
            <Text key={w.code} type={REMINDER_CODES.has(w.code) ? 'secondary' : 'warning'} style={{ fontSize: 12 }}>
              {REMINDER_CODES.has(w.code) ? 'ℹ ' : '⚠ '}{w.text}
            </Text>
          ))}
        </div>
      ) : null}
    </PageState>
  )

  return (
    <Card
      size="small"
      title="Các bên của đơn"
      style={{ marginBottom: 12 }}
      extra={canEdit ? (
        <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEditor()} disabled={saving}>
          Sửa
        </Button>
      ) : null}
    >
      <Section title="Người mua" hint="đứng tên HĐ · trả tiền · công nợ">{buyerBlock}</Section>
      <Section title="Người nhận hàng" hint="riêng đơn này">{receiverBlock}</Section>
      <Section title="Chữ in trên chứng từ" last>{printBlock}</Section>
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed #f0f0f0', fontSize: 12 }}>
        <Text strong>Công nợ, thanh toán, hoa hồng luôn theo NGƯỜI MUA.</Text>
      </div>

      <Modal
        open={editOpen}
        title="Sửa các bên của đơn"
        okText="Lưu"
        cancelText="Huỷ"
        onOk={handleSave}
        onCancel={() => setEditOpen(false)}
        confirmLoading={saving}
        destroyOnHidden
        width={isPhone ? '100%' : 560}
        style={isPhone ? { top: 0, maxWidth: '100vw', margin: 0, paddingBottom: 0 } : undefined}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
          Người nhận hàng luôn là MỘT hồ sơ khách (chưa có thì chọn "+ Thêm người nhận mới…"). Một đơn một người nhận —
          lô giao cho người nhận khác thì tách thành đợt mua tiếp. Công nợ, thanh toán, hoa hồng vẫn theo NGƯỜI MUA.
        </Text>
        {editInit ? (
          <Form key={editKey} form={form} layout="vertical" initialValues={editInit}>
            <Form.Item name="ship_to_customer_id" label="Người nhận hàng (riêng đơn này)">
              <PartyFields buyerId={order.customer_id} />
            </Form.Item>
            <Divider style={{ margin: '4px 0 12px' }}>
              <span style={{ fontSize: 12 }}>Chữ in ô Consignee / Notify — để trống = tự suy</span>
            </Divider>
            {resolved?.lcConsignee ? (
              <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 8 }}>
                Đơn L/C: ô Consignee mặc định in "{resolved.lcConsignee}". Gõ khác sẽ có cảnh báo "khác mặc định L/C" — kiểm điều khoản 46A/47A.
              </Text>
            ) : null}
            <Form.Item
              label="Consignee (tên in)"
              extra={
                <Space size={4} wrap style={{ marginTop: 4 }}>
                  <Button size="small" onClick={() => form.setFieldsValue({ consignee_name: 'TO ORDER', consignee_address: '' })}>TO ORDER</Button>
                  <Button size="small" onClick={() => form.setFieldsValue({ consignee_name: 'TO THE ORDER OF ' })}>TO THE ORDER OF …</Button>
                  <Button size="small" onClick={() => form.setFieldsValue({ consignee_name: '', consignee_address: '' })}>Để trống (tự suy)</Button>
                </Space>
              }
            >
              <Form.Item
                name="consignee_name"
                noStyle
                rules={[{
                  // "TO THE ORDER OF " bấm điền nhanh mà quên gõ tên ngân hàng → đừng lưu chữ cụt
                  validator: (_, v?: string) => (/\bORDER\s+OF\s*$/i.test(v || '')
                    ? Promise.reject(new Error('Gõ tên ngân hàng sau "TO THE ORDER OF"'))
                    : Promise.resolve()),
                }]}
              >
                <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} maxLength={300} placeholder="vd TO ORDER · TO THE ORDER OF <ngân hàng> · tên forwarder" />
              </Form.Item>
            </Form.Item>
            <Form.Item name="consignee_address" label="Consignee (địa chỉ in)">
              <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} maxLength={500} />
            </Form.Item>
            <Form.Item name="notify_party" label="Notify party (tên in)">
              <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} maxLength={300} placeholder="Để trống: in người nhận hàng (hoặc theo hồ sơ người mua)" />
            </Form.Item>
            <Form.Item name="notify_address" label="Notify party (địa chỉ in)" style={{ marginBottom: 0 }}>
              <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} maxLength={500} />
            </Form.Item>
          </Form>
        ) : null}
      </Modal>
    </Card>
  )
}

// ── Mảnh nhỏ ─────────────────────────────────────────────────────────────────

function Section({ title, hint, last, children }: { title: string; hint?: string; last?: boolean; children: ReactNode }) {
  return (
    <div style={{ paddingBottom: last ? 0 : 10, marginBottom: last ? 0 : 10, borderBottom: last ? undefined : '1px solid #f0f0f0' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>{title}</Text>
        {hint ? <Text type="secondary" style={{ fontSize: 11, fontWeight: 400, textTransform: 'none' }}> · {hint}</Text> : null}
      </div>
      {children}
    </div>
  )
}

function PrintLine({ label, name, address, source, warn }: {
  label: string
  name: string
  address: string
  source: string
  warn?: boolean
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12 }}>
        <Text type="secondary">{label}: </Text>
        <Text strong type={warn ? 'warning' : undefined} style={{ whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
          {name || '— (để trống)'}
        </Text>
        <Text type="secondary"> (nguồn: {source})</Text>
      </div>
      {address ? (
        <Text type="secondary" style={{ display: 'block', fontSize: 12, whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
          {address}
        </Text>
      ) : null}
    </div>
  )
}
