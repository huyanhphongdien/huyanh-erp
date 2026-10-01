// =============================================================================
// LỊCH TÀU DỰ KIẾN — lấy dữ liệu 2 cảng xuất chính + dựng HTML mail
// =============================================================================
// File này KHÔNG dùng API riêng của Deno (chỉ fetch chuẩn) để chạy thử được bằng Node
// trước khi deploy:  node <scratch>/preview.mjs
//
// Nguồn (đã thử 01/10/2026):
//   · Cảng Đà Nẵng  — Google Sheet "Dự báo tàu đến" cảng công bố (closing, ETA, ETB, ETD, đại lý)
//                     + bảng "Lịch tàu container" cả tháng (để biết tàu thuộc HÃNG nào)
//   · Tân Cảng Cát Lái — dữ liệu của trang tra "Thông tin tàu/chuyến" (số chuyến, closing,
//                     giờ cập, giờ rời dự kiến)
//
// ⚠ Hai cảng KHÔNG công bố điểm đến của tàu → báo cáo này xếp theo CẢNG ĐI và HÃNG,
//   chưa xếp được theo cảng đích. Muốn có cảng đích/ETA phải nối API chính thức của hãng
//   (web hãng chặn truy cập tự động: CMA CGM, MSC, Hapag-Lloyd, Yang Ming, Wan Hai; ONE có
//   Turnstile; COSCO/Evergreen không trả lịch cho request ngoài trình duyệt).
// ⚠ Mọi giờ trong nguồn là giờ Việt Nam. Đừng parse bằng new Date(chuỗi) — máy chủ chạy UTC.
// =============================================================================

const VN_OFFSET_MS = 7 * 3600_000
const DAY_MS = 24 * 3600_000
const USER_AGENT = 'Mozilla/5.0 (compatible; HuyAnhERP-vessel-schedule/1.0; +https://huyanhrubber.vn)'

const DANANG_FORECAST_CSV =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTv6pU5aToxt6xlFZVMwXUEGhfk_TpUGfl54nIOs_kKGaJ3CnZNFVCYDQznVNi_TZvvJoX-uXTLUG5Y/pub?output=csv'
const DANANG_MONTH_PAGE = 'https://danangport.com/dich-vu-khach-hang/lich-tau-container/'
const CATLAI_HOST = 'https://eport.saigonnewport.com.vn'

// Trang NGƯỜI mở được để tự đối chiếu — in ở cuối mail (mục "Nguồn tham khảo").
const DANANG_FORECAST_PAGE = 'https://danangport.com/dich-vu-khach-hang/ke-hoach-ca-du-bao-tau-den/'
const CATLAI_PAGE = `${CATLAI_HOST}/Ships`
// Cảng đích/ETA chỉ hãng có: để sẵn link trang tra lịch của hãng cho người cần tra tay.
const CARRIER_SCHEDULE_PAGES: Array<[string, string]> = [
  ['Evergreen', 'https://ss.shipmentlink.com/tvs2/jsp/TVS2_InteractiveSchedule.jsp'],
  ['Maersk', 'https://www.maersk.com/schedules/pointToPoint'],
  ['COSCO', 'https://elines.coscoshipping.com/ebusiness/sailingSchedule/searchByCity'],
  ['CMA CGM', 'https://www.cma-cgm.com/ebusiness/schedules'],
  ['ONE', 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule'],
]

export type PortCode = 'DAD' | 'CTL'

export interface Sailing {
  port: PortCode
  vessel: string
  voyage: string | null
  /** Hãng tàu. Đà Nẵng: theo bảng tháng của cảng; Cát Lái: mã hãng khai thác cảng ghi. */
  line: string | null
  agent: string | null
  closing: number | null
  eta: number | null
  etd: number | null
  /** Mốc dùng để xếp và lọc: giờ rời nếu có, không thì giờ đến. */
  key: number
  keyIsDeparture: boolean
}

export interface SourceStatus {
  name: string
  ok: boolean
  rows: number
  error?: string
  /** Trang công khai của nguồn, để người đọc mail bấm vào đối chiếu. */
  page?: string
}

export interface PortReport {
  port: PortCode
  title: string
  sailings: Sailing[]
}

export interface Report {
  generatedAt: number
  days: number
  ports: PortReport[]
  sources: SourceStatus[]
  subject: string
  html: string
}

// ── Thời gian (giờ VN) ───────────────────────────────────────────────────────

function vnEpoch(y: number, m: number, d: number, hh = 0, mm = 0): number {
  return Date.UTC(y, m - 1, d, hh, mm) - VN_OFFSET_MS
}

function vnParts(ts: number) {
  const d = new Date(ts + VN_OFFSET_MS)
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    hh: d.getUTCHours(),
    mm: d.getUTCMinutes(),
    dow: d.getUTCDay(),
  }
}

