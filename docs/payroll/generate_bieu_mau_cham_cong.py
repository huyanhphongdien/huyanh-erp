# -*- coding: utf-8 -*-
"""
Sinh BỘ BIỂU MẪU CHẤM CÔNG SẢN XUẤT (thử nghiệm giấy T10/2026)
  → public/bieu-mau-cham-cong-san-xuat.html                 (in thẳng từ trình duyệt)
  → public/bieu-mau/bieu-mau-cham-cong-san-xuat.docx        (HCNS chỉnh sửa, in)
  → public/bieu-mau/bieu-mau-cham-cong-san-xuat.pdf + bm-XX-*.pdf từng mẫu (cần Edge/Chrome trên máy)
Tất cả host trên huyanhrubber.vn; trang hướng dẫn triển khai: public/trien-khai-cham-cong-san-xuat.html

Chạy:  python docs/payroll/generate_bieu_mau_cham_cong.py
Một nguồn nội dung (FORMS) → các bản xuất, để sửa chữ một chỗ.
"""
import html as _html
import os
import shutil
import subprocess
import sys

from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_ROW_HEIGHT_RULE, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, "public", "bieu-mau")
OUT_DOCX = os.path.join(OUT_DIR, "bieu-mau-cham-cong-san-xuat.docx")
OUT_PDF = os.path.join(OUT_DIR, "bieu-mau-cham-cong-san-xuat.pdf")
OUT_HTML = os.path.join(ROOT, "public", "bieu-mau-cham-cong-san-xuat.html")
GUIDE_HTML = "trien-khai-cham-cong-san-xuat.html"

BOX = "☐"
HOURS_DAY = ["06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17"]

# ---------------------------------------------------------------------------
# NỘI DUNG — mỗi form = dict(code, title, orient 'L'/'P', sub, blocks)
# block types:
#   ('h2', text) ('p', text) ('note', text) ('fields', [str,...]) ('list', [..]) ('bullets', [..])
#   ('check', [..])  ('sign', [..])  ('cut',)  ('spacer', cm)
#   ('cols2', [left blocks], [right blocks], left_cm, right_cm)   — 2 cột cạnh nhau (tiết kiệm chiều cao)
#   ('table', dict(cols=[(label, width_cm)], rows=int | [[..]], footer=[[(text, span)|text,..]], rowh=cm, font=pt))
# ---------------------------------------------------------------------------
FORMS = []


def form(code, title, orient, sub, blocks, slug):
    FORMS.append(dict(code=code, title=title, orient=orient, sub=sub, blocks=blocks, slug=slug))


# ---------- TRANG BÌA ----------
form("", "BỘ BIỂU MẪU CHẤM CÔNG SẢN XUẤT", "P",
     "Thử nghiệm bằng giấy từ tháng 10/2026 — ca sản xuất và các tổ thời vụ (trực lò, RSS, A Lưới)",
     [
         ("p", "Tháng 10/2026 lương vẫn tính theo cách cũ. Bộ biểu mẫu này chạy song song để (1) kiểm soát "
               "việc điều người trong ca, (2) đo chênh lệch từng người giữa cách cũ và cách chia theo giờ-việc, "
               "(3) làm mẫu cho màn hình trên ERP. Không đổi cách trả lương khi chưa có số so sánh."),
         ("h2", "Danh sách biểu mẫu"),
         ("table", dict(
             cols=[("Mã", 1.4), ("Biểu mẫu", 5.2), ("Ai ghi", 4.2), ("Khi nào", 4.4), ("Nộp cho / lưu ở", 3.8)],
             font=8.5, rowh=0.75,
             rows=[
                 ["BM-00", "Danh mục mã việc & quy ước ghi bảng", "HCNS in, dán cạnh bảng phân công", "—", "Xưởng (dán tường)"],
                 ["BM-01", "Bảng phân công ca theo giờ", "Trưởng ca (phó ca khi vắng)", "Mỗi ca; ghi lúc điều người; chốt ≤ 2h sau ca", "QLSX xác nhận → HCNS"],
                 ["BM-02", "Lệnh việc", "QLSX mở; HCNS kiểm đơn giá", "TRƯỚC khi có việc ngoài dây chuyền", "QLSX giữ; bản sao dán ở xưởng"],
                 ["BM-03", "Sổ đăng ký lệnh việc", "QLSX", "Mỗi lần mở / đóng lệnh", "QLSX"],
                 ["BM-04", "Bảng chấm công tổ theo tháng", "Người quản lý tổ thời vụ / trực lò / RSS / A Lưới", "Hàng ngày", "HCNS cuối tháng (hoặc 2 kỳ)"],
                 ["BM-05", "Phiếu điều chỉnh công sau chốt", "Trưởng ca / người lao động / HCNS", "Khi cần sửa bảng đã chốt", "QLSX duyệt → HCNS"],
                 ["BM-06", "Bảng đối chiếu ca", "HCNS lập, QLSX xem", "Hàng tuần", "HCNS"],
                 ["BM-07", "Bảng tổng hợp công tháng theo mã việc", "HCNS", "Cuối tháng; niêm yết 2 ngày", "Tính lương"],
                 ["HD", "Hướng dẫn trưởng ca (1 trang)", "HCNS phát", "Trước ngày áp dụng", "Trưởng ca giữ"],
             ])),
         ("h2", "Luồng biểu mẫu trong một tháng"),
         ("list", [
             "QLSX mở LỆNH VIỆC (BM-02) cho mọi việc ngoài dây chuyền SVR (RSS, vệ sinh, bốc xếp, thay bao…), ghi vào SỔ (BM-03), dán bản sao ở xưởng. Không có lệnh → trưởng ca không được ghi giờ cho việc đó.",
             "Mỗi ca, trưởng ca ghi BẢNG PHÂN CÔNG THEO GIỜ (BM-01) ngay lúc điều người. Cuối ca cộng hàng/cột, chép sản lượng từ sổ ca, ký; QLSX xác nhận.",
             "Tổ thời vụ / trực lò / RSS / A Lưới: người quản lý tổ ghi giờ hàng ngày vào BM-04. Ngày nào người của tổ vào ca sản xuất thì chỉ ghi ở BM-01 của ca đó, BM-04 ghi “→01”.",
             "Hàng tuần HCNS nhập BM-01 / BM-04 và lập BẢNG ĐỐI CHIẾU (BM-06). Ca có cờ vàng → hỏi trưởng ca; cờ đỏ → QLSX kiểm trước khi tính lương.",
             "Cuối tháng HCNS lập BM-07, niêm yết 2 ngày cho người lao động xem. Sai sót sửa bằng PHIẾU ĐIỀU CHỈNH (BM-05): có lý do, QLSX duyệt, HCNS cập nhật.",
             "Chốt bảng công → tính lương (T10 song song với cách cũ, so chênh lệch từng người trước khi quyết định đổi).",
         ]),
         ("h2", "Sáu khoá kiểm soát mà bộ biểu mẫu thực hiện"),
         ("bullets", [
             "Danh mục mã việc ĐÓNG, không chữ tự do — BM-00.",
             "Bảo toàn giờ: 1 ô = 1 giờ = 1 mã; cộng hàng phải bằng cộng cột; 1 người chỉ ở 1 sổ trong ngày — BM-01, BM-04.",
             "Việc ngoài SX phải được MỞ TRƯỚC bằng lệnh — BM-02, BM-03.",
             "Định mức giờ-người ghi trên lệnh; ghi vượt phải có QLSX duyệt — BM-02.",
             "Đối chiếu với sản lượng ca (tấn SVR, kiện RSS) do người khác ghi — BM-06.",
             "Chốt ≤ 2h sau ca, sửa sau chốt có lý do + duyệt, người lao động được xem công của mình — BM-01, BM-05, BM-07.",
         ]),
     ], slug="bia-danh-sach-bieu-mau")

