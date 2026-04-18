# B2B — Hướng dẫn tích hợp DealCard + realtime sang Portal đại lý

> **Repo target:** `huyanh-b2b-portal` (b2b.huyanhrubber.vn) — repo **RIÊNG**, không phải workspace này
> **Ngày:** 2026-04-18
> **Tiền đề:** Đã chốt 5 cải tiến giao diện DealCard trong ERP (commit sau 2026-04-18)

---

## 1. Vì sao cần tài liệu này

DealCard trong chat giờ có:
- Gradient theo status (processing/accepted/settled/cancelled)
- Progress bar 5 mốc lifecycle
- Buttons động (Duyệt Deal / Tạo quyết toán / Xem phiếu QT / Chi tiết)
- Cảnh báo DRC variance inline
- Auto-patch metadata từ server → realtime UPDATE → UI tự refresh

Phía **đại lý** cần thấy CÙNG thông tin đó, nhưng:
- KHÔNG được duyệt deal, không được tạo quyết toán, không được ứng thêm
- CÓ thể xem chi tiết, xem phiếu QT đã phát hành, ghi nhận giao hàng
- Nhận realtime event khi nhà máy cập nhật deal

---

## 2. File cần copy sang portal

### 2.1 Copy nguyên văn (không cần sửa)
| File nguồn (ERP) | File đích (Portal) |
|---|---|
| `src/components/b2b/DealCard.tsx` | `src/components/DealCard.tsx` |
| `src/types/b2b.constants.ts` | `src/types/b2b.constants.ts` |

### 2.2 Copy + điều chỉnh path
| File nguồn | Sửa gì |
|---|---|
| `src/types/b2b.types.ts` (chỉ phần `DealCardMetadata`) | Giữ nguyên interface, xoá các type portal không cần |

DealCard **chỉ** import từ 2 file trên (sau refactor 2026-04-18) → không kéo theo `supabase` client hay bất kỳ service factory-side nào.

### 2.3 Xác nhận import đúng sau khi copy
```ts
// Trong DealCard.tsx (portal)
import type { DealCardMetadata } from '../types/b2b.types'
import {
  DEAL_STATUS_LABELS,
  DEAL_STATUS_COLORS,
  DEAL_STATUS_GRADIENT,
  PRODUCT_TYPE_LABELS,
  type DealStatus,
} from '../types/b2b.constants'
```

---

## 3. Wiring trong Portal

### 3.1 Render DealCard với `viewerType="partner"`

Các handler **factory-only** sẽ không có effect vì đã gate ở component:

```tsx
// Portal ChatMessageBubble.tsx hoặc tương đương
case 'deal': {
  const dealMeta = message.metadata?.deal as DealCardMetadata
  return (
    <DealCard
      metadata={dealMeta}
      viewerType="partner"            // ← quan trọng
      onViewDetails={() => navigate(`/deals/${dealMeta.deal_id}`)}
      onRecordDelivery={() => openDeliveryModal(dealMeta)}  // optional
      onViewSettlement={() => navigate(`/settlements?deal_id=${dealMeta.deal_id}`)}
      // KHÔNG truyền: onAddAdvance, onAcceptDeal, onCreateSettlement
    />
  )
}
```

### 3.2 Buttons mà partner SẼ thấy

| Button | Điều kiện | Ghi chú |
|---|---|---|
| Giao hàng | `status='processing'` + `onRecordDelivery` truyền vào | Optional |
| Phiếu quyết toán | `status='settled'` + `onViewSettlement` truyền vào | Link sang page xem QT |
| Chi tiết | luôn (nếu `onViewDetails`) | Link sang deal detail page portal |

### 3.3 Buttons mà partner KHÔNG thấy
- Ứng thêm (factory only, đã gate ở code)
- Duyệt Deal (factory only)
- Tạo quyết toán (factory only)

---

## 4. Realtime UPDATE — partner tự động thấy metadata mới

Portal đã có realtime subscribe `b2b.chat_messages` (cùng channel với ERP).
**Không cần thêm subscribe mới** — UPDATE events đến từ:
- Nhà máy nhập kho confirm → `stock_in_count`/`actual_weight_kg` patch vào DealCard
- QC xong → `actual_drc`/`qc_status`/`final_value` patch
- Settlement tạo/duyệt/thanh toán → `settlement_code`/`status` patch
- Deal accepted / cancelled → `status`/`cancel_reason` patch

### 4.1 Handler onUpdate trong portal phải replace message

```tsx
// Portal hook realtime — tương đương useB2BChatRoom trong ERP
subscribeToRoom(roomId, {
  onUpdate: (updated: ChatMessage) => {
    setMessages((prev) => prev.map((m) => m.id === updated.id ? updated : m))
  },
})
```

