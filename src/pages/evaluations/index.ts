// src/pages/evaluations/index.ts
// FIXED: Chỉ export các modules thực sự tồn tại

export { ApprovalPage } from './ApprovalPage'
export { MyTasksPage } from './MyTasksPage'
export { SelfEvaluationPage } from './SelfEvaluationPage'
export { TaskDetailPage } from './TaskDetailPage'

// XÓA các exports không tồn tại:
// export { TaskListPage } from './TaskListPage';
// export { TaskCreatePage } from './TaskCreatePage';
// export { TaskEditPage } from './TaskEditPage';
// export { default as TaskViewPage } from './TaskViewPage';
// export * from './components';