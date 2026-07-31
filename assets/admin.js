const API_URL = window.APP_CONFIG.GAS_API_URL;
const ADMIN_LIFF_ID = window.APP_CONFIG.ADMIN_LIFF_ID;

let sessionToken = localStorage.getItem('adminSessionToken') || null;
let currentRole = localStorage.getItem('adminRole') || '';

async function api(action, payload) {
  const body = Object.assign({ action, sessionToken }, payload || {});
  let resp;
  try {
    resp = await fetch(API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
  } catch (networkErr) {
    throw new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ (' + networkErr.message + ')');
  }
  let data;
  try {
    data = await resp.json();
  } catch (parseErr) {
    throw new Error('เซิร์ฟเวอร์ตอบกลับข้อมูลผิดรูปแบบ (status=' + resp.status + ')');
  }
  if (!data.ok) {
    console.error('Server error detail:', data.detail);
    throw new Error(data.error + (data.detail ? ' (' + data.detail + ')' : ''));
  }
  return data.data;
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(function () { el.classList.add('hidden'); }, 2200);
}

async function init() {
  await liff.init({ liffId: ADMIN_LIFF_ID });
  if (!liff.isLoggedIn()) { liff.login(); return; }

  if (!sessionToken) {
    try {
      const idToken = liff.getIDToken();
      const data = await api('adminLogin', { idToken: idToken });
      sessionToken = data.sessionToken;
      currentRole = data.role;
      localStorage.setItem('adminSessionToken', sessionToken);
      localStorage.setItem('adminRole', currentRole);
      document.getElementById('admin-name').textContent = data.name || 'เจ้าหน้าที่';
      document.getElementById('admin-role').textContent = 'สิทธิ์: ' + currentRole;
    } catch (err) {
      document.getElementById('screen-loading').classList.add('hidden');
      document.getElementById('screen-denied').classList.remove('hidden');
      return;
    }
  }

  document.getElementById('screen-loading').classList.add('hidden');
  document.getElementById('screen-admin').classList.remove('hidden');
  if (currentRole !== 'superadmin') {
    const tab = document.querySelector('[data-tab="admins"]');
    if (tab) tab.classList.add('hidden');
  }
  bindTabs();
  bindSettings();
  bindInvoices();
  bindProperties();
  bindAdmins();
  loadSettings();
  loadRequests();
}

// ---------- tabs ----------
function bindTabs() {
  document.querySelectorAll('.admin-tabs [data-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.admin-tabs [data-tab]').forEach(function (b) { b.className = 'btn btn-sm btn-outline'; });
      btn.className = 'btn btn-sm btn-primary';
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.add('hidden'); });
      document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
      if (btn.dataset.tab === 'invoices') loadInvoiceTable('');
      if (btn.dataset.tab === 'properties') loadPropertyTable('');
      if (btn.dataset.tab === 'requests') loadRequests();
      if (btn.dataset.tab === 'admins') loadAdmins();
    });
  });
}

// ---------- settings ----------
async function loadSettings() {
  const cfg = await api('adminGetConfig', {});
  Object.keys(cfg).forEach(function (key) {
    const el = document.getElementById('cfg-' + key);
    if (el) el.value = cfg[key];
  });
}
function bindSettings() {
  document.getElementById('btn-save-config').addEventListener('click', async function () {
    const keys = ['OrgName', 'BankName', 'BankAccountNo', 'BankAccountName', 'PromptPay', 'ContactPhone', 'OfficeHours', 'AnnounceText'];
    const config = {};
    keys.forEach(function (k) {
      const el = document.getElementById('cfg-' + k);
      if (el) config[k] = el.value;
    });
    try {
      await api('adminUpdateConfig', { config: config });
      showToast('บันทึกการตั้งค่าเรียบร้อย');
    } catch (err) {
      showToast('เกิดข้อผิดพลาด: ' + err.message);
    }
  });
}