# ---------- BM-00 ----------
form("BM-00", "DANH MỤC MÃ VIỆC & QUY ƯỚC GHI BẢNG PHÂN CÔNG", "P",
     "In khổ A4, dán cạnh bảng phân công ở xưởng. Chỉ HCNS được thêm/sửa mã.",
     [
         ("h2", "1. Mã việc (ghi vào ô giờ trên BM-01)"),
         ("table", dict(
             cols=[("Mã", 1.3), ("Việc", 5.0), ("Cách tính lương", 7.2), ("Ghi trên bảng", 5.5)],
             font=9, rowh=0.8,
             rows=[
                 ["S", "Chế biến SVR — đứng dây chuyền", "Chia QUỸ TẤN theo giờ S và hệ số (công thức hiện hành)", "S"],
                 ["H", "Hanging", "Đơn giá tấn hanging, chia theo giờ H", "H"],
                 ["C", "Chèn hàng", "Đơn giá tấn chèn, chia theo giờ C", "C"],
                 ["R", "Làm RSS / đóng SW RSS", "Theo LỆNH VIỆC (đơn giá HCNS chốt trên lệnh)", "R + số lệnh, vd R15"],
                 ["V", "Vệ sinh máy, dây chuyền, kho", "Theo LỆNH VIỆC — trả đích danh người làm", "V + số lệnh, vd V12"],
                 ["T", "Trực lò", "Đơn giá trực lò /12h", "T"],
                 ["L", "Việc khác có lệnh (bốc xếp, thay bao, sửa chữa…)", "Theo LỆNH VIỆC", "L + số lệnh, vd L20"],
                 ["(trống)", "Không có mặt giờ đó (vào trễ, về sớm, chưa vào ca)", "Không tính", "để trống ô"],
             ])),
         ("note", "Nếu trong ca có 2 lệnh cùng mã (vd 2 lệnh RSS) thì ghi kèm số lệnh: R15 / R16. Số lệnh lấy ở ô “Lệnh việc đang mở” đầu bảng."),
         ("h2", "2. Quy ước ghi"),
         ("list", [
             "1 ô = 1 giờ, bắt đầu giờ chẵn (06–07, 07–08…). Ca đêm: cột 1 = 18h.",
             "Chuyển việc TRƯỚC phút 30 → ô giờ đó ghi việc MỚI; SAU phút 30 → ghi việc CŨ. Không ghi số giờ lẻ vào ô.",
             "1 ô chỉ 1 mã. Không ghi 2 mã trong 1 ô.",
             "Ghi NGAY lúc điều người. Không ghi dồn cuối ca.",
             "Vào trễ / về sớm: ô không làm để trống. Giờ ăn giữa ca ghi như mã đang làm (theo quy định ca 12h hiện hành).",
             "Sai: gạch chéo 1 nét, ghi mã đúng bên cạnh, ký nháy. KHÔNG tẩy, không xoá, không dùng bút xoá.",
             "Chỉ ghi R / V / L khi lệnh việc đang MỞ và có trong ô “Lệnh việc đang mở” đầu bảng. Việc chưa có lệnh → gọi QLSX mở lệnh trước, rồi mới ghi.",
             "Người tổ khác / thời vụ vào làm trong ca: thêm dòng ở cuối bảng, cột Ghi chú ghi tổ gốc (vd “TV A Lưới”). Ngày đó KHÔNG ghi giờ ở bảng tổ gốc (BM-04 ghi “→01”).",
             "Cuối ca: cộng hàng (giờ từng người), cộng cột (số người từng giờ), chép sản lượng từ sổ ca, ký, chốt trong vòng 2 giờ sau ca.",
             "Trưởng ca vắng → phó ca ghi, ghi rõ tên người ghi. Trưởng ca ghi công cho chính mình như mọi người; QLSX xác nhận.",
         ]),
         ("h2", "3. Ký hiệu trên bảng tháng (BM-04)"),
         ("table", dict(
             cols=[("Ghi", 2.2), ("Nghĩa", 16.8)], font=9, rowh=0.7,
             rows=[
                 ["8 / 12 / 4…", "Số giờ làm trong ngày (bội số 0,5; tối đa 12, quá 12 phải có ghi chú và QLSX ký)"],
                 ["12Đ", "Chữ Đ sau số giờ = ca đêm (hưởng phụ cấp đêm)"],
                 ["P", "Nghỉ phép có đơn"],
                 ["L", "Nghỉ lễ theo lịch"],
                 ["K", "Nghỉ không phép / không báo"],
                 ["→01", "Ngày đó làm trong ca sản xuất, đã ghi ở BM-01 — KHÔNG ghi giờ ở đây"],
             ])),
     ], slug="bm-00-danh-muc-ma-viec")

