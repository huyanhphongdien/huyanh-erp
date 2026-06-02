// ============================================================================
// MANUAL ENTRY PAGE — Admin nhập tay phiếu cân (Single + CSV import)
// File: src/pages/b2b/intake-manual/ManualEntryPage.tsx
// ============================================================================

import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Upload,
  FileText,
  Image as ImageIcon,
  X,
  Save,
  Download,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { saveAs } from 'file-saver'

import {
  intakeManualEntryService,
  type ManualIntakeInput,
  type CsvRow,
  type RawRubberType,
  RAW_RUBBER_TYPE_LABELS,
  mapRawToBonusType,
} from '../../../services/b2b/intakeManualEntryService'
import { B2BPartnerSelector } from '../../../components/b2b/B2BPartnerSelector'
import drcLookupService, { type DrcLookupRow } from '../../../services/wms/drcLookupService'
import { facilityService, type Facility } from '../../../services/wms/facilityService'
import { B2BSectionTabs, INTAKE_TABS } from '../../../components/b2b/B2BSectionTabs'
import { Typography, message } from 'antd'

const { Title, Text } = Typography

const TABS = [
  { key: 'single', label: 'Nhập 1 phiếu', icon: <FileText className="w-4 h-4" /> },
  { key: 'bulk',   label: 'Import CSV/XLSX', icon: <Upload className="w-4 h-4" /> },
] as const