const p2 = (n: number) => String(n).padStart(2, '0')
const DOW = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']

const fmtDate = (ts: number) => { const p = vnParts(ts); return `${p2(p.d)}/${p2(p.m)}` }
const fmtTime = (ts: number) => { const p = vnParts(ts); return `${p2(p.hh)}:${p2(p.mm)}` }
const fmtDateTime = (ts: number) => `${fmtTime(ts)} ${fmtDate(ts)}`
const fmtDay = (ts: number) => `${DOW[vnParts(ts).dow]} ${fmtDate(ts)}`
const fmtFull = (ts: number) => { const p = vnParts(ts); return `${fmtTime(ts)} ${DOW[p.dow]} ${p2(p.d)}/${p2(p.m)}/${p.y}` }
const dayKey = (ts: number) => { const p = vnParts(ts); return `${p.y}-${p2(p.m)}-${p2(p.d)}` }

/** "02/10 08H00" (Đà Nẵng, không ghi năm) → epoch. Năm = năm cho ra ngày gần `now` nhất. */
function parseDanangTime(raw: string, now: number): number | null {
  const m = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?:\s+(\d{1,2})\s*[Hh:]\s*(\d{2}))?/.exec(raw || '')
  if (!m) return null
  const d = +m[1], mo = +m[2], hh = m[4] ? +m[4] : 0, mm = m[5] ? +m[5] : 0
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  if (m[3]) return vnEpoch(+m[3], mo, d, hh, mm)
  const y = vnParts(now).y
  let best: number | null = null
  for (const yy of [y - 1, y, y + 1]) {
    const t = vnEpoch(yy, mo, d, hh, mm)
    if (best === null || Math.abs(t - now) < Math.abs(best - now)) best = t
  }
  return best
}

/** "EST (dự kiến): 20:30 01/10/2026" hoặc "15:15 01/10/2026" (Cát Lái) → epoch. */
function parseCatLaiTime(raw: string): number | null {
  const m = /(\d{2}):(\d{2})\s+(\d{2})\/(\d{2})\/(\d{4})/.exec(raw || '')
  return m ? vnEpoch(+m[5], +m[4], +m[3], +m[1], +m[2]) : null
}

// ── Tiện ích ────────────────────────────────────────────────────────────────

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim()
const normVessel = (s: string) => clean(s).toUpperCase()

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function stripTags(s: string): string {
  return clean(
    s.replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;/g, "'").replace(/&#0?39;/g, "'"),
  )
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++ } else inQ = false
      } else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') { row.push(cur); cur = '' }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else if (ch !== '\r') cur += ch
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows
}

async function fetchText(url: string, init: RequestInit = {}): Promise<{ text: string; res: Response }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30_000)
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, ...(init.headers || {}) },
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { text, res }
  } finally {
    clearTimeout(timer)
  }
}

// ── Tên hãng ────────────────────────────────────────────────────────────────
// Chỉ đổi những mã CHẮC CHẮN; mã lạ để nguyên như cảng ghi (đoán sai tên hãng tệ hơn để mã).
// Hai cảng dùng hai bộ mã khác nhau nên tách bảng — cùng một mã có thể là hai hãng.

