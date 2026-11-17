// ============================================================================
// CONTRACT TAB — Tab Hợp đồng trong Detail Panel v4
// File: src/pages/sales/components/ContractTab.tsx
//
// Họ HĐ (sales_family_parties_p1, 17/11/2026):
//   · ĐỢT CON (mua tiếp): Alert "Mua tiếp theo HĐ X — không cần ký HĐ mới"; file HĐ của GỐC chỉ xem
//     (<ContractFileSection readOnly>) + khối file "Xác nhận đặt hàng đợt này" của chính đơn; ẩn DraftContractPreview;
//     Ngày HĐ khoá theo gốc (không ghi đè); Số đơn chỉ Admin/XNK sửa; công tắc docs_cite_root (ô CONTRACT NO.).
//   · ĐƠN GỐC: dòng "Các đợt mua tiếp" (link); đổi số HĐ gốc phải xác nhận (ô CONTRACT NO. của các đợt đổi theo).
//   · Kiểm số HĐ: checkContractNo — trùng nguyên văn CHẶN, cùng gốc số HỎI LẠI (bỏ qua đơn cùng họ).
// ============================================================================

import { useState, useEffect, type ReactNode } from 'react'
import {
  Descriptions,
  Tag,
  Divider,
  Form,
  InputNumber,
  Input,
  Select,
  DatePicker,
  Button,
  Space,
  message,
  AutoComplete,
  Modal,
  Alert,
  Radio,
  Tooltip,
  Typography,
} from 'antd'
import { EditOutlined, SaveOutlined, CloseOutlined, LockOutlined, PlusOutlined, DeleteOutlined, FileWordOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useQueryClient } from '@tanstack/react-query'
import { salesOrderService } from '../../../services/sales/salesOrderService'
import { balesFromTons, containersFromBales, defaultBalesPerContainer } from '../../../services/sales/baleMath'
import { supabase } from '../../../lib/supabase'
import type { SalesOrder, SalesOrderItem } from '../../../services/sales/salesTypes'
import { isVnd, fmtMoney, priceUnitLabel, orderTotalInCurrency, toUsdEquivalent, vndInputProps } from '../../../services/sales/salesMoney'
import {
  INCOTERM_LABELS,
  PAYMENT_TERMS_LABELS,
  PACKING_TYPE_LABELS,
  PACKING_TYPE_OPTIONS,
  PORT_OF_LOADING_OPTIONS,
  SVR_GRADE_OPTIONS,
  type Incoterm,
  type PaymentTerms,
  type PackingType,
  soDisplayCode,
  polLabel,
  contractNoForDocs,
  contractDateForDocs,
  normalizeContractNo,
  partyShortName,
} from '../../../services/sales/salesTypes'
import { fmtDate, usdInputProps } from '../../../utils/format'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import type { SalesRole } from '../../../services/sales/salesPermissionService'
import OrderActionButtons from './OrderActionButtons'
import ContractFileSection from './ContractFileSection'
import ContractWorkflowSection from './ContractWorkflowSection'
import DraftContractPreview from './DraftContractPreview'
import { salesContractWorkflowService, describeContractNoHit } from '../../../services/sales/salesContractWorkflowService'
import {
  generateAnnexDocx, downloadAnnex, formatAnnexDate, ANNEX_TYPE_LABELS, type AnnexType,
} from '../../../services/sales/contractAnnexService'
import { ContinueOrderButton, useOpenSalesOrder, useOrderFamily } from './OrderFamilyBlock'
import { salesOrderFamilyQueryKey } from './OrderFamilyChip'
import { palette } from '../../../theme/palette'

const { Text } = Typography

/** Modal.confirm dạng Promise — true = đồng ý. */
function confirmAsync(opts: { title: string; content: ReactNode; okText: string; cancelText?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    Modal.confirm({
      title: opts.title,
      content: opts.content,
      okText: opts.okText,
      cancelText: opts.cancelText || 'Xem lại',
      okButtonProps: opts.danger ? { danger: true } : undefined,
      width: 520,
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    })
  })
}

type EditItem = {
  id?: string
  grade: string
  quantity_tons: number
  unit_price: number
  bale_weight_kg: number
  bales_per_container: number
  packing_type: string
  payment_terms?: string
}

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  order: SalesOrder
  salesRole: SalesRole | null
  editable: boolean
  onSaved: () => void
}

// ============================================================================
// HELPERS
// ============================================================================

// (fmtCurrency / fmtDate cục bộ đã gỡ — tiền theo salesMoney.fmtMoney, ngày theo utils/format)

/** Nhãn điều khoản thanh toán của 1 dòng hàng (có thể nhiều mã "LC_30,TT_30") — không in mã thô. */
const paymentTermsText = (v?: string | null): string =>
  v ? v.split(',').map((pt) => PAYMENT_TERMS_LABELS[pt.trim() as PaymentTerms] || pt.trim()).join(' + ') : '—'

// ============================================================================
// COMPONENT
// ============================================================================

