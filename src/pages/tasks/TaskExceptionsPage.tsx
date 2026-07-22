// ============================================================================
// TaskExceptionsPage — GĐ 5 "Cần anh xem": DUYỆT THEO NGOẠI LỆ
// Không duyệt từng việc. Chỉ hiện việc LỆCH: trễ hạn · chờ duyệt · kẹt tự
// đánh giá · máy hỏng. Chọn nhiều → duyệt/miễn trễ 1 phát. Xuất Nhật ký Excel.
// ============================================================================
import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  getExceptionCounts, getOverdueTasks, getPendingApprovalTasks,
  getPendingSelfEvalTasks, approveTasks, exemptOverdue, getJournal,
  type ExcTask,
} from '../../services/taskExceptionService'

type Tab = 'overdue' | 'approval' | 'selfeval'

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: 'overdue', label: 'Trễ hạn', hint: 'Quá hạn mà chưa xong — cần nhắc hoặc miễn trễ' },
  { key: 'approval', label: 'Chờ duyệt', hint: 'Đã làm xong, chờ anh gật' },
  { key: 'selfeval', label: 'Kẹt tự đánh giá', hint: 'Thợ chưa tự chấm → luồng đang tắc' },
]

function daysLate(due: string | null): number {
  if (!due) return 0
  const d = new Date(due + 'T00:00:00')
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000))
}
function firstOfMonth() {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), 1).toLocaleDateString('en-CA')
}
function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
}

