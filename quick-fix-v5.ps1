# QUICK-FIX Script V5 - Simple Version
# Chay tu thu muc goc project: .\quick-fix-v5.ps1

Write-Host "Starting Quick Fixes V5..." -ForegroundColor Cyan

$files = @{
    "src\features\attendance\AttendanceListPage.tsx" = @(
        @("formatTime(item.check_in_time)", "formatTime(item.check_in_time ?? undefined)"),
        @("formatTime(item.check_out_time)", "formatTime(item.check_out_time ?? undefined)"),
        @("formatMinutes(item.working_minutes)", "formatMinutes(item.working_minutes ?? 0)"),
        @("item.overtime_minutes > 0", "(item.overtime_minutes ?? 0) > 0"),
        @("formatMinutes(item.overtime_minutes)", "formatMinutes(item.overtime_minutes ?? 0)")
    )
    "src\features\attendance\CheckInOutWidget.tsx" = @(
        @("todayAttendance.working_minutes / 60", "(todayAttendance.working_minutes ?? 0) / 60"),
        @("todayAttendance.working_minutes % 60", "(todayAttendance.working_minutes ?? 0) % 60")
    )
    "src\features\contracts\ContractListPage.tsx" = @(
        @("formatCurrency(item.base_salary)", "formatCurrency(item.base_salary ?? 0)"),
        @("const statusColors = {", "const statusColors: Record<string, string> = {"),
        @("const statusLabels = {", "const statusLabels: Record<string, string> = {")
    )
    "src\features\contracts\ExpiringContractsWidget.tsx" = @(
        @("contract.employee?.full_name", "(contract as any).employee?.full_name"),
        @("contract.contract_type?.name", "(contract as any).contract_type?.name")
    )
    "src\features\leave-requests\LeaveRequestListPage.tsx" = @(
        @("const statusColors = {", "const statusColors: Record<string, string> = {"),
        @("const statusLabels = {", "const statusLabels: Record<string, string> = {")
    )
    "src\features\leave-types\LeaveTypeListPage.tsx" = @(
        @("backgroundColor: item.color }", "backgroundColor: item.color ?? undefined }")
    )
    "src\features\payroll\PayrollPeriodForm.tsx" = @(
        @("formatCurrency(initialData.total_amount)", "formatCurrency(initialData.total_amount ?? 0)")
    )
    "src\features\payroll\PayrollPeriodListPage.tsx" = @(
        @("formatCurrency(item.total_amount)", "formatCurrency(item.total_amount ?? 0)")
    )
    "src\features\performance-reviews\PerformanceReviewListPage.tsx" = @(
        @("(data?.data || []) as PerformanceReview[]", "(data?.data || []) as unknown as PerformanceReview[]")
    )
    "src\features\positions\PositionListPage.tsx" = @(
        @("position={selectedPosition}", "position={selectedPosition as any}")
    )
    "src\features\salary-grades\SalaryGradeListPage.tsx" = @(
        @("formatCurrency(item.min_salary)", "formatCurrency(item.min_salary ?? 0)"),
        @("formatCurrency(item.max_salary)", "formatCurrency(item.max_salary ?? 0)")
    )
    "src\features\tasks\TaskListPage.tsx" = @(
        @("canViewAllDepartments ? undefined : userDepartmentId}", "canViewAllDepartments ? undefined : (userDepartmentId ?? undefined)}")
    )
    "src\features\contract-types\ContractTypeForm.tsx" = @(
        @("handleSubmit(onSubmit)", "handleSubmit(onSubmit as any)")
    )
    "src\features\leave-types\LeaveTypeForm.tsx" = @(
        @("handleSubmit(data => mutation.mutate(data))", "handleSubmit(data => mutation.mutate(data as any))")
    )
    "src\features\salary-grades\SalaryGradeForm.tsx" = @(
        @("handleSubmit(data => mutation.mutate(data))", "handleSubmit(data => mutation.mutate(data as any))")
    )
    "src\features\leave-requests\LeaveRequestForm.tsx" = @(
        @("leaveRequestService.create(data)", "leaveRequestService.create(data as any)")
    )
}

$fixCount = 0

foreach ($file in $files.Keys) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw -Encoding UTF8
        $changed = $false
        
        foreach ($replacement in $files[$file]) {
            $find = $replacement[0]
            $replace = $replacement[1]
            
            if ($content.Contains($find)) {
                $content = $content.Replace($find, $replace)
                Write-Host "  OK: $file - $find" -ForegroundColor Green
                $fixCount++
                $changed = $true
            }
        }
        
        if ($changed) {
            Set-Content $file $content -NoNewline -Encoding UTF8
        }
    } else {
        Write-Host "  NOT FOUND: $file" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Done! Applied $fixCount fixes" -ForegroundColor Cyan
Write-Host "Now run: npm run build" -ForegroundColor Yellow
