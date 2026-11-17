// ============================================================================
// auctionStatus — MỘT map nhãn + màu trạng thái phiên đấu giá / lượt bid cho cả
// AuctionListPage và AuctionDetailPage (trước đây mỗi trang chép một bản STATUS_MAP).
// Chưa có auctionService riêng → để tạm cạnh 2 trang; khi có service thì dời vào đó.
// Màu theo quy ước EnumTag: default nháp/kết thúc · blue sắp diễn ra · green đang đấu ·
// orange gia hạn · purple đã chọn người thắng · red huỷ.
// File: src/pages/b2b/auctions/auctionStatus.ts (Đợt 3 audit UI 17/11/2026)
// ============================================================================

export const AUCTION_STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  upcoming: 'Sắp diễn ra',
  active: 'Đang đấu giá',
  extended: 'Gia hạn',
  ended: 'Đã kết thúc',
  awarded: 'Đã chọn người thắng',
  cancelled: 'Đã hủy',
}

export const AUCTION_STATUS_COLORS: Record<string, string> = {
  draft: 'default',
  upcoming: 'blue',
  active: 'green',
  extended: 'orange',
  ended: 'default',
  awarded: 'purple',
  cancelled: 'red',
}

/** Dạng cũ { label, color } — giữ cho 2 trang đang đọc STATUS_MAP[x].label/.color */
export const AUCTION_STATUS_MAP: Record<string, { label: string; color: string }> = Object.fromEntries(
  Object.keys(AUCTION_STATUS_LABELS).map((k) => [k, { label: AUCTION_STATUS_LABELS[k], color: AUCTION_STATUS_COLORS[k] }]),
)

export const BID_STATUS_LABELS: Record<string, string> = {
  active: 'Hợp lệ',
  outbid: 'Bị vượt',
  winning: 'Thắng',
  withdrawn: 'Rút',
}

export const BID_STATUS_COLORS: Record<string, string> = {
  active: 'green',
  outbid: 'default',
  winning: 'gold',
  withdrawn: 'red',
}
