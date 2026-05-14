"""
Build docxtemplater templates from 4 sample contracts.

Source: SC + PI ( CIF)/* và SC + PI (FOB)/*
Output: docs/contract-templates/template_{SC,PI}_{CIF,FOB}.docx

Cách hoạt động:
- Mở từng file mẫu bằng python-docx
- Với mỗi paragraph và mỗi cell trong table → áp dụng map replace
  (literal-string find → docxtemplater placeholder `{var}` hoặc `{#docs}…{/docs}`)
- Khi replace, gộp toàn bộ runs trong paragraph thành 1 run duy nhất
  (đảm bảo placeholder không bị Word split thành nhiều run, docxtemplater sẽ detect được)

Lưu ý:
- Format intra-paragraph (bold/italic giữa câu) có thể bị mất. OK với contract templates.
- Replacements dict được build từ preset trong mock (apollo/yoongdo) — value preset
  được thay bằng key placeholder.
"""

from pathlib import Path
from copy import deepcopy
from docx import Document
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parent.parent.parent  # repo root
OUT_DIR = ROOT / "docs" / "contract-templates"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ----------------------------------------------------------------------
# Replacement maps cho từng file (literal → placeholder)
# Tham chiếu chính xác text trong file mẫu (lưu ý dấu cách lạ "2, 460", "49 ,593.60")
# ----------------------------------------------------------------------

# CIF Yoong Do (SC)
REPL_SC_CIF = [
    ("HA20260053", "{contract_no}"),
    ("08 th May 2026", "{contract_date}"),
    ("08th May 2026", "{contract_date}"),
    ("YOONG DO ENGINEERING CO.,LTD", "{buyer_name}"),
    ("295, YANGYEON-RO, NAM-MYEON, YANGJU-SI, GYEONGGI-DO, REPUBLIC OF KOREA", "{buyer_address}"),
    ("NATURAL RUBBER SVR3L", "NATURAL RUBBER {grade}"),
    ("CIF – INCHEON , KOREA", "{incoterm} – {pod}"),
    ("CIF - INCHEON , KOREA", "{incoterm} – {pod}"),
    ("CIF – INCHEON, KOREA", "{incoterm} – {pod}"),
    ("Incheon , Korea", "{pod}"),
    ("Incheon, Korea", "{pod}"),
    ("Any port , Viet Nam", "{pol}"),
    ("Any port, Viet Nam", "{pol}"),
    # Numbers (đặt sau text dài hơn để tránh conflict)
    ("20.16", "{quantity}"),
    ("2, 460", "{unit_price}"),
    ("2,460", "{unit_price}"),
    ("49 ,593.60", "{amount}"),
    ("49,593.60", "{amount}"),
    # Packing
    ("1.26mts Per Wooden pallets , 35 kg/bale with thick polybag", "{packing_desc}"),
    ("576 bales/ 16 Wooden pallets/ 01 x 20", "{bales_total} bales / {pallets_total} Wooden pallets / {containers} x {cont_type}"),
    # Shipment
    ("Time of shipment: June , 2026", "Time of shipment: {shipment_time}"),
    ("Time of shipment: June, 2026", "Time of shipment: {shipment_time}"),
    ("Partial shipment: Not Allowed", "Partial shipment: {partial}"),
    ("Trans s hipment: Allowed", "Transshipment: {trans}"),
    ("Transshipment: Allowed", "Transshipment: {trans}"),
    # Payment
    ("LC at sight. The L/C draft must be opened within five (5) days from the contract signing date.",
     "{payment}. {payment_extra}"),
    ("LC at sight", "{payment}"),
    # Claims
    ("within 20 days of receipt of goods", "within {claims_days} days of receipt of goods"),
    # Freight
    ("freight prepaid", "{freight_mark}"),
]