export default function TaskExceptionsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('overdue')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(todayStr())

  const counts = useQuery({ queryKey: ['task-exc-counts'], queryFn: getExceptionCounts, staleTime: 30_000 })
  const list = useQuery({
    queryKey: ['task-exc-list', tab],
    queryFn: () => tab === 'overdue' ? getOverdueTasks() : tab === 'approval' ? getPendingApprovalTasks() : getPendingSelfEvalTasks(),
  })

  const rows = list.data || []
  const allChecked = rows.length > 0 && rows.every(r => sel.has(r.id))
  const c = counts.data

  function toggle(id: string) {
    setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    setSel(allChecked ? new Set() : new Set(rows.map(r => r.id)))
  }
  async function act(kind: 'approve' | 'exempt') {
    const ids = [...sel]
    if (!ids.length) return
    setBusy(true); setMsg(null)
    try {
      const n = kind === 'approve' ? await approveTasks(ids) : await exemptOverdue(ids)
      setMsg(`✅ Đã ${kind === 'approve' ? 'duyệt' : 'miễn trễ'} ${n} việc`)
      setSel(new Set())
      qc.invalidateQueries({ queryKey: ['task-exc-list'] })
      qc.invalidateQueries({ queryKey: ['task-exc-counts'] })
    } catch (e: any) {
      setMsg('❌ ' + (e?.message || 'Lỗi'))
    } finally { setBusy(false) }
  }

  async function exportJournal() {
    setBusy(true); setMsg(null)
    try {
      const data = await getJournal(from, to)
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Nhật ký công việc')
      ws.columns = [
        { header: 'Ngày', key: 'date', width: 12 },
        { header: 'Mã', key: 'code', width: 14 },
        { header: 'Công việc', key: 'name', width: 52 },
        { header: 'Người làm', key: 'assignee', width: 22 },
        { header: 'Bộ phận', key: 'department', width: 24 },
        { header: 'Nhóm việc', key: 'work_category', width: 14 },
        { header: 'Trạng thái', key: 'status', width: 14 },
        { header: 'Duyệt', key: 'evaluation_status', width: 16 },
        { header: 'Hạn', key: 'due_date', width: 12 },
        { header: 'Hoàn thành', key: 'completed_date', width: 13 },
        { header: 'Điểm', key: 'score', width: 8 },
      ]
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F5132' } }
      ws.getRow(1).alignment = { vertical: 'middle' }
      ws.getRow(1).height = 22
      data.forEach(r => ws.addRow(r))
      ws.autoFilter = { from: 'A1', to: 'K1' }
      ws.views = [{ state: 'frozen', ySplit: 1 }]
      const buf = await wb.xlsx.writeBuffer()
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a')
      a.href = url; a.download = `Nhat_ky_cong_viec_${from}_${to}.xlsx`; a.click()
      URL.revokeObjectURL(url)
      setMsg(`✅ Đã xuất ${data.length} dòng`)
    } catch (e: any) {
      setMsg('❌ Xuất lỗi: ' + (e?.message || ''))
    } finally { setBusy(false) }
  }

  const kpis = useMemo(() => ([
    { key: 'overdue' as Tab, label: 'Trễ hạn', v: c?.overdue, cls: 'text-rose-600', bg: 'bg-rose-50 border-rose-200' },
    { key: 'approval' as Tab, label: 'Chờ duyệt', v: c?.pendingApproval, cls: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
    { key: 'selfeval' as Tab, label: 'Kẹt tự đánh giá', v: c?.pendingSelfEval, cls: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  ]), [c])

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cần anh xem</h1>
          <p className="text-sm text-gray-500 mt-1">
            Duyệt theo <b>ngoại lệ</b> — chỉ hiện việc lệch, không bắt anh xem từng việc.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-[11px] text-gray-500">Từ</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500">Đến</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <button onClick={exportJournal} disabled={busy}
            className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-60">
            ⬇ Xuất Nhật ký (Excel)
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {kpis.map(k => (
          <button key={k.key} onClick={() => { setTab(k.key); setSel(new Set()) }}
            className={`text-left border rounded-xl p-4 transition ${k.bg} ${tab === k.key ? 'ring-2 ring-emerald-600' : ''}`}>
            <div className={`text-3xl font-extrabold tabular-nums ${k.cls}`}>{k.v ?? '—'}</div>
            <div className="text-sm font-medium text-gray-700 mt-1">{k.label}</div>
          </button>
        ))}
        <Link to="/m/yeu-cau"
          className="text-left border rounded-xl p-4 bg-slate-50 border-slate-200 hover:bg-slate-100">
          <div className="text-3xl font-extrabold tabular-nums text-slate-700">{c?.machineIssues ?? '—'}</div>
          <div className="text-sm font-medium text-gray-700 mt-1">Máy hỏng đang mở ›</div>
        </Link>
      </div>

      {msg && <div className="mb-3 text-sm font-medium">{msg}</div>}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-3">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setSel(new Set()) }}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${tab === t.key ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-gray-700 border-gray-300'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 mb-3">{TABS.find(t => t.key === tab)?.hint}</p>

      {/* Bulk actions */}
      {sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 p-3 bg-gray-50 border rounded-xl">
          <span className="text-sm font-semibold">Đã chọn {sel.size} việc</span>
          {tab === 'overdue' ? (
            <button onClick={() => act('exempt')} disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-semibold disabled:opacity-60">
              Miễn trễ (chấp nhận ngoại lệ)
            </button>
          ) : (
            <button onClick={() => act('approve')} disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-sm font-semibold disabled:opacity-60">
              Duyệt {sel.size} việc
            </button>
          )}
          <button onClick={() => setSel(new Set())} className="px-3 py-1.5 rounded-lg border text-sm">Bỏ chọn</button>
        </div>
      )}

      {/* List */}
      <div className="border rounded-xl overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="p-3 w-10"><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                <th className="p-3 text-left">Công việc</th>
                <th className="p-3 text-left whitespace-nowrap">Người làm</th>
                <th className="p-3 text-left whitespace-nowrap">Hạn</th>
                <th className="p-3 text-left whitespace-nowrap">Tình trạng</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading && <tr><td colSpan={6} className="p-8 text-center text-gray-400">Đang tải…</td></tr>}
              {!list.isLoading && rows.length === 0 && (
                <tr><td colSpan={6} className="p-10 text-center">
                  <div className="text-3xl">🎉</div>
                  <div className="font-semibold mt-2">Không có việc nào cần xem</div>
                  <div className="text-gray-500 text-xs mt-1">Nhóm này đang sạch.</div>
                </td></tr>
              )}
              {rows.map((t: ExcTask) => {
                const late = daysLate(t.due_date)
                return (
                  <tr key={t.id} className="border-t hover:bg-gray-50">
                    <td className="p-3"><input type="checkbox" checked={sel.has(t.id)} onChange={() => toggle(t.id)} /></td>
                    <td className="p-3">
                      <div className="font-medium text-gray-900">{t.name}</div>
                      <div className="text-[11px] text-gray-400">{t.code}{t.work_category ? ` · ${t.work_category}` : ''}</div>
                    </td>
                    <td className="p-3 whitespace-nowrap">{t.assignee?.full_name || '—'}</td>
                    <td className="p-3 whitespace-nowrap tabular-nums">{t.due_date || '—'}</td>
                    <td className="p-3 whitespace-nowrap">
                      {tab === 'overdue'
                        ? <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold">Trễ {late} ngày</span>
                        : <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">{t.status}</span>}
                    </td>
                    <td className="p-3 text-right">
                      <Link to={`/tasks/${t.id}`} className="text-emerald-700 font-semibold hover:underline whitespace-nowrap">Xem ›</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {rows.length >= 100 && (
        <p className="text-xs text-gray-500 mt-2">Đang hiện 100 việc đầu — xử bớt rồi tải lại để xem tiếp.</p>
      )}
    </div>
  )
}