Nếu portal đang dùng pattern khác (ví dụ `merge`), kiểm tra xem `metadata.deal` có replace đúng không — **không merge** vì server gửi toàn bộ `metadata` mới.

### 4.2 Yêu cầu DB phía portal

Portal dùng chung Supabase project với ERP → migration `b2b_chat_realtime_publication.sql` đã chạy = portal tự động nhận UPDATE.

Verify query:
```sql
SELECT relname,
  CASE relreplident WHEN 'f' THEN 'FULL' ELSE 'OTHER' END AS replica_identity
FROM pg_class
WHERE relnamespace = 'b2b'::regnamespace
  AND relname = 'chat_messages';
-- Expect: FULL
```

### 4.3 RLS — partner chỉ thấy room của mình

Cần verify: partner authenticated vào portal query `b2b_chat_messages` → RLS filter theo `room_id` mà partner có quyền. Nếu policy đang permissive SELECT `USING (true)` (như migration đã tạo cho anon/authenticated), cần siết lại:

```sql
CREATE POLICY partner_select_own_rooms ON b2b.chat_messages
  FOR SELECT TO authenticated
  USING (
    room_id IN (
      SELECT id FROM b2b.chat_rooms
      WHERE partner_id = (auth.jwt() ->> 'partner_id')::uuid
    )
  );
```

**Bàn:** cần audit RLS riêng 1 lần cho partner auth flow — không nằm trong scope doc này.

---

## 5. Checklist triển khai

- [ ] Copy `DealCard.tsx` + `b2b.constants.ts` sang portal repo
- [ ] Copy phần `DealCardMetadata` type
- [ ] Wire DealCard vào chat bubble portal với `viewerType="partner"`
- [ ] Verify realtime UPDATE thấy được bằng test: nhà máy confirm stock-in → card partner tự thay đổi "Đã nhập"
- [ ] Verify buttons factory-only không hiện ở partner view
- [ ] Test cảnh báo DRC variance hiển thị khi |actual − expected| > 3%
- [ ] Test navigation `onViewDetails` / `onViewSettlement` đi đúng route portal

---

## 6. Tương lai — điều cần bàn thêm

### 6.1 "Đại lý acknowledge đã nhận tạm ứng"
Khi nhà máy ứng tiền, DealCard patch `total_advanced`/`balance_due`. Có thể thêm button phía partner:

```tsx
{viewerType === 'partner' && metadata.last_advance_unconfirmed && (
  <Button onClick={() => ackAdvance(metadata.last_advance_id)}>
    Tôi đã nhận tiền
  </Button>
)}
```

Cần backend:
- Trường `confirmed_by_partner_at` trong `b2b_advances`
- Khi partner bấm ack → UPDATE + insert system message "Đại lý xác nhận đã nhận"

### 6.2 Dispute DRC variance
Khi DrcVariance banner hiển thị, thêm 2 nút cho partner:
- **Chấp nhận** → `metadata.drc_ack_by_partner = true`
- **Khiếu nại** → mở modal nhập lý do, tạo `b2b_disputes` row, chặn accept Deal

### 6.3 Subscribe `b2b_deals` UPDATE (ngoài chat_messages)
Hiện portal chỉ subscribe `b2b.chat_messages`. Nếu muốn có kiểu "toast sliding" khi QC xong hoặc deal accepted, subscribe thêm bảng `b2b_deals`:

```ts
supabase.channel(`partner-deals-${partnerId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'b2b_deals',
    filter: `partner_id=eq.${partnerId}`,
  }, (payload) => {
    if (payload.old.status !== payload.new.status) {
      toast.success(`Deal ${payload.new.deal_number}: ${DEAL_STATUS_LABELS[payload.new.status]}`)
    }
  })
  .subscribe()
```

Cần:
- `b2b.deals` vào publication `supabase_realtime`
- REPLICA IDENTITY FULL
- RLS cho partner chỉ thấy deal của mình

---

## 7. Tóm tắt

| Mục | Trạng thái |
|---|---|
| DealCard portable (không còn dep vào dealService) | ✅ Done (2026-04-18) |
| Realtime UPDATE pipeline ERP side | ✅ Done + verified |
| Migration REPLICA IDENTITY FULL | ✅ Có sẵn |
| Partner-side wiring | ⏳ **Chờ apply bên portal repo** |
| Partner ack advance + dispute DRC | ⏳ Cần design thêm |
| Subscribe `b2b_deals` UPDATE cho toast | ⏳ Optional, roadmap |