const LINE_NAMES: Record<PortCode, Record<string, string>> = {
  DAD: {
    EMC: 'Evergreen', YML: 'Yang Ming', WANHAI: 'Wan Hai', 'CMA-CGM': 'CMA CGM', MCC: 'Maersk (MCC)',
    HAL: 'Hải An', 'VIMC LINES': 'VIMC Lines', VIETSUN: 'Vietsun', SAMUDERA: 'Samudera',
  },
  CTL: {
    EMC: 'Evergreen', APM: 'Maersk', COS: 'COSCO', WHA: 'Wan Hai', YML: 'Yang Ming', CMA: 'CMA CGM',
    OCL: 'OOCL', KMT: 'KMTC', SNK: 'Sinokor', HDM: 'HMM',
  },
}

// Bảng cảng không ghi hãng → suy từ tên tàu, chỉ với các tiền tố không thể nhầm.
const VESSEL_PREFIX_LINE: Array<[RegExp, string]> = [
  [/^WAN HAI /, 'Wan Hai'], [/^CMA CGM /, 'CMA CGM'], [/^MAERSK /, 'Maersk'], [/^MSC /, 'MSC'],
  [/^SITC /, 'SITC'], [/^KMTC /, 'KMTC'], [/^OOCL /, 'OOCL'],
]

function lineLabel(s: Sailing): string {
  const c = clean(s.line).toUpperCase()
  if (c) return LINE_NAMES[s.port][c] || c
  const hit = VESSEL_PREFIX_LINE.find(([re]) => re.test(normVessel(s.vessel)))
  return hit ? hit[1] : 'Chưa rõ hãng'
}

/** Cát Lái ghi "chuyến vào-chuyến ra" (vd "0129-066S-0129-066N"). Hàng xuất đi theo chuyến RA. */
function outboundVoyage(raw: string | null): string | null {
  const v = clean(raw).replace(/-NONE$/i, '') // chưa có chuyến ra → còn lại là chuyến vào
  if (!v) return null
  const parts = v.split('-')
  if (parts.length % 2 !== 0) return v
  const half = parts.length / 2
  const inV = parts.slice(0, half).join('-'), outV = parts.slice(half).join('-')
  return !outV || /^NONE$/i.test(outV) ? inV : outV
}

// ── Nguồn 1: Cảng Đà Nẵng ───────────────────────────────────────────────────

