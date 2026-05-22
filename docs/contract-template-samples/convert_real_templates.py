"""
Convert 4 file template thật ở public/contract-templates/ thành 4 file mẫu
upload-flow để test Auto-fill.

Quy tắc convert:
  - 6 token Phú fill via ERP: {x} → {{x}}
      (contract_no, bank_account_name, bank_account_no, bank_full_name,
       bank_address, bank_swift)
  - Token khác (buyer/grade/giá...): replace bằng giá trị mẫu
      (Docs sẽ custom per HĐ khi sửa template thật)
  - Conditional block {#x}...{/x}: bỏ marker, giữ content

Chạy: python docs/contract-template-samples/convert_real_templates.py
Output: docs/contract-template-samples/sample_*.docx (overwrite)
"""

import re
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # huyanh-erp-8/
SRC_DIR = ROOT / 'public' / 'contract-templates'
DST_DIR = ROOT / 'docs' / 'contract-template-samples'

# Phase B: 18 token ERP auto-fill từ sales_order DB (giữ {{double}} brace)
KEEP_TOKENS = {
    # User input (Phú nhập)
    'contract_no',
    'bank_account_name', 'bank_account_no',
    'bank_full_name', 'bank_address', 'bank_swift',
    # Auto từ sales_order
    'contract_date',
    'buyer_name', 'buyer_address', 'buyer_phone',
    'grade', 'quantity', 'unit_price', 'amount', 'amount_words',
    'incoterm', 'pol', 'pod',
    'packing_desc', 'bales_total', 'containers', 'cont_type',
    'shipment_time', 'payment', 'freight_mark',
}

# Sample value chỉ cho TOKEN KHÔNG TRONG render data (vd: partial/trans/claims_days/
# arbitration/extra_terms — Docs custom khi soạn template thật, không thay đổi
# theo HĐ. Giữ value default cho mọi file để Phú không cần nhập).
SAMPLE_DEFAULTS = {
    'partial': 'Allowed',
    'trans': 'Allowed',
    'payment_extra': '',
    'claims_days': '20',
    'arbitration': 'SICOM Singapore',
    'extra_terms': '',
    'pallets_total': '',  # Loose bale không có pallet
}

# Backward-compat: 2 biến cũ vẫn được import từ chỗ khác (nếu có)
SAMPLE_FOB = SAMPLE_DEFAULTS
SAMPLE_CIF = SAMPLE_DEFAULTS


def process_xml(xml: str, sample_data: dict) -> str:
    """Process document.xml content."""
    # 0. Strip block {#is_lc_payment}...{/is_lc_payment} entirely (markers + content).
    #    Lý do: Sale gõ FULL payment text trong form (vd "L/C at sight. L/C draft
    #    must be opened within 5 days") → conditional hardcoded "5 days" không
    #    flex cho HĐ multi-payment (vd T/T + L/C, D/P + LC UPAS 90).
    #    Workflow mới: text trong textbox = source of truth, render thẳng.
    #    Xử lý: regex DOTALL match từ {#is_lc_payment} đến {/is_lc_payment} bao
    #    gồm content + Word XML tags giữa (paragraph, run, text).
    xml = re.sub(
        r'\{#is_lc_payment\}.*?\{/is_lc_payment\}',
        '',
        xml,
        flags=re.DOTALL,
    )

    # 1. Conditional block markers khác (has_pallets, has_fumigation, has_extra_terms):
    #    {#has_xxx} → {{#has_xxx}}, {/has_xxx} → {{/has_xxx}}
    #    Giữ structure để docxtemplater xử lý conditional theo flag service truyền.
    xml = re.sub(r'\{(#\w+)\}', r'{{\1}}', xml)
    xml = re.sub(r'\{(/\w+)\}', r'{{\1}}', xml)

    # 2. Đổi 6 ERP token single → double brace
    #    {contract_no} → {{contract_no}}
    for tok in KEEP_TOKENS:
        xml = xml.replace('{' + tok + '}', '{{' + tok + '}}')

    # 3. Replace các token còn lại bằng sample value
    #    Sort by length DESC để tránh prefix match (vd: {bank_account_name} không bị {bank} match trước)
    for k in sorted(sample_data.keys(), key=len, reverse=True):
        v = sample_data[k]
        xml = xml.replace('{' + k + '}', v)

    # 4. Cosmetic fix: 'Ben's Bank' → 'Beneficiary's Bank' (Ben là viết tắt sai)
    #    Handle cả straight apostrophe và typographic ' (U+2019)
    xml = xml.replace("Ben's Bank", "Beneficiary's Bank")
    xml = xml.replace("Ben’s Bank", "Beneficiary’s Bank")

    return xml


def convert(src_filename: str, dst_filename: str, sample_data: dict):
    src = SRC_DIR / src_filename
    dst = DST_DIR / dst_filename

    if not src.exists():
        print(f'SKIP: {src} not found')
        return

    # Tạo bản copy mới với XML đã process
    with zipfile.ZipFile(src, 'r') as zin:
        with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zout:
            for item in zin.namelist():
                data = zin.read(item)
                if item == 'word/document.xml':
                    xml = data.decode('utf-8')
                    xml = process_xml(xml, sample_data)
                    data = xml.encode('utf-8')
                zout.writestr(item, data)

    size_kb = dst.stat().st_size // 1024
    print(f'OK Converted: {dst_filename} ({size_kb} KB)')


def main():
    DST_DIR.mkdir(parents=True, exist_ok=True)

    # Xóa các synthetic samples cũ (skip nếu file đang locked vd Word đang mở)
    for old in DST_DIR.glob('sample_*.docx'):
        try:
            old.unlink()
        except (PermissionError, OSError) as e:
            print(f'WARN: cant delete {old.name} ({e}) - overwrite anyway')

    convert('template_SC_FOB.docx', 'sample_SC_FOB.docx', SAMPLE_DEFAULTS)
    convert('template_PI_FOB.docx', 'sample_PI_FOB.docx', SAMPLE_DEFAULTS)
    convert('template_SC_CIF.docx', 'sample_SC_CIF.docx', SAMPLE_DEFAULTS)
    convert('template_PI_CIF.docx', 'sample_PI_CIF.docx', SAMPLE_DEFAULTS)

    print()
    print('=' * 70)
    print('SAMPLE TEMPLATES TAO TU TEMPLATE THAT')
    print('=' * 70)
    print('Cac file mau giu nguyen format Huy Anh (header, table, style, signature)')
    print('Chi 6 vung ERP fill la {{token}}, con lai la sample value de Docs xem.')
    print()
    print('Test:')
    print('1. Vao /sales/orders/new, upload 4 file sample_*.docx (max 10 file/HD)')
    print('2. Dang nhap phulv@huyanhrubber.com -> /sales/contracts/review')
    print('3. Mo HD vua tao, go So HD + chon Bank -> Auto-fill')
    print('4. Download tu o (2) xem 6 vung token da thay dung chua')


if __name__ == '__main__':
    main()
