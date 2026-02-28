// remove-unused.cjs - Chạy: node remove-unused.cjs
const fs = require('fs');

const fixes = [
  // ApprovalModal.tsx - remove unused imports
  ['src/components/evaluation/ApprovalModal.tsx', 
   "  type ApprovalAction,\n", ""],
  ['src/components/evaluation/ApprovalModal.tsx', 
   "  APPROVAL_ACTIONS,\n", ""],
  ['src/components/evaluation/ApprovalModal.tsx', 
   "const calculatedRating = score !== null ? calculateRating(score) : null;", 
   "// const calculatedRating = score !== null ? calculateRating(score) : null;"],

  // ApprovalQueue.tsx
  ['src/components/evaluation/ApprovalQueue.tsx', 
   "  type SelfEvaluationStatus,\n", ""],
  ['src/components/evaluation/ApprovalQueue.tsx', 
   "  SELF_EVALUATION_STATUS_LABELS,\n", ""],
  ['src/components/evaluation/ApprovalQueue.tsx', 
   "RatingBadge, ", ""],
  ['src/components/evaluation/ApprovalQueue.tsx', 
   "  onRequestInfo,\n", "  // onRequestInfo,\n"],

  // ScoreInput.tsx
  ['src/components/evaluation/ScoreInput.tsx', 
   ", type RatingLevel", ""],

  // SelfEvaluationForm.tsx
  ['src/components/evaluation/SelfEvaluationForm.tsx', 
   "  QUALITY_ASSESSMENTS,\n", ""],
  ['src/components/evaluation/SelfEvaluationForm.tsx', 
   "  QUALITY_ASSESSMENT_LABELS,\n", ""],

  // SelfEvaluationList.tsx
  ['src/components/evaluation/SelfEvaluationList.tsx', 
   "  SELF_EVALUATION_STATUS,\n", ""],

  // TaskStatusHistory.tsx
  ['src/components/evaluation/TaskStatusHistory.tsx', 
   ", isLast,", ","],

  // permissions.config.ts
  ['src/config/permissions.config.ts', 
   "  FeaturePermission,\n", ""],

  // AttendanceListPage.tsx
  ['src/features/attendance/AttendanceListPage.tsx', 
   ", departmentService", ""],

  // LoginPage.tsx
  ['src/features/auth/LoginPage.tsx', 
   ", Input,", ","],

  // RegisterPage.tsx
  ['src/features/auth/RegisterPage.tsx', 
   "const navigate = useNavigate()", "// const navigate = useNavigate()"],

  // ContractListPage.tsx
  ['src/features/contracts/ContractListPage.tsx', 
   ", employeeService", ""],

  // ManagerDashboard.tsx
  ['src/features/dashboard/ManagerDashboard.tsx', 
   "  Bell,\n", ""],
  ['src/features/dashboard/ManagerDashboard.tsx', 
   "(value, name, props)", "(value, _name, props)"],

  // EmployeeListPage.tsx
  ['src/features/employees/EmployeeListPage.tsx', 
   ", positionService", ""],

  // EmployeeProfileTab.tsx
  ['src/features/employees/EmployeeProfileTab.tsx', 
   "{ errors, isDirty }", "{ isDirty }"],

  // PayrollPeriodForm.tsx
  ['src/features/payroll/PayrollPeriodForm.tsx', 
   ", watch,", ","],

  // CustomReportTab.tsx
  ['src/features/reports/CustomReportTab.tsx', 
   "import React, { useState, useEffect }", "import { useState, useEffect }"],
  ['src/features/reports/CustomReportTab.tsx', 
   "  CheckSquare,\n", ""],

  // PerformanceReportTab.tsx
  ['src/features/reports/PerformanceReportTab.tsx', 
   "import React, { useState, useEffect }", "import { useState, useEffect }"],

  // SalaryGradeListPage.tsx
  ['src/features/salary-grades/SalaryGradeListPage.tsx', 
   ", DataTable,", ","],

  // AttachmentSection.tsx
  ['src/features/tasks/components/AttachmentSection.tsx', 
   "  getFileIcon,\n", ""],

  // ExtensionApprovalTab.tsx
  ['src/features/tasks/components/ExtensionApprovalTab.tsx', 
   "  AlertTriangle,\n", ""],
  ['src/features/tasks/components/ExtensionApprovalTab.tsx', 
   "function getStatusBadge(status: string)", "function _getStatusBadge(status: string)"],

  // ExtensionHistory.tsx
  ['src/features/tasks/components/ExtensionHistory.tsx', 
   "  Download,\n", ""],

  // ParentTaskInfo.tsx
  ['src/features/tasks/components/ParentTaskInfo.tsx', 
   "import { useState, useEffect }", "import { useState }"],
  ['src/features/tasks/components/ParentTaskInfo.tsx', 
   "  Clock,\n", ""],
  ['src/features/tasks/components/ParentTaskInfo.tsx', 
   "  CheckCircle,\n", ""],
  ['src/features/tasks/components/ParentTaskInfo.tsx', 
   "  X,\n", ""],
  ['src/features/tasks/components/ParentTaskInfo.tsx', 
   ", SubtaskItem", ""],

  // ParticipantList.tsx
  ['src/features/tasks/components/ParticipantList.tsx', 
   "  onRoleChange,\n", "  // onRoleChange,\n"],

  // ParticipationRequestsTab.tsx
  ['src/features/tasks/components/ParticipationRequestsTab.tsx', 
   "function formatDateTime", "function _formatDateTime"],

  // SubtasksList.tsx
  ['src/features/tasks/components/SubtasksList.tsx', 
   "  SubtaskSummary,\n", ""],
  ['src/features/tasks/components/SubtasksList.tsx', 
   "  parentTaskCode,\n", "  // parentTaskCode,\n"],

  // TaskOverviewTab.tsx
  ['src/features/tasks/components/TaskOverviewTab.tsx', 
   "  ChevronDown,\n", ""],
  ['src/features/tasks/components/TaskOverviewTab.tsx', 
   "  Filter,\n", ""],

  // TaskStatusBadge.tsx
  ['src/features/tasks/components/TaskStatusBadge.tsx', 
   "import React from 'react'\n", ""],

  // useExtensionRequests.ts
  ['src/features/tasks/hooks/useExtensionRequests.ts', 
   "(data, variables)", "(_data, variables)"],

  // useTaskAssignments.ts
  ['src/features/tasks/hooks/useTaskAssignments.ts', 
   "(data, variables)", "(_data, variables)"],

  // TaskListPage.tsx
  ['src/features/tasks/TaskListPage.tsx', 
   "    userGroup,\n", "    // userGroup,\n"],

  // TaskViewPage.tsx
  ['src/features/tasks/TaskViewPage.tsx', 
   "const isLocked = lockedStatuses.includes(evaluationStatus)", 
   "// const isLocked = lockedStatuses.includes(evaluationStatus)"],
  ['src/features/tasks/TaskViewPage.tsx', 
   "const [canHaveChildren, setCanHaveChildren] = useState(true)", 
   "const [, setCanHaveChildren] = useState(true)"],

  // ApprovalPage.tsx
  ['src/pages/evaluations/ApprovalPage.tsx', 
   "const navigate = useNavigate();", "// const navigate = useNavigate();"],
  ['src/pages/evaluations/ApprovalPage.tsx', 
   "{ group, isAdmin, canApprove }", "{ group, isAdmin }"],

  // MyTasksPage.tsx
  ['src/pages/evaluations/MyTasksPage.tsx', 
   "const STATUS_CONFIG:", "const _STATUS_CONFIG:"],

  // myTasksService.ts
  ['src/services/myTasksService.ts', 
   "const COMPLETED_STATUSES", "const _COMPLETED_STATUSES"],
  ['src/services/myTasksService.ts', 
   "count: assigneeCount", "count: _assigneeCount"],

  // performanceService.ts
  ['src/services/performanceService.ts', 
   "interface ReviewScore", "interface _ReviewScore"],

  // progressService.ts
  ['src/services/progressService.ts', 
   "changedBy, reason", "_changedBy, _reason"],
  ['src/services/progressService.ts', 
   "taskId, mode, changedBy", "taskId, mode, _changedBy"],

  // taskParticipantService.ts
  ['src/services/taskParticipantService.ts', 
   "removedBy: string", "// removedBy: string"],

  // authStore.ts
  ['src/stores/authStore.ts', 
   "error: errById", "error: _errById"],
  ['src/stores/authStore.ts', 
   "error: errByUserId", "error: _errByUserId"],
  ['src/stores/authStore.ts', 
   "const { data, error } = await supabase.auth.signUp", 
   "const { error } = await supabase.auth.signUp"],
];

console.log('Removing unused imports/variables...\n');

let count = 0;
const cache = {};

fixes.forEach(([file, find, replace]) => {
  if (!fs.existsSync(file)) {
    console.log('NOT FOUND: ' + file);
    return;
  }
  
  if (!cache[file]) {
    cache[file] = fs.readFileSync(file, 'utf8');
  }
  
  if (cache[file].includes(find)) {
    cache[file] = cache[file].replace(find, replace);
    count++;
  }
});

Object.keys(cache).forEach(file => {
  fs.writeFileSync(file, cache[file], 'utf8');
});

console.log('Done! Fixed ' + count + ' issues');
console.log('Now run: npm run build');