# ---------- BM-01 ----------
bm01_cols = [("STT", 0.7), ("Mã NV", 1.6), ("Họ tên", 3.5)]
bm01_cols += [(f"{i + 1}\n{h}h", 1.0) for i, h in enumerate(HOURS_DAY)]
bm01_cols += [("S", 0.85), ("H", 0.85), ("C", 0.85), ("R", 0.85), ("V", 0.85), ("T", 0.85), ("L", 0.85), ("Tổng", 1.0), ("Ghi chú", 2.8)]
form("BM-01", "BẢNG PHÂN CÔNG CA THEO GIỜ", "L",
     "1 ô = 1 người × 1 giờ × 1 mã việc (xem BM-00). Ghi ngay lúc điều người.",
     [
         ("fields", ["Nhà máy: " + BOX + " Phong Điền  " + BOX + " Quảng Trị  " + BOX + " Lào",
                     "Ngày ____/____/2026", "Ca: " + BOX + " Ngày 06–18  " + BOX + " Đêm 18–06 (cột 1 = 18h)",
                     "Trưởng ca: ______________________", "Người ghi: ______________________", "Số: ________"]),
         ("table", dict(
             cols=[("Số lệnh", 2.4), ("Lệnh việc đang mở trong ca — nội dung", 9.8), ("Mã ghi", 1.6),
                   ("ĐM còn lại (giờ-người)", 3.0), ("Số lệnh", 2.4), ("Nội dung", 5.6), ("Mã", 1.2), ("ĐM còn lại", 1.7)],
             rows=2, rowh=0.58, font=8)),
         ("table", dict(
             cols=bm01_cols, rows=16, rowh=0.56, font=8,
             footer=[
                 [("Số người theo giờ →  S (dây chuyền)", 3)] + [""] * 12 + [("Cộng giờ cả ca →", 7), "", ""],
                 [("R", 3)] + [""] * 12 + [("Định biên tối thiểu S: ______ người/giờ", 9)],
                 [("V", 3)] + [""] * 12 + [("Giờ S thấp nhất trong ca: ______ người (giờ thứ ___)", 9)],
                 [("H / C / T / L", 3)] + [""] * 12 + [("Tổng giờ ca = Σ hàng = Σ cột = ______", 9)],
             ])),
         ("cols2", [
             ("fields", ["SẢN LƯỢNG CA (chép từ sổ ca): SVR ________ tấn", "Hanging ________ tấn", "Chèn ________ tấn",
                         "RSS ________ kiện", "Khác: ______________________"]),
             ("check", ["Σ giờ các hàng = Σ giờ các cột",
                        "Mọi giờ đều có S ≥ định biên tối thiểu (nếu không: ghi giờ thứ mấy vào ô trên)",
                        "Mọi ô R/V/L đều thuộc lệnh đang mở và không vượt ĐM còn lại",
                        "Chốt trước ______ giờ (≤ 2h sau ca)"]),
         ], [
             ("sign", ["Trưởng ca (ghi giờ chốt)", "QLSX xác nhận", "HCNS nhận (ghi ngày)"]),
         ], 15.8, 11.9),
     ], slug="bm-01-bang-phan-cong-ca")

# ---------- BM-02 ----------
form("BM-02", "LỆNH VIỆC", "P",
     "Mở TRƯỚC khi có việc ngoài dây chuyền SVR. Không có lệnh = không ghi giờ = không có tiền.",
     [
         ("fields", ["Số lệnh: LV-______-______", "Ngày mở: ____/____/2026",
                     "Nhà máy: " + BOX + " PĐ  " + BOX + " QT  " + BOX + " Lào", "Người mở (QLSX): ____________________"]),
         ("table", dict(
             cols=[("Mục", 4.6), ("Nội dung", 14.4)], font=9, rowh=0.9,
             rows=[
                 ["Nội dung công việc", ""],
                 ["Địa điểm / máy / lô hàng", ""],
                 ["Mã ghi trên bảng BM-01", BOX + " R (RSS)     " + BOX + " V (Vệ sinh)     " + BOX + " L (Việc khác)"],
                 ["Cách trả lương", BOX + " Theo giờ ______________ đ/giờ     " + BOX + " Theo công (8h) ______________ đ/công\n"
                                    + BOX + " Theo sản phẩm ______________ đ/(kiện · tấn · lượt)     " + BOX + " Chia chung vào quỹ tổ"],
                 ["Định mức", "Tổng ______ giờ-người      Tối đa ______ giờ-người/ca      Số người tối đa cùng lúc ______"],
                 ["Đầu ra dự kiến", "______________ (kiện / tấn / lượt / m²)"],
                 ["Hạn hoàn thành", "____/____/2026"],
                 ["Lý do / căn cứ", ""],
             ])),
         ("sign", ["Người mở (QLSX)", "HCNS kiểm đơn giá & định mức", "Giám đốc NM duyệt (nếu > ______ đ)"]),
         ("h2", "Theo dõi thực hiện (trưởng ca ghi mỗi ca có dùng lệnh)"),
         ("table", dict(
             cols=[("Ngày", 2.0), ("Ca", 1.4), ("Số người", 1.7), ("Giờ-người ca này", 2.4), ("Luỹ kế giờ-người", 2.6),
                   ("Còn lại so ĐM", 2.4), ("Đầu ra ca này", 2.4), ("Trưởng ca ký", 2.2), ("Ghi chú", 1.9)],
             rows=10, rowh=0.6, font=8.5)),
         ("h2", "Đóng lệnh"),
         ("fields", ["Ngày đóng: ____/____/2026", "Tổng giờ-người thực tế: ________ / ĐM ________",
                     "Đầu ra thực tế: ______________", "Vượt ĐM: " + BOX + " Không  " + BOX + " Có — lý do: ______________________________"]),
         ("sign", ["QLSX đóng lệnh", "HCNS xác nhận để tính lương"]),
     ], slug="bm-02-lenh-viec")

