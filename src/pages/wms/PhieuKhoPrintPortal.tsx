// ============================================================================
// PhieuKhoPrintPortal — bản in A4 của phiếu NHẬP / XUẤT kho (Đợt 3 audit UI 17/11/2026:
// nút "In phiếu" ở 2 trang chi tiết trước đây không có onClick).
// Vì sao portal ra <body> thay vì khối `.print-only` nằm trong trang:
//  • vùng nội dung TabbedWorkspace là `position:relative; overflow:hidden` (tab thêm `overflow:auto`)
//    → khối `position:absolute` trong trang bị cắt còn ~1 trang giấy. Portal nằm NGOÀI #root nên
//    phiếu nhiều dòng in tràn sang trang sau tự nhiên, không sinh trang trắng thừa.
//  • tab keep-alive giữ các trang khác mounted (display:none): chỉ portal của trang ĐANG HIỆN được
//    đánh dấu lúc `beforeprint` → in ở trang khác không bị bản in này đè, cũng không bị ẩn nhầm.
// @page A4 chỉ chèn vào <head> trong lúc chính bản in này in (beforeprint → afterprint), không để sẵn — để sẵn là
// đè khổ giấy của trang in khác đang mở (vd nhãn lô A5).
// Dùng: <PhieuKhoPrintPortal rootRef={refCủaTrang}><BanIn … /></PhieuKhoPrintPortal> + window.print()
// ============================================================================
import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

const PRINT_CSS = `
  .phieu-kho-portal { display: none; }
  @media print {
    body.in-phieu-kho > *:not(.phieu-kho-portal[data-in="1"]) { display: none !important; }
    body.in-phieu-kho > .phieu-kho-portal[data-in="1"] {
      display: block !important;
      /* đệm riêng: trang in khác đang mở có thể đặt @page margin:0 */
      padding: 8mm; box-sizing: border-box; background: #fff;
    }
    /* trang khác (khuôn .print-only) có thể đặt body * { visibility:hidden } — bật lại cho bản in này */
    body.in-phieu-kho > .phieu-kho-portal[data-in="1"],
    body.in-phieu-kho > .phieu-kho-portal[data-in="1"] * { visibility: visible !important; }
    body.in-phieu-kho { background: #fff !important; }
  }
`

export default function PhieuKhoPrintPortal({ rootRef, children }: {
  /** ref của khối gốc trang — để biết trang có đang hiện không (tab ẩn → offsetParent null) */
  rootRef: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const [el] = useState(() => {
    const d = document.createElement('div')
    d.className = 'phieu-kho-portal'
    return d
  })

  useEffect(() => {
    document.body.appendChild(el)
    // Khổ A4 chỉ gắn trong lúc CHÍNH bản in này in (chèn cuối <head> để thắng @page của trang in khác đang mounted
    // ẩn, vd nhãn lô A5 ngang); không đặt margin — trang nào cần lề 0 tự thêm (xem WeighbridgeDetailPage).
    const pageStyle = document.createElement('style')
    pageStyle.textContent = '@page { size: A4; }'
    const before = () => {
      if (rootRef.current?.offsetParent) {
        el.dataset.in = '1'
        document.body.classList.add('in-phieu-kho')
        document.head.appendChild(pageStyle)
      }
    }
    const after = () => {
      if (el.dataset.in) {
        delete el.dataset.in
        document.body.classList.remove('in-phieu-kho')
        pageStyle.remove()
      }
    }
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
      after()
      el.remove()
    }
  }, [el, rootRef])

  return createPortal(<><style>{PRINT_CSS}</style>{children}</>, el)
}
