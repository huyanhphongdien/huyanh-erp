/* ============================================================================
 * build_annex_template.cjs — Dựng template_ANNEX.docx (Nấc 2)
 * Giữ nguyên gói .docx gốc (letterhead/logo header, styles, sectPr) của file
 * Annex thật, chỉ THAY phần thân bằng đoạn sạch có token {..} cho docxtemplater.
 *
 * Chạy:  node docs/contract-templates/build_annex_template.cjs
 * ========================================================================== */
const fs = require('fs')
const PizZip = require('pizzip')

const SRC = 'docs/du lieu tho/ANNEX CONTRACT HA20260053 VITRY.docx'
const OUT = 'public/contract-templates/template_ANNEX.docx'

// ── Helpers dựng OOXML ──
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function run(text, { b = false, u = false, sz = 22 } = {}) {
  const rpr = `<w:rPr>${b ? '<w:b/>' : ''}${u ? '<w:u w:val="single"/>' : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`
  return `<w:r>${rpr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
}
function para(runs, { center = false, after = 120 } = {}) {
  const ppr = `<w:pPr>${center ? '<w:jc w:val="center"/>' : ''}<w:spacing w:after="${after}" w:line="259" w:lineRule="auto"/></w:pPr>`
  return `<w:p>${ppr}${(Array.isArray(runs) ? runs : [runs]).join('')}</w:p>`
}
const blank = () => para([run('', {})], { after: 0 })

// ── Thân Annex (token { }) — bám sát mẫu HA20260053/PH/AC.1 ──
const body = [
  para([run('ANNEX CONTRACT', { b: true, sz: 36 })], { center: true, after: 80 }),
  para([run('No: {annex_no}', { b: true, sz: 22 })], { center: true, after: 40 }),
  para([run('Dated {annex_date}', { b: true, sz: 22 })], { center: true, after: 120 }),
  para([run('{annex_subject}', { b: true, sz: 24 })], { center: true, after: 200 }),

  // SELLER
  para([run('THE SELLER: ', { b: true, u: true }), run('HUY ANH RUBBER COMPANY LIMITED', { b: true })], { after: 20 }),
  para([run('KHE MA, PHONG DIEN WARD, HUE CITY, VIET NAM')], { after: 20 }),
  para([run('Tel: +84-0234 3774994\t\tFax: +84-0234 3774995')], { after: 160 }),

  // BUYER
  para([run('THE BUYER: ', { b: true, u: true }), run('{buyer_name}', { b: true })], { after: 20 }),
  para([run('{buyer_address}')], { after: 20 }),
  para([run('REGISTRATION NUMBER: {buyer_registration}')], { after: 20 }),
  para([run('MANAGING DIRECTOR: {buyer_md}')], { after: 200 }),

  // Intro
  para([run('This Annex is made and entered into by and between the Parties to amend certain terms of the Sales Contract No. {orig_contract_no} dated {orig_contract_date}.')], { after: 160 }),

  // Clause 1 (đổi số HĐ)
  para([run('1. Pursuant to the Sales Contract No. {orig_contract_no} dated {orig_contract_date}, duly signed by both Parties, and following mutual discussions, the Parties hereby agree to amend the {amend_field} as follows:')], { after: 120 }),
  para([run('•\tOriginal {amend_field}: ', {}), run('{amend_old}', { b: true })], { after: 80 }),
  para([run('•\tAmended {amend_field}: ', {}), run('{amend_new}', { b: true })], { after: 120 }),
  para([run('{amend_effect}')], { after: 160 }),

  // Clauses 2–4 (cố định)
  para([run('2. This Annex is made in English and may be signed and exchanged by email, fax, or electronic transmission. Such copies shall have the same legal validity and effect as the original signed document.')], { after: 120 }),
  para([run('3. Except for the amendment stated above, all other terms and conditions of the Sales Contract No. {orig_contract_no} shall remain unchanged and in full force and effect.')], { after: 120 }),
  para([run('4. This Annex forms an integral part of the Sales Contract No. {orig_contract_no} and shall become effective upon signing by both Parties.')], { after: 320 }),

  // Signatures
  para([run('FOR THE BUYER', { b: true }), run('\t\t\t\t\t'), run('FOR THE SELLER', { b: true })], { after: 0 }),
].join('')

// ── Lắp lại document.xml: giữ phần mở + sectPr gốc ──
const buf = fs.readFileSync(SRC)
const zip = new PizZip(buf)
const doc = zip.file('word/document.xml').asText()
const head = doc.slice(0, doc.indexOf('<w:body>') + '<w:body>'.length)
const sect = doc.slice(doc.lastIndexOf('<w:sectPr')) // sectPr + </w:body></w:document>
const newDoc = head + body + sect

zip.file('word/document.xml', newDoc)
fs.writeFileSync(OUT, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }))
console.log('✓ Đã tạo', OUT, '—', fs.statSync(OUT).size, 'bytes')
