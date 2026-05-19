// Fix justify-align trên paragraph chứa {shipment_time} / {payment} trong 4
// .docx template. Nguyên nhân: justify text + soft line break (\n trong giá
// trị Sale nhập) → Word kéo dãn các từ ra rộng (artifact xấu).
// Cách fix: chỉ đổi <w:jc w:val="both"/> → <w:jc w:val="left"/> trong các
// paragraph đó. Các paragraph khác giữ nguyên justify để không phá layout HĐ.
const PizZip = require('pizzip')
const fs = require('fs')
const path = require('path')

const TEMPLATE_DIR = path.join(__dirname, '..', 'public', 'contract-templates')
const files = ['template_SC_CIF.docx', 'template_PI_CIF.docx', 'template_SC_FOB.docx', 'template_PI_FOB.docx']

const PLACEHOLDER_RE = /\{shipment_time\}|\{payment\}/

for (const f of files) {
  const filepath = path.join(TEMPLATE_DIR, f)
  const buf = fs.readFileSync(filepath)
  const zip = new PizZip(buf)
  const xml = zip.file('word/document.xml').asText()

  let replaced = 0
  const newXml = xml.replace(/<w:p[ >][^]*?<\/w:p>/g, (p) => {
    if (!PLACEHOLDER_RE.test(p)) return p
    const updated = p.replace(/<w:jc w:val="both"\s*\/>/g, () => {
      replaced += 1
      return '<w:jc w:val="left"/>'
    })
    return updated
  })

  if (replaced === 0) {
    console.log(`${f}: KHÔNG có justify cần sửa (skip)`)
    continue
  }

  zip.file('word/document.xml', newXml)
  const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  fs.writeFileSync(filepath, out)
  console.log(`${f}: đã đổi ${replaced} <w:jc> justify → left`)
}
