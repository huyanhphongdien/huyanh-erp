// ============================================================================
// Hộp xác nhận khi khai một mã bắt đầu chạy mà đang có mã khác chạy:
//   mặc định THAY THẾ (kết thúc mã cũ) — quyết định chủ DN 30/10/2026; tick "chạy chung" để giữ mã cũ.
//   Trả về: true = thay thế · false = chạy chung · null = hủy
// File: src/components/wms/xacNhanBatDauMa.tsx
// ============================================================================
import { Checkbox, Modal, Typography } from 'antd'

export function xacNhanBatDauMa(opts: { ma: string; dangChay: string[] }): Promise<boolean | null> {
  if (!opts.dangChay.length) return Promise.resolve(true)
  let chung = false
  return new Promise((resolve) => {
    Modal.confirm({
      title: `Bắt đầu chạy mã ${opts.ma}`,
      okText: `Thay thế · kết thúc ${opts.dangChay.join(', ')}`,
      cancelText: 'Hủy',
      width: 520,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Typography.Text>Đang chạy: <Typography.Text strong>{opts.dangChay.join(', ')}</Typography.Text>. Mặc định máy sẽ <b>kết thúc</b> các mã này và từ giờ phiếu ca, phiếu chèn, lô thành phẩm tự gắn <b>{opts.ma}</b>.</Typography.Text>
          <Checkbox onChange={(e) => { chung = e.target.checked }}>Chạy chung với mã đang chạy (không kết thúc, ca sau phải tự chọn mã)</Checkbox>
        </div>
      ),
      onOk: () => resolve(!chung),
      onCancel: () => resolve(null),
    })
  })
}