export default function ContractTab({ order, salesRole, editable, onSaved }: Props) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editItems, setEditItems] = useState<EditItem[]>([])
  const [form] = Form.useForm()

  // ── Họ HĐ (mua tiếp) — chỉ khi đã migration (fam.ready) ──
  const qc = useQueryClient()
  const fam = useOrderFamily(order)
  const openOrder = useOpenSalesOrder()
  const isChild = fam.ready && fam.isChild
  const rootNo = fam.rootNo
  // Ngày HĐ GỐC (đợt con khoá theo gốc; đọc qua liên kết `parent`)
  const rootDate = isChild ? (order.parent?.contract_date ?? null) : (order.contract_date ?? null)
  // Số đơn của ĐỢT: chỉ Admin/XNK sửa (có kiểm trùng). Đơn thường / gốc: như cũ (ai sửa được tab này).
  const canEditNo = !isChild || salesRole === 'admin' || salesRole === 'logistics'
  const [savingCite, setSavingCite] = useState(false)
  /** số file "xác nhận đặt hàng" của chính đợt con (null = đang tải) — nhắc nên có trước khi Xác nhận */
  const [ownFileCount, setOwnFileCount] = useState<number | null>(null)
  useEffect(() => { setOwnFileCount(null) }, [order.id])

  // ── Nấc 2: Tạo phụ lục (Annex) ──
  const [annexOpen, setAnnexOpen] = useState(false)
  const [annexGenerating, setAnnexGenerating] = useState(false)
  const [annexForm] = Form.useForm()

  const fmtEnDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : ''

  const openAnnex = () => {
    // Phụ lục sửa HĐ ĐÃ KÝ: đợt mua tiếp in số/ngày HĐ gốc (contractNoForDocs) — đơn thường y như cũ (contract_no || code)
    const origNo = contractNoForDocs(order)
    annexForm.setFieldsValue({
      type: 'contract_no' as AnnexType,
      annex_date: formatAnnexDate(),
      seq: 1,
      orig_contract_no: origNo,
      orig_contract_date: fmtEnDate(contractDateForDocs(order)),
      buyer_name: order.customer?.name || '',
      buyer_address: (order.customer as { address?: string } | undefined)?.address || '',
      buyer_registration: '',
      buyer_md: '',
      new_contract_no: `${origNo}/ `,
    })
    setAnnexOpen(true)
  }

  const handleGenerateAnnex = async () => {
    try {
      const v = await annexForm.validateFields()
      setAnnexGenerating(true)
      const blob = await generateAnnexDocx({
        type: v.type,
        origContractNo: (v.orig_contract_no || '').trim(),
        origContractDate: (v.orig_contract_date || '').trim(),
        buyerName: v.buyer_name,
        buyerAddress: v.buyer_address,
        buyerRegistration: v.buyer_registration,
        buyerMd: v.buyer_md,
        annexDate: (v.annex_date || '').trim(),
        seq: Number(v.seq) || 1,
        newContractNo: (v.new_contract_no || '').trim(),
      })
      downloadAnnex(blob, `ANNEX ${(v.new_contract_no || order.contract_no || '').trim()}_AC${v.seq}`)
      message.success('Đã tạo phụ lục .docx — tải Word về kiểm + ký')
      setAnnexOpen(false)
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown })?.errorFields) return
      message.error(dichLoiHeThong(e, 'Tạo phụ lục thất bại'))
    } finally {
      setAnnexGenerating(false)
    }
  }

  // Cut-over (phương án A): detect đơn này dùng workflow mới hay HĐ cũ.
  // - hasWorkflow=true (có row trong sales_order_contracts) → render ContractWorkflowSection
  // - false → render ContractFileSection (legacy upload PDF scan)
  const [hasWorkflow, setHasWorkflow] = useState<boolean | null>(null)
  useEffect(() => {
    let cancelled = false
    salesContractWorkflowService
      .listBySalesOrder(order.id)
      .then((rows) => {
        if (!cancelled) setHasWorkflow(rows.length > 0)
      })
      .catch(() => {
        if (!cancelled) setHasWorkflow(false)
      })
    return () => {
      cancelled = true
    }
  }, [order.id])

  const isLocked = !!order.is_locked
  const canEdit = editable && !isLocked
  const hasItems = (order.items?.length || 0) > 0

  const itemsTotalTons = editItems.reduce((s, i) => s + (Number(i.quantity_tons) || 0), 0)
  const itemsTotalUSD = editItems.reduce((s, i) => s + (Number(i.quantity_tons) || 0) * (Number(i.unit_price) || 0), 0)

  const startEdit = () => {
    // Luôn dùng items editor — kể cả đơn cũ single-item (sẽ được promote
    // sang multi-item khi save, vì BGĐ muốn 1 đơn nhập được nhiều mặt hàng)
    if (hasItems && order.items) {
      setEditItems(order.items.map((it: SalesOrderItem) => ({
        id: it.id,
        grade: it.grade,
        quantity_tons: it.quantity_tons,
        unit_price: it.unit_price,
        bale_weight_kg: it.bale_weight_kg || 33.33,
        bales_per_container: it.bales_per_container || defaultBalesPerContainer(it.bale_weight_kg, order.container_type),
        packing_type: it.packing_type || 'loose_bale',
        payment_terms: it.payment_terms,
      })))
    } else {
      // Đơn legacy chưa có items → seed 1 dòng từ header để user có thể "Thêm dòng"
      setEditItems([{
        grade: order.grade || 'SVR_10',
        quantity_tons: order.quantity_tons || 0,
        unit_price: order.unit_price || 0,
        bale_weight_kg: order.bale_weight_kg || 33.33,
        bales_per_container: order.bales_per_container || defaultBalesPerContainer(order.bale_weight_kg, order.container_type),
        packing_type: order.packing_type || 'loose_bale',
        payment_terms: order.payment_terms || undefined,
      }])
    }
    form.setFieldsValue({
      customer_po: order.customer_po,
      quantity_tons: order.quantity_tons,
      unit_price: order.unit_price,
      incoterm: order.incoterm,
      payment_terms: order.payment_terms,
      port_of_loading: order.port_of_loading,
      port_of_destination: order.port_of_destination,
      delivery_date: order.delivery_date ? dayjs(order.delivery_date) : null,
      // Đợt con: hiện ngày HĐ GỐC (ô khoá, không ghi lại — xem handleSave)
      contract_date: (isChild ? rootDate : order.contract_date) ? dayjs((isChild ? rootDate : order.contract_date) as string) : null,
      bale_weight_kg: order.bale_weight_kg,
      bales_per_container: order.bales_per_container,
      packing_type: order.packing_type,
      commission_pct: order.commission_pct,
      commission_usd_per_mt: order.commission_usd_per_mt,
      // Bank info do Phú LV nhập qua Review HĐ workflow — Sale KHÔNG nhập ở đây
      contract_no: order.contract_no,
      notes: order.notes,
    })
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    form.resetFields()
  }

  const handleSave = async () => {
    try {
      const vals = await form.validateFields()
      setSaving(true)

      // Validate items — bắt buộc phải có ≥1 sản phẩm hợp lệ
      const validItems = editItems.filter(i => i.grade && i.quantity_tons > 0 && i.unit_price > 0)
      if (validItems.length === 0) {
        message.error('Phải có ít nhất 1 sản phẩm hợp lệ')
        setSaving(false)
        return
      }

      // ── Số HĐ / Số đơn — chỉ kiểm khi ĐỔI (so sau chuẩn hoá như index DB) ──
      // checkContractNo: trùng NGUYÊN VĂN với đơn chưa huỷ khác → CHẶN; chỉ cùng gốc số → HỎI LẠI;
      // đơn cùng họ HĐ (gốc + các đợt) không cảnh báo. (Trước 17/11/2026 cùng token đầu là chặn → chặn nhầm
      // 'HA20260053' / 'HA20260053 PH' và '…/OCT' / '…/OCT - LOT 4'.)
      const newNo = String(vals.contract_no || '').trim()
      const noChanged = canEditNo && normalizeContractNo(newNo) !== normalizeContractNo(order.contract_no)
      // Ngày HĐ của ĐƠN GỐC cũng in ở dòng DATED của các đợt trích số gốc → đổi cũng phải hỏi
      const newDate: string | null = isChild ? null : (vals.contract_date?.format('YYYY-MM-DD') || null)
      const dateChanged = !isChild && newDate !== (order.contract_date || null)
      if (noChanged || dateChanged) {
        // Họ HĐ hiện có — dùng cache nếu còn mới, không thì tải (lỗi → dừng lưu, báo lỗi ở catch dưới)
        const family = fam.ready
          ? await qc.fetchQuery({
              queryKey: salesOrderFamilyQueryKey(fam.rootId),
              queryFn: () => salesOrderService.getFamily(fam.rootId),
              staleTime: 60 * 1000,
            })
          : []
        const liveKids = family.filter((m) => !m.is_root && m.status !== 'cancelled')
        if (noChanged && !newNo && (isChild || liveKids.length > 0)) {
          message.error(isChild
            ? 'Đợt mua tiếp phải có Số đơn — không bỏ trống được'
            : `HĐ gốc đang có ${liveKids.length} đơn mua tiếp — không bỏ trống Số HĐ được`)
          return
        }
        if (noChanged && newNo) {
          const chk = await salesContractWorkflowService.checkContractNo(newNo, {
            excludeSalesOrderId: order.id,
            buyerId: order.customer_id,
            familyRootId: fam.ready ? fam.rootId : null,
          })
          if (chk.block) {
            message.error(describeContractNoHit(chk.block))
            return
          }
          if (chk.warnings.length > 0) {
            const ok = await confirmAsync({
              title: `Số HĐ "${newNo}" giống HĐ đã có`,
              content: (
                <ul style={{ paddingLeft: 18, margin: 0 }}>
                  {chk.warnings.slice(0, 5).map((w) => <li key={w.id}>{describeContractNoHit(w)}</li>)}
                  {chk.warnings.length > 5 ? <li>… và {chk.warnings.length - 5} đơn khác</li> : null}
                </ul>
              ),
              okText: 'Vẫn lưu số này',
            })
            if (!ok) return
          }
        }
        // Đổi số / ngày HĐ GỐC: ô CONTRACT NO. + DATED của các đợt (docs_cite_root) đọc qua liên kết → đổi theo
        // (KHÔNG tự đổi số đơn của các đợt — giấy đã phát giữ số cũ)
        if (!isChild && liveKids.length > 0 && ((noChanged && newNo) || dateChanged)) {
          const citing = liveKids.filter((k) => k.docs_cite_root !== false).length
          const ok = await confirmAsync({
            title: noChanged ? 'Đổi số HĐ gốc?' : 'Đổi ngày HĐ gốc?',
            content: (
              <div>
                <p style={{ marginBottom: 6 }}>
                  HĐ gốc đang có {liveKids.length} đợt mua tiếp ({liveKids.map((k) => soDisplayCode(k)).join(' · ')}).
                </p>
                <p style={{ margin: 0 }}>
                  <b>{citing} đợt</b> sẽ in theo HĐ gốc mới
                  {noChanged && newNo ? <> — CONTRACT NO. "{newNo}"</> : null}
                  {dateChanged ? <> — DATED {fmtDate(newDate)}</> : null}; số đơn của từng đợt giữ nguyên.
                </p>
              </div>
            ),
            okText: noChanged ? 'Đổi số HĐ gốc' : 'Đổi ngày HĐ gốc',
          })
          if (!ok) return
        }
      }

      const updateData: Record<string, any> = {
        customer_po: vals.customer_po || null,
        incoterm: vals.incoterm,
        payment_terms: vals.payment_terms || null,
        port_of_loading: vals.port_of_loading || null,
        port_of_destination: vals.port_of_destination || null,
        delivery_date: vals.delivery_date?.format('YYYY-MM-DD') || null,
        contract_date: vals.contract_date?.format('YYYY-MM-DD') || null,
        commission_pct: vals.commission_pct || null,
        commission_usd_per_mt: vals.commission_usd_per_mt || null,
        // Bank info do Phú LV nhập qua Review HĐ workflow — không update từ tab này
        contract_no: vals.contract_no || null,
        notes: vals.notes || null,
      }
      // Đợt con: Ngày HĐ theo GỐC — KHÔNG ghi lại (đợt cũ nối vào họ như HA20260301 giữ ngày đã in trên chứng từ).
      if (isChild) delete updateData.contract_date
      // Số đơn của đợt chỉ Admin/XNK sửa — người khác lưu thì giữ nguyên số
      if (!canEditNo) delete updateData.contract_no

      // ── Replace sales_order_items với giá trị mới (multi-item path luôn) ──
      const { error: delErr } = await supabase
        .from('sales_order_items')
        .delete()
        .eq('sales_order_id', order.id)
      if (delErr) throw delErr

      // Đồng tiền của đơn giữ nguyên khi sửa dòng (đổi USD↔VNĐ = tạo đơn mới)
      const cur = order.currency || 'USD'
      const rate = order.exchange_rate || 0
      const itemRows = validItems.map((it, idx) => {
        const qtyKg = it.quantity_tons * 1000
        const bw = it.bale_weight_kg || 33.33
        const bales = balesFromTons(it.quantity_tons, bw)
        const bpc = it.bales_per_container || defaultBalesPerContainer(bw, order.container_type)
        return {
          sales_order_id: order.id,
          grade: it.grade,
          quantity_tons: it.quantity_tons,
          unit_price: it.unit_price,
          currency: cur,
          payment_terms: it.payment_terms || null,
          // đơn VNĐ: số USD quy đổi (÷ tỷ giá) — xem salesMoney.ts
          total_value_usd: toUsdEquivalent(it.quantity_tons * it.unit_price, cur, rate),
          quantity_kg: qtyKg,
          bale_weight_kg: bw,
          total_bales: bales,
          bales_per_container: bpc,
          container_count: containersFromBales(bales, bpc),
          packing_type: it.packing_type || 'loose_bale',
          sort_order: idx,
        }
      })
      const { error: insErr } = await supabase.from('sales_order_items').insert(itemRows)
      if (insErr) throw insErr

      const totalTons = itemRows.reduce((s, i) => s + i.quantity_tons, 0)
      const totalValueUsd = itemRows.reduce((s, i) => s + (i.total_value_usd || 0), 0)   // USD (quy đổi nếu VNĐ)
      const totalInCurrency = itemRows.reduce((s, i) => s + i.quantity_tons * i.unit_price, 0) // theo đồng tiền đơn
      const totalBales = itemRows.reduce((s, i) => s + (i.total_bales || 0), 0)
      const containerCount = itemRows.reduce((s, i) => s + (i.container_count || 0), 0)
      const aggregatedGrade = itemRows.length === 1 ? itemRows[0].grade : itemRows.map(i => i.grade).join(' + ')
      const firstItem = validItems[0]

      // unit_price header theo đồng tiền của đơn (VNĐ không lấy số lẻ)
      const avgUnitPrice = totalTons > 0
        ? (isVnd(cur) ? Math.round(totalInCurrency / totalTons) : Math.round((totalInCurrency / totalTons) * 100) / 100)
        : 0
      const commissionAmount = vals.commission_usd_per_mt
        ? totalTons * vals.commission_usd_per_mt
        : (vals.commission_pct ? totalValueUsd * (vals.commission_pct / 100) : null)

      updateData.quantity_tons = totalTons
      updateData.quantity_kg = totalTons * 1000
      updateData.unit_price = avgUnitPrice
      updateData.total_value_usd = totalValueUsd
      if (isVnd(cur)) updateData.total_value_vnd = Math.round(totalInCurrency)
      else if (rate > 0) updateData.total_value_vnd = Math.round(totalValueUsd * rate)
      updateData.total_bales = totalBales
      updateData.container_count = containerCount
      updateData.grade = aggregatedGrade
      updateData.bale_weight_kg = firstItem.bale_weight_kg
      updateData.bales_per_container = firstItem.bales_per_container
      updateData.packing_type = firstItem.packing_type
      updateData.commission_amount = commissionAmount

      await salesOrderService.updateFields(order.id, updateData)
      message.success('Đã cập nhật hợp đồng')
      setEditing(false)
      // (họ HĐ ở chip / khối "Các đợt cùng HĐ" được làm mới khi nơi gọi tải lại đơn — loadOrder của 2 dạng xem)
      onSaved()
    } catch (e: any) {
      if (e?.errorFields) return // validation error
      message.error(dichLoiHeThong(e, 'Lỗi cập nhật hợp đồng'))
    } finally {
      setSaving(false)
    }
  }

  // ── Công tắc ô CONTRACT NO. của đợt con (docs_cite_root) ──
  const handleCiteChange = (v: 'root' | 'own') => {
    const next = v === 'root'
    if ((order.docs_cite_root !== false) === next) return
    const no = next ? (rootNo || '—') : soDisplayCode(order)
    const dated = next ? rootDate : order.contract_date
    Modal.confirm({
      title: 'Đổi số in ở ô CONTRACT NO.?',
      width: 520,
      content: (
        <div>
          <p style={{ marginBottom: 6 }}>
            Chứng từ của đơn này (Invoice, Packing List, Hối phiếu, Đơn chiết khấu…) sẽ in{' '}
            <b>CONTRACT NO.: {no}</b>{dated ? ` · DATED ${fmtDate(dated)}` : ''}.
          </p>
          <p style={{ margin: 0, color: palette.warning }}>
            Bộ chứng từ đã phát cho khách / ngân hàng thì nên giữ như cũ. Số chứng từ PKL / WL… không đổi.
          </p>
        </div>
      ),
      okText: 'Đổi',
      cancelText: 'Giữ nguyên',
      onOk: async () => {
        setSavingCite(true)
        try {
          await salesOrderService.updateFields(order.id, { docs_cite_root: next })
          message.success(`Ô CONTRACT NO. sẽ in ${no}`)
          onSaved()
        } catch (e: unknown) {
          message.error(dichLoiHeThong(e, 'Không đổi được ô CONTRACT NO.'))
        } finally {
          setSavingCite(false)
        }
      },
    })
  }

  // ── Computed ──
  // Ưu tiên giá trị đã tính chính xác trong DB (tổng các items), tránh recompute
  // từ quantity × unit_price (unit_price multi-item là trung bình đã làm tròn).
  const totalValueUSD = order.total_value_usd ?? ((order.quantity_tons || 0) * (order.unit_price || 0))
  const totalBales = order.total_bales || 0
  const containerCount = order.container_count || 0
  const commissionAmt = order.commission_amount
    || ((order.commission_usd_per_mt || 0) > 0
        ? (order.quantity_tons || 0) * (order.commission_usd_per_mt || 0)
        : totalValueUSD * (order.commission_pct || 0) / 100)

  // ══════════════════════════════════════════════════════════════
  // EDIT MODE
  // ══════════════════════════════════════════════════════════════

  if (editing) {
    return (
      <Form form={form} layout="vertical" size="small" style={{ padding: '8px 0' }}>
        {/* Action bar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
          <Button icon={<CloseOutlined />} onClick={cancelEdit}>Hủy</Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSave}
            style={{ background: '#1B4D3E' }}
          >
            Lưu
          </Button>
        </div>

        {/* Section: Hợp đồng */}
        <SectionHeader title="Hợp đồng" color="#1B4D3E" />
        {isChild && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 8 }}
            title={`Đợt mua tiếp theo HĐ ${rootNo} — Ngày HĐ theo HĐ gốc (khoá); Số đơn của đợt chỉ Admin / XNK sửa.`}
          />
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0 16px' }}>
          <Form.Item
            label={isChild ? `Số đơn (đợt ${order.continuation_seq ?? ''})` : 'Số hợp đồng'}
            name="contract_no"
            tooltip={isChild
              ? `Số của đợt này (gốc số chứng từ PKL/WL…). Ô CONTRACT NO. in theo công tắc ở chế độ xem — mặc định số HĐ gốc ${rootNo}.`
              : undefined}
          >
            <Input placeholder={isChild ? `${rootNo}-D${order.continuation_seq ?? ''}` : 'LTC2024/PD-ATC'} disabled={!canEditNo} />
          </Form.Item>
          <Form.Item
            label={isChild ? 'Ngày HĐ (theo HĐ gốc)' : 'Ngày HĐ'}
            name="contract_date"
            tooltip={isChild ? `Ngày ký HĐ gốc ${rootNo} — đợt mua tiếp không ký HĐ mới` : undefined}
          >
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" disabled={isChild} />
          </Form.Item>
          <Form.Item label="PO# Khách hàng" name="customer_po">
            <Input />
          </Form.Item>
        </div>

        {/* Section: Sản phẩm & Giá — luôn dùng multi-item table */}
        <SectionHeader title="Sản phẩm & Giá" color="#1B4D3E" />
        {!hasItems && editItems.length > 0 && (
          <div style={{
            padding: '6px 10px',
            background: '#fffbe6',
            border: '1px solid #ffe58f',
            borderRadius: 4,
            fontSize: 11,
            color: '#874d00',
            marginBottom: 8,
          }}>
            ℹ️ Đơn này được tạo theo format cũ (1 mặt hàng). Bạn có thể bấm "Thêm dòng" để bổ sung mặt hàng — đơn sẽ tự convert sang multi-item.
          </div>
        )}
        <>
          <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', border: '1px solid #f0f0f0', borderRadius: 6 }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, color: '#666', minWidth: 110 }}>Grade</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, color: '#666', minWidth: 90 }}>Tấn</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, color: '#666', minWidth: 100 }}>{priceUnitLabel(order.currency)}</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, color: '#666', minWidth: 100 }}>Thành tiền</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, color: '#666', minWidth: 80 }}>KL bành</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, color: '#666', minWidth: 80 }}>Bành/cont</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, color: '#666', minWidth: 130 }}>Đóng gói</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, color: '#666', minWidth: 110 }}>Thanh toán</th>
                    <th style={{ padding: '6px 8px', width: 32 }} />
                  </tr>
                </thead>
                <tbody>
                  {editItems.map((it, idx) => (
                    <tr key={idx} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '4px 6px' }}>
                        <AutoComplete
                          size="small"
                          value={it.grade}
                          style={{ width: '100%' }}
                          placeholder="Chọn hoặc tự nhập"
                          options={SVR_GRADE_OPTIONS.map((g) => ({ value: g.value, label: g.label }))}
                          filterOption={(input, opt) =>
                            String(opt?.value || '').toLowerCase().includes(input.toLowerCase()) ||
                            String(opt?.label || '').toLowerCase().includes(input.toLowerCase())
                          }
                          onChange={(v: string) => {
                            const next = [...editItems]; next[idx] = { ...it, grade: v || '' }; setEditItems(next)
                          }}
                        />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <InputNumber
                          size="small"
                          min={0.01}
                          step={0.01}
                          placeholder="vd: 19.20"
                          value={it.quantity_tons}
                          style={{ width: '100%' }}
                          onChange={(v) => {
                            const next = [...editItems]; next[idx] = { ...it, quantity_tons: Number(v) || 0 }; setEditItems(next)
                          }}
                        />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <InputNumber
                          size="small"
                          min={isVnd(order.currency) ? 1 : 0.01}
                          step={isVnd(order.currency) ? 100000 : 0.01}
                          placeholder={isVnd(order.currency) ? 'vd: 35.000.000' : 'vd: 2150'}
                          value={it.unit_price}
                          style={{ width: '100%' }}
                          {...(isVnd(order.currency) ? vndInputProps : usdInputProps)}
                          onChange={(v) => {
                            const next = [...editItems]; next[idx] = { ...it, unit_price: Number(v) || 0 }; setEditItems(next)
                          }}
                        />
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#1B4D3E' }}>
                        {fmtMoney(it.quantity_tons * it.unit_price, order.currency)}
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <InputNumber
                          size="small"
                          min={1}
                          max={100}
                          value={it.bale_weight_kg}
                          style={{ width: '100%' }}
                          onChange={(v) => {
                            const next = [...editItems]; next[idx] = { ...it, bale_weight_kg: Number(v) || 33.33 }; setEditItems(next)
                          }}
                        />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <InputNumber
                          size="small"
                          min={1}
                          value={it.bales_per_container}
                          style={{ width: '100%' }}
                          onChange={(v) => {
                            const next = [...editItems]; next[idx] = { ...it, bales_per_container: Number(v) || defaultBalesPerContainer(it.bale_weight_kg, order.container_type) }; setEditItems(next)
                          }}
                        />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <Select
                          size="small"
                          value={it.packing_type}
                          style={{ width: '100%' }}
                          onChange={(v) => {
                            const next = [...editItems]; next[idx] = { ...it, packing_type: v }; setEditItems(next)
                          }}
                          options={PACKING_TYPE_OPTIONS}
                        />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <Select
                          size="small"
                          allowClear
                          value={it.payment_terms}
                          style={{ width: '100%' }}
                          onChange={(v) => {
                            const next = [...editItems]; next[idx] = { ...it, payment_terms: v }; setEditItems(next)
                          }}
                          options={Object.entries(PAYMENT_TERMS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                        />
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          disabled={editItems.length <= 1}
                          onClick={() => setEditItems(editItems.filter((_, i) => i !== idx))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#fafafa', fontWeight: 600 }}>
                    <td style={{ padding: '6px 8px', fontSize: 11 }}>Tổng</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{itemsTotalTons.toFixed(2)}</td>
                    <td />
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#1B4D3E' }}>
                      {fmtMoney(itemsTotalUSD, order.currency)}
                    </td>
                    <td colSpan={5} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <Button
              size="small"
              icon={<PlusOutlined />}
              style={{ marginBottom: 12 }}
              onClick={() => setEditItems([
                ...editItems,
                {
                  grade: 'SVR_10',
                  quantity_tons: 0,
                  unit_price: 0,
                  bale_weight_kg: editItems[0]?.bale_weight_kg || 33.33,
                  bales_per_container: editItems[0]?.bales_per_container || defaultBalesPerContainer(editItems[0]?.bale_weight_kg, order.container_type),
                  packing_type: editItems[0]?.packing_type || 'loose_bale',
                },
              ])}
            >
              Thêm dòng
            </Button>
        </>

        {/* Section: Điều khoản */}
        <SectionHeader title="Điều khoản" color="#1B4D3E" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="Incoterm" name="incoterm">
            <Select options={Object.entries(INCOTERM_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
          <Form.Item label="Thanh toán" name="payment_terms">
            <Select
              allowClear
              options={Object.entries(PAYMENT_TERMS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            />
          </Form.Item>
          <Form.Item label="Cảng xếp hàng" name="port_of_loading">
            <Select
              allowClear
              options={PORT_OF_LOADING_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
            />
          </Form.Item>
          <Form.Item label="Cảng đích" name="port_of_destination">
            <Input />
          </Form.Item>
          <Form.Item label="Ngày giao" name="delivery_date">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="Hoa hồng (%)" name="commission_pct" tooltip="Tính theo % tổng giá trị. Dùng % HOẶC USD/MT.">
            <InputNumber min={0} max={20} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Hoa hồng (USD/MT)" name="commission_usd_per_mt" tooltip="Số USD trên mỗi tấn. Dùng khi môi giới tính theo đô/tấn.">
            <InputNumber min={0} max={1000} step={1} style={{ width: '100%' }} />
          </Form.Item>
        </div>

        {/* Bank info bị BỎ khỏi đây — do Phú LV nhập qua Review HĐ workflow.
            Sale KHÔNG nhập bank ở đơn hàng (chỉ Phú LV mới có quyền). */}

        {/* Section: Ghi chú */}
        <Form.Item label="Ghi chú" name="notes">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // VIEW MODE
  // ══════════════════════════════════════════════════════════════

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Action bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <OrderActionButtons order={order} salesRole={salesRole} onSaved={onSaved} tab="contract" size="small" />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {/* Khách mua thêm theo HĐ này → đơn mới gắn HĐ gốc (ẩn khi huỷ / chưa migration; mờ khi gốc chưa có số HĐ) */}
          <ContinueOrderButton order={order} salesRole={salesRole} size="small" />
          <Button size="small" icon={<FileWordOutlined />} onClick={openAnnex}>
            Tạo phụ lục
          </Button>
          {canEdit ? (
            <Button
              type="primary"
              icon={<EditOutlined />}
              size="small"
              onClick={startEdit}
              style={{
                background: '#1B4D3E',
                borderColor: '#1B4D3E',
                color: '#ffffff',
                fontWeight: 500,
              }}
            >
              Chỉnh sửa
            </Button>
          ) : (isLocked && !hasWorkflow) ? (
            <Tag icon={<LockOutlined />} color="default">Đã khóa</Tag>
          ) : null}
        </div>
      {/* ── Nấc 2: Modal Tạo phụ lục (Annex) ── */}
      <Modal
        title="Tạo phụ lục hợp đồng (Annex)"
        open={annexOpen}
        onCancel={() => setAnnexOpen(false)}
        onOk={handleGenerateAnnex}
        okText="Tạo phụ lục (.docx)"
        cancelText="Hủy"
        confirmLoading={annexGenerating}
        okButtonProps={{ icon: <FileWordOutlined />, style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}
        width={620}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Phụ lục giữ đúng mẫu thật (letterhead + chữ ký)."
          description="Máy điền sẵn từ HĐ gốc. Tải Word về → in → ký + đóng dấu (như HĐ chính)."
        />
        <Form form={annexForm} layout="vertical" size="small">
          <Form.Item name="type" label="Loại phụ lục" rules={[{ required: true }]}>
            <Select options={Object.entries(ANNEX_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="orig_contract_no" label="Số HĐ gốc" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="orig_contract_date" label="Ngày HĐ gốc (EN)" tooltip="vd: 11 May 2026">
              <Input placeholder="11 May 2026" />
            </Form.Item>
          </div>
          <Form.Item
            name="new_contract_no"
            label="Số HĐ MỚI (sau khi đổi)"
            rules={[{ required: true, message: 'Nhập số HĐ mới' }]}
            tooltip="vd: HA20260053/ PH"
          >
            <Input placeholder="HA20260053/ PH" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="annex_date" label="Ngày phụ lục (EN)" rules={[{ required: true }]}>
              <Input placeholder="1st June 2026" />
            </Form.Item>
            <Form.Item name="seq" label="Số thứ tự (AC.n)" rules={[{ required: true }]}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="buyer_name" label="Khách hàng (Buyer)" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="buyer_address" label="Địa chỉ Buyer (EN)">
            <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="buyer_registration" label="Registration No. (nếu có)">
              <Input placeholder="2025050202017-02" />
            </Form.Item>
            <Form.Item name="buyer_md" label="Managing Director (nếu có)">
              <Input placeholder="GABRIEL E IGOT" />
            </Form.Item>
          </div>
        </Form>
      </Modal>
      </div>

      {/* ═══ Section: Hợp đồng ═══
          Phương án A cut-over:
          - Đơn dùng workflow mới → ContractWorkflowSection + ContractFileSection
            (Sale up tài liệu bổ sung: PI khách ký, bản scan, docs...). Sale add OK,
            không xóa (canDeleteContract loại role=sale).
          - Đơn cũ → ContractFileSection legacy (upload PDF scan của HĐ chính)
          Khi hasWorkflow=null (đang load) chưa render gì để tránh flash giữa 2 UI.
          - ĐỢT MUA TIẾP (17/11/2026): không ký HĐ mới → file HĐ của GỐC (chỉ xem) + file xác nhận đặt hàng
            của chính đợt; KHÔNG vẽ bản nháp HĐ (DraftContractPreview). */}
      {isChild && (
        <>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            title={`Mua tiếp theo HĐ ${rootNo}${rootDate ? ` (ký ${fmtDate(rootDate)})` : ''} — không cần ký HĐ mới`}
            description={
              <span>
                File HĐ đã ký nằm ở đơn gốc (xem bên dưới).{' '}
                {order.parent_order_id ? (
                  <a onClick={() => openOrder(order.parent_order_id as string, rootNo || 'gốc')}>Mở HĐ gốc {rootNo}</a>
                ) : null}
              </span>
            }
          />
          {/* Owner câu 9: chứng cứ đặt hàng của đợt CHỈ KHUYẾN NGHỊ — nhắc vàng, không chặn */}
          {order.status === 'draft' && ownFileCount === 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              title="Đợt này chưa có chứng cứ đặt hàng (PI khách ký / phụ lục / email)"
              description="Không bắt buộc — nhưng nên đính trước khi bấm Xác nhận đơn, để có căn cứ tấn / giá / ETD riêng của đợt."
            />
          )}
          {hasWorkflow === true && <ContractWorkflowSection salesOrderId={order.id} />}
          {order.parent_order_id && (
            <ContractFileSection
              orderId={order.parent_order_id}
              salesRole={salesRole}
              readOnly
              anchorPrefix="contract-root-group"
              title={`File HĐ gốc (${rootNo})`}
              emptyHint="HĐ gốc chưa có file HĐ đã ký — mở HĐ gốc để đính file."
            />
          )}
          <ContractFileSection
            orderId={order.id}
            salesRole={salesRole}
            title="Xác nhận đặt hàng đợt này — PI khách ký / phụ lục / email (nên có)"
            emptyHint="Chưa có file xác nhận đặt hàng của đợt này."
            uploadLabel="Bấm để chọn file xác nhận đặt hàng (PI khách ký / phụ lục / email — 1–10 file)"
            onCountChange={setOwnFileCount}
          />
        </>
      )}
      {!isChild && hasWorkflow === true && (
        <>
          <ContractWorkflowSection salesOrderId={order.id} />
          <ContractFileSection
            orderId={order.id}
            salesRole={salesRole}
            title="Tài liệu bổ sung"
            emptyHint="Sale up thêm tài liệu (PI khách ký, scan bản gốc, phụ lục...). Chỉ Admin/BGĐ được xóa."
          />
        </>
      )}
      {!isChild && hasWorkflow === false && (
        <>
          {/* Sale lưu nháp chưa trình → vẫn xem được preview SC/PI + tải mock .docx
              ngay từ Detail (không phải bấm "Sửa" để mở lại Compose Studio) */}
          {order.status === 'draft' && <DraftContractPreview order={order} />}
          <ContractFileSection orderId={order.id} salesRole={salesRole} />
        </>
      )}

      {/* Section: Hợp đồng */}
      <SectionHeader title="Hợp đồng" color="#1B4D3E" />
      <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
        {isChild ? (
          <>
            <Descriptions.Item label={`Số đơn · Đợt ${order.continuation_seq ?? ''}`}>
              <strong style={{ fontFamily: 'monospace' }}>{soDisplayCode(order)}</strong>
            </Descriptions.Item>
            <Descriptions.Item label="HĐ gốc">
              {order.parent_order_id ? (
                <a onClick={() => openOrder(order.parent_order_id as string, rootNo || 'gốc')} style={{ fontWeight: 600 }}>{rootNo || '—'}</a>
              ) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Ô CONTRACT NO. trên chứng từ" span={2}>
              {/* Công tắc docs_cite_root: in số HĐ GỐC (mặc định đợt mới) hay số của chính đơn (đợt cũ đã phát chứng từ) */}
              <Radio.Group
                value={order.docs_cite_root !== false ? 'root' : 'own'}
                disabled={!canEdit || savingCite}
                onChange={(e) => handleCiteChange(e.target.value as 'root' | 'own')}
                style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}
              >
                <Radio value="root">Số HĐ gốc ({rootNo || '—'})</Radio>
                <Radio value="own">Số của đơn này ({soDisplayCode(order)})</Radio>
              </Radio.Group>
              <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                Đang in: <b>{contractNoForDocs(order)}</b>{contractDateForDocs(order) ? ` · DATED ${fmtDate(contractDateForDocs(order))}` : ''}
                {' '}— cũng là số khai hải quan. Số chứng từ PKL / WL… vẫn theo số đơn của đợt.
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Ngày HĐ (theo HĐ gốc)" span={2}>
              {fmtDate(rootDate || order.contract_date || order.order_date)}
            </Descriptions.Item>
          </>
        ) : (
          <>
            <Descriptions.Item label="Số HĐ (Contract No.)">
              <strong>{soDisplayCode(order)}</strong>
            </Descriptions.Item>
            <Descriptions.Item label="Ngày HĐ">{fmtDate(order.contract_date || order.order_date)}</Descriptions.Item>
            {fam.children.length > 0 && (
              <Descriptions.Item label="Các đợt mua tiếp" span={2}>
                <Space size={[4, 2]} wrap separator={<Text type="secondary">·</Text>}>
                  {fam.children.map((m) => (
                    <Tooltip key={m.id} title={m.status === 'cancelled' ? 'Đợt đã huỷ' : 'Mở đơn của đợt này'}>
                      <a onClick={() => openOrder(m.id, soDisplayCode(m))} style={{ whiteSpace: 'nowrap' }}>
                        <Text delete={m.status === 'cancelled'} style={{ color: 'inherit' }}>Đợt {m.seq} · {soDisplayCode(m)}</Text>
                      </a>
                    </Tooltip>
                  ))}
                </Space>
              </Descriptions.Item>
            )}
          </>
        )}
        <Descriptions.Item label="Người mua" span={2}>
          {order.customer ? (
            <Space wrap size={[6, 2]}>
              <Tag color="blue">{order.customer.code}</Tag>
              {order.customer.name}
              {order.customer.country && <Tag>{order.customer.country}</Tag>}
              {fam.ready && order.ship_to_customer_id && order.ship_to ? (
                <Text strong>→ {partyShortName(order.ship_to)} <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>(người nhận)</Text></Text>
              ) : null}
            </Space>
          ) : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="PO# KH">{order.customer_po || '—'}</Descriptions.Item>
        <Descriptions.Item label="Grade"><Tag color="green">{order.grade}</Tag></Descriptions.Item>
      </Descriptions>

      <Divider style={{ margin: '12px 0' }} />

      {/* Section: Sản phẩm & Giá */}
      <SectionHeader title="Sản phẩm & Giá" color="#1B4D3E" />
      <Descriptions column={3} size="small" bordered>
        <Descriptions.Item label="Số lượng">{order.quantity_tons} tấn</Descriptions.Item>
        <Descriptions.Item label="Đơn giá">{fmtMoney(order.unit_price, order.currency)}/tấn</Descriptions.Item>
        <Descriptions.Item label="Tổng giá trị">
          <strong style={{ color: '#1B4D3E' }}>{fmtMoney(orderTotalInCurrency(order), order.currency)}</strong>
          {isVnd(order.currency) && totalValueUSD ? <span style={{ fontSize: 11, color: '#999', marginLeft: 6 }}>≈ {fmtMoney(totalValueUSD, 'USD', { decimals: 0 })}</span> : null}
        </Descriptions.Item>
        <Descriptions.Item label="KL bành">{order.bale_weight_kg || 33.33} kg</Descriptions.Item>
        <Descriptions.Item label="Tổng bành">{totalBales}</Descriptions.Item>
        <Descriptions.Item label="Container">
          {containerCount} x {order.container_type || '20ft'}
        </Descriptions.Item>
        {order.bales_per_container && (
          <Descriptions.Item label="Bành/cont">{order.bales_per_container}</Descriptions.Item>
        )}
        <Descriptions.Item label="Đóng gói">
          {PACKING_TYPE_LABELS[order.packing_type as PackingType] || order.packing_type || '—'}
          {order.shrink_wrap ? ' + Shrink wrap' : ''}
          {order.pallet_required ? ' + Pallet' : ''}
        </Descriptions.Item>
      </Descriptions>

      {/* Chi tiết sản phẩm (multi-item) */}
      {order.items && order.items.length > 1 && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <SectionHeader title="Chi tiết sản phẩm" color="#1B4D3E" />
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', border: '1px solid #f0f0f0', borderRadius: 6 }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: '#666' }}>Grade</th>
                <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: 11, color: '#666' }}>Tấn</th>
                <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: 11, color: '#666' }}>{priceUnitLabel(order.currency)}</th>
                <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: 11, color: '#666' }}>Thành tiền</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: '#666' }}>Đóng gói</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: '#666' }}>Thanh toán</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item: any, i: number) => (
                <tr key={item.id || i} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '6px 10px' }}><Tag color="green">{item.grade}</Tag></td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{item.quantity_tons}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{fmtMoney(item.unit_price, order.currency, { decimals: 0 })}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#1B4D3E' }}>
                    {isVnd(order.currency)
                      ? fmtMoney((item.quantity_tons || 0) * (item.unit_price || 0), 'VND')
                      : fmtMoney(item.total_value_usd, 'USD', { decimals: 0 })}
                  </td>
                  {/* Nhãn từ map chung — trước đây in mã thô ('sw plastic_pallet', 'LC_30 + TT_30') */}
                  <td style={{ padding: '6px 10px', fontSize: 11 }}>{item.packing_type ? (PACKING_TYPE_LABELS[item.packing_type as PackingType] || item.packing_type) : '—'}</td>
                  <td style={{ padding: '6px 10px', fontSize: 11 }}>{paymentTermsText(item.payment_terms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <Divider style={{ margin: '12px 0' }} />

      {/* Section: Điều khoản & Ngân hàng */}
      <SectionHeader title="Điều khoản" color="#1B4D3E" />
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="Incoterm">
          <Tag>{INCOTERM_LABELS[order.incoterm as Incoterm] || order.incoterm || '—'}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Thanh toán">
          {order.items && order.items.length > 0
            ? order.items.map((it: any) => it.payment_terms ? it.payment_terms.split(',').map((pt: string) => PAYMENT_TERMS_LABELS[pt as PaymentTerms] || pt).join(' + ') : '').filter(Boolean).join(' / ') || '—'
            : PAYMENT_TERMS_LABELS[order.payment_terms as PaymentTerms] || order.payment_terms || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Cảng xếp hàng">
          {polLabel(order.port_of_loading)}
        </Descriptions.Item>
        <Descriptions.Item label="Cảng đích">{order.port_of_destination || '—'}</Descriptions.Item>
        <Descriptions.Item label="Ngày giao">{fmtDate(order.delivery_date)}</Descriptions.Item>
        <Descriptions.Item label="Hoa hồng">
          {commissionAmt > 0
            ? `${fmtMoney(commissionAmt, 'USD')} (${(order.commission_usd_per_mt || 0) > 0
                ? `$${order.commission_usd_per_mt}/MT`
                : `${order.commission_pct || 0}%`})`
            : '—'}
        </Descriptions.Item>
      </Descriptions>

      {/* Bank info read-only — hiện đầy đủ ở ContractWorkflowSection (workflow card).
          Block view cũ bỏ vì gây nhầm lẫn (Sale tưởng có thể edit). */}
      {(order.bank_name || order.bank_account || order.bank_swift) && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <SectionHeader title="Ngân hàng (legacy)" color="#999" />
          <div style={{
            fontSize: 11, color: '#8c8c8c', fontStyle: 'italic',
            padding: '6px 10px', background: '#fafafa', borderRadius: 4,
          }}>
            {order.bank_name && <>🏦 {order.bank_name} · </>}
            {order.bank_account && <>TK: {order.bank_account} · </>}
            {order.bank_swift && <>SWIFT: {order.bank_swift}</>}
            <br />
            <span style={{ color: '#cf1322' }}>
              ⓘ Đơn cũ. Bank info HĐ mới do Phú LV nhập qua workflow Review HĐ.
            </span>
          </div>
        </>
      )}

      {/* Section: Chỉ tiêu kỹ thuật */}
      <Divider style={{ margin: '12px 0' }} />
      <SectionHeader title="Chỉ tiêu kỹ thuật" color="#666" />
      <Descriptions column={3} size="small" bordered>
        <Descriptions.Item label="DRC">{order.drc_min ?? '—'} ~ {order.drc_max ?? '—'} %</Descriptions.Item>
        <Descriptions.Item label="Moisture">{order.moisture_max ?? '—'} %</Descriptions.Item>
        <Descriptions.Item label="Dirt">{order.dirt_max ?? '—'} %</Descriptions.Item>
        <Descriptions.Item label="Ash">{order.ash_max ?? '—'} %</Descriptions.Item>
        <Descriptions.Item label="Nitrogen">{order.nitrogen_max ?? '—'} %</Descriptions.Item>
        <Descriptions.Item label="Volatile">{order.volatile_max ?? '—'} %</Descriptions.Item>
        <Descriptions.Item label="PRI">{order.pri_min ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Mooney">{order.mooney_max ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Color">{order.color_lovibond_max ?? '—'}</Descriptions.Item>
      </Descriptions>

      {/* Ghi chú */}
      {order.notes && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <SectionHeader title="Ghi chú" color="#666" />
          <div style={{ padding: '8px 12px', background: '#fafafa', borderRadius: 6, fontSize: 13 }}>
            {order.notes}
          </div>
        </>
      )}
    </div>
  )
}

// ── Section header ──
function SectionHeader({ title, color }: { title: string; color: string }) {
  return (
    <div style={{
      fontSize: 12,
      fontWeight: 700,
      textTransform: 'uppercase',
      color,
      letterSpacing: 1,
      marginBottom: 8,
      marginTop: 4,
    }}>
      {title}
    </div>
  )
}
