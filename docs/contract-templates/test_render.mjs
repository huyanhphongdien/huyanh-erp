/**
 * Test render docxtemplater với data preset từ mock.
 * Chạy: node docs/contract-templates/test_render.mjs
 * Output: docs/contract-templates/_out_*.docx (4 file, mở Word check thủ công)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const presets = {
  yoongdo_SC_CIF: {
    template: 'template_SC_CIF.docx',
    data: {
      contract_no: 'HA20260053',
      contract_date: '08 May 2026',
      buyer_name: 'YOONG DO ENGINEERING CO.,LTD',
      buyer_address: '295, YANGYEON-RO, NAM-MYEON, YANGJU-SI, GYEONGGI-DO, REPUBLIC OF KOREA',
      buyer_phone: '',
      grade: 'SVR3L',
      quantity: '20.16',
      unit_price: '2,460',
      amount: '49,593.60',
      incoterm: 'CIF',
      pol: 'Any port, Viet Nam',
      pod: 'Incheon, Korea',
      packing_desc: '35kg/bale with thick polybag, Wooden pallets',
      bales_total: '576',
      pallets_total: '16',
      containers: '01',
      cont_type: '20DC',
      shipment_time: 'June, 2026',
      partial: 'Not Allowed',
      trans: 'Allowed',
      payment: 'LC at sight',
      payment_extra: 'The L/C draft must be opened within five (5) days from the contract signing date.',
      claims_days: '20',
      arbitration: 'SICOM Singapore',
      freight_mark: 'freight prepaid',
    },
  },
  yoongdo_PI_CIF: {
    template: 'template_PI_CIF.docx',
    data: {
      contract_no: 'HA20260053',
      contract_date: '08 May 2026',
      buyer_name: 'YOONG DO ENGINEERING CO.,LTD',
      buyer_address: '295, YANGYEON-RO, NAM-MYEON, YANGJU-SI, GYEONGGI-DO, REPUBLIC OF KOREA',
      grade: 'SVR3L',
      quantity: '20.16',
      unit_price: '2,460',
      amount: '49,593.60',
      amount_words: 'Forty-Nine Thousand Five Hundred Ninety-Three US Dollars and Sixty Cents Only',
      incoterm: 'CIF',
      pod: 'Incheon, Korea',
      packing_desc: '35kg/bale with thick polybag — Wooden pallets',
      containers: '01',
      cont_type: '20DC',
      payment: 'LC at sight',
      payment_extra: 'The L/C draft must be opened within five (5) days from the contract signing date.',
    },
  },
  apollo_SC_FOB: {
    template: 'template_SC_FOB.docx',
    data: {
      contract_no: 'HA20260051',
      contract_date: '08 May 2026',
      buyer_name: 'APOLLO TYRES LTD',
      buyer_address: '7, INSTITUTIONAL AREA, SECTOR 32, GURGAON, INDIA 122001',
      buyer_phone: '1800 212 7070',
      grade: 'RSS3',
      quantity: '201.6',
      unit_price: '2,350',
      amount: '473,760.00',
      incoterm: 'FOB',
      pol: 'Da Nang port, Viet Nam',
      packing_desc: '35kg/bale. Loose bales packing',
      bales_total: '5,760',
      containers: '10',
      cont_type: '20DC',
      shipment_time: '1st Lot: Before 15th June, 2026 / 2nd Lot: Before 30th June, 2026',
      partial: 'Allowed',
      trans: 'Allowed',
      payment: 'CAD 5 days',
      claims_days: '20',
      arbitration: 'SICOM Singapore',
      freight_mark: 'freight Collect',
    },
  },
  apollo_PI_FOB: {
    template: 'template_PI_FOB.docx',
    data: {
      contract_no: 'HA20260051',
      contract_date: '08 May 2026',
      buyer_name: 'APOLLO TYRES LTD',
      buyer_address: '7, INSTITUTIONAL AREA, SECTOR 32, GURGAON, INDIA 122001',
      buyer_phone: '1800 212 7070',
      grade: 'RSS3',
      quantity: '201.6',
      unit_price: '2,350',
      amount: '473,760.00',
      amount_words: 'Four Hundred Seventy-Three Thousand Seven Hundred Sixty US Dollars Only',
      incoterm: 'FOB',
      pol: 'DA NANG PORT, VIET NAM',
      packing_desc: '35 kg/bale. Loose bales packing',
      containers: '10',
      cont_type: '20DC',
      payment: 'CAD 5 days',
    },
  },
};

function render(name, { template, data }) {
  const tplPath = path.join(__dirname, template);
  const content = fs.readFileSync(tplPath, 'binary');
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{', end: '}' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: (part) => {
      // Trả về placeholder gốc cho missing keys (để dễ debug)
      console.warn(`  [warn] missing key: ${part.value}`);
      return `{${part.value}}`;
    },
  });

  try {
    doc.render(data);
  } catch (e) {
    console.error(`✗ Render ${name} thất bại:`, e.message);
    if (e.properties && e.properties.errors) {
      e.properties.errors.forEach((err, i) =>
        console.error(`  [${i}]`, err.message, err.properties)
      );
    }
    return false;
  }

  const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  const outPath = path.join(__dirname, `_out_${name}.docx`);
  fs.writeFileSync(outPath, buf);
  console.log(`✓ ${name} → ${path.relative(process.cwd(), outPath)} (${(buf.length / 1024).toFixed(1)} KB)`);
  return true;
}

console.log('═══ Test render 4 contract templates ═══\n');
let pass = 0, fail = 0;
for (const [name, cfg] of Object.entries(presets)) {
  console.log(`── ${name} ──`);
  const ok = render(name, cfg);
  ok ? pass++ : fail++;
  console.log('');
}
console.log(`Kết quả: ${pass} pass / ${fail} fail / ${Object.keys(presets).length} total`);
process.exit(fail === 0 ? 0 : 1);
