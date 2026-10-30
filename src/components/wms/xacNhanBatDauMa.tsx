// ============================================================================
// Hộp xác nhận khi khai một mã bắt đầu chạy mà đang có LỆNH khác chạy (SQL p13):
//   mặc định THAY THẾ (kết thúc lệnh cũ) — quyết định chủ DN 30/10; hoặc chạy song song (lệnh riêng);
//   hoặc GỘP mã vào lệnh đang chạy (KHMN-15 đang chạy, thêm 17 → lệnh 15 + 17).
//   Trả về { thayThe, gopVao } hoặc null = hủy.
// File: src/components/wms/xacNhanBatDauMa.tsx
// ============================================================================
import { Modal, Radio, Space, Typography } from 'antd'

export interface XacNhanBatDau { thayThe: boolean; gopVao: string | null }

export function xacNhanBatDauMa(opts: { ma: string; dangChay: { id: string; label: string }[] }): Promise<XacNhanBatDau | null> {
  if (!opts.dangChay.length) return Promise.resolve({ thayThe: true, gopVao: null })
  let chon = 'thay_the'
  return new Promise((resolve) => {
    Modal.confirm({
      title: `Bắt đầu chạy mã ${opts.ma}`,
      okText: 'Bắt đầu',
      cancelText: 'Hủy',
      width: 580,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Typography.Text>Đang chạy: <Typography.Text strong>{opts.dangChay.map((g) => g.label).join(' · ')}</Typography.Text></Typography.Text>
          <Radio.Group defaultValue="thay_the" onChange={(e) => { chon = e.target.value }}>
            <Space direction="vertical">
              <Radio value="thay_the"><b>Thay thế</b> · kết thúc lệnh đang chạy; từ giờ phiếu ca, phiếu chèn, lô TP tự gắn {opts.ma} (mặc định)</Radio>
              <Radio value="song_song">Chạy song song · lệnh riêng cho {opts.ma}, lệnh cũ vẫn chạy (mỗi phiếu chèn phải chọn lệnh)</Radio>
              {opts.dangChay.map((g) => <Radio key={g.id} value={`gop:${g.id}`}>Gộp {opts.ma} vào lệnh <b>{g.label}</b> · chạy chung, chèn tính cho cả lệnh</Radio>)}
            </Space>
          </Radio.Group>
        </div>
      ),
      onOk: () => resolve(chon === 'thay_the' ? { thayThe: true, gopVao: null } : chon === 'song_song' ? { thayThe: false, gopVao: null } : { thayThe: false, gopVao: chon.slice(4) }),
      onCancel: () => resolve(null),
    })
  })
}
