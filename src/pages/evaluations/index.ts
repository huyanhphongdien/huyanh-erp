// src/pages/evaluations/index.ts
// FIXED: Sửa tên exports đúng với file thực tế

// ApprovalPage.tsx export là "ApprovalsPage" (có s)
export { ApprovalsPage } from './ApprovalPage'
export { ApprovalsPage as ApprovalPage } from './ApprovalPage'

// MyTasksPage.tsx dùng default export
export { default as MyTasksPage } from './MyTasksPage'

// TaskDetailPage.tsx dùng default export
export { default as TaskDetailPage } from './TaskDetailPage'

// Nếu có SelfEvaluationPage (uncomment nếu file tồn tại)
// export { default as SelfEvaluationPage } from './SelfEvaluationPage'