# ---------- BM-03 ----------
form("BM-03", "SỔ ĐĂNG KÝ LỆNH VIỆC", "L",
     "QLSX giữ. Mỗi lệnh 1 dòng; cập nhật luỹ kế theo BM-02 mỗi tuần.",
     [
         ("fields", ["Tháng ____/2026", "Nhà máy: " + BOX + " PĐ  " + BOX + " QT  " + BOX + " Lào", "QLSX: ______________________"]),
         ("table", dict(
             cols=[("Số lệnh", 2.2), ("Ngày mở", 1.8), ("Nội dung công việc", 6.2), ("Mã", 1.0), ("Cách trả / đơn giá", 3.6),
                   ("ĐM giờ-người", 1.9), ("Luỹ kế đã ghi", 1.9), ("Còn lại", 1.6), ("Hạn", 1.8), ("Trạng thái\nMở / Đóng", 1.9),
                   ("Người mở", 2.0), ("Ngày đóng", 1.8)],
             rows=16, rowh=0.62, font=8)),
         ("sign", ["QLSX", "HCNS đối chiếu cuối tháng"]),
     ], slug="bm-03-so-dang-ky-lenh-viec")

# ---------- BM-04 ----------
bm04_cols = [("STT", 0.7), ("Mã", 1.4), ("Họ tên", 2.9)] + [(str(d), 0.57) for d in range(1, 32)]
bm04_cols += [("Tổng giờ", 0.95), ("Công", 0.95), ("Đêm", 0.85), ("P", 0.6), ("L", 0.6), ("Ký nhận", 1.0)]
form("BM-04", "BẢNG CHẤM CÔNG TỔ THEO THÁNG", "L",
     "Dùng cho tổ thời vụ / trực lò / RSS / A Lưới — ghi SỐ GIỜ mỗi ngày (ký hiệu xem BM-00 mục 3).",
     [
         ("fields", ["Tổ: ______________________", "Tháng ____/2026", "Người quản lý tổ: ______________________",
                     "Nhà máy / điểm: ______________"]),
         ("table", dict(cols=bm04_cols, rows=20, rowh=0.6, font=7.5,
                        footer=[[("Số người có mặt theo ngày →", 3)] + [""] * 31 + [("", 6)]])),
         ("note", "Số = giờ làm (bội số 0,5; > 12 phải ghi chú + QLSX ký) · 12Đ = ca đêm · P phép · L lễ · K không phép · "
                  "→01 = ngày đó làm trong ca sản xuất, đã ghi ở BM-01, KHÔNG ghi giờ ở đây. Công = tổng giờ ÷ 8 (trực lò: ÷ 12)."),
         ("sign", ["Người quản lý tổ", "QLSX / Trưởng bộ phận", "HCNS nhận (ngày, ký)"]),
     ], slug="bm-04-bang-cham-cong-to-thang")

# ---------- BM-05 ----------
bm05 = [
    ("fields", ["Số: ________", "Ngày: ____/____/2026",
                "Bảng cần sửa: " + BOX + " BM-01 ngày ____/____ ca ______    " + BOX + " BM-04 tổ ______________ tháng ____"]),
    ("fields", ["Người được điều chỉnh — Mã: ______________", "Họ tên: ____________________________"]),
    ("table", dict(
        cols=[("Ngày / giờ", 3.2), ("Đang ghi (cũ)", 6.0), ("Đề nghị sửa thành (mới)", 6.0), ("Chênh lệch giờ", 3.8)],
        rows=3, rowh=0.7, font=9)),
    ("fields", ["Lý do (bắt buộc): ________________________________________________________________"]),
    ("fields", ["Nguồn đề nghị: " + BOX + " Trưởng ca   " + BOX + " Người lao động   " + BOX + " HCNS đối chiếu (BM-06)   " + BOX + " QLSX"]),
    ("sign", ["Người đề nghị", "QLSX duyệt", "HCNS cập nhật (ngày, ký)"]),
]
form("BM-05", "PHIẾU ĐIỀU CHỈNH CÔNG SAU CHỐT", "P",
     "Mọi thay đổi trên bảng đã chốt phải qua phiếu này. Không sửa trực tiếp lên bảng.",
     bm05 + [("cut",)] + bm05, slug="bm-05-phieu-dieu-chinh-cong")

# ---------- BM-06 ----------
form("BM-06", "BẢNG ĐỐI CHIẾU CA", "L",
     "HCNS lập hàng tuần từ BM-01 + sổ ca. Chỉ kiểm ca có cờ — không cần kiểm hết.",
     [
         ("fields", ["Tuần từ ____/____ đến ____/____/2026", "Nhà máy: ______",
                     "Dải bình thường: SVR ______–______ tấn/giờ-người S", "RSS ______–______ kiện/giờ-người R",
                     "Định biên tối thiểu S: ______ người"]),
         ("table", dict(
             cols=[("Ngày", 1.5), ("Ca", 1.0), ("Trưởng ca", 2.0), ("Số người", 1.2), ("Giờ S", 1.2), ("Giờ khác\nR/V/L/H/C/T", 1.6),
                   ("Σ giờ", 1.2), ("= người × 12?", 1.4), ("Tấn SVR", 1.3), ("Tấn / giờ-người S", 1.6), ("Kiện RSS", 1.2),
                   ("Giờ R", 1.1), ("Kiện / giờ-người R", 1.6), ("Giờ có S < định biên", 1.6), ("Lệnh vượt ĐM", 1.4),
                   ("Chốt đúng hạn", 1.3), ("Cờ\nV / Đ", 1.0), ("Xử lý / kết luận", 3.0)],
             rows=14, rowh=0.62, font=7.5)),
         ("note", "CỜ VÀNG = 1 chỉ số lệch dải (năng suất, định biên, lệnh vượt ĐM, chốt trễ) → hỏi trưởng ca, ghi kết luận. "
                  "CỜ ĐỎ = từ 2 chỉ số lệch, hoặc Σ giờ ≠ người × 12, hoặc có kiện RSS mà 0 giờ R → QLSX kiểm và ký trước khi HCNS nhập tính lương."),
         ("sign", ["HCNS lập", "QLSX xem & ký ca cờ đỏ"]),
     ], slug="bm-06-bang-doi-chieu-ca")

