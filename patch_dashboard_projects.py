#!/usr/bin/env python3
"""
Patch Dashboard & Navigation — Thêm thông tin Dự án
Chạy: python3 patch_dashboard_projects.py <project_root>
Ví dụ: python3 patch_dashboard_projects.py .
       python3 patch_dashboard_projects.py /path/to/erp

Sẽ patch 3 file:
1. src/features/dashboard/ManagerDashboard.tsx — thêm project stats + recent projects card
2. src/features/dashboard/EmployeeDashboard.tsx — thêm "Dự án của tôi" card
3. src/config/navigation.ts — thêm route Dashboard DA
"""

import sys
import os

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

# ═══════════════════════════════════════════════════════════════════════════
# 1. PATCH: ManagerDashboard.tsx
# ═══════════════════════════════════════════════════════════════════════════

def patch_manager_dashboard(filepath):
    content = read_file(filepath)
    changes = 0
    print(f"\n📝 Patching ManagerDashboard: {filepath}")

    # 1a. Thêm FolderKanban icon import
    if 'FolderKanban' not in content:
        content = content.replace(
            "  BarChart3,\n} from 'lucide-react'",
            "  BarChart3,\n  FolderKanban,\n} from 'lucide-react'"
        )
        changes += 1
        print("  ✅ Thêm FolderKanban icon import")

    # 1b. Thêm state cho project stats (sau expiringContracts state)
    if 'projectStats' not in content:
        content = content.replace(
            "const [expiringContracts, setExpiringContracts] = useState<ContractAlert[]>([])",
            """const [expiringContracts, setExpiringContracts] = useState<ContractAlert[]>([])

  // ✅ PROJECT STATS
  const [projectStats, setProjectStats] = useState<{
    total: number; active: number; completed: number;
    recentProjects: { id: string; code: string; name: string; status: string; progress_pct: number }[]
  }>({ total: 0, active: 0, completed: 0, recentProjects: [] })"""
        )
        changes += 1
        print("  ✅ Thêm projectStats state")

    # 1c. Thêm project data loading (sau contractsResult fetch)
    if 'Load project stats' not in content:
        old_load = "if (statsResult.data) setStats(statsResult.data)"
        new_load = """if (statsResult.data) setStats(statsResult.data)

      // ✅ Load project stats
      try {
        const { count: totalProjects } = await supabase
          .from('projects').select('*', { count: 'exact', head: true })
        const { count: activeProjects } = await supabase
          .from('projects').select('*', { count: 'exact', head: true })
          .in('status', ['in_progress', 'approved', 'planning'])
        const { count: completedProjects } = await supabase
          .from('projects').select('*', { count: 'exact', head: true })
          .eq('status', 'completed')
        const { data: recentProjs } = await supabase
          .from('projects')
          .select('id, code, name, status, progress_pct')
          .neq('status', 'cancelled')
          .order('updated_at', { ascending: false })
          .limit(5)
        setProjectStats({
          total: totalProjects || 0,
          active: activeProjects || 0,
          completed: completedProjects || 0,
          recentProjects: recentProjs || [],
        })
      } catch (e) { console.error('Project stats error:', e) }"""

        # Cần import supabase nếu chưa có
        if "import { supabase }" not in content and "from '../../lib/supabase'" not in content:
            content = content.replace(
                "import { useAuthStore }",
                "import { supabase } from '../../lib/supabase'\nimport { useAuthStore }"
            )
            changes += 1
            print("  ✅ Thêm supabase import")

        content = content.replace(old_load, new_load)
        changes += 1
        print("  ✅ Thêm project data loading")

    # 1d. Thêm Project Stats Card
    if 'DỰ ÁN ĐANG CHẠY' not in content:
        old_stat_grid_end = """          <StatCard
            title="Chờ duyệt"
            value={stats?.pendingApprovals || 0}
            subtitle="Đang chờ phê duyệt"
            icon={<Clock className="w-6 h-6" />}
            color="yellow"
            onClick={() => navigate('/approvals')}
          />
        </div>"""

        new_stat_grid_end = """          <StatCard
            title="Chờ duyệt"
            value={stats?.pendingApprovals || 0}
            subtitle="Đang chờ phê duyệt"
            icon={<Clock className="w-6 h-6" />}
            color="yellow"
            onClick={() => navigate('/approvals')}
          />
        </div>

        {/* ══════════ DỰ ÁN ĐANG CHẠY — Project summary card ══════════ */}
        {projectStats.total > 0 && (
          <Card>
            <SectionHeader
              title="Dự án"
              icon={<FolderKanban className="w-4 h-4 sm:w-5 sm:h-5" />}
              action={
                <button
                  onClick={() => navigate('/projects/list')}
                  className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                >
                  Xem tất cả <ChevronRight className="w-3.5 h-3.5" />
                </button>
              }
            />
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center p-2.5 sm:p-3 bg-blue-50 rounded-xl">
                <div className="text-lg sm:text-xl font-bold text-blue-600">{projectStats.total}</div>
                <div className="text-[10px] sm:text-xs text-gray-500">Tổng DA</div>
              </div>
              <div className="text-center p-2.5 sm:p-3 bg-emerald-50 rounded-xl">
                <div className="text-lg sm:text-xl font-bold text-emerald-600">{projectStats.active}</div>
                <div className="text-[10px] sm:text-xs text-gray-500">Đang chạy</div>
              </div>
              <div className="text-center p-2.5 sm:p-3 bg-green-50 rounded-xl">
                <div className="text-lg sm:text-xl font-bold text-green-600">{projectStats.completed}</div>
                <div className="text-[10px] sm:text-xs text-gray-500">Hoàn thành</div>
              </div>
            </div>
            <div className="space-y-2">
              {projectStats.recentProjects.map((proj) => (
                <div
                  key={proj.id}
                  onClick={() => navigate(`/projects/${proj.id}`)}
                  className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors active:bg-gray-100"
                >
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <FolderKanban className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{proj.name}</p>
                    <p className="text-[10px] sm:text-xs text-gray-500">{proj.code}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-16 sm:w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          proj.progress_pct >= 75 ? 'bg-emerald-500' :
                          proj.progress_pct >= 40 ? 'bg-blue-500' :
                          proj.progress_pct >= 10 ? 'bg-amber-500' : 'bg-gray-300'
                        }`}
                        style={{ width: `${proj.progress_pct}%` }}
                      />
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-gray-600 w-10 text-right">
                      {proj.progress_pct}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}"""

        content = content.replace(old_stat_grid_end, new_stat_grid_end)
        changes += 1
        print("  ✅ Thêm Project Stats + Recent Projects card")

    # 1e. Thêm "Dự án" vào Quick Actions
    if "'/projects/list'" not in content:
        old_quick = "{ label: 'Thống kê', icon: <BarChart3 className=\"w-5 h-5\" />, path: '/reports/tasks', color: 'bg-pink-100 text-pink-600 hover:bg-pink-200 active:bg-pink-300' },"
        new_quick = """{ label: 'Thống kê', icon: <BarChart3 className="w-5 h-5" />, path: '/reports/tasks', color: 'bg-pink-100 text-pink-600 hover:bg-pink-200 active:bg-pink-300' },
              { label: 'Dự án', icon: <FolderKanban className="w-5 h-5" />, path: '/projects/list', color: 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200 active:bg-indigo-300' },"""
        content = content.replace(old_quick, new_quick)
        changes += 1
        print("  ✅ Thêm 'Dự án' vào Quick Actions")

    write_file(filepath, content)
    print(f"  📄 {changes} thay đổi")
    return changes

