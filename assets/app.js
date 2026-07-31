// ============ ค่าคงที่ / state ============
const API_URL = window.APP_CONFIG.GAS_API_URL;
const LIFF_ID = window.APP_CONFIG.LIFF_ID;

let sessionToken = localStorage.getItem('sessionToken') || null;
let profile = JSON.parse(localStorage.getItem('profile') || 'null');
let publicConfig = {};
let invoicesCache = [];

const TAX_TYPE_LABEL = { SignTax: 'ภาษีป้าย', LandTax: 'ภาษีที่ดินและสิ่งปลูกสร้าง', Garbage: 'ค่าธรรมเนียมขยะ' };
const TAX_TYPE_ICON = { SignTax: '🪧', LandTax: '🏡', Garbage: '🗑️' };

// ============ helper: เรียก API ============
async function api(action, payload) {
  const body = Object.assign({ action, sessionToken }, payload || {});
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // เลี่ยง CORS preflight
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(data.error || 'api_error');
  return data.data;
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(function () { el.classList.add('hidden'); }, 2200);
}

function formatBaht(n) {
  return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatDate(d) {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date)) return d;
  return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}
function statusMeta(inv) {
  if (inv.Status === 'Paid') return { cls: 'paid', label: 'ชำระแล้ว' };
  const overdue = inv.DueDate && new Date(inv.DueDate) < new Date();
  return overdue ? { cls: 'overdue', label: 'เกินกำหนด' } : { cls: 'unpaid', label: 'รอชำระ' };
}

// ============ init ============
async function init() {
  publicConfig = await api('getPublicConfig', {}).catch(function () { return {}; });
  document.getElementById('home-org-name').textContent = publicConfig.OrgName || '';

  await liff.init({ liffId: LIFF_ID });
  if (!liff.isLoggedIn()) {
    liff.login();
    return;
  }

  if (!sessionToken) {
    const idToken = liff.getIDToken();
    const data = await api('login', { idToken: idToken });
    sessionToken = data.sessionToken;
    profile = data.profile;
    localStorage.setItem('sessionToken', sessionToken);
    localStorage.setItem('profile', JSON.stringify(profile));
    if (!data.linked) {
      showScreen('link');
      return;
    }
  }

  // ตรวจสอบว่าผูกบัญชีแล้วหรือยัง (กรณี session เก่ายังไม่ผูก)
  try {
    const dash = await api('getDashboard', {});
    if (!dash.linked) { showScreen('link'); return; }
    renderHome(dash);
  } catch (err) {
    // session หมดอายุ/ไม่ถูกต้อง -> login ใหม่
    localStorage.removeItem('sessionToken');
    sessionToken = null;
    location.reload();
    return;
  }

  document.getElementById('bottom-nav').classList.remove('hidden');
  bindNav();
  bindLinkForm();
  bindRequestForm();
}

function showScreen(name) {
  ['loading', 'link', 'home', 'invoices', 'pay', 'requests', 'profile'].forEach(function (s) {
    const el = document.getElementById('screen-' + s);
    if (el) el.classList.toggle('hidden', s !== name);
  });
  document.querySelectorAll('.nav-item').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.screen === name);
  });
}

// ============ ผูกบัญชี ============
function bindLinkForm() {
  document.getElementById('btn-link-submit').addEventListener('click', async function () {
    const citizenId = document.getElementById('input-citizen-id').value.trim();
    const phone = document.getElementById('input-phone').value.trim();
    if (citizenId.length !== 13) { showToast('กรุณากรอกเลขบัตรประชาชนให้ครบ 13 หลัก'); return; }
    await api('linkAccount', { citizenId: citizenId, phone: phone });
    showToast('ผูกบัญชีสำเร็จ');
    const dash = await api('getDashboard', {});
    document.getElementById('bottom-nav').classList.remove('hidden');
    renderHome(dash);
  });
}

// ============ หน้าแรก ============
function renderHome(dash) {
  document.getElementById('home-greeting').textContent = 'สวัสดี ' + (profile.displayName || '');
  const grid = document.getElementById('summary-grid');
  grid.innerHTML = Object.keys(TAX_TYPE_LABEL).map(function (t) {
    const s = dash.summary[t] || { unpaidCount: 0, unpaidAmount: 0 };
    return '<div class="summary-card">' +
      '<div class="icon">' + TAX_TYPE_ICON[t] + '</div>' +
      '<div class="amount">' + formatBaht(s.unpaidAmount) + '</div>' +
      '<div class="label">' + TAX_TYPE_LABEL[t] + '</div>' +
      '</div>';
  }).join('');

  const nearDue = document.getElementById('near-due-list');
  if (!dash.nearDue || dash.nearDue.length === 0) {
    nearDue.innerHTML = '<div class="empty-state"><div class="emoji">✅</div>ไม่มีรายการค้างชำระ</div>';
  } else {
    nearDue.innerHTML = dash.nearDue.map(renderInvoiceCard).join('');
  }

  if (publicConfig.AnnounceText) {
    const box = document.getElementById('announce-box');
    box.classList.remove('hidden');
    box.textContent = '📢 ' + publicConfig.AnnounceText;
  }
  showScreen('home');
}

function renderInvoiceCard(inv) {
  const meta = statusMeta(inv);
  return '<div class="stub-card ' + meta.cls + '">' +
    '<div class="stub-tab"></div>' +
    '<div class="stub-body"><div class="stub-perf"></div>' +
    '<div class="row1">' +
    '<div><div class="tax-type">' + (TAX_TYPE_LABEL[inv.TaxType] || inv.TaxType) + ' • ' + (inv.Year || '') + '</div>' +
    '<div class="title">' + (inv.Title || inv.InvoiceId) + '</div></div>' +
    '<div class="amount">฿' + formatBaht(inv.Amount) + '</div>' +
    '</div>' +
    '<div class="row2"><span class="badge ' + meta.cls + '">' + meta.label + '</span>' +
    '<span class="due">ครบกำหนด ' + formatDate(inv.DueDate) + '</span></div>' +
    '</div></div>';
}