# CIF Yoong Do (PI)
REPL_PI_CIF = [
    ("HA20260053", "{contract_no}"),
    ("08 th May 2026", "{contract_date}"),
    ("08th May 2026", "{contract_date}"),
    ("YOONG DO ENGINEERING CO.,LTD", "{buyer_name}"),
    ("295, YANGYEON-RO, NAM-MYEON, YANGJU-SI, GYEONGGI-DO, REPUBLIC OF KOREA", "{buyer_address}"),
    ("CIF – INCHEON , KOREA", "{incoterm} – {pod}"),
    ("CIF - INCHEON , KOREA", "{incoterm} – {pod}"),
    ("CIF – INCHEON, KOREA", "{incoterm} – {pod}"),
    ("NATURAL RUBBER SVR3L", "NATURAL RUBBER {grade}"),
    ("01 x 20", "{containers} x {cont_type}"),
    ("35kg/ bale with thick polybag – Wooden pallets", "{packing_desc}"),
    ("35kg/ bale with thick polybag - Wooden pallets", "{packing_desc}"),
    ("20.16", "{quantity}"),
    ("2, 460", "{unit_price}"),
    ("2,460", "{unit_price}"),
    ("49 ,593.60", "{amount}"),
    ("49,593.60", "{amount}"),
    ("Forty-Nine Thousand Five Hundred Ninety-Three US Dollars and Sixty Cents Only",
     "{amount_words}"),
    ("LC at sight. The L/C draft must be opened within five (5) days from the contract signing date.",
     "{payment}. {payment_extra}"),
    ("LC at sight", "{payment}"),
]

# FOB Apollo (SC)
REPL_SC_FOB = [
    ("HA20260051", "{contract_no}"),
    ("08 th May 2026", "{contract_date}"),
    ("08th May 2026", "{contract_date}"),
    ("APOLLO TYRES LTD", "{buyer_name}"),
    ("7, INSTITUTIONAL AREA, SECTOR 32, GURGAON, INDIA 122001", "{buyer_address}"),
    ("1800 212 7070", "{buyer_phone}"),
    ("NATURAL RUBBER RSS3", "NATURAL RUBBER {grade}"),
    ("FOB DA NANG PORT, VIET NAM", "{incoterm} {pol}"),
    ("FOB DA NANG PORT , VIET NAM", "{incoterm} {pol}"),
    ("Da Nang port , Viet Nam", "{pol}"),
    ("Da Nang port, Viet Nam", "{pol}"),
    ("201 .6", "{quantity}"),
    ("201.6", "{quantity}"),
    ("2, 350", "{unit_price}"),
    ("2,350", "{unit_price}"),
    ("473 ,760.00", "{amount}"),
    ("473,760.00", "{amount}"),
    # Packing
    ("35kg /bales. Loose bales packing", "{packing_desc}"),
    ("35 kg/bales. Loose bales packing", "{packing_desc}"),
    ("5,760 bales/ 10 x 20", "{bales_total} bales / {containers} x {cont_type}"),
    # Shipment (multi-lot) — nếu file gốc tách 2 paragraph "+ 1st Lot..." và "+ 2nd Lot...",
    # ta thay paragraph đầu thành "{shipment_time}" và xóa nội dung paragraph "+ 2nd Lot..."
    ("+ 1st Lot: Before 15th June, 2026 + 2nd Lot: Before 30th June, 2026", "{shipment_time}"),
    ("+ 1st Lot: Before 15th June, 2026", "{shipment_time}"),
    ("+ 2nd Lot: Before 30th June, 2026", ""),
    ("1st Lot: Before 15th June, 2026", "{shipment_time}"),
    # Single-line variants
    ("Partial shipment: Allowed", "Partial shipment: {partial}"),
    ("Trans s hipment: Allowed", "Transshipment: {trans}"),
    ("Transshipment: Allowed", "Transshipment: {trans}"),
    # Payment
    ("CAD 5 days", "{payment}"),
    ("within 20 days of receipt of goods", "within {claims_days} days of receipt of goods"),
    ("freight Collect", "{freight_mark}"),
    ("freight collect", "{freight_mark}"),
]

