// ============================================================
// HUY ANH ERP - SEED AUTH USERS
// Tạo tài khoản đăng nhập cho 16 nhân viên test
// ============================================================
// Chạy: npx ts-node scripts/seed_auth_users.ts
// Hoặc: npx tsx scripts/seed_auth_users.ts
// ============================================================

import { createClient } from '@supabase/supabase-js';

// ============================================================
// CẤU HÌNH SUPABASE - THAY BẰNG CREDENTIALS CỦA BẠN
// ============================================================
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://dygveetaatqllhjusyzz.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_vP1cQXw4fRNuLlmynw-6rQ_wrhYC95R';
// ⚠️ QUAN TRỌNG: Dùng SERVICE_ROLE_KEY, không phải ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// ============================================================
// MẬT KHẨU CHUNG CHO TẤT CẢ TÀI KHOẢN TEST
// ============================================================
const DEFAULT_PASSWORD = 'Test@123';

// ============================================================
// DANH SÁCH 16 TÀI KHOẢN TEST (2 người/phòng × 8 phòng)
// ============================================================
interface TestUser {
  email: string;
  full_name: string;
  employee_id: string;
  employee_code: string;
  department: string;
  position: string;
  role: 'admin' | 'manager' | 'employee';
}

const TEST_USERS: TestUser[] = [
  // ========== 1. BAN GIÁM ĐỐC ==========
  {
    email: 'giamdoc@test.huyanh.vn',
    full_name: 'Trần Huy Anh',
    employee_id: 'e0000000-0000-0000-0001-000000000001',
    employee_code: 'HA-BGD-001',
    department: 'Ban Giám đốc',
    position: 'Giám đốc',
    role: 'admin',
  },
  {
    email: 'phogd@test.huyanh.vn',
    full_name: 'Nguyễn Văn Phó',
    employee_id: 'e0000000-0000-0000-0001-000000000002',
    employee_code: 'HA-BGD-002',
    department: 'Ban Giám đốc',
    position: 'Phó Giám đốc',
    role: 'manager',
  },

  // ========== 2. PHÒNG CƠ ĐIỆN ==========
  {
    email: 'tp.codien@test.huyanh.vn',
    full_name: 'Lê Văn Điện',
    employee_id: 'e0000000-0000-0000-0002-000000000001',
    employee_code: 'HA-CD-001',
    department: 'Phòng Cơ Điện',
    position: 'Trưởng phòng',
    role: 'manager',
  },
  {
    email: 'nv.codien@test.huyanh.vn',
    full_name: 'Trần Thị Cơ',
    employee_id: 'e0000000-0000-0000-0002-000000000002',
    employee_code: 'HA-CD-002',
    department: 'Phòng Cơ Điện',
    position: 'Nhân viên',
    role: 'employee',
  },

  // ========== 3. PHÒNG HÀNH CHÍNH - TỔNG HỢP ==========
  {
    email: 'tp.hcth@test.huyanh.vn',
    full_name: 'Phạm Thị Hành',
    employee_id: 'e0000000-0000-0000-0003-000000000001',
    employee_code: 'HA-HCTH-001',
    department: 'Phòng HC-TH',
    position: 'Trưởng phòng',
    role: 'manager',
  },
  {
    email: 'nv.hcth@test.huyanh.vn',
    full_name: 'Võ Văn Tổng',
    employee_id: 'e0000000-0000-0000-0003-000000000002',
    employee_code: 'HA-HCTH-002',
    department: 'Phòng HC-TH',
    position: 'Nhân viên',
    role: 'employee',
  },

  // ========== 4. PHÒNG KẾ TOÁN ==========
  {
    email: 'tp.ketoan@test.huyanh.vn',
    full_name: 'Nguyễn Thị Toán',
    employee_id: 'e0000000-0000-0000-0004-000000000001',
    employee_code: 'HA-KT-001',
    department: 'Phòng Kế toán',
    position: 'Trưởng phòng',
    role: 'manager',
  },
  {
    email: 'nv.ketoan@test.huyanh.vn',
    full_name: 'Đặng Văn Kế',
    employee_id: 'e0000000-0000-0000-0004-000000000002',
    employee_code: 'HA-KT-002',
    department: 'Phòng Kế toán',
    position: 'Nhân viên',
    role: 'employee',
  },

  // ========== 5. PHÒNG KINH DOANH ==========
  {
    email: 'tp.kinhdoanh@test.huyanh.vn',
    full_name: 'Hoàng Văn Doanh',
    employee_id: 'e0000000-0000-0000-0005-000000000001',
    employee_code: 'HA-KD-001',
    department: 'Phòng Kinh doanh',
    position: 'Trưởng phòng',
    role: 'manager',
  },
  {
    email: 'nv.kinhdoanh@test.huyanh.vn',
    full_name: 'Lý Thị Kinh',
    employee_id: 'e0000000-0000-0000-0005-000000000002',
    employee_code: 'HA-KD-002',
    department: 'Phòng Kinh doanh',
    position: 'Nhân viên',
    role: 'employee',
  },

  // ========== 6. PHÒNG KỸ THUẬT ==========
  {
    email: 'tp.kythuat@test.huyanh.vn',
    full_name: 'Bùi Văn Thuật',
    employee_id: 'e0000000-0000-0000-0006-000000000001',
    employee_code: 'HA-KTH-001',
    department: 'Phòng Kỹ thuật',
    position: 'Trưởng phòng',
    role: 'manager',
  },
  {
    email: 'nv.kythuat@test.huyanh.vn',
    full_name: 'Trương Thị Kỹ',
    employee_id: 'e0000000-0000-0000-0006-000000000002',
    employee_code: 'HA-KTH-002',
    department: 'Phòng Kỹ thuật',
    position: 'Nhân viên',
    role: 'employee',
  },

  // ========== 7. PHÒNG SẢN XUẤT ==========
  {
    email: 'tp.sanxuat@test.huyanh.vn',
    full_name: 'Đỗ Văn Xuất',
    employee_id: 'e0000000-0000-0000-0007-000000000001',
    employee_code: 'HA-SX-001',
    department: 'Phòng Sản xuất',
    position: 'Trưởng phòng',
    role: 'manager',
  },
  {
    email: 'nv.sanxuat@test.huyanh.vn',
    full_name: 'Ngô Thị Sản',
    employee_id: 'e0000000-0000-0000-0007-000000000002',
    employee_code: 'HA-SX-002',
    department: 'Phòng Sản xuất',
    position: 'Nhân viên',
    role: 'employee',
  },

  // ========== 8. PHÒNG QC ==========
  {
    email: 'tp.qc@test.huyanh.vn',
    full_name: 'Vũ Văn Chất',
    employee_id: 'e0000000-0000-0000-0008-000000000001',
    employee_code: 'HA-QC-001',
    department: 'Phòng QC',
    position: 'Trưởng phòng',
    role: 'manager',
  },
  {
    email: 'nv.qc@test.huyanh.vn',
    full_name: 'Mai Thị Lượng',
    employee_id: 'e0000000-0000-0000-0008-000000000002',
    employee_code: 'HA-QC-002',
    department: 'Phòng QC',
    position: 'Nhân viên',
    role: 'employee',
  },
];

