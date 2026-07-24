// coach-i18n-dict.js — English -> Thai dictionary for the coach dashboard.
//
// The engine (coach-i18n.js) looks up each visible English phrase here and
// swaps in the Thai. Keys must match the on-screen English EXACTLY (internal
// runs of whitespace are collapsed to one space before lookup, so you don't
// need to reproduce indentation/newlines — just the words).
//
// Anything not listed here stays in English, so this file is safe to grow
// screen by screen. Thai UI terms are kept consistent with the client app's
// existing translations in src/i18n/th.js.
window.COACH_I18N = window.COACH_I18N || {};
window.COACH_I18N.th = Object.assign(window.COACH_I18N.th || {}, {
  // ── Sidebar nav + tooltips (shared chrome, every page) ──────────────────
  'Dashboard': 'แดชบอร์ด',
  'Clients': 'ลูกค้า',
  'Messages': 'ข้อความ',
  'Recipes': 'สูตรอาหาร',
  'Meal Plans': 'แผนมื้ออาหาร',
  'Workouts': 'ออกกำลังกาย',
  'Challenges': 'ชาเลนจ์',
  'Ranks': 'อันดับ',
  'Trainers': 'เทรนเนอร์',
  'My Profile': 'โปรไฟล์ของฉัน',
  'Profile': 'โปรไฟล์',
  'Branding': 'แบรนด์',
  'Billing': 'การชำระเงิน',
  'Reminders': 'การแจ้งเตือน',
  'Supplements': 'อาหารเสริม',
  'Command Center': 'ศูนย์ควบคุม',
  'Log Out': 'ออกจากระบบ',
  'Log out': 'ออกจากระบบ',
  'Log out and use a different account': 'ออกจากระบบและใช้บัญชีอื่น',

  // Sidebar section headers
  'Menu': 'เมนู',
  'Settings': 'การตั้งค่า',

  // ── Common actions / status (used all over) ─────────────────────────────
  'Loading...': 'กำลังโหลด...',
  'Loading…': 'กำลังโหลด…',
  'Save': 'บันทึก',
  'Save Changes': 'บันทึกการเปลี่ยนแปลง',
  'Save changes': 'บันทึกการเปลี่ยนแปลง',
  'Saving...': 'กำลังบันทึก...',
  'Saving…': 'กำลังบันทึก…',
  'Saved': 'บันทึกแล้ว',
  'Saved!': 'บันทึกแล้ว!',
  'Cancel': 'ยกเลิก',
  'Delete': 'ลบ',
  'Edit': 'แก้ไข',
  'Remove': 'นำออก',
  'Add': 'เพิ่ม',
  'Close': 'ปิด',
  'Back': 'กลับ',
  'Next': 'ถัดไป',
  'Previous': 'ก่อนหน้า',
  'Done': 'เสร็จสิ้น',
  'Confirm': 'ยืนยัน',
  'Continue': 'ดำเนินการต่อ',
  'Search': 'ค้นหา',
  'Search...': 'ค้นหา...',
  'Yes': 'ใช่',
  'No': 'ไม่',
  'OK': 'ตกลง',
  'Submit': 'ส่ง',
  'Send': 'ส่ง',
  'Update': 'อัปเดต',
  'View': 'ดู',
  'View All': 'ดูทั้งหมด',
  'Copy': 'คัดลอก',
  'Copied!': 'คัดลอกแล้ว!',
  'Download': 'ดาวน์โหลด',
  'Upload': 'อัปโหลด',
  'Retry': 'ลองใหม่',
  'Try Again': 'ลองอีกครั้ง',
  'Try again': 'ลองอีกครั้ง',
  'Refresh': 'รีเฟรช',
  'Select': 'เลือก',
  'All': 'ทั้งหมด',
  'None': 'ไม่มี',
  'Active': 'ใช้งานอยู่',
  'Inactive': 'ไม่ได้ใช้งาน',

  // ── Subscription gate ───────────────────────────────────────────────────
  'Subscription Required': 'ต้องสมัครสมาชิก',
  'Your subscription has expired or is inactive. Please subscribe to continue using the dashboard.':
    'การสมัครสมาชิกของคุณหมดอายุหรือไม่ได้ใช้งาน กรุณาสมัครสมาชิกเพื่อใช้งานแดชบอร์ดต่อ',
  'View Plans & Subscribe': 'ดูแพ็กเกจและสมัครสมาชิก',
  '✓ AI-powered meal generation': '✓ สร้างมื้ออาหารด้วย AI',
  '✓ Client portal access': '✓ เข้าถึงพอร์ทัลลูกค้า',
  '✓ Recipe library & customization': '✓ คลังสูตรอาหารและการปรับแต่ง',
  '✓ Unlimited client meal plans': '✓ แผนมื้ออาหารลูกค้าไม่จำกัด'
});
