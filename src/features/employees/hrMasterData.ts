// ============================================================================
// hrMasterData — cờ khoá Sửa/Xoá danh mục nhân sự (Nhân viên · Phòng ban · Chức vụ).
// Trước Đợt 3 (audit UI 17/11/2026) mỗi trang tự khai `DISABLE_EDIT_DELETE = true` và vẫn vẽ
// 2 nút chết có ổ khoá trên MỖI dòng. Giờ: một cờ, trang ẩn hẳn cột Thao tác + 1 dòng giải thích.
// Đặt false để mở lại nút Sửa/Xoá ở cả 3 trang.
// ============================================================================
export const HR_MASTER_DATA_READONLY: boolean = true

export const HR_MASTER_DATA_READONLY_NOTE = 'Sửa/Xoá đang tạm khoá để giữ toàn vẹn dữ liệu.'
