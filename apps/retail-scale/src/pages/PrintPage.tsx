// ============================================================================
// TRANG IN PHIẾU MỦ LẺ
// File: apps/retail-scale/src/pages/PrintPage.tsx
//
// Chỉ MỘT cây DOM cho cả xem trước lẫn bản in (phiếu cân xe render 2 bản → sửa 1 chỗ
// quên chỗ kia). Khi in, CSS ẩn mọi thứ có class .no-print.
//
// ?auto=1 → tự mở hộp thoại in ngay sau khi lưu phiếu (nhưng CHỜ font + ảnh xong trước,
//           nếu không QR/logo in ra ô rỗng).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, Segmented, Space, Spin, Typography } from 'antd'
import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons'
import { supabase } from '@erp/lib/supabase'
import { useCurrentFacility, getFacilityCode } from '@/stores/facilityStore'
import RetailTicketSheet, { type PaperSize } from '@/components/RetailTicketSheet'
import { getLots, getTicket, type RetailTicket, type RetailTicketLot } from '@/services/retailTicketService'

const { Text, Title } = Typography
const PRIMARY = '#1B4D3E'
const PAPER_KEY = 'rs_paper_size'   // key RIÊNG — đừng đụng 'wb_paper_size' của app cân xe

function readPaper(): PaperSize {
  const v = localStorage.getItem(PAPER_KEY)
  return v === 'a5' ? 'a5' : '80mm'
}

/** Thẻ <style> chứa @page động (chiều cao phiếu đo được). Tạo 1 lần, tái dùng. */
const PAGE_SIZE_STYLE_ID = 'rs-page-size'
function ensurePageSizeStyle(): HTMLStyleElement {
  let s = document.getElementById(PAGE_SIZE_STYLE_ID) as HTMLStyleElement | null
  if (!s) {
    s = document.createElement('style')
    s.id = PAGE_SIZE_STYLE_ID
    document.head.appendChild(s)
  }
  return s
}

