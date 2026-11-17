// ============================================================================
// palette — MỘT nguồn màu thương hiệu + màu trạng thái cho CẢ antd (src/config/antdTheme.ts)
// lẫn Tailwind (tailwind.config.js). File .js thuần (ESM) vì tailwind.config.js đọc trực tiếp;
// kiểu cho TypeScript ở palette.d.ts bên cạnh.
// Trước 17/11/2026: Tailwind `primary` là xanh dương #2E86AB trong khi antd là xanh lục #1B4D3E
// → nút bg-primary ở HR/mua hàng/đăng nhập lạc tông cả hệ. Màu mới: lấy từ đây, đừng gõ hex.
// ============================================================================
export const palette = {
  brand: '#1B4D3E',        // xanh cao su — nút chính, link, tiêu đề
  brandHover: '#2D8B6E',
  brandActive: '#0D2E25',  // nhấn / nền tối / đầu gradient đậm
  brandBg: '#E8F5F0',      // nền nhạt khối thông tin
  accent: '#E8A838',       // vàng mủ — điểm nhấn phụ
  success: '#52c41a',      // ✓ xong / đã chi / đạt
  warning: '#faad14',      // chờ / sắp hạn
  danger: '#ff4d4f',       // lỗi / huỷ / quá hạn
  info: '#1890ff',         // đã duyệt chờ chi (xem luật màu dòng tiền ở CLAUDE.md)
}

export default palette
