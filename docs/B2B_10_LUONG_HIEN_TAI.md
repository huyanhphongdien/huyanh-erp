# Quy trình B2B — 10 Luồng Hiện Tại

> **Hệ thống:** ERP Huy Anh Rubber
> **Module:** B2B (Thu mua mủ cao su từ Đại lý)
> **Ngày cập nhật:** 2026-04-18
> **Phạm vi:** Tất cả luồng (flows) trong module B2B từ lúc tạo Demand đến Settlement/Cancel

---

## Mục lục

1. [Luồng Nhu cầu (Demand)](#luồng-1-nhu-cầu-demand)
2. [Luồng Chào giá (Offer)](#luồng-2-chào-giá-offer)
3. [Luồng Chat + Booking](#luồng-3-chat--booking)
4. [Luồng Vòng đời Deal](#luồng-4-vòng-đời-deal)
5. [Luồng Tạm ứng (Advance)](#luồng-5-tạm-ứng-advance)
6. [Luồng Quyết toán (Settlement)](#luồng-6-quyết-toán-settlement)
7. [Luồng Thanh toán từng phần (Partial Payment)](#luồng-7-thanh-toán-từng-phần-partial-payment)
8. [Luồng Sổ cái (Ledger)](#luồng-8-sổ-cái-ledger)
9. [Luồng Cảnh báo DRC (Variance)](#luồng-9-cảnh-báo-drc-variance)
10. [Luồng Hủy Deal (Cancel)](#luồng-10-hủy-deal-cancel)
11. [Tổng quan liên kết 10 luồng](#tổng-quan-liên-kết-10-luồng)

---

## LUỒNG 1: NHU CẦU (Demand)

**Mục đích:** Nhà máy công bố nhu cầu thu mua mủ.

**Người xử lý:** Thu mua (ERP)

**Entity:** `b2b_demands`
**Service:** `src/services/b2b/demandService.ts`

```
┌─────────────────┐
│  👤 Thu mua     │
│  (ERP)          │
└────────┬────────┘
         │ Tạo Demand
         ▼
┌──────────────────────────────────┐
│  📋 b2b_demands                   │
│  ─────────────────                │
│  code:      DM-2604-0001          │
│  product:   Mủ đông                │
│  quantity:  50 tấn                 │
│  price:     45,000 VNĐ/kg khô      │
│  deadline:  30/04/2026             │
│  status:    open                   │
└────────┬─────────────────────────┘
         │ Publish
         ▼
┌──────────────────────────────────┐
│  🌐 Portal b2b.huyanhrubber.vn    │
│  → Đại lý xem danh sách Demand     │
└──────────────────────────────────┘
```

---

## LUỒNG 2: CHÀO GIÁ (Offer)

**Mục đích:** Đại lý gửi báo giá cho Demand.

**Người xử lý:** Đại lý (Portal) → Thu mua (ERP)

**Entity:** `b2b_demand_offers`

```
┌─────────────────┐                ┌─────────────────┐
│  🏢 Đại lý       │                │  👤 Thu mua     │
│  (Portal)        │                │  (ERP)          │
└────────┬────────┘                └────────▲────────┘
         │                                   │
         │ 1. Xem Demand                     │
         │ 2. Gửi Offer                      │ 4. Review
         │    (giá, số lượng)                │
         ▼                                   │
┌──────────────────────────────┐             │
│  💰 b2b_demand_offers         │             │
│  status: pending              │─────────────┘
└──────────────┬───────────────┘
               │ 5. Decision
         ┌─────┴─────┐
         ▼           ▼
    ┌────────┐  ┌─────────┐
    │ ACCEPT │  │ REJECT  │
    └───┬────┘  └─────────┘
        │
        │ → mở Chat để chốt
        ▼
   [Sang LUỒNG 3]
```

---

## LUỒNG 3: CHAT + BOOKING

**Mục đích:** Chốt chi tiết giao dịch qua chat và tạo Deal.

**Người xử lý:** Đại lý (Portal) → Thu mua (ERP)

**Files:**
- `src/components/b2b/ConfirmDealModal.tsx`
- `src/services/b2b/dealConfirmService.ts`
- `src/services/b2b/chatMessageService.ts`

```
┌─────────────────┐                    ┌─────────────────┐
│  🏢 Đại lý       │                    │  👤 Thu mua     │
│  (Portal)        │ ◄─── 💬 Chat ───►  │  (ERP)          │
└────────┬────────┘                    └────────┬────────┘
         │                                       │
         │ 1. Gửi BookingCard                   │
         │    ┌──────────────────────┐          │
         │    │ 📌 Phiếu chốt mủ     │          │
         │    │ Loại: Mủ đông        │          │
         │    │ Số lượng: 50 tấn     │          │
         │    │ DRC dự kiến: 62%     │          │
         │    │ Giá: 45k/kg khô      │          │
         │    │ Giao: 25/04/2026     │          │
         │    │ Status: pending      │          │
         │    └──────────┬───────────┘          │
         │               │                       │
         │               ▼                       │
         │    [b2b_chat_messages                │
         │     message_type='booking']           │
         │                                       │
         │                     2. Xem + Click ◄──┘
         │                        "Xác nhận"
         │                              │
         │                              ▼
         │                   ┌───────────────────┐
         │                   │ ConfirmDealModal   │
         │                   │ - Giá cuối         │
         │                   │ - Có/không ứng?    │
         │                   │ - Số tiền ứng      │
         │                   └─────────┬─────────┘
         │                             │
         │                             ▼
         │                      [Sang LUỒNG 4]
```

---

## LUỒNG 4: VÒNG ĐỜI DEAL

**Mục đích:** Quản lý trạng thái của Deal từ tạo đến kết thúc.

**Người xử lý:** Thu mua + Quản lý + Kế toán

**File:** `src/services/b2b/dealService.ts:505-529`

```
   ┌──────────┐
   │ pending  │  ← Tạo từ BookingCard
   └────┬─────┘
        │ startProcessing()
        ▼
   ┌────────────┐       ┌────────────────────────┐
   │ processing │◄──────┤ Giai đoạn sản xuất:    │
   └────┬───────┘       │ - Nhập kho (stock-in)   │
        │               │ - QC test DRC           │
        │               │ - Tạm ứng (optional)    │
        │               └────────────────────────┘
        │
        │ acceptDeal()
        │ ⚠️ ĐIỀU KIỆN: actual_weight > 0
        │                actual_drc > 0
        │                qc_status = 'passed'
        ▼
   ┌──────────┐
   │ accepted │
   └────┬─────┘
        │ settleDeal()
        ▼
   ┌──────────┐
   │ settled  │  ← Đã quyết toán xong
   └──────────┘

   ┌───────────────────────────────────────────┐
   │ Bất kỳ giai đoạn nào → cancelDeal()       │
   │  → ┌────────────┐                         │
   │    │ cancelled  │                         │
   │    └────────────┘                         │
   └───────────────────────────────────────────┘
```

### Status transitions

| Từ | Tới | Function | Điều kiện |
|----|-----|----------|-----------|
| pending | processing | `startProcessing()` | (không kiểm tra) |
| processing | accepted | `acceptDeal()` | ⚠️ Code hiện tại KHÔNG check weight/drc |
| accepted | settled | `settleDeal()` | Qua `autoSettlementService` |
| * | cancelled | `cancelDeal()` | Không rollback side effects |

---

## LUỒNG 5: TẠM ỨNG (Advance)

**Mục đích:** Ứng tiền trước cho đại lý trong quá trình giao hàng.

**Người xử lý:** Kế toán

**File:** `src/services/b2b/advanceService.ts`

### Cách 1: Tạo tự động khi confirm Deal

```
  confirmDealFromChat (has_advance=true)
             │
             ▼
  ┌──────────────────────────┐
  │ 💵 b2b_advances           │
  │ status = 'paid' ⚡ ngay    │
  │ amount = 500,000,000 VNĐ  │
  └──────────┬───────────────┘
             │
             ▼
  ┌──────────────────────────┐
  │ 📘 b2b_partner_ledger     │
  │ entry_type = 'advance'    │
  │ CREDIT = 500,000,000      │
  └──────────────────────────┘
```

### Cách 2: Tạo thủ công

```
  [Kế toán] → Tab "Tạm ứng" → "Ứng thêm"
             │
             ▼
    createAdvance()
             │
             ▼
     ┌────────────┐
     │  pending   │
     └─────┬──────┘
           │ approveAdvance()
           ▼
     ┌────────────┐
     │  approved  │
     └─────┬──────┘
           │ markPaid()
           ▼
     ┌────────────┐        ┌───────────────────┐
     │   paid     │───────►│ Ghi Ledger CREDIT │
     └────────────┘        └───────────────────┘
```

### ⚠️ Bug hiện tại

- Cách 1 ghi ledger **NGAY** trong `confirmDealFromChat`
- Nếu sau đó gọi `markPaid()` lại → **DOUBLE ledger entry**
- Cần sửa: Cách 1 chỉ tạo advance, để `markPaid()` ghi ledger

---

## LUỒNG 6: QUYẾT TOÁN (Settlement)

**Mục đích:** Tính tổng tiền hàng, trừ tạm ứng, chốt số tiền cần trả.

**Người xử lý:** Kế toán

**Files:**
- `src/services/b2b/autoSettlementService.ts`
- `src/services/b2b/settlementService.ts`

```
[Kế toán] → Deal Detail → "Tạo phiếu quyết toán"
             │
             ▼
  ┌──────────────────────────────────────────────────┐
  │ 🧮 autoSettlementService.createAutoSettlement()  │
  │ ─────────────────────────────────────────────    │
  │ gross       = weight × (DRC/100) × price         │
  │             = 50,000 × (62/100) × 45,000         │
  │             = 1,395,000,000 VNĐ                   │
  │                                                   │
  │ advances    = Σ(advances.amount WHERE paid)       │
  │             = 500,000,000 VNĐ                     │
  │                                                   │
  │ balance_due = gross − advances                    │
  │             = 895,000,000 VNĐ                     │
  └──────────────────┬───────────────────────────────┘
                     │
                     ▼
          ┌─────────────────┐
          │ 📄 Settlement    │
          │ [draft]          │
          └────────┬────────┘
                   │ approveSettlement()
                   ▼
          ┌─────────────────┐       ┌───────────────────┐
          │  [approved]      │──────►│ Ledger DEBIT      │
          └────────┬────────┘       │ settlement type    │
                   │                └───────────────────┘
                   │ markAsPaid()
                   ▼
          ┌─────────────────┐       ┌───────────────────┐
          │  [paid]          │──────►│ Ledger CREDIT     │
          └────────┬────────┘       │ payment type       │
                   │                └───────────────────┘
                   │ Auto
                   ▼
          ┌─────────────────┐
          │ Deal [settled]   │
          └─────────────────┘
```

### ⚠️ Bug hiện tại

- Settlement status enum có `pending` nhưng **KHÔNG** có flow draft → pending
- Chỉ có: draft → approved → paid
- `pending` là orphan status

---

## LUỒNG 7: THANH TOÁN TỪNG PHẦN (Partial Payment)

**Mục đích:** Trả tiền cho đại lý theo nhiều đợt.

**Người xử lý:** Kế toán

**File:** `src/services/b2b/paymentService.ts`

```
Settlement [approved] — balance_due = 895,000,000 VNĐ
                 │
                 ▼
  Đợt 1:  Ngày 20/04 → Trả 300,000,000
           │
           ▼
   createPayment() → b2b_settlement_payments
                     └─ amount: 300,000,000
                        method: bank
                        txn_code: BK-20240420

  Đợt 2:  Ngày 25/04 → Trả 300,000,000
           ↓
         createPayment() → b2b_settlement_payments

  Đợt 3:  Ngày 28/04 → Trả 295,000,000 (nốt)
           ↓
         createPayment() → b2b_settlement_payments
           ↓
         markAsPaid(settlement) ← khi đã đủ
           ↓
         Settlement [paid]
```

### ⚠️ Lưu ý

- `createPayment` KHÔNG tự động:
  - Update settlement status
  - Ghi ledger
- Cần `markAsPaid()` riêng khi đã thu đủ

---

## LUỒNG 8: SỔ CÁI (Ledger)

**Mục đích:** Ghi nhận tất cả giao dịch tiền với đại lý.

**Người xử lý:** Tự động (system) + Kế toán (adjustment)

**File:** `src/services/b2b/ledgerService.ts`
**Entity:** `b2b_partner_ledger`

### Ví dụ Ledger cho 1 Deal

| DATE     | TYPE       | DEBIT          | CREDIT         | BALANCE         |
|----------|------------|----------------|----------------|-----------------|
| 01/04/26 | advance    |                | 500,000,000    | -500,000,000    |
| 25/04/26 | settlement | 1,395,000,000  |                | 895,000,000     |
| 28/04/26 | payment    |                | 895,000,000    | 0               |

### Quy ước

```
BALANCE > 0 → Nhà máy NỢ đại lý (công nợ)
BALANCE < 0 → Đại lý NỢ nhà máy (chưa giao đủ)
BALANCE = 0 → Cân bằng
```

### Các entry types

| Type | DEBIT/CREDIT | Sự kiện |
|------|--------------|---------|
| `advance` | CREDIT | Ứng tiền cho đại lý |
| `settlement` | DEBIT | Duyệt phiếu quyết toán |
| `payment` | CREDIT | Trả tiền |
| `adjustment` | DEBIT/CREDIT | Điều chỉnh thủ công |
| `opening_balance` | DEBIT/CREDIT | Số dư đầu kỳ |

### ⚠️ Bug hiện tại

- `running_balance` KHÔNG được tính tự động trong code hoặc DB trigger
- Cần thêm trigger DB hoặc recalc logic

---

## LUỒNG 9: CẢNH BÁO DRC (Variance)

**Mục đích:** Cảnh báo khi DRC thực tế khác xa so với dự kiến.

**Người xử lý:** Tự động (hiển thị) + Kế toán (quyết định)

**File:** `src/services/b2b/drcVarianceService.ts`

```
  QC đo DRC batch:
  ┌─────────────────────────────┐
  │ Batch 1: 58% × 20,000 kg    │
  │ Batch 2: 61% × 15,000 kg    │
  │ Batch 3: 59% × 15,000 kg    │
  └─────────────────────────────┘
                │
                ▼
   updateDealActualDrc():
   ┌────────────────────────────────────┐
   │ actual_drc = Σ(drc × weight)       │
   │            / Σ(weight)              │
   │            = 59.15%                  │
   └────────────┬───────────────────────┘
                │ So sánh
                ▼
   ┌────────────────────────────────────┐
   │ expected_drc (Deal đã chốt): 62%   │
   │ actual_drc (thực tế):        59.15% │
   │ variance = -2.85%                   │
   └────────────┬───────────────────────┘
                │
        ┌───────┴───────┐
        │               │
        ▼               ▼
   |var| ≤ 3%        |var| > 3%
        │               │
        ▼               ▼
   ✅ OK         ⚠️ DrcVarianceCard
                   (hiển thị cảnh báo
                    trong Deal Detail)
```

### ⚠️ Lưu ý

- Chỉ **CẢNH BÁO**, không tự động giảm giá
- Kế toán phải quyết định có trừ giá hay không

---

## LUỒNG 10: HỦY DEAL (Cancel)

**Mục đích:** Hủy Deal khi không tiếp tục giao dịch.

**Người xử lý:** Thu mua / Quản lý

**File:** `src/services/b2b/dealService.ts:529`

```
  Deal ở bất kỳ status: pending | processing | accepted
                 │
                 │ cancelDeal(deal_id)
                 ▼
          ┌──────────────┐
          │  cancelled   │
          └──────────────┘
```

### ⚠️ Side effects KHÔNG tự động xử lý

| Đối tượng | Tình trạng sau cancel |
|-----------|----------------------|
| 💵 Advances đã paid | Tiền đã chi, không rollback |
| 📘 Ledger entries | Vẫn giữ nguyên, cần adjustment |
| 📦 Stock-in đã nhập | Kho vẫn còn hàng, cần xuất thủ công |
| 💬 Chat room | Không đóng, không archive |

### 🚨 RISK

Cancel giữa chừng có thể để lại dữ liệu orphan. Nên có checklist cleanup:
1. Thu hồi tạm ứng (nếu có)
2. Tạo adjustment entry đóng ledger
3. Xuất kho hoàn trả (nếu còn)
4. Archive chat room

---

## TỔNG QUAN LIÊN KẾT 10 LUỒNG

```
        Demand (1)
           │
           ▼
        Offer (2)
           │
           ▼
    Chat + Booking (3)
           │
           ▼
    ┌──────────────────────────────────┐
    │         Deal Lifecycle (4)        │
    │  pending → processing → accepted  │
    │              ↓              ↓     │
    │          Advance (5)    Settlement│
    │              ↓             (6)    │
    │          Ledger (8)         ↓     │
    │              ↓          Payment   │
    │          DRC Alert (9)    (7)     │
    │                             ↓     │
    │                         Ledger(8) │
    │                             ↓     │
    │                         settled   │
    └──────────────────────────────────┘
                  │
                  ▼
            Cancel (10) ← có thể xảy ra bất kỳ lúc nào
```

---

## TÓM TẮT BẢNG 10 LUỒNG

| # | Luồng | Người xử lý chính | Service chính |
|---|-------|-------------------|---------------|
| 1 | Nhu cầu (Demand) | Thu mua | `demandService.ts` |
| 2 | Chào giá (Offer) | Đại lý → Thu mua | (demand_offers logic) |
| 3 | Chat + Booking | Đại lý → Thu mua | `chatMessageService.ts`, `dealConfirmService.ts` |
| 4 | Vòng đời Deal | Thu mua + Quản lý | `dealService.ts` |
| 5 | Tạm ứng (Advance) | Kế toán | `advanceService.ts` |
| 6 | Quyết toán (Settlement) | Kế toán | `autoSettlementService.ts`, `settlementService.ts` |
| 7 | Thanh toán từng phần | Kế toán | `paymentService.ts` |
| 8 | Sổ cái (Ledger) | Tự động + Kế toán | `ledgerService.ts` |
| 9 | Cảnh báo DRC | Tự động hiển thị | `drcVarianceService.ts` |
| 10 | Hủy Deal | Thu mua / Quản lý | `dealService.ts` |

---

## CÁC BUG HIỆN TẠI CẦN FIX

### 🔴 Critical (P0)

1. **Double ledger entry cho advance** (Luồng 5) — `dealConfirmService` + `advanceService.markPaid` cùng ghi ledger
2. **QC xong KHÔNG tự động update Deal.actual_drc** (Luồng 4) — phải manual gọi `updateDealActualDrc()`
3. **Settlement status `pending` không thể đạt được** (Luồng 6) — orphan status
4. **Ledger `running_balance` KHÔNG được tính** (Luồng 8) — code chỉ đọc, không update

### 🟡 Major (P1)

5. **Enum `DealStatus` mismatch** — `b2b.types.ts` ≠ `dealService.ts`
6. **Không validate preconditions** khi accept/settle Deal
7. **Không check quyền role** — ai cũng duyệt được
8. **Payment service không validate amount** ≤ remaining_amount

### 🟠 Minor (P2)

9. QC xong không auto-notify chat
10. `lot_code` fail → vẫn tạo deal với lot_code=null
11. Không có penalty logic khi DRC thực < expected
12. Cancel Deal không cascade cleanup

---

**Tài liệu này dùng cho:**
- Business Analyst review quy trình
- Onboarding nhân viên mới vào module B2B
- Lập kế hoạch fix bug / refactor
- Tham chiếu khi test end-to-end
