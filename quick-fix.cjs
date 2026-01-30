// quick-fix.cjs - Chạy bằng: node quick-fix.cjs
const fs = require('fs');
const path = require('path');

const fixes = [
  // AttendanceListPage.tsx
  ['src/features/attendance/AttendanceListPage.tsx', 'formatTime(item.check_in_time)', 'formatTime(item.check_in_time ?? undefined)'],
  ['src/features/attendance/AttendanceListPage.tsx', 'formatTime(item.check_out_time)', 'formatTime(item.check_out_time ?? undefined)'],
  ['src/features/attendance/AttendanceListPage.tsx', 'formatMinutes(item.working_minutes)', 'formatMinutes(item.working_minutes ?? 0)'],
  ['src/features/attendance/AttendanceListPage.tsx', 'item.overtime_minutes > 0', '(item.overtime_minutes ?? 0) > 0'],
  ['src/features/attendance/AttendanceListPage.tsx', 'formatMinutes(item.overtime_minutes)', 'formatMinutes(item.overtime_minutes ?? 0)'],
  
  // CheckInOutWidget.tsx
  ['src/features/attendance/CheckInOutWidget.tsx', 'todayAttendance.working_minutes / 60', '(todayAttendance.working_minutes ?? 0) / 60'],
  ['src/features/attendance/CheckInOutWidget.tsx', 'todayAttendance.working_minutes % 60', '(todayAttendance.working_minutes ?? 0) % 60'],
  
  // ContractListPage.tsx
  ['src/features/contracts/ContractListPage.tsx', 'formatCurrency(item.base_salary)', 'formatCurrency(item.base_salary ?? 0)'],
  ['src/features/contracts/ContractListPage.tsx', 'const statusColors = {', 'const statusColors: Record<string, string> = {'],
  ['src/features/contracts/ContractListPage.tsx', 'const statusLabels = {', 'const statusLabels: Record<string, string> = {'],
  
  // ExpiringContractsWidget.tsx
  ['src/features/contracts/ExpiringContractsWidget.tsx', 'contract.employee?.full_name', '(contract as any).employee?.full_name'],
  ['src/features/contracts/ExpiringContractsWidget.tsx', 'contract.contract_type?.name', '(contract as any).contract_type?.name'],
  
  // LeaveRequestListPage.tsx
  ['src/features/leave-requests/LeaveRequestListPage.tsx', 'const statusColors = {', 'const statusColors: Record<string, string> = {'],
  ['src/features/leave-requests/LeaveRequestListPage.tsx', 'const statusLabels = {', 'const statusLabels: Record<string, string> = {'],
  
  // LeaveTypeListPage.tsx
  ['src/features/leave-types/LeaveTypeListPage.tsx', 'backgroundColor: item.color }', 'backgroundColor: item.color ?? undefined }'],
  
  // PayrollPeriodForm.tsx
  ['src/features/payroll/PayrollPeriodForm.tsx', 'formatCurrency(initialData.total_amount)', 'formatCurrency(initialData.total_amount ?? 0)'],
  
  // PayrollPeriodListPage.tsx
  ['src/features/payroll/PayrollPeriodListPage.tsx', 'formatCurrency(item.total_amount)', 'formatCurrency(item.total_amount ?? 0)'],
  
  // PerformanceReviewListPage.tsx
  ['src/features/performance-reviews/PerformanceReviewListPage.tsx', '(data?.data || []) as PerformanceReview[]', '(data?.data || []) as unknown as PerformanceReview[]'],
  
  // PositionListPage.tsx
  ['src/features/positions/PositionListPage.tsx', 'position={selectedPosition}', 'position={selectedPosition as any}'],
  
  // SalaryGradeListPage.tsx
  ['src/features/salary-grades/SalaryGradeListPage.tsx', 'formatCurrency(item.min_salary)', 'formatCurrency(item.min_salary ?? 0)'],
  ['src/features/salary-grades/SalaryGradeListPage.tsx', 'formatCurrency(item.max_salary)', 'formatCurrency(item.max_salary ?? 0)'],
  
  // TaskListPage.tsx
  ['src/features/tasks/TaskListPage.tsx', 'canViewAllDepartments ? undefined : userDepartmentId}', 'canViewAllDepartments ? undefined : (userDepartmentId ?? undefined)}'],
  
  // Form type casts
  ['src/features/contract-types/ContractTypeForm.tsx', 'handleSubmit(onSubmit)', 'handleSubmit(onSubmit as any)'],
  ['src/features/leave-types/LeaveTypeForm.tsx', 'handleSubmit(data => mutation.mutate(data))', 'handleSubmit(data => mutation.mutate(data as any))'],
  ['src/features/salary-grades/SalaryGradeForm.tsx', 'handleSubmit(data => mutation.mutate(data))', 'handleSubmit(data => mutation.mutate(data as any))'],
  ['src/features/leave-requests/LeaveRequestForm.tsx', 'leaveRequestService.create(data)', 'leaveRequestService.create(data as any)'],
];

console.log('Starting Quick Fix...\n');

let totalFixes = 0;
const fileCache = {};

fixes.forEach(function(item) {
  const filePath = item[0];
  const find = item[1];
  const replace = item[2];
  const fullPath = path.join(process.cwd(), filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log('NOT FOUND: ' + filePath);
    return;
  }
  
  if (!fileCache[filePath]) {
    fileCache[filePath] = fs.readFileSync(fullPath, 'utf8');
  }
  
  if (fileCache[filePath].includes(find)) {
    fileCache[filePath] = fileCache[filePath].replace(find, replace);
    console.log('OK: ' + filePath);
    totalFixes++;
  }
});

Object.keys(fileCache).forEach(function(filePath) {
  const fullPath = path.join(process.cwd(), filePath);
  fs.writeFileSync(fullPath, fileCache[filePath], 'utf8');
});

console.log('\nDone! Applied ' + totalFixes + ' fixes');
console.log('Now run: npm run build');