// ============ รายการภาษี ============
async function loadInvoices(taxType) {
  const list = document.getElementById('invoice-list');
  list.innerHTML = '<div class="loading">กำลังโหลด...</div>';
  const data = await api('getInvoices', { taxType: taxType || '' });
  invoicesCache = data;
  if (data.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="emoji">🧾</div>ไม่พบรายการ</div>';
    return;
  }
  list.innerHTML = data.map(renderInvoiceCard).join('');
}

function bindInvoiceFilters() {
  document.querySelectorAll('#screen-invoices [data-filter]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#screen-invoices [data-filter]').forEach(function (b) {
        b.className = 'btn btn-sm btn-outline';
      });
      btn.className = 'btn btn-sm btn-primary';
      loadInvoices(btn.dataset.filter);
    });
  });
}

// ============ ชำระเงิน ============
function renderPayInfo() {
  document.getElementById('pay-info-card').innerHTML =
    '<div class="muted" style="margin-bottom:6px;">โอนเข้าบัญชี</div>' +
    '<div style="font-family:var(--font-display); font-weight:600; font-size:15px;">' + (publicConfig.BankName || '-') + '</div>' +
    '<div style="font-size:18px; letter-spacing:0.5px; margin:4px 0;">' + (publicConfig.BankAccountNo || '-') + '</div>' +
    '<div class="muted">ชื่อบัญชี: ' + (publicConfig.BankAccountName || '-') + '</div>' +
    (publicConfig.PromptPay ? '<div class="muted" style="margin-top:6px;">พร้อมเพย์: ' + publicConfig.PromptPay + '</div>' : '') +
    '<div class="muted" style="margin-top:10px;">หลังชำระแล้ว กรุณาเก็บหลักฐานการโอนไว้ หรือแจ้งเจ้าหน้าที่ผ่านเมนู "แจ้งเรื่อง" เพื่อยืนยันการชำระ</div>';
}

async function loadPayInvoices() {
  const list = document.getElementById('pay-invoice-list');
  list.innerHTML = '<div class="loading">กำลังโหลด...</div>';
  const data = await api('getInvoices', {});
  const unpaid = data.filter(function (inv) { return inv.Status !== 'Paid'; });
  if (unpaid.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="emoji">✅</div>ไม่มีรายการค้างชำระ</div>';
    return;
  }
  list.innerHTML = unpaid.map(renderInvoiceCard).join('');
}

// ============ แจ้ง/ยื่นเรื่อง ============
function bindRequestForm() {
  document.getElementById('btn-req-submit').addEventListener('click', async function () {
    const type = document.getElementById('req-type').value;
    const detail = document.getElementById('req-detail').value.trim();
    if (!detail) { showToast('กรุณากรอกรายละเอียด'); return; }
    await api('createRequest', { type: type, detail: detail });
    document.getElementById('req-detail').value = '';
    showToast('ส่งเรื่องเรียบร้อย');
    loadRequests();
  });
}

async function loadRequests() {
  const list = document.getElementById('request-list');
  list.innerHTML = '<div class="loading">กำลังโหลด...</div>';
  const data = await api('getRequests', {});
  if (data.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="emoji">📭</div>ยังไม่มีเรื่องที่แจ้ง</div>';
    return;
  }
  const typeLabel = { sign_tax_filing: 'ยื่นแบบภาษีป้าย', property_change: 'แจ้งเปลี่ยนแปลงข้อมูล', garbage_issue: 'ปัญหาขยะ', other: 'อื่นๆ' };
  const statusLabel = { Pending: 'รอดำเนินการ', InProgress: 'กำลังดำเนินการ', Done: 'เสร็จสิ้น', Rejected: 'ปฏิเสธ' };
  list.innerHTML = '<div class="card status-list">' + data.map(function (r) {
    return '<div class="status-row"><span>' + (typeLabel[r.Type] || r.Type) + '<br><span class="muted">' + formatDate(r.CreatedAt) + '</span></span>' +
      '<span class="badge ' + (r.Status === 'Done' ? 'paid' : r.Status === 'Rejected' ? 'overdue' : 'unpaid') + '">' + (statusLabel[r.Status] || r.Status) + '</span></div>';
  }).join('') + '</div>';
}

// ============ โปรไฟล์ ============
async function loadProfile() {
  const data = await api('getProfile', {});
  document.getElementById('profile-pic').src = data.PictureUrl || '';
  document.getElementById('profile-name').textContent = data.DisplayName || '';
  document.getElementById('profile-citizen-id').textContent = 'เลขบัตรประชาชน: ' + (data.CitizenId || '-');
  document.getElementById('contact-box').innerHTML =
    '☎️ โทร: ' + (publicConfig.ContactPhone || '-') + '<br>' +
    '🕒 เวลาทำการ: ' + (publicConfig.OfficeHours || '-');
}

// ============ nav ============
function bindNav() {
  bindInvoiceFilters();
  document.querySelectorAll('.nav-item').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      const screen = btn.dataset.screen;
      showScreen(screen);
      if (screen === 'invoices') loadInvoices('');
      if (screen === 'pay') { renderPayInfo(); loadPayInvoices(); }
      if (screen === 'requests') loadRequests();
      if (screen === 'profile') loadProfile();
    });
  });
}

init().catch(function (err) {
  document.getElementById('screen-loading').textContent = 'เกิดข้อผิดพลาด: ' + err.message;
  console.error(err);
});
