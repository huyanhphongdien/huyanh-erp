// fix-errors.cjs - Chạy: node fix-errors.cjs
const fs = require('fs');

console.log('Fixing 7 errors...\n');

// Fix 1: ApprovalQueue.tsx - restore onRequestInfo
const file1 = 'src/components/evaluation/ApprovalQueue.tsx';
if (fs.existsSync(file1)) {
  let content = fs.readFileSync(file1, 'utf8');
  content = content.replace("  // onRequestInfo,\n", "  onRequestInfo,\n");
  fs.writeFileSync(file1, content, 'utf8');
  console.log('OK: ApprovalQueue.tsx');
}

// Fix 2: ApprovalPage.tsx - restore navigate
const file2 = 'src/pages/evaluations/ApprovalPage.tsx';
if (fs.existsSync(file2)) {
  let content = fs.readFileSync(file2, 'utf8');
  content = content.replace("// const navigate = useNavigate();", "const navigate = useNavigate();");
  fs.writeFileSync(file2, content, 'utf8');
  console.log('OK: ApprovalPage.tsx');
}

// Fix 3: progressService.ts - fix destructuring
const file3 = 'src/services/progressService.ts';
if (fs.existsSync(file3)) {
  let content = fs.readFileSync(file3, 'utf8');
  // Revert _changedBy, _reason back and use different approach
  content = content.replace(
    "const { taskId, progress, _changedBy, _reason } = input",
    "const { taskId, progress } = input"
  );
  content = content.replace(
    "const { taskId, mode, _changedBy } = input",
    "const { taskId, mode } = input"
  );
  fs.writeFileSync(file3, content, 'utf8');
  console.log('OK: progressService.ts');
}

// Fix 4: TaskParticipantsSection.tsx - need to check this file
const file4 = 'src/features/tasks/components/TaskParticipantsSection.tsx';
if (fs.existsSync(file4)) {
  let content = fs.readFileSync(file4, 'utf8');
  // Find line 469 area and fix the argument issue
  // This is likely a function call with wrong number of args
  // Let's check if there's an issue with employee_id
  if (content.includes("user?.employee_id || ''")) {
    // This might be related to a function that was changed
    console.log('CHECK: TaskParticipantsSection.tsx - needs manual review');
  }
}

console.log('\nDone! Now run: npm run build');
