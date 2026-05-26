/**
 * Self-running verification cho src/lib/hac13.ts.
 *
 * Chạy:
 *   node --experimental-strip-types src/lib/__tests__/hac13.test.ts
 *
 * Vector test dựa theo ví dụ trong:
 *   docs/du lieu tho/QuyDinh_MaDinhDanh_v10_CaoSuHuyAnh (3).docx
 */

import {
  HAC13_PREFIX,
  buildHac13,
  calculateCheckDigit,
  formatHac13Display,
  isHac13,
  parseHac13,
  validateHac13,
} from '../hac13.ts';

type Case = { name: string; fn: () => void };
const cases: Case[] = [];
function test(name: string, fn: () => void) {
  cases.push({ name, fn });
}
function assertEqual<T>(actual: T, expected: T, label = '') {
  if (actual !== expected) {
    throw new Error(
      `${label ? label + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
function assert(cond: unknown, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

// ─── calculateCheckDigit ─────────────────────────────────────────────────────
test('calculateCheckDigit: ví dụ An Xuyên 899910001234 → 6', () => {
  assertEqual(calculateCheckDigit('899910001234'), '6');
});

test('calculateCheckDigit: ví dụ BP nước ngoài 899920000056 → 4', () => {
  assertEqual(calculateCheckDigit('899920000056'), '4');
});

test('calculateCheckDigit: ví dụ nhân viên 899930000012 → 9', () => {
  assertEqual(calculateCheckDigit('899930000012'), '9');
});

test('calculateCheckDigit: throw khi input không phải 12 chữ số', () => {
  let threw = false;
  try {
    calculateCheckDigit('12345');
  } catch {
    threw = true;
  }
  assert(threw, 'expected throw for non-12-digit input');
});

test('calculateCheckDigit: throw khi có ký tự không phải digit', () => {
  let threw = false;
  try {
    calculateCheckDigit('89991000123a');
  } catch {
    threw = true;
  }
  assert(threw, 'expected throw for non-digit char');
});

// ─── validateHac13 ───────────────────────────────────────────────────────────
test('validateHac13: 3 ví dụ docx đều hợp lệ', () => {
  assertEqual(validateHac13('8999100012346').valid, true, '8999100012346');
  assertEqual(validateHac13('8999200000564').valid, true, '8999200000564');
  assertEqual(validateHac13('8999300000129').valid, true, '8999300000129');
});

test('validateHac13: rỗng → EMPTY', () => {
  assertEqual(validateHac13('').reason, 'EMPTY');
});

test('validateHac13: sai độ dài → WRONG_LENGTH', () => {
  assertEqual(validateHac13('899910001234').reason, 'WRONG_LENGTH'); // 12 ký tự
  assertEqual(validateHac13('89991000123466').reason, 'WRONG_LENGTH'); // 14 ký tự
});

test('validateHac13: chứa chữ cái → NON_NUMERIC', () => {
  assertEqual(validateHac13('8999100012a46').reason, 'NON_NUMERIC');
});

test('validateHac13: sai prefix → WRONG_PREFIX', () => {
  assertEqual(validateHac13('6886100012346').reason, 'WRONG_PREFIX');
});

test('validateHac13: type code 4 → INVALID_TYPE', () => {
  // build với prefix đúng + type=4 + seq + check digit tính trên 8999400012345
  // Cho check digit hợp lệ để bị reject ở step INVALID_TYPE chứ không phải CHECK_DIGIT_MISMATCH
  const body = '899940001234';
  const code = body + calculateCheckDigit(body);
  assertEqual(validateHac13(code).reason, 'INVALID_TYPE');
});

test('validateHac13: sequence 0000000 → INVALID_SEQUENCE', () => {
  const body = '899910000000';
  const code = body + calculateCheckDigit(body);
  assertEqual(validateHac13(code).reason, 'INVALID_SEQUENCE');
});

test('validateHac13: sai check digit → CHECK_DIGIT_MISMATCH', () => {
  // 8999100012346 đúng, đổi check digit thành 5
  assertEqual(validateHac13('8999100012345').reason, 'CHECK_DIGIT_MISMATCH');
});

test('validateHac13: accept format có dấu gạch ngang 8999-1-0001234-6', () => {
  assertEqual(validateHac13('8999-1-0001234-6').valid, true);
});

test('validateHac13: accept format có khoảng trắng', () => {
  assertEqual(validateHac13('8999 1 0001234 6').valid, true);
});

// ─── isHac13 ─────────────────────────────────────────────────────────────────
test('isHac13: shorthand hợp lệ', () => {
  assertEqual(isHac13('8999100012346'), true);
  assertEqual(isHac13('8999100012345'), false);
});

// ─── parseHac13 ──────────────────────────────────────────────────────────────
test('parseHac13: 8999100012346 → type=1, seq=1234, check=6', () => {
  const parsed = parseHac13('8999100012346');
  assert(parsed !== null);
  assertEqual(parsed!.prefix, HAC13_PREFIX);
  assertEqual(parsed!.typeCode, 1);
  assertEqual(parsed!.sequence, 1234);
  assertEqual(parsed!.checkDigit, '6');
});

test('parseHac13: 8999300000129 → type=3, seq=12', () => {
  const parsed = parseHac13('8999300000129');
  assert(parsed !== null);
  assertEqual(parsed!.typeCode, 3);
  assertEqual(parsed!.sequence, 12);
});

test('parseHac13: mã không hợp lệ → null', () => {
  assertEqual(parseHac13('8999100012345'), null);
  assertEqual(parseHac13('abc'), null);
});

// ─── buildHac13 ──────────────────────────────────────────────────────────────
test('buildHac13: (1, 1234) → 8999100012346 (khớp docx)', () => {
  assertEqual(buildHac13(1, 1234), '8999100012346');
});

test('buildHac13: (2, 56) → 8999200000564', () => {
  assertEqual(buildHac13(2, 56), '8999200000564');
});

test('buildHac13: (3, 12) → 8999300000129', () => {
  assertEqual(buildHac13(3, 12), '8999300000129');
});

test('buildHac13: (1, 1) → seq=0000001 với check digit hợp lệ', () => {
  const code = buildHac13(1, 1);
  assertEqual(code.length, 13);
  assertEqual(code.slice(0, 5), '89991');
  assertEqual(code.slice(5, 12), '0000001');
  assertEqual(validateHac13(code).valid, true);
});

test('buildHac13: throw cho sequence ngoài [1..9999999]', () => {
  let t1 = false;
  let t2 = false;
  try {
    buildHac13(1, 0);
  } catch {
    t1 = true;
  }
  try {
    buildHac13(1, 10_000_000);
  } catch {
    t2 = true;
  }
  assert(t1 && t2);
});

test('buildHac13: throw cho typeCode 4', () => {
  let threw = false;
  try {
    buildHac13(4 as 1, 1);
  } catch {
    threw = true;
  }
  assert(threw);
});

test('buildHac13 → validateHac13: roundtrip 100 mã hợp lệ', () => {
  for (const t of [1, 2, 3] as const) {
    for (const seq of [1, 7, 99, 1000, 99_999, 1_000_000, 9_999_999]) {
      const code = buildHac13(t, seq);
      const v = validateHac13(code);
      assert(v.valid, `roundtrip fail: type=${t} seq=${seq} code=${code} reason=${v.reason}`);
    }
  }
});

// ─── formatHac13Display ──────────────────────────────────────────────────────
test('formatHac13Display: 8999100012346 → 8999-1-0001234-6', () => {
  assertEqual(formatHac13Display('8999100012346'), '8999-1-0001234-6');
});

test('formatHac13Display: input đã có dash → re-format chuẩn', () => {
  assertEqual(formatHac13Display('8999-1-0001234-6'), '8999-1-0001234-6');
});

test('formatHac13Display: input không đủ 13 ký tự → trả nguyên', () => {
  assertEqual(formatHac13Display('abc'), 'abc');
});

// ─── Runner ──────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures: { name: string; error: string }[] = [];

for (const c of cases) {
  try {
    c.fn();
    passed++;
    console.log(`  ok  ${c.name}`);
  } catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    failures.push({ name: c.name, error: msg });
    console.log(`  FAIL ${c.name}\n       ${msg}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed, ${cases.length} total`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}\n      ${f.error}`);
  process.exit(1);
}