# ---------- BM-07 ----------
form("BM-07", "BẢNG TỔNG HỢP CÔNG THÁNG THEO MÃ VIỆC", "L",
     "HCNS lập từ BM-01 + BM-04. Niêm yết 2 ngày để người lao động kiểm tra; khiếu nại bằng BM-05.",
     [
         ("fields", ["Tháng ____/2026", "Tổ / ca: ______________________", "Niêm yết từ ____/____ đến ____/____",
                     "Nguồn: BM-01 số ______ → ______; BM-04 tổ ______________"]),
         ("table", dict(
             cols=[("STT", 0.7), ("Mã NV", 1.7), ("Họ tên", 3.6), ("Giờ S", 1.3), ("Giờ H", 1.1), ("Giờ C", 1.1), ("Giờ R", 1.3),
                   ("Giờ V", 1.1), ("Giờ T", 1.1), ("Giờ L", 1.1), ("Tổng giờ", 1.4), ("Công\n(giờ ÷ 8)", 1.4), ("Số ca", 1.1),
                   ("Ca đêm", 1.1), ("P", 0.8), ("L", 0.8), ("Ký nhận NLĐ", 2.4), ("Khiếu nại (số BM-05)", 2.5)],
             rows=18, rowh=0.6, font=8,
             footer=[[("Cộng", 3)] + [""] * 13 + [("", 2)]])),
         ("sign", ["HCNS lập", "QLSX", "Giám đốc nhà máy"]),
     ], slug="bm-07-tong-hop-cong-thang")

# ---------- HƯỚNG DẪN TRƯỞNG CA ----------
form("HD", "HƯỚNG DẪN TRƯỞNG CA — GHI BẢNG PHÂN CÔNG CA (BM-01)", "P",
     "1 trang. Đọc kỹ trước ngày áp dụng. Thắc mắc hỏi HCNS.",
     [
         ("h2", "Đầu ca (5 phút)"),
         ("list", [
             "Lấy tờ BM-01 mới, ghi ngày, ca, tên mình, số tờ. Ghi tên người có mặt (hoặc dùng tờ đã in sẵn tên tổ).",
             "Chép các lệnh việc đang mở (từ bảng dán ở xưởng) vào ô “Lệnh việc đang mở”, kèm định mức còn lại.",
             "Người có mặt và đang ở dây chuyền: ghi S vào cột giờ 1. Người chưa vào: để trống.",
         ]),
         ("h2", "Trong ca — mỗi lần điều người (10 giây)"),
         ("list", [
             "Chuyển ai sang việc gì → ghi mã việc (R/V/L/H/C/T) vào ô giờ hiện tại của người đó. Trước phút 30 ghi vào giờ này; sau phút 30 ghi từ giờ sau.",
             "Người quay lại dây chuyền → ghi S từ ô giờ đó.",
             "Việc chưa có lệnh (không có trong ô lệnh đang mở) → GỌI QLSX MỞ LỆNH trước, chưa ghi.",
             "Người tổ khác / thời vụ vào giúp → thêm dòng cuối bảng, ghi tổ gốc ở Ghi chú.",
             "Số người S trong giờ tụt dưới định biên tối thiểu → báo QLSX ngay, ghi giờ đó vào ô “Giờ S thấp nhất”.",
         ]),
         ("h2", "Cuối ca (10 phút)"),
         ("list", [
             "Người về sớm: ô giờ không làm để trống. Không ghi mã cho giờ chưa làm.",
             "Cộng hàng: đếm chữ cái từng người → điền cột S/H/C/R/V/T/L và Tổng.",
             "Cộng cột: đếm số người S, R, V, khác ở mỗi giờ → điền 4 dòng “Số người theo giờ”.",
             "Kiểm: Σ Tổng các hàng phải = Σ 4 dòng số người × 1 giờ. Lệch → tìm ô ghi thiếu / thừa.",
             "Chép sản lượng ca từ sổ ca (SVR tấn, hanging, chèn, kiện RSS). Tick 4 ô kiểm nhanh. Ký, ghi giờ chốt.",
             "Nộp QLSX xác nhận trong vòng 2 giờ sau ca (chụp ảnh gửi HCNS nếu QLSX vắng).",
         ]),
         ("h2", "Khi sai"),
         ("bullets", [
             "Chưa chốt: gạch chéo ô sai 1 nét, ghi mã đúng bên cạnh, ký nháy.",
             "Đã chốt: KHÔNG sửa lên bảng. Viết BM-05 (phiếu điều chỉnh), có lý do, QLSX duyệt.",
             "Trưởng ca vắng: phó ca ghi và ghi rõ tên mình ở ô Người ghi.",
         ]),
         ("h2", "Vì sao phải ghi đúng"),
         ("p", "Quỹ khoán SVR chỉ chia cho giờ S. Ghi S cho người đang làm RSS/vệ sinh là lấy tiền của người đứng máy chia cho người không đứng máy. "
               "Ghi R/V/L đúng thì người làm việc đó được trả đích danh theo lệnh. Sản lượng ca do người khác ghi — bảng lệch sản lượng sẽ bị hỏi."),
     ], slug="hd-huong-dan-truong-ca")

# ===========================================================================
# XUẤT DOCX
# ===========================================================================
A4_W, A4_H = Cm(21.0), Cm(29.7)
MARGIN = Cm(1.0)
DOCX_ROW_ADJ = -0.06  # Word cộng thêm lề ô vào chiều cao dòng → trừ lại để bằng bản HTML


def _set_font(run, size, bold=False, italic=False, color=None):
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.name = "Arial"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
    if color:
        run.font.color.rgb = RGBColor.from_string(color)