export default function PrintPage() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const { facility } = useCurrentFacility()

  const [ticket, setTicket] = useState<RetailTicket | null>(null)
  const [lots, setLots] = useState<RetailTicketLot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paper, setPaper] = useState<PaperSize>(readPaper)
  // Tên người LẬP phiếu, tra từ ticket.created_by. `resolved` bật cả khi tra không ra để
  // luồng ?auto=1 biết là đã hỏi xong mà in, không treo mãi.
  const [creatorName, setCreatorName] = useState<string | null>(null)
  const [creatorResolved, setCreatorResolved] = useState(false)

  useEffect(() => {
    if (!ticketId) return
    setLoading(true)
    Promise.all([getTicket(ticketId), getLots(ticketId)])
      .then(([t, l]) => {
        if (!t) setError('Không tìm thấy phiếu')
        setTicket(t)
        setLots(l)
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [ticketId])

  // Tra tên người lập phiếu. Query RIÊNG, không embed vào TICKET_COLS: created_by KHÔNG có
  // FK sang scale_operators nên PostgREST không join được (lỗi PGRST200).
  useEffect(() => {
    if (!ticket) return
    if (!ticket.created_by) {
      setCreatorName(null)
      setCreatorResolved(true)
      return
    }
    let alive = true
    // Lưới an toàn: nếu request TREO (wifi bãi cân rớt giữa chừng, captive portal nuốt kết
    // nối) thì promise không bao giờ settle và luồng ?auto=1 sẽ không bao giờ bật hộp thoại
    // in. Quá 2,5s thì in với tên trống — đúng tinh thần "tra không ra thì để trống".
    const timeout = setTimeout(() => { if (alive) setCreatorResolved(true) }, 2500)
    supabase
      .from('scale_operators')
      .select('name')
      .eq('id', ticket.created_by)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        clearTimeout(timeout)
        // Tra không ra (nhân viên đã nghỉ → policy anon lọc is_active) thì để TRỐNG.
        // Tuyệt đối không fallback về người đang đăng nhập — đó chính là con bug cần tránh.
        setCreatorName((data as { name?: string } | null)?.name ?? null)
        setCreatorResolved(true)
      })
    return () => { alive = false; clearTimeout(timeout) }
  }, [ticket])

  // Dọn thẻ @page động khi rời trang in — đừng để rule 72mm sống sang màn khác của SPA.
  useEffect(() => () => { document.getElementById(PAGE_SIZE_STYLE_ID)?.remove() }, [])

  const doPrint = useCallback(async () => {
    // Chờ font + mọi <img> tải xong rồi mới in — tránh in ra ô trắng.
    // (QR là SVG inline nên không nằm trong document.images, không cần chờ.)
    try { await (document as Document & { fonts?: FontFaceSet }).fonts?.ready } catch { /* ignore */ }
    const imgs = Array.from(document.images).filter(i => !i.complete)
    if (imgs.length) {
      await Promise.all(
        imgs.map(i => new Promise<void>(res => {
          i.addEventListener('load', () => res(), { once: true })
          i.addEventListener('error', () => res(), { once: true })
        })),
      )
    }

    // ⚠ CSS KHÔNG CÓ chiều cao "auto" cho @page: grammar là `auto | <length>{1,2} | ...`,
    // `auto` phải đứng MỘT MÌNH. Viết `size: 72mm auto` là declaration KHÔNG HỢP LỆ và bị
    // Chrome vứt bỏ im lặng → khổ giấy rơi về mặc định của máy in đang chọn.
    // Cách duy nhất để phiếu "dài bao nhiêu in bấy nhiêu" là ĐO chiều cao thật rồi bơm số
    // đo được vào @page ngay trước khi in. Ghi thẳng DOM chứ không qua React state — setState
    // là bất đồng bộ, style chưa kịp commit thì window.print() đã chạy.
    const styleEl = ensurePageSizeStyle()
    if (paper === '80mm') {
      const el = document.querySelector('.rs-sheet') as HTMLElement | null
      if (el) {
        const mm = Math.ceil((el.getBoundingClientRect().height / 96) * 25.4) + 2  // +2mm dư
        styleEl.textContent = `@media print { @page { size: 72mm ${mm}mm; margin: 0 } }`
      }
    } else {
      // PHẢI dọn khi đổi sang A5: nếu để nguyên, rule 72mm của phiếu TRƯỚC vẫn sống trong
      // <head> suốt phiên SPA — rời trang in rồi Ctrl+P ở màn khác là ra khổ 72mm, và tính
      // đúng-sai của A5 phụ thuộc vào vị trí thẻ <style> trong cây DOM (rất giòn).
      styleEl.textContent = ''
    }

    window.print()
  }, [paper])

  // Tự in sau khi lưu phiếu (?auto=1). Phải CHỜ tra xong tên người lập, nếu không bản in
  // đầu tiên (bản giao cho khách) sẽ trống tên nhân viên cân.
  const autoPrintedRef = useRef(false)
  useEffect(() => {
    if (loading || !ticket || sp.get('auto') !== '1') return
    if (!creatorResolved) return
    if (autoPrintedRef.current) return   // StrictMode chạy effect 2 lần ở dev → chặn in đôi
    autoPrintedRef.current = true
    const t = setTimeout(doPrint, 250)
    return () => clearTimeout(t)
  }, [loading, ticket, sp, doPrint, creatorResolved])

  function changePaper(v: PaperSize) {
    setPaper(v)
    try { localStorage.setItem(PAPER_KEY, v) } catch { /* ignore */ }
  }

  const printCss = `
    .print-only { display: block; }
    @media screen {
      /* Bóng đổ + nền giấy CHỈ tồn tại trên màn hình. Trước đây đặt inline nên nó lọt ra
         bản in thành vệt xám quanh mép phiếu — đúng chỗ dao cắt. */
      .print-only { background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
    }
    @media print {
      .no-print { display: none !important; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }

      /* Nền xám + padding của khung màn hình PHẢI bị gỡ khi in:
         - nền #f0f2f5 cao 100vh in ra thành mảng xám phủ kín trang (giấy nhiệt: lấm tấm
           đen suốt chiều dài, mòn đầu in);
         - padding 16px ≈ 4,2mm ăn vào khổ 72mm, đẩy phiếu tràn khỏi vùng in, xén mép phải. */
      .rs-page { background: #fff !important; min-height: 0 !important; }
      .rs-body { padding: 0 !important; max-width: none !important; }
      .rs-body .ant-space { row-gap: 0 !important; gap: 0 !important; }
      .print-only { box-shadow: none !important; background: transparent !important; }

      /* Khổ A5 khai tĩnh ở đây; khổ nhiệt được bơm động trong doPrint() vì cần chiều cao
         thật của phiếu (CSS không có size auto theo chiều cao). */
      ${paper === 'a5' ? '@page { size: A5; margin: 6mm; }' : ''}

      /* Lớp phòng hờ khi phiếu vẫn bị ngắt trang (chiều dài vượt form vật lý của driver):
         đừng để điểm ngắt rơi vào giữa bảng bao, khối tiền hay khối chữ ký. */
      .rs-sheet table { break-inside: avoid; }
      .rs-sheet thead { display: table-header-group; }
      .rs-keep { break-inside: avoid; }

      /* KHÔNG đặt print-color-adjust cho bộ chọn universal: nó ép in cả nền xám của khung
         lẫn bóng đổ. Phiếu chỉ có chữ/viền #000 (foreground) nên thực ra không cần, giữ lại
         đúng phạm vi phiếu để phòng khi sau này thêm dải đen làm tiêu đề.
         ⚠ TUYỆT ĐỐI không gõ dấu backtick trong khối comment này — nó nằm TRONG template
         literal, một backtick là đóng chuỗi sớm và printCss biến thành NaN (mất sạch CSS in
         mà build vẫn xanh, vì phép nhân 2 chuỗi vẫn là JS hợp lệ). */
      .rs-sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Space direction="vertical" align="center">
          <Spin size="large" />
          <Text type="secondary">Đang tải phiếu...</Text>
        </Space>
      </div>
    )
  }

  if (error || !ticket) {
    return (
      <div style={{ padding: 24 }}>
        <Alert type="error" showIcon message={error || 'Không tìm thấy phiếu'} />
        <Button style={{ marginTop: 12 }} onClick={() => navigate('/')}>Về danh sách</Button>
      </div>
    )
  }

  return (
    <div className="rs-page" style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <style>{printCss}</style>

      <div className="no-print" style={{ background: PRIMARY, padding: '10px 20px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} style={{ color: '#fff' }}>
            Về danh sách
          </Button>
          <Title level={5} style={{ color: '#fff', margin: 0, flex: 1 }}>In phiếu {ticket.code}</Title>
          <Segmented
            value={paper}
            onChange={v => changePaper(v as PaperSize)}
            options={[
              { label: 'Nhiệt 80mm', value: '80mm' },
              { label: 'A5', value: 'a5' },
            ]}
          />
          <Button type="primary" icon={<PrinterOutlined />} onClick={doPrint}>In</Button>
        </div>
      </div>

      <div className="rs-body" style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {paper === '80mm' && (
            <Card className="no-print" size="small" style={{ borderRadius: 12 }}>
              <Text strong>Cài máy in nhiệt (làm 1 lần trên máy trạm):</Text>
              <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: 13 }}>
                <li>Trong hộp thoại in: <b>Lề = Không</b>, bỏ tick <b>Đầu trang và chân trang</b></li>
                <li>
                  Khổ giấy của driver: đặt <b>custom rộng 72mm, dài TỐI ĐA</b> mà driver cho phép.
                  {' '}<b>Đừng chọn 72 × 297mm</b> — phiếu nhiều bao dài hơn 297mm sẽ bị ngắt
                  trang và máy cắt ngang giữa phiếu.
                </li>
                <li>Đặt máy in nhiệt làm <b>máy in mặc định</b> để phiếu ra thẳng</li>
              </ul>
            </Card>
          )}

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {/* Nền + bóng đổ đặt trong @media screen của printCss, KHÔNG inline — inline là
                lọt ra bản in. */}
            <div className="print-only">
              <RetailTicketSheet
                ticket={ticket}
                lots={lots}
                paper={paper}
                facilityCode={facility?.code || getFacilityCode()}
                facilityName={facility?.name}
                /* Tên người LẬP phiếu (ticket.created_by), KHÔNG phải người đang đăng nhập —
                   in lại phiếu ca sáng vào ca chiều mà ghi tên người ca chiều là sai chứng từ. */
                operatorName={ticket.created_by ? creatorName : null}
              />
            </div>
          </div>

          <div className="no-print" style={{ textAlign: 'center' }}>
            <Button type="primary" size="large" onClick={() => navigate('/weigh')} style={{ background: PRIMARY, borderColor: PRIMARY }}>
              Cân khách tiếp theo →
            </Button>
          </div>
        </Space>
      </div>
    </div>
  )
}