// ---------- invoices ----------
function bindInvoices() {
  document.getElementById('btn-add-invoice').addEventListener('click', async function () {
    const invoice = {
      OwnerCitizenId: document.getElementById('inv-citizen').value.trim(),
      TaxType: document.getElementById('inv-type').value,
      Year: document.getElementById('inv-year').value,
      Title: document.getElementById('inv-title').value,
      Amount: document.getElementById('inv-amount').value,
      DueDate: document.getElementById('inv-due').value
    };
    if (!invoice.OwnerCitizenId || !invoice.Amount) { showToast('กรอกเลขบัตรประชาชนและจำนวนเงินให้ครบ'); return; }
    try {
      await api('adminUpsertInvoice', { invoice: invoice });
      showToast('เพิ่มใบแจ้งหนี้แล้ว');
      ['inv-citizen', 'inv-year', 'inv-title', 'inv-amount', 'inv-due'].forEach(function (id) { document.getElementById(id).value = ''; });
      loadInvoiceTable(document.getElementById('inv-search-citizen').value.trim());
    } catch (err) {
      showToast('เกิดข้อผิดพลาด: ' + err.message);
    }
  });
  document.getElementById('inv-search-citizen').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') loadInvoiceTable(e.target.value.trim());
  });
}

async function loadInvoiceTable(citizenId) {
  try {
    const data = await api('adminListInvoices', { citizenId: citizenId || undefined });
    const el = document.getElementById('invoice-table');
    if (data.length === 0) { el.innerHTML = '<div class="empty-state">ไม่พบรายการ</div>'; return; }
    el.innerHTML = '<table class="simple"><tr><th>ผู้เสียภาษี</th><th>ประเภท</th><th>รายการ</th><th>จำนวน</th><th>สถานะ</th><th></th></tr>' +
      data.map(function (inv) {
        return '<tr><td>' + inv.OwnerCitizenId + '</td><td>' + inv.TaxType + '</td><td>' + (inv.Title || '') + '</td>' +
          '<td>' + Number(inv.Amount || 0).toLocaleString('th-TH') + '</td><td>' + inv.Status + '</td>' +
          '<td>' + (inv.Status !== 'Paid' ? '<button class="btn btn-sm btn-primary" onclick="markPaid(\'' + inv.InvoiceId + '\')">รับชำระ</button>' : '-') + '</td></tr>';
      }).join('') + '</table>';
  } catch (err) {
    document.getElementById('invoice-table').innerHTML = '<div class="empty-state">เกิดข้อผิดพลาดในการโหลดข้อมูล</div>';
    showToast('เกิดข้อผิดพลาด: ' + err.message);
  }
}

async function markPaid(invoiceId) {
  try {
    await api('adminMarkPaid', { invoiceId: invoiceId, paymentRef: 'manual-' + Date.now() });
    showToast('บันทึกการชำระแล้ว');
    loadInvoiceTable(document.getElementById('inv-search-citizen').value.trim());
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message);
  }
}
window.markPaid = markPaid;

// ---------- properties ----------
function bindProperties() {
  document.getElementById('btn-add-property').addEventListener('click', async function () {
    const property = {
      OwnerCitizenId: document.getElementById('prop-citizen').value.trim(),
      TaxType: document.getElementById('prop-type').value,
      Title: document.getElementById('prop-title').value,
      Detail: document.getElementById('prop-detail').value,
      Address: document.getElementById('prop-address').value
    };
    if (!property.OwnerCitizenId || !property.Title) { showToast('กรอกเลขบัตรประชาชนและชื่อรายการให้ครบ'); return; }
    try {
      await api('adminUpsertProperty', { property: property });
      showToast('บันทึกทรัพย์สินแล้ว');
      ['prop-citizen', 'prop-title', 'prop-detail', 'prop-address'].forEach(function (id) { document.getElementById(id).value = ''; });
      loadPropertyTable(document.getElementById('prop-search-citizen').value.trim());
    } catch (err) {
      showToast('เกิดข้อผิดพลาด: ' + err.message);
    }
  });
  document.getElementById('prop-search-citizen').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') loadPropertyTable(e.target.value.trim());
  });
}

async function loadPropertyTable(citizenId) {
  try {
    const data = await api('adminListProperties', { citizenId: citizenId || undefined });
    const el = document.getElementById('property-table');
    if (data.length === 0) { el.innerHTML = '<div class="empty-state">ไม่พบรายการ</div>'; return; }
    el.innerHTML = '<table class="simple"><tr><th>ผู้เป็นเจ้าของ</th><th>ประเภท</th><th>ชื่อรายการ</th><th>ที่อยู่</th></tr>' +
      data.map(function (p) {
        return '<tr><td>' + p.OwnerCitizenId + '</td><td>' + p.TaxType + '</td><td>' + p.Title + '</td><td>' + (p.Address || '') + '</td></tr>';
      }).join('') + '</table>';
  } catch (err) {
    document.getElementById('property-table').innerHTML = '<div class="empty-state">เกิดข้อผิดพลาดในการโหลดข้อมูล</div>';
    showToast('เกิดข้อผิดพลาด: ' + err.message);
  }
}

