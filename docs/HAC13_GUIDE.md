# Hướng dẫn hệ thống mã định danh HAC-13 v10

> Tài liệu vận hành cho hệ thống mã định danh 13 chữ số (HAC-13) áp dụng trong ERP Cao Su Huy Anh.
> Tài liệu gốc: `docs/du lieu tho/QuyDinh_MaDinhDanh_v10_CaoSuHuyAnh (3).docx`.

## 1. Format mã

Mỗi mã có đúng **13 chữ số** = `8999` + Type + Sequence (7 digit) + Check digit:

```
8999 1 0001234 6
└──┘ │ └─────┘ │
prefix│ sequence check digit (GS1 Mod-10)
      type code
```

| Type | Đối tượng | Sequence DB |
|:---:|---|---|
| 1 | Business Partner trong nước (KH + NCC + đại lý + hộ NCC mủ, country_iso='VN') | `hac13_seq_bp_vn` |
| 2 | Business Partner nước ngoài | `hac13_seq_bp_foreign` |
| 3 | Nhân viên | `hac13_seq_employee` |

Hiển thị đẹp: `8999-1-0001234-6` (qua component `<Hac13CodeDisplay />`).

## 2. Kiến trúc

```
business_partners (master)             ← 1 BP có nhiều vai trò
   ├─ hac13_code (UNIQUE, immutable)
   ├─ type_code, legal_name, tax_code, country_iso, …
   │
   ├─→ bp_roles                        ← vai trò + role_data jsonb
   │     CUSTOMER_INTL  | role_data: {tier, default_incoterm, credit_limit, …}
   │     SUPPLIER_GENERAL | role_data: {supplier_group, payment_terms_days, …}
   │     PARTNER_B2B    | role_data: {partner_type, tier_b2b, region_code, legacy_code, …}
   │     RUBBER_SUPPLIER | role_data: {plantation_area_ha, eudr_compliant, geo_*, …}
   │
   ├─→ bp_search_keys                  ← TAX_CODE, CCCD, EMAIL, PHONE, ALIAS (mã cũ KH-001…)
   ├─→ bp_name_history                 ← log đổi tên (mã KHÔNG đổi)
   └─→ bp_address_history              ← log chuyển tỉnh / trụ sở
```

5 bảng role hiện hữu giữ FK `bp_id → business_partners.id`:

| Bảng | Schema | code mới | Note |
|---|---|---|---|
| `employees` | public | = `hac13_code` | Drop column code dự kiến Phase 6 |
| `sales_customers` | public | = `hac13_code` | KH-001 lưu trong bp_search_keys ALIAS |
| `suppliers` | public | = `hac13_code` | NCC-001 lưu trong bp_search_keys ALIAS |
| `b2b.partners` | b2b | **GIỮ NGUYÊN TEHG01** | Cross-repo dependency (B2B Portal + lot code generation) |
| `rubber_suppliers` | public | = `hac13_code` | MU-001 lưu trong bp_search_keys ALIAS |

## 3. Cách sinh mã

### DB function `generate_hac13(type_code)`

```sql
SELECT generate_hac13(1);  -- type=1 (BP-VN), trả về '89991XXXXXXXC'
SELECT generate_hac13(3);  -- type=3 (NV)
```

- Consume `nextval` của sequence tương ứng.
- Tự tính check digit GS1 Modulo 10 trên 12 ký tự đầu.
- Validate qua `is_valid_hac13(text)`.

### Cách app gọi (TypeScript)

```ts
import { businessPartnerService } from '@/services/businessPartnerService'

const bp = await businessPartnerService.create({
  legal_name: 'Công ty XYZ',
  country_iso: 'VN',
  tax_code: '0301234567',
  roles: [
    { role_type: 'CUSTOMER_INTL', is_primary: true, role_data: { tier: 'premium' } },
  ],
})
console.log(bp.hac13_code)  // '8999100012346'
```

### Tuyệt đối KHÔNG

- ❌ Sửa `hac13_code` sau khi tạo (trigger raise EXCEPTION).
- ❌ Sửa `type_code` sau khi tạo.
- ❌ Sinh mã thủ công ở app — luôn để DB trigger / RPC sinh.
- ❌ Tái sử dụng sequence đã consume.

## 4. Check digit (GS1 Mod 10)

```
Position từ phải sang trái (1..12):
  i lẻ  (1, 3, 5, 7, 9, 11) → digit × 3
  i chẵn (2, 4, 6, 8, 10, 12) → digit × 1
Sum tất cả. Check = (10 - sum mod 10) mod 10.
```

Ví dụ `899910001234` → sum = 94 → check = 6 → mã đầy đủ `8999100012346`.

Helper TypeScript: `src/lib/hac13.ts` — `calculateCheckDigit`, `validateHac13`, `parseHac13`, `formatHac13Display`.

Unit test (29/29 pass): chạy `node --experimental-strip-types src/lib/__tests__/hac13.test.ts`.

## 5. Vận hành thường ngày

### Tạo BP mới
1. `/master-data/business-partners/new` (chưa triển khai UI Create) hoặc tạo qua module-specific:
   - Customer: `/sales/customers` → "Thêm KH" — service tự gọi BP RPC.
   - Supplier: `/purchasing/suppliers` → "Thêm NCC".
   - Rubber: `/rubber/suppliers` → "Thêm NCC mủ".
2. Hệ thống tự sinh HAC-13, gán role tương ứng, lưu alias mã cũ (nếu có) vào bp_search_keys.

