// src/services/index.ts
// Export all services - với selective exports để tránh conflict

// ===== PHASE 3.1: Tổ chức =====
export * from './departmentService';
export * from './positionService';
export * from './employeeService';

// ===== PHASE 3.2: Hợp đồng =====
export * from './contractTypeService';
export * from './employeeProfileService';
export * from './contractService';
export * from './employeeDocumentService';

// ===== PHASE 3.3: Nghỉ phép & Chấm công =====
export * from './leaveTypeService';
export * from './leaveRequestService';
export * from './attendanceService';

// ===== PHASE 3.4: Lương & Đánh giá =====
export * from './salaryGradeService';
export * from './payrollService';
export * from './performanceService';

// ===== PHASE 4.1: Task Management =====
export * from './taskService';

// ===== PHASE 4.3: Task Status Service (Primary cho status operations) =====
export * from './taskStatusService';

// ===== PHASE 4.3: My Tasks Service =====
export * from './myTasksService';

// ===== PHASE 4.3: Self Evaluation Service =====
export * from './selfEvaluationService';

// ===== PHASE 4.3: Approval Service =====
// Selective export - KHÔNG export approveTask, rejectTask, requestInfo vì đã có trong taskStatusService
export {
  // Types only
  type PendingEvaluation,
  type CompletedTaskWithoutEval,
  type ApprovalStats,
  type ApproveInput,
  type RejectInput,
  type RequestRevisionInput,
  type QuickApproveInput,
  type ApproveTaskInput,
  type RejectTaskInput,
  type RequestInfoInput,
  // Functions không trùng
  getPendingApprovals,
  getApprovalHistory,
  // Service object (có các method riêng)
  approvalService,
} from './approvalService';

// ===== PHASE 4.3: Progress Service =====
export * from './progressService';

// ===== PHASE 4.3: Task Detail Service =====
export * from './taskDetailService';

// ===== PHASE 4.3: Task Assignment Service =====
export * from './taskAssignmentService';

// ===== Email Service =====
export * from './emailService';

// ===== Chấm công V2: Shift Services =====
export * from './shiftService';
export * from './shiftAssignmentService';
export * from './shiftTeamService';