# FOB Apollo (PI)
REPL_PI_FOB = [
    ("HA20260051", "{contract_no}"),
    ("08 th May 2026", "{contract_date}"),
    ("08th May 2026", "{contract_date}"),
    ("APOLLO TYRES LTD", "{buyer_name}"),
    ("7, INSTITUTIONAL AREA, SECTOR 32, GURGAON, INDIA 122001", "{buyer_address}"),
    ("1800 212 7070", "{buyer_phone}"),
    ("FOB DA NANG PORT , VIET NAM", "{incoterm} {pol}"),
    ("FOB DA NANG PORT, VIET NAM", "{incoterm} {pol}"),
    ("NATURAL RUBBER RSS3", "NATURAL RUBBER {grade}"),
    ("10 x 20", "{containers} x {cont_type}"),
    ("35 kg/ bale . Loose bales packing", "{packing_desc}"),
    ("35 kg/ bale. Loose bales packing", "{packing_desc}"),
    ("201 .6", "{quantity}"),
    ("201.6", "{quantity}"),
    ("2, 350", "{unit_price}"),
    ("2,350", "{unit_price}"),
    ("473 ,760.00", "{amount}"),
    ("473,760.00", "{amount}"),
    ("Four Hundred Seventy-Three Thousand Seven Hundred Sixty US Dollars Only",
     "{amount_words}"),
    ("CAD 5 days", "{payment}"),
]


def _replace_in_paragraph(paragraph, replacements):
    """
    Áp dụng list (find_str, replace_str) lên paragraph.
    Nếu có thay đổi: collapse toàn bộ runs thành 1 run duy nhất giữ format của run đầu.
    """
    original = paragraph.text
    if not original.strip():
        return False
    new_text = original
    for find, repl in replacements:
        if find in new_text:
            new_text = new_text.replace(find, repl)
    if new_text == original:
        return False

    runs = paragraph.runs
    if not runs:
        return False

    # Giữ run đầu tiên, đặt text mới, xóa các runs còn lại
    first_run = runs[0]
    first_run.text = new_text
    # Remove subsequent run elements
    for r in runs[1:]:
        r._element.getparent().remove(r._element)
    return True


def _iter_paragraphs(doc):
    """Yield all paragraphs in document (body + tables, recursive)."""
    for p in doc.paragraphs:
        yield p
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    yield p
                # Nested tables (rare but possible)
                for nested in cell.tables:
                    for nr in nested.rows:
                        for nc in nr.cells:
                            for np in nc.paragraphs:
                                yield np


def build_template(src_path, out_path, replacements, label):
    print(f"\n── {label} ──")
    print(f"  src: {src_path.relative_to(ROOT)}")
    doc = Document(str(src_path))
    changed = 0
    matched_keys = set()
    for p in _iter_paragraphs(doc):
        before = p.text
        if _replace_in_paragraph(p, replacements):
            changed += 1
            for find, repl in replacements:
                if find in before:
                    matched_keys.add(repl)
    doc.save(str(out_path))
    print(f"  out: {out_path.relative_to(ROOT)}  ({changed} paragraphs modified)")
    print(f"  placeholders inserted: {sorted(matched_keys)}")
    return changed, matched_keys


def main():
    pairs = [
        (ROOT / "SC + PI ( CIF)" / "SC- Yoong Do engineering Co.,Ltd 01.2026.docx",
         OUT_DIR / "template_SC_CIF.docx", REPL_SC_CIF, "SC CIF (Yoong Do)"),
        (ROOT / "SC + PI ( CIF)" / "PI- Yoong Do engineering Co.,Ltd 01.2026.docx",
         OUT_DIR / "template_PI_CIF.docx", REPL_PI_CIF, "PI CIF (Yoong Do)"),
        (ROOT / "SC + PI (FOB)" / "SC-APOLLO 01.2026 1.docx",
         OUT_DIR / "template_SC_FOB.docx", REPL_SC_FOB, "SC FOB (Apollo)"),
        (ROOT / "SC + PI (FOB)" / "PI- APOLLO 01.2026 1.docx",
         OUT_DIR / "template_PI_FOB.docx", REPL_PI_FOB, "PI FOB (Apollo)"),
    ]
    total = 0
    for src, out, repl, label in pairs:
        if not src.exists():
            print(f"!!! KHÔNG TÌM THẤY: {src}")
            continue
        c, _ = build_template(src, out, repl, label)
        total += c
    print(f"\n✓ Tổng: {total} paragraphs đã modify trong 4 file")


if __name__ == "__main__":
    main()
