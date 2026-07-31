// ตั้งค่าเหล่านี้หลังจากสร้าง LINE Login Channel + LIFF App และ Deploy GAS แล้ว
// ดูขั้นตอนทั้งหมดใน README.md

window.APP_CONFIG = {
  // LIFF ID ของแอปฝั่งประชาชน (สร้างใน LINE Developers Console > LIFF)
  LIFF_ID: '2007981677-By5J5OAk',

  // LIFF ID ของแอปฝั่งเจ้าหน้าที่ (แนะนำให้สร้างแยกต่างหาก endpoint ชี้ไป admin.html)
  ADMIN_LIFF_ID: '2007981677-R4UeGoKy',

  // URL ของ Google Apps Script Web App หลัง Deploy
  // รูปแบบ: https://script.google.com/macros/s/XXXXXXXX/exec
  GAS_API_URL: 'https://script.google.com/macros/s/AKfycbzvyiJctTME2VqfSaue_4LLm2MPo_77Dz6xyfeGheklika0uFNxAsQvmd_VP0eK_Cxg/exec'
};
