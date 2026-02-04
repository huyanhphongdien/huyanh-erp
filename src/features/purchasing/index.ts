// ============================================================================
// PURCHASING MODULE - INDEX EXPORTS
// File: src/features/purchasing/index.ts
// Huy Anh ERP System - Module Quản lý đơn hàng
// Updated: Phase 2E - Materials UI
// ============================================================================

// ===== SUPPLIER PAGES (Phase 1) =====
// Path: từ src/features/purchasing/ đến src/features/purchasing/pages/
export { SupplierListPage } from './pages/SupplierListPage';
export { SupplierCreatePage } from './pages/SupplierCreatePage';
export { SupplierEditPage } from './pages/SupplierEditPage';
export { SupplierDetailPage } from './pages/SupplierDetailPage';

// ===== MATERIAL PAGES (Phase 2) =====
export { default as CategoryListPage } from './pages/CategoryListPage';
export { default as TypeListPage } from './pages/TypeListPage';
export { default as UnitListPage } from './pages/UnitListPage';
export { default as MaterialListPage } from './pages/MaterialListPage';
export { default as MaterialDetailPage } from './pages/MaterialDetailPage';

// ===== SUPPLIER COMPONENTS =====
// Path: từ src/features/purchasing/ đến src/features/purchasing/pages/components/suppliers/
export { SupplierForm } from './pages/components/suppliers/SupplierForm';
export { SupplierContacts } from './pages/components/suppliers/SupplierContacts';
export { SupplierQuotations } from './pages/components/suppliers/SupplierQuotations';

// ===== MATERIAL COMPONENTS =====
// Path: từ src/features/purchasing/ đến src/features/purchasing/pages/components/materials/
export { default as CategoryForm } from './pages/components/materials/CategoryForm';
export { default as TypeForm } from './pages/components/materials/TypeForm';
export { default as UnitForm } from './pages/components/materials/UnitForm';
export { default as MaterialForm } from './pages/components/materials/MaterialForm';

// ===== SERVICES RE-EXPORT =====
// Path: từ src/features/purchasing/ đến src/services/ (2 cấp lên)
export { 
  supplierService,
  type Supplier,
  type SupplierContact,
  type SupplierQuotation,
  type SupplierFormData,
  type SupplierFilterParams
} from '../../services/supplierService';

export {
  purchaseAccessService,
  type PurchasePermissions,
  type PurchaseAccess
} from '../../services/purchaseAccessService';

export {
  materialCategoryService,
  type MaterialCategory,
  type MaterialCategoryFormData
} from '../../services/materialCategoryService';

export {
  materialTypeService,
  type MaterialType,
  type MaterialTypeFormData
} from '../../services/materialTypeService';

export {
  unitService,
  type Unit,
  type UnitFormData,
  UNIT_TYPES,
  getUnitTypeLabel,
  getUnitTypeColor
} from '../../services/unitService';

export {
  materialService,
  type Material,
  type MaterialFormData,
  type MaterialSupplier,
  type MaterialSupplierFormData,
  generateMaterialCode,
  previewMaterialCode
} from '../../services/materialService';