def _shade(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    tcPr.append(shd)


def _cell_margins(table, top=15, left=40, bottom=15, right=40):
    tblPr = table._tbl.tblPr
    mar = OxmlElement("w:tblCellMar")
    for k, v in (("top", top), ("left", left), ("bottom", bottom), ("right", right)):
        el = OxmlElement(f"w:{k}")
        el.set(qn("w:w"), str(v))
        el.set(qn("w:type"), "dxa")
        mar.append(el)
    tblPr.append(mar)


def _cell_text(cell, text, size, bold=False, align=None, italic=False):
    cell.text = ""
    lines = str(text).split("\n")
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.space_before = Pt(0)
    if align:
        p.alignment = align
    for i, line in enumerate(lines):
        r = p.add_run(line)
        _set_font(r, size, bold=bold, italic=italic)
        if i < len(lines) - 1:
            r.add_break()
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER


def _para(doc, text, size=9.5, bold=False, italic=False, align=None, after=3, before=0, color=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.space_before = Pt(before)
    if align:
        p.alignment = align
    r = p.add_run(text)
    _set_font(r, size, bold=bold, italic=italic, color=color)
    return p


def docx_table(doc, spec):
    cols = spec["cols"]
    rows = spec.get("rows", 0)
    body = rows if isinstance(rows, list) else [[""] * len(cols) for _ in range(rows)]
    footer = spec.get("footer", [])
    font = spec.get("font", 8)
    rowh = spec.get("rowh", 0.6)
    n_rows = 1 + len(body) + len(footer)
    t = doc.add_table(rows=n_rows, cols=len(cols))
    t.style = "Table Grid"
    t.autofit = False
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    _cell_margins(t)
    for ci, (label, w) in enumerate(cols):
        t.columns[ci].width = Cm(w)
        for row in t.rows:
            row.cells[ci].width = Cm(w)
    # header
    hdr = t.rows[0]
    hdr.height = Cm(0.55)
    hdr.height_rule = WD_ROW_HEIGHT_RULE.AT_LEAST
    for ci, (label, w) in enumerate(cols):
        c = hdr.cells[ci]
        _cell_text(c, label, font, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
        _shade(c, "E6E6E6")
    # body
    for ri, data in enumerate(body, start=1):
        row = t.rows[ri]
        row.height = Cm(max(0.45, rowh + DOCX_ROW_ADJ))
        row.height_rule = WD_ROW_HEIGHT_RULE.AT_LEAST
        for ci, val in enumerate(data):
            bold = ci == 0 and isinstance(rows, list) and spec.get("first_col_bold", True)
            _cell_text(row.cells[ci], val, font, bold=bold)
    # footer rows with spans
    for fi, fdata in enumerate(footer):
        row = t.rows[1 + len(body) + fi]
        row.height = Cm(max(0.45, rowh + DOCX_ROW_ADJ))
        row.height_rule = WD_ROW_HEIGHT_RULE.AT_LEAST
        ci = 0
        for item in fdata:
            text, span = (item if isinstance(item, tuple) else (item, 1))
            if span > 1:
                merged = row.cells[ci].merge(row.cells[ci + span - 1])
                _cell_text(merged, text, font, bold=True)
            else:
                _cell_text(row.cells[ci], text, font, bold=bool(text))
            _shade(row.cells[ci], "F3F3F3")
            ci += span
    _gap(doc)
    return t


def _gap(doc):
    """Đoạn trống mỏng sau bảng (Word bắt buộc có paragraph giữa 2 bảng)."""
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    p.paragraph_format.line_spacing = Pt(5)
    return p


def docx_sign(doc, labels):
    # nhãn → "(ký, ghi rõ họ tên)" → khoảng trống 1,2 cm để ký
    t = doc.add_table(rows=3, cols=len(labels))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for ci, lab in enumerate(labels):
        _cell_text(t.rows[0].cells[ci], lab, 9, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
        _cell_text(t.rows[1].cells[ci], "(ký, ghi rõ họ tên)", 8, italic=True, align=WD_ALIGN_PARAGRAPH.CENTER)
        _cell_text(t.rows[2].cells[ci], "", 8)
    t.rows[2].height = Cm(1.0)
    t.rows[2].height_rule = WD_ROW_HEIGHT_RULE.AT_LEAST
    _gap(doc)


def docx_blocks(doc, blocks):
    """doc = Document hoặc _Cell (khi lồng trong cols2)."""
    for blk in blocks:
        kind = blk[0]
        if kind == "h2":
            _para(doc, blk[1], size=10, bold=True, before=4, after=2, color="1F5A3A")
        elif kind == "p":
            _para(doc, blk[1], size=9.5, after=4)
        elif kind == "note":
            _para(doc, blk[1], size=8, italic=True, after=4, color="444444")
        elif kind == "fields":
            _para(doc, "     ".join(blk[1]), size=9, after=4)
        elif kind == "list":
            for i, item in enumerate(blk[1], 1):
                p = _para(doc, f"{i}. {item}", size=9, after=1)
                p.paragraph_format.left_indent = Cm(0.5)
                p.paragraph_format.first_line_indent = Cm(-0.5)
            doc.add_paragraph().paragraph_format.space_after = Pt(1)
        elif kind == "bullets":
            for item in blk[1]:
                p = _para(doc, "•  " + item, size=9, after=1)
                p.paragraph_format.left_indent = Cm(0.5)
                p.paragraph_format.first_line_indent = Cm(-0.5)
            doc.add_paragraph().paragraph_format.space_after = Pt(1)
        elif kind == "check":
            _para(doc, "KIỂM NHANH TRƯỚC KHI KÝ:   " + "     ".join(BOX + " " + c for c in blk[1]), size=8, after=2)
        elif kind == "table":
            docx_table(doc, blk[1])
        elif kind == "sign":
            docx_sign(doc, blk[1])
        elif kind == "cut":
            _para(doc, "✂ " + "- " * 70, size=8, align=WD_ALIGN_PARAGRAPH.CENTER, color="888888", before=6, after=6)
        elif kind == "spacer":
            doc.add_paragraph().paragraph_format.space_after = Pt(blk[1] * 28)
        elif kind == "cols2":
            _, left, right, lw, rw = blk
            t = doc.add_table(rows=1, cols=2)   # không viền
            t.autofit = False
            for ci, w in enumerate((lw, rw)):
                t.columns[ci].width = Cm(w)
                t.rows[0].cells[ci].width = Cm(w)
            trPr = t.rows[0]._tr.get_or_add_trPr()
            trPr.append(OxmlElement("w:cantSplit"))      # hàng không được tách sang trang sau
            for ci, sub in enumerate((left, right)):
                cell = t.rows[0].cells[ci]
                docx_blocks(cell, sub)
                first = cell.paragraphs[0]
                if not first.text and len(cell.paragraphs) > 1:
                    first._element.getparent().remove(first._element)
                # cell.add_table() tự chèn 1 đoạn rỗng sau bảng + _gap → gom về 1 đoạn 2pt,
                # kẻo 2 dòng trống này làm hàng cao thêm ~1,5 dòng và tràn trang.
                paras = cell.paragraphs
                while len(paras) > 1 and not paras[-1].text and not paras[-2].text:
                    paras[-1]._element.getparent().remove(paras[-1]._element)
                    paras = cell.paragraphs
                last = paras[-1]
                if not last.text:
                    last.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
                    last.paragraph_format.line_spacing = Pt(2)
                    last.paragraph_format.space_after = Pt(0)
                    last.paragraph_format.space_before = Pt(0)
                cell.vertical_alignment = WD_ALIGN_VERTICAL.TOP


def build_docx():
    doc = Document()
    st = doc.styles["Normal"]
    st.font.name = "Arial"
    st.font.size = Pt(9.5)
    st.element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")

    for idx, f in enumerate(FORMS):
        sec = doc.sections[0] if idx == 0 else doc.add_section(WD_SECTION.NEW_PAGE)
        if idx > 0:
            # add_section() để lại 1 đoạn rỗng mang sectPr ở cuối form trước + đoạn _gap → thu nhỏ
            # kẻo 2 đoạn đó rớt sang trang trắng khi form vừa khít trang.
            for p in doc.paragraphs[-2:]:
                if not p.text:
                    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
                    p.paragraph_format.line_spacing = Pt(2)
                    p.paragraph_format.space_after = Pt(0)
                    p.paragraph_format.space_before = Pt(0)
        if f["orient"] == "L":
            sec.orientation = WD_ORIENT.LANDSCAPE
            sec.page_width, sec.page_height = A4_H, A4_W
        else:
            sec.orientation = WD_ORIENT.PORTRAIT
            sec.page_width, sec.page_height = A4_W, A4_H
        sec.left_margin = sec.right_margin = MARGIN
        sec.top_margin = sec.bottom_margin = Cm(0.6)

        # tiêu đề
        head = doc.add_paragraph()
        head.paragraph_format.space_after = Pt(0)
        r = head.add_run("CÔNG TY CỔ PHẦN CAO SU HUY ANH")
        _set_font(r, 8, color="555555")
        r2 = head.add_run(("      Mẫu " + f["code"]) if f["code"] else "")
        _set_font(r2, 8, bold=True, color="1F5A3A")
        _para(doc, f["title"], size=13, bold=True, after=0)
        if f["sub"]:
            _para(doc, f["sub"], size=8.5, italic=True, after=4, color="444444")

        docx_blocks(doc, f["blocks"])
    doc.save(OUT_DOCX)
    return OUT_DOCX


# ===========================================================================
# XUẤT HTML (in thẳng từ trình duyệt)
# ===========================================================================
CSS = """
:root{--ink:#1b1b1b;--muted:#4a4a4a;--line:#3c3c3c;--shade:#e6e6e6;--shade2:#f3f3f3;--accent:#1f5a3a;--paper:#fff;--bg:#d6dad4}
*{box-sizing:border-box}
html{color-scheme:light}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Arial,"Segoe UI",Helvetica,sans-serif;font-size:9.5pt;line-height:1.3;padding:14px 16px}
.toolbar{position:sticky;top:0;z-index:5;background:var(--accent);color:#fff;padding:10px 14px;border-radius:6px;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;margin:0 auto 14px;max-width:297mm}
.toolbar strong{font-size:11pt;margin-right:6px}
.toolbar a{color:#fff;text-decoration:none;opacity:.92;font-size:9pt;border:1px solid rgba(255,255,255,.35);padding:2px 7px;border-radius:4px}
.toolbar a:hover,.toolbar a:focus-visible{opacity:1;background:rgba(255,255,255,.15);outline:none}
.toolbar button{margin-left:auto;background:#fff;color:var(--accent);border:0;border-radius:4px;padding:6px 12px;font-weight:bold;cursor:pointer;font-size:9.5pt}
.toolbar button:focus-visible{outline:2px solid #fff;outline-offset:2px}
.wrap{overflow-x:auto;max-width:100%}
.page{background:var(--paper);width:297mm;min-height:210mm;margin:0 auto 14px;padding:9mm 10mm;box-shadow:0 2px 10px rgba(0,0,0,.28);break-after:page;page-break-after:always;position:relative}
.page.portrait{width:210mm;min-height:297mm;page:portrait}
.wrap:last-of-type .page{break-after:auto;page-break-after:auto}
.co{font-size:8pt;color:var(--muted);display:flex;justify-content:space-between}
.co b{color:var(--accent)}
h1{font-size:13.5pt;margin:2px 0 0;letter-spacing:.01em}
h1+.sub{font-size:8.5pt;font-style:italic;color:var(--muted);margin:1px 0 6px}
h2{font-size:10pt;color:var(--accent);margin:7px 0 3px}
p{margin:0 0 5px}
.note{font-size:8pt;font-style:italic;color:var(--muted);margin:2px 0 5px}
.fields{display:flex;flex-wrap:wrap;gap:3px 18px;margin:2px 0 6px;font-size:9pt}
ol,ul{margin:0 0 5px;padding-left:18px;font-size:9pt}
li{margin:0 0 2px}
table{border-collapse:collapse;width:100%;table-layout:fixed;margin:0 0 6px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
th,td{border:1px solid var(--line);padding:1px 3px;vertical-align:middle;overflow:hidden;word-wrap:break-word}
th{background:var(--shade);font-weight:bold;text-align:center;line-height:1.15}
td.first{font-weight:bold}
tr.foot td{background:var(--shade2);font-weight:bold}
.check{font-size:8.5pt;margin:2px 0 6px}
.check span{margin-right:14px;white-space:nowrap}
.sign{display:grid;gap:0;margin:4px 0 6px}
.sign div{text-align:center;padding-bottom:12mm}
.cols2{display:grid;gap:6mm;align-items:start}
.cols2 .check span{white-space:normal;display:block}
.sign b{display:block;font-size:9pt}
.sign i{font-size:8pt;color:var(--muted)}
.cut{text-align:center;color:#888;font-size:8pt;margin:8px 0;border-top:1px dashed #999;line-height:0}
.cut span{background:#fff;padding:0 8px}
@page{size:A4 landscape;margin:7mm}
@page portrait{size:A4 portrait;margin:7mm}
@media print{
  body{background:#fff;padding:0}
  .toolbar{display:none}
  .wrap{overflow:visible}
  .page{box-shadow:none;margin:0;width:auto;min-height:0;padding:1mm 2mm}
}
"""


def esc(s):
    return _html.escape(str(s)).replace("\n", "<br>")


def html_table(spec):
    cols = spec["cols"]
    rows = spec.get("rows", 0)
    body = rows if isinstance(rows, list) else [[""] * len(cols) for _ in range(rows)]
    footer = spec.get("footer", [])
    font = spec.get("font", 8)
    rowh = spec.get("rowh", 0.6)
    total = sum(w for _, w in cols)
    out = [f'<table style="font-size:{font}pt"><colgroup>']
    for _, w in cols:
        out.append(f'<col style="width:{w / total * 100:.2f}%">')
    out.append("</colgroup><thead><tr>")
    for label, _ in cols:
        out.append(f"<th>{esc(label)}</th>")
    out.append("</tr></thead><tbody>")
    for data in body:
        out.append(f'<tr style="height:{rowh * 10:.1f}mm">')
        for ci, val in enumerate(data):
            cls = ' class="first"' if (ci == 0 and isinstance(rows, list) and val) else ""
            out.append(f"<td{cls}>{esc(val)}</td>")
        out.append("</tr>")
    for fdata in footer:
        out.append(f'<tr class="foot" style="height:{rowh * 10:.1f}mm">')
        for item in fdata:
            text, span = (item if isinstance(item, tuple) else (item, 1))
            sp = f' colspan="{span}"' if span > 1 else ""
            out.append(f"<td{sp}>{esc(text)}</td>")
        out.append("</tr>")
    out.append("</tbody></table>")
    return "".join(out)


def html_blocks(blocks):
    parts = []
    for blk in blocks:
        kind = blk[0]
        if kind == "h2":
            parts.append(f"<h2>{esc(blk[1])}</h2>")
        elif kind == "p":
            parts.append(f"<p>{esc(blk[1])}</p>")
        elif kind == "note":
            parts.append(f'<p class="note">{esc(blk[1])}</p>')
        elif kind == "fields":
            parts.append('<div class="fields">' + "".join(f"<span>{esc(x)}</span>" for x in blk[1]) + "</div>")
        elif kind == "list":
            parts.append("<ol>" + "".join(f"<li>{esc(x)}</li>" for x in blk[1]) + "</ol>")
        elif kind == "bullets":
            parts.append("<ul>" + "".join(f"<li>{esc(x)}</li>" for x in blk[1]) + "</ul>")
        elif kind == "check":
            parts.append('<div class="check"><b>KIỂM NHANH TRƯỚC KHI KÝ:</b> '
                         + "".join(f"<span>{BOX} {esc(x)}</span>" for x in blk[1]) + "</div>")
        elif kind == "table":
            parts.append(html_table(blk[1]))
        elif kind == "sign":
            n = len(blk[1])
            parts.append(f'<div class="sign" style="grid-template-columns:repeat({n},1fr)">'
                         + "".join(f"<div><b>{esc(x)}</b><i>(ký, ghi rõ họ tên)</i></div>" for x in blk[1]) + "</div>")
        elif kind == "cut":
            parts.append('<div class="cut"><span>✂ cắt theo đường này</span></div>')
        elif kind == "cols2":
            _, left, right, lw, rw = blk
            parts.append(f'<div class="cols2" style="grid-template-columns:{lw}fr {rw}fr">'
                         f'<div>{html_blocks(left)}</div><div>{html_blocks(right)}</div></div>')
    return "".join(parts)


def build_html():
    parts = ["<title>Biểu mẫu chấm công sản xuất</title>", f"<style>{CSS}</style>"]
    parts.append('<div class="toolbar"><strong>Biểu mẫu chấm công SX</strong>')
    for f in FORMS:
        if f["code"]:
            parts.append(f'<a href="#{f["code"]}">{esc(f["code"])}</a>')
    parts.append(f'<a href="{GUIDE_HTML}">📘 Hướng dẫn triển khai</a>'
                 f'<a href="bieu-mau/{os.path.basename(OUT_DOCX)}">⬇ Word</a>'
                 f'<a href="bieu-mau/{os.path.basename(OUT_PDF)}">⬇ PDF</a>')
    parts.append('<button type="button" onclick="window.print()">🖨 In / Lưu PDF</button></div>')

    for f in FORMS:
        cls = "page portrait" if f["orient"] == "P" else "page"
        anchor = f' id="{f["code"]}"' if f["code"] else ""
        parts.append(f'<div class="wrap"><section class="{cls}"{anchor}>')
        parts.append('<div class="co"><span>CÔNG TY CỔ PHẦN CAO SU HUY ANH</span>'
                     + (f'<b>Mẫu {esc(f["code"])}</b>' if f["code"] else "") + "</div>")
        parts.append(f"<h1>{esc(f['title'])}</h1>")
        if f["sub"]:
            parts.append(f'<div class="sub">{esc(f["sub"])}</div>')
        parts.append(html_blocks(f["blocks"]))
        parts.append("</section></div>")
    with open(OUT_HTML, "w", encoding="utf-8") as fh:
        fh.write("\n".join(parts))
    return OUT_HTML


def build_pdfs():
    """In HTML → PDF bằng Edge/Chrome headless, rồi tách từng mẫu (1 mẫu = 1 trang)."""
    browsers = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        shutil.which("msedge"), shutil.which("chrome"), shutil.which("google-chrome"), shutil.which("chromium"),
    ]
    exe = next((b for b in browsers if b and os.path.exists(b)), None)
    if not exe:
        print("PDF: bỏ qua (không tìm thấy Edge/Chrome)")
        return
    subprocess.run([exe, "--headless=new", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer",
                    f"--print-to-pdf={OUT_PDF}", "file:///" + OUT_HTML.replace("\\", "/")],
                   check=True, capture_output=True, timeout=120)
    try:
        import fitz  # PyMuPDF
    except ImportError:
        print("PDF:", OUT_PDF, "(không tách từng mẫu — thiếu PyMuPDF)")
        return
    src = fitz.open(OUT_PDF)
    if len(src) != len(FORMS):
        print(f"PDF: {len(src)} trang ≠ {len(FORMS)} mẫu — có mẫu tràn trang, KHÔNG tách từng mẫu")
        return
    for i, f in enumerate(FORMS):
        one = fitz.open()
        one.insert_pdf(src, from_page=i, to_page=i)
        one.save(os.path.join(OUT_DIR, f["slug"] + ".pdf"), garbage=4, deflate=True)
    print("PDF:", OUT_PDF, f"+ {len(FORMS)} file từng mẫu")


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    print("DOCX:", build_docx())
    print("HTML:", build_html())
    build_pdfs()