# ═══════════════════════════════════════════════════════════════════════════
# 2. PATCH: EmployeeDashboard.tsx
# ═══════════════════════════════════════════════════════════════════════════

def patch_employee_dashboard(filepath):
    content = read_file(filepath)
    changes = 0
    print(f"\n📝 Patching EmployeeDashboard: {filepath}")

    # 2a. Thêm FolderKanban icon
    if 'FolderKanban' not in content:
        content = content.replace(
            "  LogIn,\n} from 'lucide-react'",
            "  LogIn,\n  FolderKanban,\n} from 'lucide-react'"
        )
        changes += 1
        print("  ✅ Thêm FolderKanban icon import")

    # 2b. Thêm project count vào DashboardStats interface
    if 'myProjectCount' not in content:
        content = content.replace(
            "  recentTasks: RecentTask[]\n}",
            "  recentTasks: RecentTask[]\n  myProjectCount: number\n}"
        )
        changes += 1
        print("  ✅ Thêm myProjectCount vào DashboardStats")

    # 2c. Thêm default value
    if "myProjectCount: 0" not in content:
        content = content.replace(
            "    recentTasks: [],\n  })",
            "    recentTasks: [],\n    myProjectCount: 0,\n  })"
        )
        changes += 1
        print("  ✅ Thêm myProjectCount default value")

    # 2d. Thêm query đếm dự án nhân viên tham gia (trước setStats cuối)
    if 'myProjectCount' not in content.split('setStats({')[1] if 'setStats({' in content else '':
        old_set_stats = """      setStats({
        totalTasks: totalTasks || 0,
        pendingEvaluation: pendingEvalTasks?.length || 0,
        completedTasks: completedData?.length || 0,
        inProgressTasks: inProgressData?.length || 0,
        remainingLeaveDays: remainingDays,
        pendingLeaveRequests: pendingLeave || 0,
        recentTasks,
      })"""

        new_set_stats = """      // ✅ Đếm dự án nhân viên tham gia
      let myProjectCount = 0
      try {
        const { count } = await supabase
          .from('project_members')
          .select('*', { count: 'exact', head: true })
          .eq('employee_id', employeeId)
          .eq('is_active', true)
        myProjectCount = count || 0
      } catch {}

      setStats({
        totalTasks: totalTasks || 0,
        pendingEvaluation: pendingEvalTasks?.length || 0,
        completedTasks: completedData?.length || 0,
        inProgressTasks: inProgressData?.length || 0,
        remainingLeaveDays: remainingDays,
        pendingLeaveRequests: pendingLeave || 0,
        recentTasks,
        myProjectCount,
      })"""

        content = content.replace(old_set_stats, new_set_stats)
        changes += 1
        print("  ✅ Thêm query đếm dự án")

    # 2e. Thêm StatCard "Dự án" (sau card "Phiếu lương")
    if 'myProjectCount > 0' not in content:
        old_payslip_card = """          <StatCard
            title="Phiếu lương"
            value="Xem"
            subtitle="phiếu lương mới nhất"
            icon={<Wallet size={24} />}
            color="pink"
            link="/payslips"
          />
        </div>"""

        new_payslip_card = """          <StatCard
            title="Phiếu lương"
            value="Xem"
            subtitle="phiếu lương mới nhất"
            icon={<Wallet size={24} />}
            color="pink"
            link="/payslips"
          />
          {stats.myProjectCount > 0 && (
            <StatCard
              title="Dự án"
              value={stats.myProjectCount}
              subtitle="đang tham gia"
              icon={<FolderKanban size={24} />}
              color="indigo"
              link="/projects/list"
            />
          )}
        </div>"""

        content = content.replace(old_payslip_card, new_payslip_card)
        changes += 1
        print("  ✅ Thêm StatCard 'Dự án' cho nhân viên")

    # 2f. Thêm Dự án vào Quick Actions
    if "FolderKanban size={22}" not in content:
        old_qa = """            <Link
              to="/payslips"
              className="flex flex-col items-center gap-1.5 sm:gap-2 p-3 sm:p-4 rounded-xl bg-pink-50 text-pink-600 hover:bg-pink-100 active:bg-pink-200 transition-colors"
            >
              <Wallet size={22} />
              <span className="text-xs sm:text-sm font-medium">Phiếu lương</span>
            </Link>
          </div>"""

        new_qa = """            <Link
              to="/payslips"
              className="flex flex-col items-center gap-1.5 sm:gap-2 p-3 sm:p-4 rounded-xl bg-pink-50 text-pink-600 hover:bg-pink-100 active:bg-pink-200 transition-colors"
            >
              <Wallet size={22} />
              <span className="text-xs sm:text-sm font-medium">Phiếu lương</span>
            </Link>
            <Link
              to="/projects/list"
              className="flex flex-col items-center gap-1.5 sm:gap-2 p-3 sm:p-4 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 active:bg-indigo-200 transition-colors"
            >
              <FolderKanban size={22} />
              <span className="text-xs sm:text-sm font-medium">Dự án</span>
            </Link>
          </div>"""

        content = content.replace(old_qa, new_qa)
        changes += 1
        print("  ✅ Thêm 'Dự án' vào Quick Actions")

    write_file(filepath, content)
    print(f"  📄 {changes} thay đổi")
    return changes

