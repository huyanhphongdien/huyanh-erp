// quick-fix-forms.cjs - Chạy bằng: node quick-fix-forms.cjs
const fs = require('fs');
const path = require('path');

console.log('Fixing 3 Form files...\n');

// Fix 1: ContractTypeForm.tsx
const file1 = 'src/features/contract-types/ContractTypeForm.tsx';
if (fs.existsSync(file1)) {
  let content = fs.readFileSync(file1, 'utf8');
  content = content.replace(
    'defaultValues: initialData || {',
    `defaultValues: initialData ? {
      ...initialData,
      description: initialData.description ?? undefined,
      duration_months: initialData.duration_months ?? undefined,
    } : {`
  );
  fs.writeFileSync(file1, content, 'utf8');
  console.log('OK: ContractTypeForm.tsx');
}

// Fix 2: LeaveTypeForm.tsx
const file2 = 'src/features/leave-types/LeaveTypeForm.tsx';
if (fs.existsSync(file2)) {
  let content = fs.readFileSync(file2, 'utf8');
  content = content.replace(
    'defaultValues: initialData || {',
    `defaultValues: initialData ? {
      ...initialData,
      description: initialData.description ?? undefined,
      max_days_per_year: initialData.max_days_per_year ?? undefined,
      default_days: initialData.default_days ?? undefined,
      color: initialData.color ?? undefined,
    } : {`
  );
  fs.writeFileSync(file2, content, 'utf8');
  console.log('OK: LeaveTypeForm.tsx');
}

// Fix 3: SalaryGradeForm.tsx
const file3 = 'src/features/salary-grades/SalaryGradeForm.tsx';
if (fs.existsSync(file3)) {
  let content = fs.readFileSync(file3, 'utf8');
  content = content.replace(
    'defaultValues: initialData || {',
    `defaultValues: initialData ? {
      ...initialData,
      min_salary: initialData.min_salary ?? undefined,
      max_salary: initialData.max_salary ?? undefined,
      description: initialData.description ?? undefined,
    } : {`
  );
  fs.writeFileSync(file3, content, 'utf8');
  console.log('OK: SalaryGradeForm.tsx');
}

console.log('\nDone! Now run: npm run build');