// ============================================================
// MAIN: TẠO AUTH USERS VÀ LIÊN KẾT VỚI EMPLOYEES
// ============================================================
async function seedAuthUsers() {
  console.log('='.repeat(60));
  console.log('🚀 HUY ANH ERP - TẠO TÀI KHOẢN TEST');
  console.log('='.repeat(60));
  console.log(`📊 Tổng số tài khoản: ${TEST_USERS.length}`);
  console.log(`🔐 Mật khẩu chung: ${DEFAULT_PASSWORD}`);
  console.log('='.repeat(60));

  const results = {
    success: [] as string[],
    failed: [] as string[],
  };

  for (const user of TEST_USERS) {
    console.log(`\n📝 Đang tạo: ${user.email}`);
    console.log(`   👤 ${user.full_name} | ${user.position} | ${user.department}`);

    try {
      // 1. Tạo Auth user
      const { data: authData, error: authError } =
        await supabase.auth.admin.createUser({
          email: user.email,
          password: DEFAULT_PASSWORD,
          email_confirm: true, // Auto confirm email
          user_metadata: {
            full_name: user.full_name,
            role: user.role,
            employee_id: user.employee_id,
            employee_code: user.employee_code,
          },
        });

      if (authError) {
        // Nếu user đã tồn tại, lấy user hiện có
        if (authError.message.includes('already been registered')) {
          console.log(`   ⚠️  User đã tồn tại, đang cập nhật liên kết...`);

          // Lấy user hiện có
          const { data: existingUsers } =
            await supabase.auth.admin.listUsers();
          const existingUser = existingUsers?.users.find(
            (u) => u.email === user.email
          );

          if (existingUser) {
            // Cập nhật employee với user_id
            const { error: empError } = await supabase
              .from('employees')
              .update({ user_id: existingUser.id })
              .eq('id', user.employee_id);

            if (empError) {
              console.log(
                `   ⚠️  Không thể liên kết employee: ${empError.message}`
              );
            } else {
              console.log(`   ✅ Đã liên kết employee với user hiện có`);
              results.success.push(user.email);
            }
          }
          continue;
        }
        throw authError;
      }

      if (authData?.user) {
        console.log(`   📧 Auth User ID: ${authData.user.id}`);

        // 2. Cập nhật employee với user_id
        const { error: empError } = await supabase
          .from('employees')
          .update({ user_id: authData.user.id })
          .eq('id', user.employee_id);

        if (empError) {
          console.log(
            `   ⚠️  Không thể liên kết employee: ${empError.message}`
          );
        }
      }

      console.log(`   ✅ Thành công!`);
      results.success.push(user.email);
    } catch (error: any) {
      console.log(`   ❌ Lỗi: ${error.message}`);
      results.failed.push(`${user.email}: ${error.message}`);
    }
  }

  // ============================================================
  // KẾT QUẢ
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 KẾT QUẢ');
  console.log('='.repeat(60));
  console.log(`✅ Thành công: ${results.success.length}/${TEST_USERS.length}`);
  console.log(`❌ Thất bại: ${results.failed.length}/${TEST_USERS.length}`);

  if (results.failed.length > 0) {
    console.log('\n❌ Danh sách lỗi:');
    results.failed.forEach((f) => console.log(`   - ${f}`));
  }

  console.log('\n' + '='.repeat(60));
  console.log('📋 DANH SÁCH TÀI KHOẢN TEST');
  console.log('='.repeat(60));
  console.log(`\n🔐 Mật khẩu chung: ${DEFAULT_PASSWORD}\n`);

  // Bảng tài khoản
  console.log(
    '| Email                          | Vai trò    | Phòng ban        |'
  );
  console.log(
    '|--------------------------------|------------|------------------|'
  );
  TEST_USERS.forEach((u) => {
    const role =
      u.role === 'admin' ? 'Admin' : u.role === 'manager' ? 'Quản lý' : 'NV';
    console.log(
      `| ${u.email.padEnd(30)} | ${role.padEnd(10)} | ${u.department.substring(0, 16).padEnd(16)} |`
    );
  });

  console.log('\n✨ Hoàn tất!\n');
}

// Chạy
seedAuthUsers().catch(console.error);