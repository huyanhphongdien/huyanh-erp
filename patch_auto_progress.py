#!/usr/bin/env python3
"""
Patch ProjectDetailPage.tsx — Thêm Auto-Progress
Chạy: python3 patch_auto_progress.py <path_to_ProjectDetailPage.tsx>
Ví dụ: python3 patch_auto_progress.py src/pages/projects/ProjectDetailPage.tsx
"""

import sys
import re

def patch_file(filepath: str):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    changes = 0

    # =========================================================================
    # 1. THÊM IMPORT projectProgressService (sau dòng import ProjectActivityTab)
    # =========================================================================
    marker1 = "import ProjectActivityTab from '../../components/project/ProjectActivityTab'"
    insert1 = """import ProjectActivityTab from '../../components/project/ProjectActivityTab'

// ✅ AUTO-PROGRESS: Import service
import { projectProgressService, type ProgressMode } from '../../services/project/projectProgressService'"""

    if 'projectProgressService' not in content:
        content = content.replace(marker1, insert1)
        changes += 1
        print("✅ [1/7] Thêm import projectProgressService")
    else:
        print("⏭️  [1/7] Import đã có — bỏ qua")

    # =========================================================================
    # 2. THÊM progress_mode vào interface Project
    # =========================================================================
    old_project_iface = "  progress_pct: number\n  budget_planned: number"
    new_project_iface = "  progress_pct: number\n  progress_mode?: ProgressMode  // ✅ AUTO-PROGRESS\n  budget_planned: number"

    if 'progress_mode?: ProgressMode' not in content:
        content = content.replace(old_project_iface, new_project_iface, 1)
        changes += 1
        print("✅ [2/7] Thêm progress_mode vào interface Project")
    else:
        print("⏭️  [2/7] Interface Project đã có progress_mode — bỏ qua")

    # =========================================================================
    # 2b. THÊM progress_mode vào interface Phase
    # =========================================================================
    old_phase_iface = "  progress_pct: number\n  color?: string"
    new_phase_iface = "  progress_pct: number\n  progress_mode?: ProgressMode  // ✅ AUTO-PROGRESS\n  color?: string"

    if content.count('progress_mode?: ProgressMode') < 2:
        content = content.replace(old_phase_iface, new_phase_iface, 1)
        changes += 1
        print("✅ [2b/7] Thêm progress_mode vào interface Phase")
    else:
        print("⏭️  [2b/7] Interface Phase đã có progress_mode — bỏ qua")

    # =========================================================================
    # 3. THÊM DEFAULT progress_mode vào DEFAULT_PROJECT
    # =========================================================================
    old_default = "  progress_pct: 0,\n  budget_planned: 0,"
    new_default = "  progress_pct: 0,\n  progress_mode: 'auto',\n  budget_planned: 0,"

    if "progress_mode: 'auto'" not in content:
        content = content.replace(old_default, new_default, 1)
        changes += 1
        print("✅ [3/7] Thêm progress_mode vào DEFAULT_PROJECT")
    else:
        print("⏭️  [3/7] DEFAULT_PROJECT đã có progress_mode — bỏ qua")

    # =========================================================================
    # 4. THÊM state progressMode, refreshing (sau realProjectId state)
    # =========================================================================
    old_state = "const [realProjectId, setRealProjectId] = useState<string | null>(null)"
    new_state = """const [realProjectId, setRealProjectId] = useState<string | null>(null)

  // ✅ AUTO-PROGRESS state
  const [progressMode, setProgressMode] = useState<ProgressMode>('auto')
  const [refreshing, setRefreshing] = useState(false)"""

    if 'progressMode' not in content:
        content = content.replace(old_state, new_state, 1)
        changes += 1
        print("✅ [4/7] Thêm state progressMode + refreshing")
    else:
        print("⏭️  [4/7] State progressMode đã có — bỏ qua")

    # =========================================================================
    # 5. THÊM progress_mode vào PROJECT_SELECT + load progressMode
    # =========================================================================
    # 5a. Thêm progress_mode vào SELECT query
    old_select = "progress_pct, budget_planned, budget_actual, budget_currency,"
    new_select = "progress_pct, progress_mode, budget_planned, budget_actual, budget_currency,"

    if 'progress_mode, budget_planned' not in content:
        content = content.replace(old_select, new_select, 1)
        changes += 1
        print("✅ [5a/7] Thêm progress_mode vào PROJECT_SELECT")
    else:
        print("⏭️  [5a/7] PROJECT_SELECT đã có progress_mode — bỏ qua")

    # 5b. Load progressMode sau setRealProjectId
    old_set_id = "setRealProjectId(projectId)\n"
    new_set_id = """setRealProjectId(projectId)

        // ✅ AUTO-PROGRESS: Load progress_mode
        setProgressMode((data.progress_mode as ProgressMode) || 'auto')
"""

    if "setProgressMode((data.progress_mode" not in content:
        content = content.replace(old_set_id, new_set_id, 1)
        changes += 1
        print("✅ [5b/7] Load progressMode sau setRealProjectId")
    else:
        print("⏭️  [5b/7] setProgressMode đã có — bỏ qua")

    # 5c. Thêm progress_mode vào setProject object
    old_set_project = "progress_pct: Number(data.progress_pct) || 0,\n          budget_planned:"
    new_set_project = "progress_pct: Number(data.progress_pct) || 0,\n          progress_mode: (data.progress_mode as ProgressMode) || 'auto',\n          budget_planned:"

    if "progress_mode: (data.progress_mode as ProgressMode)" not in content:
        content = content.replace(old_set_project, new_set_project, 1)
        changes += 1
        print("✅ [5c/7] Thêm progress_mode vào setProject")
    else:
        print("⏭️  [5c/7] setProject đã có progress_mode — bỏ qua")

    # 5d. Thêm progress_mode vào phase mapping (trong loadProject)
    old_phase_map = "progress_pct: Number(p.progress_pct) || 0,\n        planned_start: p.planned_start"
    new_phase_map = "progress_pct: Number(p.progress_pct) || 0,\n        progress_mode: (p.progress_mode as ProgressMode) || 'auto',\n        planned_start: p.planned_start"

    if content.count("progress_mode: (p.progress_mode as ProgressMode)") == 0:
        content = content.replace(old_phase_map, new_phase_map)
        changes += 1
        print("✅ [5d/7] Thêm progress_mode vào phase mapping")
    else:
        print("⏭️  [5d/7] Phase mapping đã có progress_mode — bỏ qua")

    # =========================================================================
    # 6. THÊM refreshProgress + toggleProgressMode handlers
    #    (sau dòng "const health = getHealthStatus()")
    # =========================================================================
    marker6 = "const health = getHealthStatus()"
    insert6 = """const health = getHealthStatus()

  // ========================================================================
  // ✅ AUTO-PROGRESS: Refresh handler
  // ========================================================================
  const refreshProgress = async () => {
    if (!realProjectId || refreshing) return
    try {
      setRefreshing(true)
      const result = await projectProgressService.recalculate(realProjectId)
      setProject(prev => ({ ...prev, progress_pct: result.project_progress }))
      await loadPhases()
      console.log(`✅ Progress recalculated: ${result.project_progress}%, ${result.phases_updated} phases updated`)
    } catch (err) {
      console.error('Refresh progress failed:', err)
    } finally {
      setRefreshing(false)
    }
  }

  // ========================================================================
  // ✅ AUTO-PROGRESS: Toggle mode handler
  // ========================================================================
  const toggleProgressMode = async () => {
    if (!realProjectId) return
    const newMode: ProgressMode = progressMode === 'auto' ? 'manual' : 'auto'
    try {
      await projectProgressService.setMode('project', realProjectId, newMode)
      setProgressMode(newMode)
      setProject(prev => ({ ...prev, progress_mode: newMode }))
      if (newMode === 'auto') {
        await refreshProgress()
      }
    } catch (err) {
      console.error('Toggle mode failed:', err)
    }
  }"""

    if 'refreshProgress' not in content:
        content = content.replace(marker6, insert6, 1)
        changes += 1
        print("✅ [6/7] Thêm refreshProgress + toggleProgressMode")
    else:
        print("⏭️  [6/7] Handlers đã có — bỏ qua")

    # =========================================================================
    # 7. THÊM UI: badge Auto/Nhập tay + nút Refresh vào header progress bar
    # =========================================================================
    old_progress_ui = """            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] text-gray-500">Tiến độ</span>
              <span className="text-[14px] font-bold text-gray-800" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {project.progress_pct.toFixed(1)}%
              </span>
            </div>"""

    new_progress_ui = """            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] text-gray-500">Tiến độ</span>
              <span className="text-[14px] font-bold text-gray-800" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {project.progress_pct.toFixed(1)}%
              </span>
              {/* ✅ AUTO-PROGRESS: Mode badge */}
              <button
                onClick={toggleProgressMode}
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                  progressMode === 'auto'
                    ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                    : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                }`}
                title={progressMode === 'auto' ? 'Đang tự động — nhấn để chuyển sang nhập tay' : 'Đang nhập tay — nhấn để chuyển sang tự động'}
              >
                {progressMode === 'auto' ? 'Auto' : 'Nhập tay'}
              </button>
              {/* ✅ AUTO-PROGRESS: Refresh button */}
              <button
                onClick={refreshProgress}
                disabled={refreshing}
                className="p-1 rounded-md text-gray-400 hover:text-[#1B4D3E] hover:bg-gray-100 transition-colors disabled:opacity-50"
                title="Cập nhật tiến độ từ tasks"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>"""

    if old_progress_ui in content:
        content = content.replace(old_progress_ui, new_progress_ui, 1)
        changes += 1
        print("✅ [7/7] Thêm UI badge Auto/Nhập tay + nút Refresh")
    elif 'toggleProgressMode' in content and 'Auto' in content and "progressMode === 'auto'" in content:
        print("⏭️  [7/7] UI đã có — bỏ qua")
    else:
        print("⚠️  [7/7] Không tìm thấy progress UI block — cần patch thủ công")

    # =========================================================================
    # WRITE FILE
    # =========================================================================
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"\n{'='*50}")
    print(f"✅ HOÀN TẤT: {changes} thay đổi đã áp dụng vào {filepath}")
    print(f"{'='*50}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 patch_auto_progress.py <path_to_ProjectDetailPage.tsx>")
        print("Ví dụ: python3 patch_auto_progress.py src/pages/projects/ProjectDetailPage.tsx")
        sys.exit(1)

    filepath = sys.argv[1]
    try:
        patch_file(filepath)
    except FileNotFoundError:
        print(f"❌ File không tồn tại: {filepath}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Lỗi: {e}")
        sys.exit(1)
