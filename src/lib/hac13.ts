/**
 * HAC-13 — Mã định danh 13 chữ số cho Cao Su Huy Anh.
 *
 * Format: 8999 + T + NNNNNNN + C
 *   - 8999    : prefix cố định (4 ký tự)
 *   - T       : type code 1 ký tự (1=BP-VN, 2=BP-Foreign, 3=Employee)
 *   - NNNNNNN : sequence 7 chữ số (0000001..9999999)
 *   - C       : check digit GS1 Modulo 10
 *
 * Quy chiếu: docs/du lieu tho/QuyDinh_MaDinhDanh_v10_CaoSuHuyAnh (3).docx
 */

export const HAC13_PREFIX = '8999';
export const HAC13_LENGTH = 13;

export type Hac13TypeCode = 1 | 2 | 3;

export interface ParsedHac13 {
  prefix: string;
  typeCode: Hac13TypeCode;
  sequence: number;
  checkDigit: string;
}

export type Hac13ValidationFailure =
  | 'EMPTY'
  | 'WRONG_LENGTH'
  | 'NON_NUMERIC'
  | 'WRONG_PREFIX'
  | 'INVALID_TYPE'
  | 'INVALID_SEQUENCE'
  | 'CHECK_DIGIT_MISMATCH';

export interface Hac13ValidationResult {
  valid: boolean;
  reason?: Hac13ValidationFailure;
  message?: string;
}

/**
 * Tính check digit theo GS1 Modulo 10 cho 12 chữ số đầu.
 * Vị trí lẻ tính từ phải (1, 3, 5, ...) ×3, vị trí chẵn ×1.
 */
export function calculateCheckDigit(twelveDigits: string): string {
  if (!/^\d{12}$/.test(twelveDigits)) {
    throw new Error('calculateCheckDigit: input phải là chuỗi 12 chữ số');
  }
  let sum = 0;
  for (let i = 1; i <= 12; i++) {
    const digit = twelveDigits.charCodeAt(12 - i) - 48; // '0' = 48
    sum += i % 2 === 1 ? digit * 3 : digit;
  }
  return String((10 - (sum % 10)) % 10);
}

/**
 * Strip dấu gạch ngang và khoảng trắng (cho phép paste mã ở dạng "8999-1-0001234-6").
 */
export function normalizeHac13(input: string): string {
  return input.replace(/[\s-]/g, '');
}

/**
 * Validate mã HAC-13. Trả về {valid, reason, message}.
 * Không throw — caller dùng kết quả để hiển thị lỗi UI.
 */
export function validateHac13(rawCode: string): Hac13ValidationResult {
  if (!rawCode) {
    return { valid: false, reason: 'EMPTY', message: 'Mã rỗng' };
  }
  const code = normalizeHac13(rawCode);

  if (code.length !== HAC13_LENGTH) {
    return {
      valid: false,
      reason: 'WRONG_LENGTH',
      message: `Mã phải có ${HAC13_LENGTH} chữ số (hiện: ${code.length})`,
    };
  }
  if (!/^\d{13}$/.test(code)) {
    return { valid: false, reason: 'NON_NUMERIC', message: 'Mã chỉ chứa chữ số 0-9' };
  }
  if (code.slice(0, 4) !== HAC13_PREFIX) {
    return {
      valid: false,
      reason: 'WRONG_PREFIX',
      message: `Prefix phải là ${HAC13_PREFIX} (hiện: ${code.slice(0, 4)})`,
    };
  }

  const typeChar = code[4];
  if (typeChar !== '1' && typeChar !== '2' && typeChar !== '3') {
    return {
      valid: false,
      reason: 'INVALID_TYPE',
      message: `Type code phải là 1, 2 hoặc 3 (hiện: ${typeChar})`,
    };
  }

  const sequence = code.slice(5, 12);
  if (sequence === '0000000') {
    return {
      valid: false,
      reason: 'INVALID_SEQUENCE',
      message: 'Sequence không được toàn số 0',
    };
  }

  const expectedCheck = calculateCheckDigit(code.slice(0, 12));
  if (expectedCheck !== code[12]) {
    return {
      valid: false,
      reason: 'CHECK_DIGIT_MISMATCH',
      message: `Check digit không khớp (đúng: ${expectedCheck}, gõ: ${code[12]})`,
    };
  }

  return { valid: true };
}

export function isHac13(code: string): boolean {
  return validateHac13(code).valid;
}

/**
 * Parse mã HAC-13 hợp lệ thành các segment. Trả về null nếu mã không hợp lệ.
 */
export function parseHac13(rawCode: string): ParsedHac13 | null {
  const code = normalizeHac13(rawCode);
  if (!isHac13(code)) return null;
  return {
    prefix: code.slice(0, 4),
    typeCode: Number(code[4]) as Hac13TypeCode,
    sequence: Number(code.slice(5, 12)),
    checkDigit: code[12],
  };
}

/**
 * Build mã HAC-13 từ type code + sequence. Tự tính check digit.
 * Throw nếu input không hợp lệ.
 */
export function buildHac13(typeCode: Hac13TypeCode, sequence: number): string {
  if (typeCode !== 1 && typeCode !== 2 && typeCode !== 3) {
    throw new Error(`buildHac13: typeCode phải là 1, 2 hoặc 3 (nhận: ${typeCode})`);
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9_999_999) {
    throw new Error(`buildHac13: sequence phải trong [1..9999999] (nhận: ${sequence})`);
  }
  const body = `${HAC13_PREFIX}${typeCode}${sequence.toString().padStart(7, '0')}`;
  return body + calculateCheckDigit(body);
}

/**
 * Hiển thị mã ở dạng có gạch ngang cho người đọc: "8999-1-0001234-6".
 */
export function formatHac13Display(rawCode: string): string {
  const code = normalizeHac13(rawCode);
  if (code.length !== HAC13_LENGTH) return rawCode;
  return `${code.slice(0, 4)}-${code[4]}-${code.slice(5, 12)}-${code[12]}`;
}

export const HAC13_TYPE_LABELS: Record<Hac13TypeCode, string> = {
  1: 'Đối tác trong nước',
  2: 'Đối tác nước ngoài',
  3: 'Nhân viên',
};