/** Bảng tháng: tên tàu → hãng. Không đọc được thì trả map rỗng (chỉ mất cột hãng). */
async function fetchDanangLineMap(): Promise<{ map: Map<string, string>; status: SourceStatus }> {
  const name = 'Cảng Đà Nẵng — lịch tàu container tháng'
  const map = new Map<string, string>()
  try {
    const { text } = await fetchText(DANANG_MONTH_PAGE)
    const table = /<table[\s\S]*?<\/table>/i.exec(text)?.[0]
    if (!table) throw new Error('Không tìm thấy bảng lịch — có thể trang đổi bố cục')
    for (const tr of table.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
      const cells = (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map(stripTags)
      // NO | VESSEL | SHIPPING LINE | AGENT | ETB
      if (cells.length >= 4 && /^\d+$/.test(cells[0]) && cells[1] && cells[2]) {
        map.set(normVessel(cells[1]), cells[2])
      }
    }
    if (map.size < 5) throw new Error(`Chỉ đọc được ${map.size} tàu — nghi bảng đổi cột`)
    return { map, status: { name, ok: true, rows: map.size } }
  } catch (e) {
    return { map, status: { name, ok: false, rows: 0, error: (e as Error).message } }
  }
}

async function fetchDanang(now: number, lineMap: Map<string, string>): Promise<{ sailings: Sailing[]; status: SourceStatus }> {
  const name = 'Cảng Đà Nẵng — dự báo tàu đến'
  try {
    const { text } = await fetchText(DANANG_FORECAST_CSV)
    const rows = parseCsv(text)
    const headerIdx = rows.findIndex((r) => r.some((c) => /\(VESSEL\)/i.test(c)))
    if (headerIdx < 0) throw new Error('Không tìm thấy dòng tiêu đề — bảng đã đổi bố cục')
    const header = rows[headerIdx].map((c) => clean(c).toUpperCase())
    const col = (re: RegExp) => header.findIndex((c) => re.test(c))
    const iVessel = col(/\(VESSEL\)/), iClosing = col(/CLOSING/), iEta = col(/\(ETA\)/), iEtb = col(/\(ETB\)/)
    const iEtd = col(/\(ETD\)/), iCargo = col(/CARGO/), iAgent = col(/\(AGENT\)/)
    if ([iVessel, iClosing, iEta, iEtd, iCargo, iAgent].some((i) => i < 0)) {
      throw new Error('Thiếu cột (tàu/closing/ETA/ETD/loại hàng/đại lý) — bảng đã đổi bố cục')
    }

    const sailings: Sailing[] = []
    for (const r of rows.slice(headerIdx + 1)) {
      if (!/CONTAINER/i.test(r[iCargo] || '')) continue
      const vessel = clean(r[iVessel])
      if (!vessel) continue
      const eta = parseDanangTime(r[iEta], now) ?? (iEtb >= 0 ? parseDanangTime(r[iEtb], now) : null)
      const etd = parseDanangTime(r[iEtd], now)
      const key = etd ?? eta
      if (key === null) continue
      sailings.push({
        port: 'DAD',
        vessel,
        voyage: null, // cảng Đà Nẵng không ghi số chuyến
        line: lineMap.get(normVessel(vessel)) ?? null,
        agent: clean(r[iAgent]) || null,
        closing: parseDanangTime(r[iClosing], now),
        eta,
        etd,
        key,
        keyIsDeparture: etd !== null,
      })
    }
    if (sailings.length < 5) throw new Error(`Chỉ đọc được ${sailings.length} chuyến container — nghi bảng đổi bố cục`)
    return { sailings, status: { name, ok: true, rows: sailings.length } }
  } catch (e) {
    return { sailings: [], status: { name, ok: false, rows: 0, error: (e as Error).message } }
  }
}

// ── Nguồn 2: Tân Cảng Cát Lái ───────────────────────────────────────────────

async function fetchCatLai(): Promise<{ sailings: Sailing[]; status: SourceStatus }> {
  const name = 'Tân Cảng Cát Lái — thông tin tàu/chuyến'
  try {
    // Mở trang trước để lấy cookie phiên như trình duyệt, rồi mới gọi dữ liệu của bảng.
    let cookie = ''
    try {
      const { res } = await fetchText(`${CATLAI_HOST}/Ships`)
      const set = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() || []
      cookie = set.map((c) => c.split(';')[0]).join('; ')
    } catch { /* không có cookie vẫn thử gọi */ }

    const { text } = await fetchText(`${CATLAI_HOST}/ships/Searcher`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${CATLAI_HOST}/Ships`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify({ siteId: 'CTL', vesselName: '' }),
    })
    let data: { model?: Array<Record<string, string | null>> }
    try { data = JSON.parse(text) } catch { throw new Error('Cảng trả về trang không phải dữ liệu (có thể đang chặn truy cập tự động)') }
    const model = data.model
    if (!Array.isArray(model) || model.length < 50 || !('VESSELNAME' in model[0])) {
      throw new Error(`Dữ liệu không đúng dạng (${Array.isArray(model) ? model.length : 0} dòng)`)
    }

    const sailings: Sailing[] = []
    for (const r of model) {
      // Sà lan/tàu sông không có closing time → bỏ, chỉ giữ tàu biển nhận hàng xuất.
      const closing = parseCatLaiTime(r.CLOSING_TIME || '')
      const etd = parseCatLaiTime(r.ACTUAL_DEPATURE_TIME || '')
      if (closing === null || etd === null) continue
      const voyage = clean(r.IN_OUT_VOYAGE)
      sailings.push({
        port: 'CTL',
        vessel: clean(r.VESSELNAME),
        voyage: voyage || null,
        line: clean(r.AGENT) || null,
        agent: null,
        closing,
        eta: parseCatLaiTime(r.ACTUAL_BERTH_TIME || ''),
        etd,
        key: etd,
        keyIsDeparture: true,
      })
    }
    return { sailings, status: { name, ok: true, rows: sailings.length } }
  } catch (e) {
    return { sailings: [], status: { name, ok: false, rows: 0, error: (e as Error).message } }
  }
}

// ── HTML ────────────────────────────────────────────────────────────────────

const C = {
  ink: '#12332A', sub: '#5F6F69', line: '#E3E9E6', band: '#F2F6F4', brand: '#1B4D3E',
  brandSoft: '#DCEBE5', warn: '#B45309', warnBg: '#FEF3C7', muted: '#9AA8A2', bad: '#B91C1C', badBg: '#FEE2E2',
}
const FONT = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"

function sailingRow(s: Sailing, now: number): string {
  const voyage = outboundVoyage(s.voyage)
  const lineTxt = [lineLabel(s), voyage ? `chuyến ${voyage}` : '', s.agent ? `đại lý ${s.agent}` : ''].filter(Boolean).join(' · ')
  const closingSoon = s.closing !== null && s.closing >= now && s.closing - now <= DAY_MS
  let closingHtml: string
  if (s.closing === null) closingHtml = `<span style="color:${C.muted}">Closing: chưa có</span>`
  else if (s.closing < now) closingHtml = `<span style="color:${C.muted}">Đã closing ${fmtDateTime(s.closing)}</span>`
  else closingHtml = `Closing <b style="color:${closingSoon ? C.warn : C.ink}">${fmtDateTime(s.closing)}</b>`
  const bd = `border-bottom:1px solid ${C.line}`
  return `
<tr><td valign="top" style="padding:9px 8px 9px 0;${bd}"><b style="font-size:14px;color:${C.ink}">${esc(s.vessel)}</b><br><span style="font-size:12px;color:${C.sub}">${esc(lineTxt)}</span></td><td align="right" valign="top" nowrap style="padding:9px 0;${bd};font-size:12px;line-height:18px;color:${C.sub}">Rời <b style="font-size:13px;color:${C.ink}">${fmtDateTime(s.key)}</b><br>${closingHtml}</td></tr>`
}

function dayGroups(list: Sailing[], now: number): string {
  const groups = new Map<string, Sailing[]>()
  for (const s of list) {
    const k = dayKey(s.key)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(s)
  }
  let html = ''
  for (const items of groups.values()) {
    html += `
  <tr><td colspan="2" style="padding:14px 0 0;">
    <div style="background:${C.band};border-radius:6px;padding:6px 10px;font-size:12px;line-height:18px;font-weight:700;color:${C.brand};letter-spacing:.2px;">${fmtDay(items[0].key)} · ${items.length} chuyến</div>
  </td></tr>${items.map((s) => sailingRow(s, now)).join('')}`
  }
  return html
}

/** Tàu sẽ ghé trong kỳ nhưng cảng CHƯA công bố giờ rời (Đà Nẵng chỉ công bố trước ~2 ngày).
 *  Không phải dòng "tàu đi" đúng nghĩa nên chỉ liệt kê gọn theo ngày, không bịa giờ rời. */
function pendingList(list: Sailing[]): string {
  if (list.length === 0) return ''
  const groups = new Map<string, Sailing[]>()
  for (const s of list) {
    const k = dayKey(s.key)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(s)
  }
  return `
    ${subTitle(`Chưa có giờ rời — ${list.length} chuyến`)}
    <div style="font-size:12px;line-height:17px;color:${C.sub};">Cảng mới công bố ngày tàu ghé; giờ rời thường có trước khoảng 2 ngày.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:4px;">${[...groups.values()].map((items) => `
      <tr><td valign="top" nowrap style="padding:7px 10px 7px 0;border-bottom:1px solid ${C.line};font-size:12px;line-height:18px;font-weight:700;color:${C.brand}">${fmtDay(items[0].key)}</td><td style="padding:7px 0;border-bottom:1px solid ${C.line};font-size:12px;line-height:18px;color:${C.ink}">${items.map((s) => `${esc(s.vessel)} <span style="color:${C.sub}">(${esc(lineLabel(s))})</span>`).join('<br>')}</td></tr>`).join('')}
    </table>`
}

function sectionTitle(text: string, note: string): string {
  return `
  <div style="font-size:17px;line-height:22px;font-weight:700;color:${C.ink};">${esc(text)}</div>
  <div style="font-size:12px;line-height:17px;color:${C.sub};margin-top:2px;">${esc(note)}</div>`
}

function subTitle(text: string): string {
  return `<div style="font-size:12px;line-height:16px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:${C.brand};margin:18px 0 4px;">${esc(text)}</div>`
}

function portSection(p: PortReport, now: number, days: number): string {
  if (p.sailings.length === 0) return ''
  const departing = p.sailings.filter((s) => s.keyIsDeparture)
  const pending = p.sailings.filter((s) => !s.keyIsDeparture)
  const note = pending.length
    ? `${departing.length} chuyến đã có giờ rời · ${pending.length} chuyến chưa có giờ rời · ${days} ngày tới`
    : `${departing.length} chuyến rời cảng trong ${days} ngày tới`
  return `
  <tr><td style="padding:24px 16px 0;">
    ${sectionTitle(p.title, note)}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      ${dayGroups(departing, now)}
    </table>
    ${pendingList(pending)}
  </td></tr>`
}

function tile(value: string, label: string, bg: string, color: string): string {
  return `
    <td width="33%" style="padding:0 4px;" valign="top">
      <div style="background:${bg};border-radius:10px;padding:12px 6px;text-align:center;">
        <div style="font-size:24px;line-height:28px;font-weight:700;color:${color};">${value}</div>
        <div style="font-size:11px;line-height:15px;color:${C.sub};margin-top:2px;">${label}</div>
      </div>
    </td>`
}

function buildHtml(r: Omit<Report, 'html' | 'subject'>, isTrial: boolean): string {
  const now = r.generatedAt
  const all = r.ports.flatMap((p) => p.sailings)
  const closingSoon = all.filter((s) => s.closing !== null && s.closing >= now && s.closing - now <= DAY_MS).length
  // Ô số và dòng xem trước chỉ đếm chuyến ĐÃ CÓ giờ rời — khớp với danh sách bên dưới.
  const count = (code: PortCode) => r.ports.find((p) => p.port === code)?.sailings.filter((s) => s.keyIsDeparture).length ?? 0
  const failed = r.sources.filter((s) => !s.ok)

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Lịch tàu rời cảng</title>
</head>
<body style="margin:0;padding:0;background:#EEF2F0;${FONT}-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Đà Nẵng ${count('DAD')} chuyến, Cát Lái ${count('CTL')} chuyến trong ${r.days} ngày tới · ${closingSoon} chuyến closing trong 24 giờ.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#EEF2F0;">
<tr><td align="center" style="padding:12px 8px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#FFFFFF;border-radius:14px;overflow:hidden;${FONT}">

  <tr><td style="background:${C.brand};padding:20px 16px 18px;">
    <div style="font-size:11px;line-height:15px;letter-spacing:1.2px;text-transform:uppercase;color:#A9D3C4;">Huy Anh Rubber · Logistics${isTrial ? ' · Bản thử' : ''}</div>
    <div style="font-size:21px;line-height:27px;font-weight:700;color:#FFFFFF;margin-top:6px;">Lịch tàu rời cảng<br>Đà Nẵng &amp; TP.HCM</div>
    <div style="font-size:13px;line-height:19px;color:#CFE6DD;margin-top:8px;">Tra cứu lúc ${fmtFull(now)} · ${r.days} ngày tới</div>
  </td></tr>

  <tr><td style="padding:16px 12px 0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      ${tile(String(count('DAD')), 'chuyến rời<br>Đà Nẵng', C.brandSoft, C.brand)}
      ${tile(String(count('CTL')), 'chuyến rời<br>Cát Lái (TP.HCM)', C.brandSoft, C.brand)}
      ${tile(String(closingSoon), 'chuyến closing<br>trong 24 giờ', C.warnBg, C.warn)}
    </tr></table>
  </td></tr>

  ${failed.length ? `
  <tr><td style="padding:14px 16px 0;">
    <div style="background:${C.badBg};border-radius:8px;padding:10px 12px;font-size:13px;line-height:19px;color:${C.bad};">
      <b>Hôm nay không đọc được:</b><br>${failed.map((s) => `${esc(s.name)} — ${esc(s.error || 'lỗi không rõ')}`).join('<br>')}
    </div>
  </td></tr>` : ''}

  ${r.ports.map((p) => portSection(p, now, r.days)).join('')}

  <tr><td style="padding:24px 16px 0;">
    <div style="background:${C.band};border-radius:8px;padding:12px;font-size:12px;line-height:18px;color:${C.sub};">
      <b style="color:${C.ink};">Cách đọc</b><br>
      · <b>Closing</b> = hạn chót hạ container về cảng cho chuyến đó.<br>
      · Giờ rời là <b>dự kiến</b> do cảng công bố, có thể đổi.<br>
      · Tên hãng viết tắt (NSL, JSV, MCV…) là mã của cảng, giữ nguyên khi chưa chắc tên đầy đủ.<br>
      · Báo cáo xếp theo <b>cảng đi và ngày rời</b>. Cảng đích và ngày đến nơi của từng chuyến chưa có — hai cảng không công bố, phải lấy từ hãng tàu.
    </div>
  </td></tr>

  <tr><td style="padding:22px 16px 0;">
    <div style="font-size:15px;line-height:20px;font-weight:700;color:${C.ink};">Nguồn tham khảo</div>
    <div style="font-size:12px;line-height:17px;color:${C.sub};margin-top:2px;">Số liệu lấy trực tiếp từ trang của cảng lúc ${fmtDateTime(now)}. Bấm vào để tự đối chiếu.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:6px;">
      ${r.sources.map((s) => `
      <tr><td style="padding:8px 0;border-bottom:1px solid ${C.line};font-size:13px;line-height:19px;color:${C.ink};">
        ${s.page ? `<a href="${esc(s.page)}" style="color:${C.brand};font-weight:600;text-decoration:underline;">${esc(s.name)}</a>` : `<b>${esc(s.name)}</b>`}<br>
        <span style="font-size:12px;color:${s.ok ? C.sub : C.bad};">${s.ok ? `Đọc được ${s.rows} dòng` : `Không đọc được — ${esc(s.error || 'lỗi không rõ')}`}</span>
      </td></tr>`).join('')}
    </table>
    <div style="font-size:12px;line-height:20px;color:${C.sub};margin-top:10px;">
      Tra cảng đích và ngày đến tại trang lịch tàu của hãng:
      ${CARRIER_SCHEDULE_PAGES.map(([n, u]) => `<a href="${esc(u)}" style="color:${C.brand};text-decoration:underline;white-space:nowrap;">${esc(n)}</a>`).join(' · ')}
    </div>
  </td></tr>

  <tr><td style="padding:16px 16px 20px;">
    <div style="font-size:11px;line-height:16px;color:${C.muted};">Email tự động từ hệ thống Huy Anh ERP.</div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

// ── Điểm vào ────────────────────────────────────────────────────────────────

export async function buildReport(opts: { now?: number; days?: number; trial?: boolean } = {}): Promise<Report> {
  const now = opts.now ?? Date.now()
  const days = opts.days ?? 7
  const horizon = now + days * DAY_MS

  const lineMapRes = await fetchDanangLineMap()
  const [dad, ctl] = await Promise.all([fetchDanang(now, lineMapRes.map), fetchCatLai()])

  const inWindow = (s: Sailing) => s.key >= now && s.key <= horizon
  const sort = (a: Sailing, b: Sailing) => a.key - b.key

  const ports: PortReport[] = [
    { port: 'DAD', title: 'Cảng Đà Nẵng (Tiên Sa)', sailings: dad.sailings.filter(inWindow).sort(sort) },
    { port: 'CTL', title: 'Tân Cảng Cát Lái (TP.HCM)', sailings: ctl.sailings.filter(inWindow).sort(sort) },
  ]
  const sources: SourceStatus[] = [
    { ...dad.status, page: DANANG_FORECAST_PAGE },
    { ...lineMapRes.status, page: DANANG_MONTH_PAGE },
    { ...ctl.status, page: CATLAI_PAGE },
  ]
  const base = { generatedAt: now, days, ports, sources }
  const p = vnParts(now)
  return {
    ...base,
    subject: `🚢 Lịch tàu rời Đà Nẵng & TP.HCM ${days} ngày tới — ${p2(p.d)}/${p2(p.m)}/${p.y}${opts.trial ? ' (bản thử)' : ''}`,
    html: buildHtml(base, !!opts.trial),
  }
}