export function ManualEntryPage() {
  const [tab, setTab] = useState<'single' | 'bulk'>('single')

  return (
    <div style={{ padding: 24 }} className="space-y-4">
      {/* B2B Section Tabs — gom chung với Lý lịch mủ + Phiếu cân (đa NM) */}
      <B2BSectionTabs tabs={INTAKE_TABS} active="manual-entry" />

      <div>
        <Title level={3} style={{ margin: 0 }}>Nhập tay phiếu cân</Title>
        <Text type="secondary">
          Dùng khi data về sau cân (vd phiếu giấy cũ, phiếu Excel) — bonus sẽ tự recompute sau insert.
        </Text>
      </div>

      <div className="flex border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
              tab === t.key
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'single' ? <SingleEntryForm /> : <BulkImportPanel />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// SINGLE ENTRY FORM
// ════════════════════════════════════════════════════════════════════════════
function SingleEntryForm() {
  const qc = useQueryClient()
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [rawRubberType, setRawRubberType] = useState<RawRubberType>('mu_tap')
  const [intakeDate, setIntakeDate] = useState(new Date().toISOString().slice(0, 10))
  const [netWeight, setNetWeight] = useState<number>(0)
  const [grossWeight, setGrossWeight] = useState<number | undefined>(undefined)
  const [drc, setDrc] = useState<number | undefined>(undefined)
  const [unitPrice, setUnitPrice] = useState<number | undefined>(undefined)
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // Sprint 1.4 (TL flow) — ĐỐT + LLM + facility + DRC lookup
  const [dotReading, setDotReading] = useState<number | undefined>(undefined)
  const [consolidationCode, setConsolidationCode] = useState('')
  const [facilityId, setFacilityId] = useState<string | undefined>(undefined)
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [drcLookupRows, setDrcLookupRows] = useState<DrcLookupRow[]>([])

  useEffect(() => {
    facilityService.getAllActive().then(setFacilities).catch(() => setFacilities([]))
    drcLookupService.getAll().then(setDrcLookupRows).catch(() => setDrcLookupRows([]))
  }, [])

  // ĐỐT thay đổi → re-fill DRC từ bảng tra
  const handleDotChange = (v: string | number) => {
    const n = v === '' || v == null ? undefined : Number(v)
    setDotReading(n)
    if (n == null || !Number.isFinite(n)) {
      setDrc(undefined)
    } else {
      const suggested = drcLookupService.lookupSync(drcLookupRows, n)
      if (suggested != null) setDrc(suggested)
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!partnerId) throw new Error('Chọn đại lý B2B trước.')
      const input: ManualIntakeInput = {
        b2b_partner_id: partnerId,
        raw_rubber_type: rawRubberType,
        intake_date: intakeDate,
        net_weight_kg: netWeight,
        gross_weight_kg: grossWeight,
        drc_percent: drc,
        unit_price: unitPrice,
        vehicle_plate: vehiclePlate || undefined,
        invoice_no: invoiceNo || undefined,
        notes: notes || undefined,
        field_dot_reading: dotReading,
        consolidation_code: consolidationCode.trim() || undefined,
        facility_id: facilityId,
      }
      return intakeManualEntryService.createSingle(input, files)
    },
    onSuccess: (result) => {
      const bonusGroup = result.rubber_type === 'tap' ? 'mủ tạp (bonus)' : result.rubber_type === 'nuoc' ? 'mủ nước (bonus)' : 'không tính bonus'
      message.success(`Tạo phiếu thành công — Net ${result.net_weight_kg.toLocaleString('vi-VN')}kg · ${RAW_RUBBER_TYPE_LABELS[result.raw_rubber_type]} · ${bonusGroup}`)
      // Reset form
      setPartnerId(null)
      setNetWeight(0)
      setGrossWeight(undefined)
      setDrc(undefined)
      setUnitPrice(undefined)
      setVehiclePlate('')
      setInvoiceNo('')
      setNotes('')
      setFiles([])
      setDotReading(undefined)
      setConsolidationCode('')
      qc.invalidateQueries({ queryKey: ['b2b-bonus-list'] })
      qc.invalidateQueries({ queryKey: ['b2b-bonus-dashboard'] })
    },
    onError: (e: Error) => alert(`Lỗi: ${e.message}`),
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (!list) return
    setFiles([...files, ...Array.from(list)])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeFile = (idx: number) => {
    setFiles(files.filter((_, i) => i !== idx))
  }

  return (
    <div className="bg-white border rounded-md p-5 space-y-4">
      {/* Đại lý */}
      <div>
        <label className="block text-xs text-slate-600 mb-1 font-medium">Đại lý B2B *</label>
        <B2BPartnerSelector value={partnerId} onChange={(id) => setPartnerId(id)} />
      </div>

      {/* Loại mủ (5 chi tiết) + ngày */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-600 mb-1 font-medium">
            Loại mủ chi tiết * <span className="text-slate-400">(5 loại — DB tự nhóm cho bonus)</span>
          </label>
          <div className="grid grid-cols-5 gap-1">
            {(['mu_nuoc', 'mu_tap', 'mu_dong', 'mu_chen', 'mu_to'] as RawRubberType[]).map((t) => {
              const isNuoc = t === 'mu_nuoc'
              const isActive = rawRubberType === t
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setRawRubberType(t)}
                  className={`px-2 py-2 rounded border text-xs font-medium ${
                    isActive
                      ? isNuoc
                        ? 'bg-blue-50 border-blue-300 text-blue-800'
                        : 'bg-amber-50 border-amber-300 text-amber-800'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {isNuoc ? '💧' : '🪨'} {RAW_RUBBER_TYPE_LABELS[t]}
                </button>
              )
            })}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            ⇒ Bonus: <strong className={mapRawToBonusType(rawRubberType) === 'nuoc' ? 'text-blue-700' : 'text-amber-700'}>
              {mapRawToBonusType(rawRubberType) === 'nuoc' ? 'Mủ nước' : 'Mủ tạp'}
            </strong>
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1 font-medium">Ngày cân *</label>
          <input
            type="date"
            value={intakeDate}
            onChange={(e) => setIntakeDate(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm"
          />
        </div>
      </div>

      {/* Khối lượng */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <NumberInput label="Net weight (kg) *" value={netWeight} onChange={(v) => setNetWeight(Number(v) || 0)} required />
        <NumberInput label="Gross weight (kg)" value={grossWeight ?? ''} onChange={(v) => setGrossWeight(v === '' ? undefined : Number(v))} />
        <NumberInput
          label={`ĐỐT (metrolac)${rawRubberType === 'mu_nuoc' ? ' — Quảng Trị' : ''}`}
          value={dotReading ?? ''}
          onChange={handleDotChange}
        />
        <NumberInput
          label={`DRC (%) ${dotReading != null ? '— tra từ bảng' : ''}`}
          value={drc ?? ''}
          onChange={(v) => setDrc(v === '' ? undefined : Number(v))}
          step={0.1}
        />
      </div>

      {/* KL khô preview + đơn giá + facility + LLM */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <NumberInput
          label="Đơn giá (đ/kg)"
          value={unitPrice ?? ''}
          onChange={(v) => setUnitPrice(v === '' ? undefined : Number(v))}
        />
        <div>
          <label className="block text-xs text-slate-600 mb-1 font-medium">Nhà máy</label>
          <select
            value={facilityId || ''}
            onChange={(e) => setFacilityId(e.target.value || undefined)}
            className="w-full px-3 py-2 border rounded text-sm bg-white"
          >
            <option value="">— Không gán —</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>{f.code} — {f.name}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs text-slate-600 mb-1 font-medium">
            Mã LLM (gộp xe) <span className="text-slate-400">— tuỳ chọn</span>
          </label>
          <input
            type="text"
            value={consolidationCode}
            onChange={(e) => setConsolidationCode(e.target.value)}
            placeholder="VD: TMMN-07 XE 1 (19/05)"
            className="w-full px-3 py-2 border rounded text-sm"
          />
        </div>
      </div>

      {/* KL khô preview khi đủ net + DRC */}
      {netWeight > 0 && drc != null && drc > 0 && (
        <div className="bg-teal-50 border border-teal-200 rounded px-3 py-2 text-sm">
          📊 KL khô ≈ {netWeight.toLocaleString('vi-VN')} kg × {drc}% ={' '}
          <strong className="text-teal-800">
            {(netWeight * drc / 100).toFixed(1)} kg
          </strong>{' '}
          <span className="text-xs text-teal-600">
            ({((netWeight * drc / 100) / 1000).toFixed(2)} T)
          </span>
        </div>
      )}

      {/* Tham chiếu */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-600 mb-1 font-medium">Biển số xe</label>
          <input
            type="text"
            value={vehiclePlate}
            onChange={(e) => setVehiclePlate(e.target.value)}
            placeholder="76A-12345"
            className="w-full px-3 py-2 border rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1 font-medium">Số phiếu cân / Invoice</label>
          <input
            type="text"
            value={invoiceNo}
            onChange={(e) => setInvoiceNo(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-600 mb-1 font-medium">Ghi chú</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border rounded text-sm"
        />
      </div>

      {/* Upload ảnh phiếu cân */}
      <div>
        <label className="block text-xs text-slate-600 mb-1 font-medium">
          Ảnh phiếu cân ({files.length} file{files.length !== 1 && 's'})
        </label>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf"
            onChange={handleFileChange}
            className="hidden"
            id="img-input"
          />
          <label
            htmlFor="img-input"
            className="px-3 py-2 border-2 border-dashed rounded text-sm cursor-pointer hover:bg-slate-50 flex items-center gap-1 text-slate-600"
          >
            <ImageIcon className="w-4 h-4" />
            Thêm ảnh / PDF
          </label>
          <span className="text-xs text-slate-500">Optional (10MB/file, jpg/png/webp/heic/pdf)</span>
        </div>
        {files.length > 0 && (
          <div className="mt-2 grid grid-cols-3 md:grid-cols-5 gap-2">
            {files.map((f, i) => (
              <div key={i} className="relative border rounded p-2 bg-slate-50">
                <div className="text-xs truncate" title={f.name}>{f.name}</div>
                <div className="text-xs text-slate-400">{(f.size / 1024).toFixed(0)}KB</div>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute top-0 right-0 p-1 text-rose-600 hover:bg-rose-50 rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-2 pt-3 border-t">
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !partnerId || netWeight <= 0}
          className="px-4 py-2 bg-emerald-700 text-white rounded text-sm hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-1"
        >
          <Save className="w-4 h-4" />
          {mutation.isPending ? 'Đang lưu…' : 'Lưu phiếu'}
        </button>
      </div>
    </div>
  )
}

function NumberInput({
  label,
  value,
  onChange,
  required,
  step,
}: {
  label: string
  value: number | string
  onChange: (v: string | number) => void
  required?: boolean
  step?: number
}) {
  return (
    <div>
      <label className="block text-xs text-slate-600 mb-1 font-medium">{label}</label>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === '' ? '' : Number(v))
        }}
        required={required}
        className="w-full px-2 py-1.5 border rounded text-sm font-mono"
      />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// BULK CSV IMPORT
// ════════════════════════════════════════════════════════════════════════════
function BulkImportPanel() {
  const qc = useQueryClient()
  const [rows, setRows] = useState<CsvRow[]>([])
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [importResult, setImportResult] = useState<{ inserted: number; failed: number; errors: string[] } | null>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name)
    setParsing(true)
    setRows([])
    setImportResult(null)
    try {
      const parsed = await intakeManualEntryService.parseFile(f)
      await intakeManualEntryService.resolvePartnerCodes(parsed)
      setRows(parsed)
    } catch (err) {
      message.error(`Đọc file thất bại: ${(err as Error).message}`)
    } finally {
      setParsing(false)
    }
  }

  const downloadTemplate = () => {
    const blob = intakeManualEntryService.generateCsvTemplate()
    saveAs(blob, 'intake_template.csv')
  }

  const importMutation = useMutation({
    mutationFn: () => intakeManualEntryService.bulkImport(rows),
    onSuccess: (result) => {
      setImportResult(result)
      if (result.inserted > 0) {
        qc.invalidateQueries({ queryKey: ['b2b-bonus-list'] })
        qc.invalidateQueries({ queryKey: ['b2b-bonus-dashboard'] })
      }
    },
    onError: (e: Error) => message.error(`Lỗi import: ${e.message}`),
  })

  const okCount = rows.filter((r) => r.ok).length
  const errorCount = rows.length - okCount

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-2 text-sm">
        <div className="font-medium text-blue-900">📋 Hướng dẫn import</div>
        <ul className="text-xs text-blue-900 list-disc list-inside space-y-0.5">
          <li>Cột bắt buộc: <code className="bg-white px-1 rounded">intake_date</code>, <code className="bg-white px-1 rounded">partner_code</code>, <code className="bg-white px-1 rounded">raw_rubber_type</code>, <code className="bg-white px-1 rounded">net_weight_kg</code></li>
          <li><code className="bg-white px-1 rounded">raw_rubber_type</code> chấp nhận 5 giá trị: <strong>mu_nuoc, mu_tap, mu_dong, mu_chen, mu_to</strong> (DB tự nhóm sang 2 loại tap/nuoc cho bonus)</li>
          <li>Shortcut được chấp nhận: <code>tap</code>=mu_tap, <code>nuoc</code>=mu_nuoc, <code>dong</code>=mu_dong, <code>chen</code>=mu_chen, <code>to</code>=mu_to</li>
          <li>Cột tuỳ chọn: gross_weight_kg, drc_percent, unit_price, vehicle_plate, invoice_no, notes</li>
          <li><code className="bg-white px-1 rounded">partner_code</code> chấp nhận: HAC-13 (13 chữ số), alias DEMO-XXX, hoặc legacy TEHG01...</li>
          <li><code className="bg-white px-1 rounded">intake_date</code>: YYYY-MM-DD hoặc DD/MM/YYYY hoặc Excel date</li>
          <li>Hỗ trợ file CSV và XLSX. Tải template để có format chuẩn.</li>
        </ul>
        <button
          onClick={downloadTemplate}
          className="text-xs bg-white border border-blue-300 px-2 py-1 rounded hover:bg-blue-50 flex items-center gap-1"
        >
          <Download className="w-3 h-3" />
          Tải template CSV
        </button>
      </div>

      <div className="bg-white border rounded p-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <Upload className="w-5 h-5 text-slate-400" />
          <span className="text-sm text-slate-700">Chọn file CSV / XLSX</span>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" />
          <span className="text-xs px-2 py-1 bg-emerald-700 text-white rounded hover:bg-emerald-800">
            Browse…
          </span>
        </label>
        {fileName && (
          <div className="mt-2 text-xs text-slate-600 flex items-center gap-2">
            <FileText className="w-3 h-3" /> {fileName}
            {parsing && <span className="text-blue-700">đang parse…</span>}
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <>
          {/* Summary */}
          <div className="flex gap-3 text-sm">
            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded">
              ✓ {okCount} row hợp lệ
            </span>
            {errorCount > 0 && (
              <span className="px-3 py-1 bg-rose-100 text-rose-800 rounded">
                ✗ {errorCount} row lỗi
              </span>
            )}
          </div>

          {/* Preview table */}
          <div className="bg-white border rounded overflow-auto max-h-96">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-2 py-2 text-left w-8">#</th>
                  <th className="px-2 py-2 text-left">Ngày</th>
                  <th className="px-2 py-2 text-left">Đại lý</th>
                  <th className="px-2 py-2 text-left">Loại</th>
                  <th className="px-2 py-2 text-right">Net (kg)</th>
                  <th className="px-2 py-2 text-right">DRC%</th>
                  <th className="px-2 py-2 text-left">Lỗi / Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rowIndex} className={`border-t ${r.ok ? '' : 'bg-rose-50'}`}>
                    <td className="px-2 py-1.5">{r.rowIndex}</td>
                    <td className="px-2 py-1.5 font-mono">{r.intake_date}</td>
                    <td className="px-2 py-1.5">
                      <div className="font-mono text-[11px]">{r.partner_code}</div>
                      {r.partner_name && <div className="text-[10px] text-slate-500">{r.partner_name}</div>}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="font-mono text-[11px]">{r.raw_rubber_type}</div>
                      {RAW_RUBBER_TYPE_LABELS[r.raw_rubber_type as RawRubberType] && (
                        <div className="text-[10px] text-slate-500">{RAW_RUBBER_TYPE_LABELS[r.raw_rubber_type as RawRubberType]}</div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{r.net_weight_kg.toLocaleString('vi-VN')}</td>
                    <td className="px-2 py-1.5 text-right">{r.drc_percent ?? '—'}</td>
                    <td className="px-2 py-1.5">
                      {r.ok ? (
                        <span className="text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> OK
                        </span>
                      ) : (
                        <span className="text-rose-700 flex items-start gap-1">
                          <AlertTriangle className="w-3 h-3 mt-0.5" />
                          <span>{r.errors.join('; ')}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Import button */}
          <div className="flex items-center justify-between border-t pt-3">
            <div className="text-xs text-slate-600">
              Sẽ insert {okCount} phiếu với status=`confirmed`. Bonus tự recompute sau insert.
            </div>
            <button
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending || okCount === 0}
              className="px-4 py-2 bg-emerald-700 text-white rounded text-sm hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-1"
            >
              <Save className="w-4 h-4" />
              {importMutation.isPending ? 'Đang import…' : `Import ${okCount} phiếu`}
            </button>
          </div>
        </>
      )}

      {/* Result */}
      {importResult && (
        <div
          className={`border rounded p-3 text-sm ${
            importResult.failed > 0
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          <div className="font-medium">
            ✓ Đã insert <strong>{importResult.inserted}</strong> phiếu
            {importResult.failed > 0 && <span> · ⚠ {importResult.failed} thất bại</span>}
          </div>
          {importResult.errors.length > 0 && (
            <ul className="text-xs mt-1 list-disc list-inside">
              {importResult.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default ManualEntryPage