# ═══════════════════════════════════════════════════════════════════════════
# 3. PATCH: navigation.ts — thêm Dashboard DA route
# ═══════════════════════════════════════════════════════════════════════════

def patch_navigation(filepath):
    content = read_file(filepath)
    changes = 0
    print(f"\n📝 Patching navigation.ts: {filepath}")

    # 3a. Thêm route "Dashboard DA" vào group QUẢN LÝ DỰ ÁN (trước Danh sách DA)
    if "Dashboard DA" not in content:
        old_projects_group = """      // ✅ PM3: Danh sách & Tạo mới
      { label: 'Danh sách DA', href: '/projects/list', icon: ListTodo },"""

        new_projects_group = """      // ✅ PM3: Danh sách & Tạo mới
      { label: 'Dashboard DA', href: '/projects/dashboard', icon: FolderKanban },
      { label: 'Danh sách DA', href: '/projects/list', icon: ListTodo },"""

        content = content.replace(old_projects_group, new_projects_group)
        changes += 1
        print("  ✅ Thêm 'Dashboard DA' vào navigation")

    write_file(filepath, content)
    print(f"  📄 {changes} thay đổi")
    return changes

# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 patch_dashboard_projects.py <project_root>")
        print("Ví dụ: python3 patch_dashboard_projects.py .")
        sys.exit(1)

    root = sys.argv[1].rstrip('/')

    files = {
        'manager': f"{root}/src/features/dashboard/ManagerDashboard.tsx",
        'employee': f"{root}/src/features/dashboard/EmployeeDashboard.tsx",
        'navigation': f"{root}/src/config/navigation.ts",
    }

    total_changes = 0

    # Patch Manager Dashboard
    if os.path.exists(files['manager']):
        total_changes += patch_manager_dashboard(files['manager'])
    else:
        print(f"⚠️  Không tìm thấy {files['manager']}")

    # Patch Employee Dashboard
    if os.path.exists(files['employee']):
        total_changes += patch_employee_dashboard(files['employee'])
    else:
        print(f"⚠️  Không tìm thấy {files['employee']}")

    # Patch Navigation
    if os.path.exists(files['navigation']):
        total_changes += patch_navigation(files['navigation'])
    else:
        print(f"⚠️  Không tìm thấy {files['navigation']}")

    print(f"\n{'='*55}")
    print(f"✅ HOÀN TẤT: {total_changes} thay đổi trên {sum(1 for f in files.values() if os.path.exists(f))} file")
    print(f"{'='*55}")
    print()
    print("⚠️  Cần thêm route trong App.tsx nếu muốn /projects/dashboard:")
    print("   <Route path=\"dashboard\" element={<ProjectDashboardPage />} />")
    print("   (Hoặc dùng ProjectListPage làm dashboard)")


if __name__ == '__main__':
    main()
