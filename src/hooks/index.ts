// src/hooks/index.ts
// Export all hooks

export { usePermissions, useTaskPermissions } from './usePermissions'
export type { 
  UsePermissionsReturn, 
  UseTaskPermissionsReturn,
  TaskForPermission,
  TaskPermissions,
  PermissionGroup,
  UserRole,
} from './usePermissions'

// Re-export other hooks if they exist
// export { useDebounce } from './useDebounce'
// export { useLocalStorage } from './useLocalStorage'