// ---------- requests ----------
async function loadRequests() {
  try {
    const data = await api('adminListRequests', {});
    const el = document.getElementById('request-table');
    if (data.length === 0) { el.innerHTML = '<div class="empty-state">ยังไม่มีเรื่องแจ้งเข้ามา</div>'; return; }
    el.innerHTML = data.map(function (r) {
      return '<div class="card">' +
        '<div style="display:flex; justify-content:space-between;"><strong>' + r.Type + '</strong><span class="muted">' + new Date(r.CreatedAt).toLocaleDateString('th-TH') + '</span></div>' +
        '<p style="font-size:13.5px; margin:8px 0;">' + r.Detail + '</p>' +
        '<div class="muted" style="margin-bottom:8px;">CitizenId: ' + (r.CitizenId || '-') + '</div>' +
        '<select onchange="updateReqStatus(\'' + r.RequestId + '\', this.value)">' +
        ['Pending', 'InProgress', 'Done', 'Rejected'].map(function (s) {
          return '<option value="' + s + '"' + (s === r.Status ? ' selected' : '') + '>' + s + '</option>';
        }).join('') + '</select>' +
        '</div>';
    }).join('');
  } catch (err) {
    document.getElementById('request-table').innerHTML = '<div class="empty-state">เกิดข้อผิดพลาดในการโหลดข้อมูล</div>';
    showToast('เกิดข้อผิดพลาด: ' + err.message);
  }
}
async function updateReqStatus(requestId, status) {
  try {
    await api('adminUpdateRequestStatus', { requestId: requestId, status: status });
    showToast('อัปเดตสถานะแล้ว');
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message);
  }
}
window.updateReqStatus = updateReqStatus;

// ---------- admins ----------
function bindAdmins() {
  document.getElementById('btn-add-admin').addEventListener('click', async function () {
    const lineUserId = document.getElementById('new-admin-uid').value.trim();
    const name = document.getElementById('new-admin-name').value.trim();
    const role = document.getElementById('new-admin-role').value;
    if (!lineUserId) { showToast('กรอก LINE User ID'); return; }
    try {
      await api('adminAddAdmin', { lineUserId: lineUserId, name: name, role: role });
      showToast('เพิ่มเจ้าหน้าที่แล้ว');
      document.getElementById('new-admin-uid').value = '';
      document.getElementById('new-admin-name').value = '';
      loadAdmins();
    } catch (err) {
      showToast('เกิดข้อผิดพลาด: ' + err.message);
    }
  });
}
async function loadAdmins() {
  try {
    const data = await api('adminListAdmins', {});
    const el = document.getElementById('admin-table');
    el.innerHTML = '<table class="simple"><tr><th>ชื่อ</th><th>LINE User ID</th><th>สิทธิ์</th><th></th></tr>' +
      data.map(function (a) {
        return '<tr><td>' + a.Name + '</td><td style="font-size:11px;">' + a.LineUserId + '</td><td>' + a.Role + '</td>' +
          '<td><button class="btn btn-sm btn-outline" onclick="removeAdmin(\'' + a.LineUserId + '\')">ลบ</button></td></tr>';
      }).join('') + '</table>';
  } catch (err) {
    document.getElementById('admin-table').innerHTML = '<div class="empty-state">เกิดข้อผิดพลาดในการโหลดข้อมูล</div>';
    showToast('เกิดข้อผิดพลาด: ' + err.message);
  }
}
async function removeAdmin(lineUserId) {
  if (!confirm('ยืนยันลบสิทธิ์เจ้าหน้าที่คนนี้?')) return;
  try {
    await api('adminRemoveAdmin', { lineUserId: lineUserId });
    showToast('ลบแล้ว');
    loadAdmins();
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message);
  }
}
window.removeAdmin = removeAdmin;

init().catch(function (err) {
  document.getElementById('screen-loading').textContent = 'เกิดข้อผิดพลาด: ' + err.message;
  console.error(err);
});
