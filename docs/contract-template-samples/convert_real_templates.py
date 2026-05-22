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

# 6 token ERP sẽ auto-fill (chỉ đổi single → double brace, KHÔNG thay value)
KEEP_TOKENS = {
    'contract_no',
    'bank_account_name',
    'bank_account_no',
    'bank_full_name',
    'bank_address',
    'bank_swift',
}

# Sample value cho các token khác (Docs sẽ thay khi soạn HĐ thật)
SAMPLE_FOB = {
    'contract_date': '22 May 2026',
    'buyer_name': 'APOLLO TYRES LTD',
    'buyer_address': '3rd Floor, Apollo House, 7 Institutional Area, Sector 32, Gurugram-122001, Haryana, India',
    'buyer_phone': '+91-124-2383500',
    'grade': 'SVR3L',
    'quantity': '42.00',
    'unit_price': '2,350',
    'amount': '98,700.00',
    'amount_words': 'Ninety-Eight Thousand Seven Hundred US Dollars Only',
    'incoterm': 'FOB',
    'pol': 'DA NANG PORT, VIETNAM',
    'pod': '',
    'packing_desc': '35 kg/bale, Loose bales packing',
    'bales_total': '1,260',
    'pallets_total': '',
    'containers': '3',
    'cont_type': "20'",
    'shipment_time': 'June 2026',
    'partial': 'Allowed',
    'trans': 'Allowed',
    'payment': 'L/C at sight',
    'payment_extra': '',
    'claims_days': '20',
    'arbitration': 'SICOM Singapore',
    'freight_mark': 'Freight Collect',
    'extra_terms': '',
}

SAMPLE_CIF = {
    **SAMPLE_FOB,
    'buyer_name': 'PT ALPHEN INTERNASIONAL CORPORINDO',
    'buyer_address': 'Jl. Industri Raya III Blok AE No. 17, Tangerang, Banten 15710, Indonesia',
    'buyer_phone': '+62-21-5901234',
    'incoterm': 'CIF',
    'pol': 'HO CHI MINH PORT, VIETNAM',
    'pod': 'BELAWAN PORT, INDONESIA',
    'freight_mark': 'Freight Prepaid',
}


def process_xml(xml: str, sample_data: dict) -> str:
    """Process document.xml content."""
    # 1. Conditional block markers — bỏ marker, giữ content
    #    {#has_xxx}...{/has_xxx} → ...
    xml = re.sub(r'\{#\w+\}', '', xml)
    xml = re.sub(r'\{/\w+\}', '', xml)

    # 2. Đổi 6 ERP token single → double brace
    #    {contract_no} → {{contract_no}}
    for tok in KEEP_TOKENS:
        xml = xml.replace('{' + tok + '}', '{{' + tok + '}}')

    # 3. Replace các token còn lại bằng sample value
    #    Sort by length DESC để tránh prefix match (vd: {bank_account_name} không bị {bank} match trước)
    for k in sorted(sample_data.keys(), key=len, reverse=True):
        v = sample_data[k]
        xml = xml.replace('{' + k + '}', v)

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

    # Xóa các synthetic samples cũ
    for old in DST_DIR.glob('sample_*.docx'):
        old.unlink()

    convert('template_SC_FOB.docx', 'sample_SC_FOB.docx', SAMPLE_FOB)
    convert('template_PI_FOB.docx', 'sample_PI_FOB.docx', SAMPLE_FOB)
    convert('template_SC_CIF.docx', 'sample_SC_CIF.docx', SAMPLE_CIF)
    convert('template_PI_CIF.docx', 'sample_PI_CIF.docx', SAMPLE_CIF)

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
