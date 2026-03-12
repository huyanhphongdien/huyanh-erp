// ============================================================================
// SCRIPT TẠO AUTH USERS CHO ĐẠI LÝ (ES MODULE VERSION)
// File: create-partner-auth-users.mjs
// ============================================================================
// CÁCH CHẠY:
// node create-partner-auth-users.mjs
// ============================================================================

import { createClient } from '@supabase/supabase-js'

// ============================================================================
// CẤU HÌNH - CẬP NHẬT THÔNG TIN CỦA BẠN
// ============================================================================

const SUPABASE_URL = 'https://dygveetaatqllhjusyzz.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5Z3ZlZXRhYXRxbGxoanVzeXp6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ2MDY4NSwiZXhwIjoyMDg0MDM2Njg1fQ.bw4dPo4e8pLfbdlhHFFGnCVejp15z4BPANjtOQ3h6bc' // ← DÁN KEY VÀO ĐÂY

// ============================================================================
// DANH SÁCH ĐẠI LÝ CẦN TẠO
// ============================================================================

const partners = [
  { email: 'anhdatgroup@gmail.com', password: '123456', name: 'Nguyễn Văn Đạt (ANH ĐẠT GROUP)' },
  { email: 'truonghv@gmail.com', password: '123456', name: 'Hà Văn Trường' },
  { email: 'cuonglth@gmail.com', password: '123456', name: 'Lê Thị Hồng Cương' },
  { email: 'gioinhh@gmail.com', password: '123456', name: 'Nguyễn Hữu Giới' },
  { email: 'vannhh@gmail.com', password: '123456', name: 'Nguyễn Hữu Vân' },
  { email: 'lent@gmail.com', password: '123456', name: 'Nguyễn Thị Lệ' },
  { email: 'tinhnv@gmail.com', password: '123456', name: 'Nguyễn Văn Tính (Mạnh Quân)' },
  { email: 'phongmy@gmail.com', password: '123456', name: 'Trần Phong Mỹ' },
  { email: 'anpm@gmail.com', password: '123456', name: 'Phạm Minh Ân' },
  { email: 'binhts@gmail.com', password: '123456', name: 'Trương Sỹ Bình' },
  { email: 'ngatt@gmail.com', password: '123456', name: 'Trần Thị Nga' },
  { email: 'sentt@gmail.com', password: '123456', name: 'Trần Thị Sen' },
  { email: 'minhdv@gmail.com', password: '123456', name: 'Đặng Văn Minh (Kíp)' },
]

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function createPartnerAuthUsers() {
  console.log('========================================')
  console.log('TẠO AUTH USERS CHO ĐẠI LÝ')
  console.log('========================================\n')

  // Kiểm tra config
  if (SERVICE_ROLE_KEY === 'YOUR_SERVICE_ROLE_KEY_HERE') {
    console.error('❌ LỖI: Bạn chưa cập nhật SERVICE_ROLE_KEY!')
    console.log('\nCách lấy SERVICE_ROLE_KEY:')
    console.log('1. Vào Supabase Dashboard > Settings > API')
    console.log('2. Click "Reveal" bên cạnh service_role')
    console.log('3. Copy key và dán vào biến SERVICE_ROLE_KEY')
    process.exit(1)
  }

  // Tạo Supabase client với service_role
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  let successCount = 0
  let errorCount = 0
  const results = []

  for (const partner of partners) {
    try {
      process.stdout.write(`📧 ${partner.email}... `)

      // Tạo auth user
      const { data, error } = await supabase.auth.admin.createUser({
        email: partner.email,
        password: partner.password,
        email_confirm: true,
        user_metadata: {
          full_name: partner.name,
          user_type: 'partner'
        }
      })

      if (error) {
        if (error.message.includes('already been registered')) {
          // User đã tồn tại, lấy thông tin
          const { data: listData } = await supabase.auth.admin.listUsers()
          const existingUser = listData?.users?.find(u => u.email === partner.email)
          
          if (existingUser) {
            // Update partner_users
            await supabase
              .from('partner_users')
              .update({ auth_user_id: existingUser.id })
              .eq('email', partner.email)
            
            console.log(`⚠️  Đã tồn tại, đã link`)
            results.push({ email: partner.email, userId: existingUser.id, status: 'existed' })
            successCount++
          } else {
            throw new Error('User existed but cannot find')
          }
        } else {
          throw error
        }
      } else if (data?.user) {
        // Update partner_users với auth_user_id
        await supabase
          .from('partner_users')
          .update({ auth_user_id: data.user.id })
          .eq('email', partner.email)

        console.log(`✅ Đã tạo`)
        results.push({ email: partner.email, userId: data.user.id, status: 'created' })
        successCount++
      }

    } catch (err) {
      console.log(`❌ Lỗi: ${err.message}`)
      results.push({ email: partner.email, error: err.message, status: 'error' })
      errorCount++
    }
  }

  // Tổng kết
  console.log('\n========================================')
  console.log('KẾT QUẢ')
  console.log('========================================')
  console.log(`✅ Thành công: ${successCount}/${partners.length}`)
  if (errorCount > 0) console.log(`❌ Lỗi: ${errorCount}/${partners.length}`)

  console.log('\n========================================')
  console.log('DANH SÁCH TÀI KHOẢN ĐẠI LÝ')
  console.log('========================================')
  console.log('| Email                      | Password |')
  console.log('|----------------------------|----------|')
  partners.forEach(p => {
    console.log(`| ${p.email.padEnd(26)} | ${p.password.padEnd(8)} |`)
  })
  
  console.log('\n🔗 Đăng nhập tại: /partner/login')
  console.log('========================================\n')
}

// Chạy
createPartnerAuthUsers().catch(console.error)
