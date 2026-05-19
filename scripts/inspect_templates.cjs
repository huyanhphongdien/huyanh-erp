// Inspect contract templates: count justify-align (w:jc w:val="both") and locate
// the paragraphs containing {shipment_time} and {payment} placeholders.
const PizZip = require('pizzip')
const fs = require('fs')
const path = require('path')

const TEMPLATE_DIR = path.join(__dirname, '..', 'public', 'contract-templates')
const files = ['template_SC_CIF.docx', 'template_PI_CIF.docx', 'template_SC_FOB.docx', 'template_PI_FOB.docx']

for (const f of files) {
  const buf = fs.readFileSync(path.join(TEMPLATE_DIR, f))
  const zip = new PizZip(buf)
  const xml = zip.file('word/document.xml').asText()

  // Count total justify alignments
  const allJc = (xml.match(/<w:jc w:val="both"\s*\/>/g) || []).length

  // Find paragraphs containing the problem placeholders
  // Match <w:p>...</w:p> and check inside for placeholder
  const paragraphs = xml.match(/<w:p[ >][^]*?<\/w:p>/g) || []
  const problematicPs = paragraphs.filter(p =>
    /\{shipment_time\}|\{payment\}/.test(p)
  )
  const problematicJustified = problematicPs.filter(p =>
    /<w:jc w:val="both"\s*\/>/.test(p)
  )

  console.log(`\n=== ${f} ===`)
  console.log(`Total <w:jc w:val="both"/>: ${allJc}`)
  console.log(`Paragraphs containing {shipment_time}/{payment}: ${problematicPs.length}`)
  console.log(`  ...with justify: ${problematicJustified.length}`)

  // Sample first problematic paragraph (truncated)
  if (problematicPs.length > 0) {
    const sample = problematicPs[0].slice(0, 500).replace(/\s+/g, ' ')
    console.log(`Sample paragraph: ${sample}...`)
  }
}