### Một đối tác là cả KH và NCC
- Nếu trùng MST (tax_code), Phase 3 đã auto-merge. Phase 4 cũng merge khi insert mới.
- Nếu KH cũ không có MST, lúc tạo NCC trùng tên: **chưa auto-merge** — admin merge thủ công qua UI `/master-data/business-partners` (TODO Phase 6).

### Tìm kiếm
- List page các module hỗ trợ search HAC-13 (kể cả có dấu gạch `8999-1-0001234-6`) hoặc mã cũ (KH-001, NV001…).
- Search backend dùng `code.ilike` + `bp_search_keys.key_value` (TAX_CODE, ALIAS, EMAIL, PHONE).

### Đổi tên / chuyển tỉnh
- Vẫn `UPDATE business_partners SET legal_name = '…'` — trigger `bp_after_update_history` tự ghi vào `bp_name_history` / `bp_address_history`.
- Mã HAC-13 **KHÔNG đổi**.

### Xem lịch sử
- `/master-data/business-partners/:id` tab "Lịch sử" → list đổi tên + chuyển tỉnh, sắp xếp giảm dần theo `changed_at`.

## 6. Migration đã chạy

| File | Mục đích |
|---|---|
| `docs/migrations/hac13_01_lib.sql` | 3 sequences + `hac13_check_digit`, `generate_hac13`, `is_valid_hac13` |
| `docs/migrations/hac13_02_search_history_tables.sql` | `bp_search_keys`, `bp_name_history`, `bp_address_history`, `employee_history` + indexes (gin_trgm) + RLS |
| `docs/migrations/hac13_03_business_partners_master.sql` | `business_partners` + `bp_roles` + 4 trigger + RPC `rpc_create_bp_with_roles` |
| `docs/migrations/hac13_04_employees_hac13.sql` | Backfill employees.hac13_code (type=3) + trigger sync employees.code = hac13_code + trigger log employee_history |
| `docs/migrations/hac13_05_migrate_customers_suppliers.sql` | Backfill sales_customers + suppliers vào BP + trigger sync code = hac13_code + 2 view compat |
| `docs/migrations/hac13_06_migrate_b2b_rubber.sql` | (Conditional) Backfill b2b.partners + rubber_suppliers vào BP + trigger AFTER INSERT cross-repo |

## 7. Khi nào DROP COLUMN code (Phase tương lai)

Hiện cột `code` legacy được giữ tạm để callsite cũ (~50 file) không bị break. Trigger sync giữ `code = hac13_code` realtime.

Khi nào drop được:
1. Migrate hết callsite TypeScript từ `.code` → `.hac13_code` (mỗi module ~5-10 file).
2. Cập nhật báo cáo (AR Aging, Top Supplier…) dùng `bp.hac13_code` thay vì `s.code`.
3. Update template .docx hợp đồng dùng `{buyer_code}` placeholder (đã add Phase 5).
4. Run migration 07 (DROP COLUMN code) — chưa viết.

## 8. Phụ lục: Phân biệt với mã legacy

| Mã legacy | Bảng | Format | Bây giờ |
|---|---|---|---|
| NV001 | employees | NV+3digit | Đã bị overwrite = hac13_code |
| KH-001 | sales_customers | KH-+3digit | Đã overwrite = hac13_code. Search được qua bp_search_keys ALIAS |
| NCC-001 | suppliers | NCC-+3digit | Đã overwrite = hac13_code. Search qua ALIAS |
| MU-001 | rubber_suppliers | MU-+3digit | Đã overwrite (khi mig 06 chạy được). Search qua ALIAS |
| TEHG01 | b2b.partners | Region+Name+Seq | **GIỮ NGUYÊN** — B2B Portal repo + downstream lot code dùng. Lưu trong bp_search_keys ALIAS cho search HAC-13 ↔ TEHG01 |
| QIGI01-2604-01 | rubber_intake_batches.lot_code | partner_code-YYMM-seq | KHÔNG đụng — vẫn dùng partner.code (TEHG01) để generate |

## 9. Q&A nhanh

**Q: Tại sao prefix `8999` không phải `8930xxx` (GS1 Vietnam)?**
A: 8999 nằm trong dải GS1 Internal Numbering (8990-8999, không cần đăng ký). An toàn cho nội bộ. Nếu sau này cần barcode hàng xuất khẩu, đăng ký GS1 Vietnam prefix riêng cho sản phẩm — **độc lập với HAC-13** (HAC-13 chỉ dùng trong ERP, không in lên hàng).

**Q: Sequence hết 9999999 thì sao?**
A: ~10 triệu BP nội bộ × 7 thập kỷ — vượt xa quy mô công ty. Nếu đến lúc đó, tăng prefix lên 14 chữ số.

**Q: Mã HAC-13 có thay đổi khi đối tác đổi tên không?**
A: Không. Mã immutable. Tên cũ vào `bp_name_history`.

**Q: Một đối tác chuyển từ VN sang nước ngoài (type 1 → 2) — mã có đổi không?**
A: Không. Trigger `bp_before_update_guard_immutable` chặn sửa type_code. Khi BP thực sự "biến chất" (M&A, spin-off), tạo BP mới và inactive BP cũ.

**Q: B2B Portal repo có cần migrate code không?**
A: Không cần. `b2b.partners.code` (TEHG01) giữ nguyên format. Trigger AFTER INSERT tự tạo BP master ở `public.business_partners` cho mỗi partner mới — kể cả khi B2B Portal repo insert direct.
