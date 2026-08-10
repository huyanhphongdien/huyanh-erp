// ============================================================================
// DOC LETTERHEAD — Header chung cho MỌI chứng từ tự sinh (khớp HỆT mẫu thật)
// File: src/pages/sales/components/DocLetterhead.tsx
// LOGO trái + khối thông tin công ty căn phải + gạch chân. Dùng chung on-screen.
// ============================================================================
import { LOGO_DATA_URI } from '../../../services/sales/logoAsset'

export default function DocLetterhead() {
  return (
    <div className="doc-company-header" style={{ marginBottom: 16, color: '#000' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <img src={LOGO_DATA_URI} alt="HUY ANH Natural Rubber" style={{ height: 50, width: 'auto' }} />
        <div style={{ textAlign: 'right', lineHeight: 1.4 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>HUY ANH RUBBER COMPANY LIMITED</div>
          <div style={{ fontSize: 11 }}>KHE MA, PHONG DIEN WARD, HUE CITY, VIETNAM</div>
          <div style={{ fontSize: 11 }}>TEL: 054 3774994&nbsp;&nbsp;&nbsp;FAX: 054 3774994</div>
          <div style={{ fontSize: 11 }}>EMAIL: info@huyanh.com&nbsp;&nbsp;&nbsp;WEB: http://huyanhrubber.com.vn</div>
        </div>
      </div>
      <div style={{ borderBottom: '2px solid #000', marginTop: 8 }} />
    </div>
  )
}
