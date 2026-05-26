# E2E Test Checklist — Run-time tracker

Đánh dấu ✓ từng phase khi pass. Note ID + giá trị thực tế để debug nếu fail.

**Date run**: ____________________
**Tester**: ____________________

---

## Setup

| Item | Value |
|---|---|
| `<<<PARTNER_ID>>>` | ____________________ |
| Partner code | ____________________ |
| Partner name | ____________________ |
| Partner tier | _______ |
| `proxy_name` (nếu có) | ____________________ |
| `<<<TICKET_ID>>>` | ____________________ |
| `<<<INTAKE_ID>>>` | ____________________ |
| `<<<SETTLEMENT_ID>>>` | ____________________ |

## Baseline (Phase 0.3)

| Metric | Value |
|---|---|
| `intakes_before` | ____ |
| `tickets_before` | ____ |
| `bonus_rows_jun_before` | ____ |
| `bonus_volume_jun_before` | ____ kg |
| `bonus_dry_jun_before` | ____ kg |

---

## Phase Checklist

### Phase 0 — Pick + Baseline
- [ ] 0.1: Pick partner OK, lưu UUID
- [ ] 0.2: Bonus rule cho mủ nước active tại 2026-06-01 (có row)
- [ ] 0.3: Baseline snapshot ghi note

### Phase 1 — Gross
- [ ] `status = 'weighing_tare'`
- [ ] `gross_weight = 6500`
- [ ] Ghi `<<<TICKET_ID>>>`

### Phase 2 — Complete
- [ ] `lookup_drc(230) = 42.40`
- [ ] `status = 'completed'`
- [ ] `net_weight = 4200`
- [ ] `field_dot_reading = 230`
- [ ] `qc_actual_drc = 42.40`

### Phase 3 — Bridge → intake_batch
- [ ] 1 row trong `rubber_intake_batches` với `weighbridge_ticket_id = <<<TICKET_ID>>>`
- [ ] `raw_rubber_type = 'mu_nuoc'`
- [ ] `rubber_type = 'nuoc'` (auto derived)
- [ ] `dry_weight_kg = 1780.80`
- [ ] `field_dot_reading = 230`
- [ ] `consolidation_code` khớp
- [ ] `status = 'confirmed'`
- [ ] `intake_date = '2026-06-01'`
- [ ] `facility_code = 'TL'`
- [ ] `pnk_number IS NOT NULL`
- [ ] Ghi `<<<INTAKE_ID>>>`

### Phase 4 — PNK sequential
- [ ] `test_pnk = max_pnk_other + 1`
- [ ] Check result hiển thị `✓ PNK sequential OK`

### Phase 5 — Bonus auto-recompute
- [ ] Có row `b2b_monthly_bonus` cho (partner, 2026-6, 'nuoc')
- [ ] `bonus_unit = 'dry'`
- [ ] `dry_weight_kg` tăng đúng **+1780.80** so baseline
- [ ] `volume_kg` tăng đúng **+4200** so baseline
- [ ] `total_bonus_vnd > 0` (verify tay: dry × bonus_per_kg theo tier)

### Phase 6 — Settlement
- [ ] Insert settlement header OK, `status = 'draft'`
- [ ] Ghi `<<<SETTLEMENT_ID>>>`
- [ ] Insert settlement_item: `total_amount = 26,712,000`
- [ ] Update header `total_amount = 26,712,000`

### Phase 7 — Approve + Paid
- [ ] 7.1: `status = 'approved'`, `approved_at` set
- [ ] 7.2: Payment record created với `amount = 26.712.000`
- [ ] 7.3: `status = 'paid'`, `paid_at` set
- [ ] 7.4: Check result hiển thị `✓ Settlement paid full`

### Phase 8 — Ledger
- [ ] 8.1: `ledger_table_exists = true`
- [ ] 8.2: Có entries (debit + credit) HOẶC note "ledger ở UI" nếu không có trigger

### Phase 9 — Proxy (optional)
- [ ] Check result hiển thị `✓ Proxy partner đúng` HOẶC `⚪ Skip` nếu không có proxy

### Post-test
- [ ] `intakes_after = intakes_before + 1`
- [ ] `tickets_after = tickets_before + 1`
- [ ] `bonus_volume_jun_after - bonus_volume_jun_before = 4200`
- [ ] `bonus_dry_jun_after - bonus_dry_jun_before = 1780.80`

---

## Bugs / Notes

Ghi lại bất kỳ FAIL hoặc behavior bất thường:

| Phase | Issue | Note |
|---|---|---|
|   |   |   |
|   |   |   |
|   |   |   |

---

## Conclusion

- [ ] **All passed** → Go-live ready ✅
- [ ] **Failed at phase ___** → fix + rerun
