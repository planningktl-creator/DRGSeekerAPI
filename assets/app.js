/* ============================================================
   KTL CMI DRG Seeker — App Logic v3.1 (Vite SPA)
   GitHub Pages เรียก API CMI@MoPH ตรง ส่วน Docker ใช้ same-origin /api proxy
   ไม่ส่งข้อมูลผู้ป่วยผ่าน public CORS proxy
   ============================================================ */
'use strict';

/* ================= CONFIG ================= */
const DEFAULT_API = 'https://had-api.moph.go.th/cmi';
const API = String((import.meta.env && import.meta.env.VITE_API_BASE) || DEFAULT_API).replace(/\/+$/, '');
const SDX_LIMIT = 10;
const PROC_LIMIT = 20;
const MAX_SCENARIOS = 2000;

let SEX = 1;
let SDX = [];
let PROC = [];
let BUSY = false;
let ACTIVE_CONTROLLER = null;
let PENDING_DC_STATUS = null;

/* ================= ICONS ================= */
const S = ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const IC = {
  search:   '<svg class="ic"' + S + '><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  repeat:   '<svg class="ic"' + S + '><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>',
  check:    '<svg class="ic"' + S + '><path d="M20 6 9 17l-5-5"/></svg>',
  checkC:   '<svg class="ic"' + S + '><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
  warn:     '<svg class="ic"' + S + '><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  err:      '<svg class="ic"' + S + '><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>',
  money:    '<svg class="ic"' + S + '><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>',
  copy:     '<svg class="ic-sm"' + S + '><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  x:        '<svg class="ic-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  square:   '<svg class="ic-sm"' + S + '><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  xlSearch: '<svg class="ic-xl" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>'
};

/* ================= HELPERS ================= */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = s => String(s == null ? '' : s).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const parseCodes = raw => String(raw == null ? '' : raw).trim().toUpperCase().split(/[\s,;]+/).map(clean).filter(Boolean);

function toast(msg, ms, type) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (type === 'ok' ? ' ok' : type === 'warn' ? ' warn' : '');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), ms || 4500);
}
function setCaseStatus(state, title, detail) {
  const el = $('caseStatus');
  if (!el) return;
  el.dataset.state = state || 'ready';
  el.innerHTML = '<span class="status-dot" aria-hidden="true"></span><span><b>' + esc(title) + '</b>' + (detail ? ' · ' + esc(detail) : '') + '</span>';
}
function setPdxError(show) {
  const field = $('pdx') && $('pdx').closest('.field');
  if (!field) return;
  field.classList.toggle('has-error', !!show);
  $('pdx').setAttribute('aria-invalid', show ? 'true' : 'false');
}

/* ================= NETWORK LAYER ================= */
class ApiError extends Error {
  constructor(message, status, path) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
  }
}

async function fetchT(url, opts, ms, signal) {
  const ctl = new AbortController();
  const forwardAbort = () => ctl.abort();
  if (signal) {
    if (signal.aborted) throw new DOMException('ยกเลิกคำขอ', 'AbortError');
    signal.addEventListener('abort', forwardAbort, { once: true });
  }
  const t = setTimeout(() => ctl.abort(), ms || 30000);
  try {
    return await fetch(url, Object.assign({}, opts, { signal: ctl.signal }));
  } catch (e) {
    if (ctl.signal.aborted) {
      if (signal && signal.aborted) throw new DOMException('ยกเลิกคำขอ', 'AbortError');
      const timeout = new Error('Request timeout');
      timeout.name = 'TimeoutError';
      throw timeout;
    }
    throw e;
  } finally {
    clearTimeout(t);
    if (signal) signal.removeEventListener('abort', forwardAbort);
  }
}

async function apiRequest(path, { method = 'GET', body = null, signal = null } = {}) {
  const cleanPath = String(path || '').replace(/^\/+/, '');
  const url = API + '/' + cleanPath;
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }

  const r = await fetchT(url, opts, method === 'POST' ? 30000 : 15000, signal);
  if (!r.ok) throw new ApiError('HTTP ' + r.status, r.status, cleanPath);
  try {
    return await r.json();
  } catch (e) {
    throw new ApiError('API ส่งข้อมูล JSON ไม่ถูกต้อง', r.status, cleanPath);
  }
}
/* wrapper สะดวก */
function apiGet(path, options = {}) { return apiRequest(path, Object.assign({ method: 'GET' }, options)); }
function apiPost(path, body, options = {}) { return apiRequest(path, Object.assign({ method: 'POST', body }, options)); }

function beginOperation() {
  if (ACTIVE_CONTROLLER) ACTIVE_CONTROLLER.abort();
  ACTIVE_CONTROLLER = new AbortController();
  return ACTIVE_CONTROLLER;
}
function endOperation(controller) {
  if (ACTIVE_CONTROLLER === controller) ACTIVE_CONTROLLER = null;
}
function isAbortError(e) { return !!e && (e.name === 'AbortError' || /abort|ยกเลิก/i.test(String(e.message || e))); }

/* เลื่อนไปยัง element แบบปลอดภัย */
function scrollToEl(el) {
  if (!el) return;
  const offset = window.innerWidth <= 640 ? 96 : 16;
  const y = el.getBoundingClientRect().top + window.pageYOffset - offset;
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
}
function emptyState() {
  return `<div class="empty">
    <div class="empty-ic" aria-hidden="true">${IC.xlSearch}</div>
    <h2>ยังไม่ได้คำนวณ</h2>
    <p>กรอกข้อมูลผู้ป่วยและรหัสวินิจฉัย แล้วกด <b>คำนวณ DRG</b></p>
    <div class="empty-steps">
      <div class="step"><span class="n">1</span>กรอก PDx — รหัสวินิจฉัยหลัก</div>
      <div class="step"><span class="n">2</span>เพิ่ม SDx / หัตถการ (ถ้ามี)</div>
      <div class="step"><span class="n">3</span>กดคำนวณเพื่อดูผลลัพธ์</div>
    </div>
  </div>`;
}
function setBusy(b, which) {
  BUSY = b;
  ['btnCalc', 'btnPermute', 'btnReset', 'btnCalcM', 'btnPermuteM', 'btnResetM'].forEach(id => {
    const el = $(id);
    if (el) el.disabled = b;
  });
  if (which && $(which)) $(which).classList.toggle('loading', b);
}

/* ================= D/C STATUS ================= */
async function loadDc() {
  const sel = $('dcStatus');
  const note = $('dcHint');
  sel.setAttribute('aria-busy', 'true');
  try {
    const d = await apiGet('libs/ipd-result');
    const dcList = (d && d.rows) || [];
    if (!dcList.length) throw new Error('D/C status list is empty');
    sel.innerHTML = '';
    dcList.forEach(r => {
      const o = document.createElement('option');
      const code = String(r.code == null ? '' : r.code);
      o.value = code;
      o.textContent = (r.name_th || r.name || code) + ' (' + code + ')';
      sel.appendChild(o);
    });
    const preferred = PENDING_DC_STATUS || '11';
    sel.value = dcList.some(r => String(r.code) === preferred) ? preferred : '11';
    PENDING_DC_STATUS = null;
    if (note) note.textContent = 'รายการสถานะจำหน่ายจาก CMI@MoPH พร้อมใช้งาน';
  } catch (e) {
    sel.innerHTML = '<option value="11">ใช้ค่าเริ่มต้น (11)</option>';
    sel.value = '11';
    PENDING_DC_STATUS = null;
    if (note) note.textContent = 'เชื่อมต่อรายการไม่สำเร็จ — ใช้ค่าเริ่มต้น (11)';
    toast('โหลดรายการ D/C Status ไม่สำเร็จ — ใช้ค่าเริ่มต้น (11)', 3500, 'warn');
  } finally {
    sel.removeAttribute('aria-busy');
  }
}

/* ================= PDx AUTOCOMPLETE (ICD-10) ================= */
let pdAcTimer = null, pdAcIndex = -1, pdAcRequest = 0;
const pdxInput = $('pdx'), pdxList = $('pdxAc');
function updatePdxReadiness() {
  const pdx = clean(pdxInput.value);
  if (pdx) {
    setPdxError(false);
    setCaseStatus('ready', 'พร้อมคำนวณ', 'PDx ' + pdx + ' · ตรวจสอบข้อมูลแล้วกดคำนวณ');
  } else {
    setCaseStatus('ready', 'รอข้อมูล PDx', 'กรอกรหัสวินิจฉัยหลักเพื่อเริ่มคำนวณ');
  }
}
function openPdxList() { pdxList.classList.add('open'); pdxInput.setAttribute('aria-expanded', 'true'); }
function closePdxList() { pdxList.classList.remove('open'); pdxInput.setAttribute('aria-expanded', 'false'); pdAcIndex = -1; }
function renderPdxAc(rows) {
  if (!rows.length) {
    pdxList.innerHTML = '<div class="ac-empty">ไม่พบรหัส ICD-10 ที่ตรงกัน</div>';
    openPdxList();
    return;
  }
  pdxList.innerHTML = rows.map((r, i) =>
    `<div class="ac-item" id="pdxAc-${i}" data-code="${esc(r.icd10)}" role="option" aria-selected="false"><span class="c">${esc(r.icd10)}</span><span class="d">${esc(r.who_full_desc || r.icd10_3_code_desc || '')}</span></div>`
  ).join('');
  openPdxList();
}
function selectPdxAc(item) {
  pdxInput.value = item.dataset.code;
  updatePdxReadiness();
  closePdxList();
  syncSdxVsPdx();
}
pdxInput.addEventListener('input', function () {
  const q = this.value.trim();
  updatePdxReadiness();
  pdAcIndex = -1;
  clearTimeout(pdAcTimer);
  syncSdxVsPdx();
  if (!q) { closePdxList(); pdxList.innerHTML = ''; return; }
  const requestId = ++pdAcRequest;
  pdAcTimer = setTimeout(async () => {
    try {
      const d = await apiGet('libs/icd10/' + encodeURIComponent(q));
      if (requestId !== pdAcRequest || clean(pdxInput.value) !== clean(q)) return;
      renderPdxAc((d && d.rows) || []);
    } catch (e) { closePdxList(); }
  }, 300);
});
pdxList.addEventListener('click', e => {
  const item = e.target.closest('.ac-item');
  if (item) selectPdxAc(item);
});
pdxInput.addEventListener('keydown', e => {
  if (!pdxList.classList.contains('open')) {
    if (e.key === 'Enter') { e.preventDefault(); focusChip($('sdxChips')); }
    return;
  }
  const items = [...pdxList.querySelectorAll('.ac-item')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    pdAcIndex = e.key === 'ArrowDown' ? Math.min(pdAcIndex + 1, items.length - 1) : Math.max(pdAcIndex - 1, 0);
    items.forEach((it, i) => {
      it.classList.toggle('sel', i === pdAcIndex);
      it.setAttribute('aria-selected', i === pdAcIndex ? 'true' : 'false');
    });
    if (items[pdAcIndex]) {
      pdxInput.setAttribute('aria-activedescendant', 'pdxAc-' + pdAcIndex);
      items[pdAcIndex].scrollIntoView({ block: 'nearest' });
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (pdAcIndex >= 0 && items[pdAcIndex]) selectPdxAc(items[pdAcIndex]);
    else $('btnCalc').click();
  } else if (e.key === 'Escape') {
    closePdxList();
  }
});
document.addEventListener('click', e => {
  if (!e.target.closest('.ac-wrap')) closePdxList();
});

/* ================= CHIPS (SDx / Proc) ================= */
function focusChip(container) {
  const inp = container.querySelector('.chip-input');
  if (inp) inp.focus();
}
function bindChips(container, arr, kind) {
  container._arr = arr;
  container._kind = kind;
  container.addEventListener('click', e => {
    const item = e.target.closest('.ac-item');
    if (item) { pickProcAc(item, container); return; }
    const x = e.target.closest('.chip-x');
    if (x) {
      const current = container._arr || [];
      const i = current.indexOf(x.dataset.c);
      if (i >= 0) { current.splice(i, 1); chipRow(container, current); }
      return;
    }
    const inp = container.querySelector('.chip-input');
    if (inp && e.target !== inp) inp.focus();
  });
}
function addCodes(container, arr, codes) {
  let skipped = 0;
  let limited = 0;
  const pdxCur = clean($('pdx').value);
  const limit = container._kind === 'proc' ? PROC_LIMIT : SDX_LIMIT;
  codes.forEach(c => {
    if (!c || arr.includes(c)) return;
    if (container._kind === 'sdx' && c === pdxCur) { skipped++; return; }
    if (arr.length >= limit) { limited++; return; }
    arr.push(c);
  });
  if (skipped) toast('ข้าม ' + skipped + ' รหัสที่ซ้ำกับ PDx (' + pdxCur + ')', 3000, 'warn');
  if (limited) toast('เพิ่มได้สูงสุด ' + limit + ' รหัสสำหรับ ' + (container._kind === 'proc' ? 'Proc' : 'SDx') + ' — ข้าม ' + limited + ' รหัส', 3500, 'warn');
  if (codes.length) chipRow(container, arr);
}
function syncSdxVsPdx() {
  const p = clean($('pdx').value);
  if (!p) return;
  if (SDX.includes(p)) {
    SDX = SDX.filter(x => x !== p);
    chipRow($('sdxChips'), SDX);
    toast('ลบ ' + p + ' ออกจาก SDx (ซ้ำกับ PDx)', 2500, 'warn');
  }
}
function bindChipInput(inp, container, kind) {
  inp.addEventListener('input', () => { if (kind === 'proc') procAcSearch(inp, container); });
  inp.addEventListener('keydown', e => {
    const list = container.querySelector('.ac-list');
    const open = list && list.classList.contains('open');
    const items = open ? [...list.querySelectorAll('.ac-item')] : [];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      procAcIndex = e.key === 'ArrowDown' ? Math.min(procAcIndex + 1, items.length - 1) : Math.max(procAcIndex - 1, 0);
      items.forEach((it, i) => it.classList.toggle('sel', i === procAcIndex));
      return;
    }
    if (e.key === 'Escape') { closeProcAc(container); inp.blur(); return; }
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (open && procAcIndex >= 0 && items[procAcIndex]) { pickProcAc(items[procAcIndex], container); return; }
      const codes = parseCodes(inp.value);
      if (codes.length) { addCodes(container, container._arr, codes); focusChip(container); return; }
      if (kind === 'sdx') focusChip($('procChips'));
      else $('btnCalc').click();
    }
  });
  inp.addEventListener('paste', e => {
    e.preventDefault();
    const txt = (e.clipboardData || window.clipboardData).getData('text');
    const codes = parseCodes(txt);
    if (!codes.length) return;
    addCodes(container, container._arr, codes);
    focusChip(container);
  });
  inp.addEventListener('blur', () => {
    closeProcAc(container);
    const codes = parseCodes(inp.value);
    if (!codes.length) return;
    addCodes(container, container._arr, codes);
  });
}
function chipRow(container, arr) {
  container._arr = arr;
  const kind = container._kind;
  const label = kind === 'proc' ? 'เพิ่มรหัสหัตถการ' : 'เพิ่มรหัสวินิจฉัย';
  if (kind === 'proc') procAcRequest++;
  let inp = container.querySelector('.chip-input');
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'chip-input';
    inp.setAttribute('aria-label', label);
    inp.autocomplete = 'off';
    bindChipInput(inp, container, kind);
    container.appendChild(inp);
  }
  container.querySelectorAll('.chip, .ac-list').forEach(el => el.remove());
  inp.value = '';
  arr.forEach(c => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.append(document.createTextNode(c));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'chip-x';
    remove.dataset.c = c;
    remove.setAttribute('aria-label', 'ลบ ' + c);
    remove.title = 'ลบ ' + c;
    remove.innerHTML = IC.x;
    chip.appendChild(remove);
    container.insertBefore(chip, inp);
  });
  if (kind === 'sdx') renderRecent();
  syncQuickState();
}

/* ===== Proc autocomplete (ICD-9-CM /libs/icd-cm) ===== */
let procAcTimer = null, procAcIndex = -1, procAcRows = [], procAcRequest = 0;
function closeProcAc(container) {
  const l = container.querySelector('.ac-list');
  if (l) l.classList.remove('open');
  procAcIndex = -1;
  procAcRows = [];
}
function pickProcAc(item, container) {
  addCodes(container, container._arr, [item.dataset.code]);
  closeProcAc(container);
  focusChip(container);
}
function procAcSearch(inp, container) {
  const q = inp.value.trim();
  clearTimeout(procAcTimer);
  procAcIndex = -1;
  if (!q) { procAcRequest++; closeProcAc(container); return; }
  const requestId = ++procAcRequest;
  procAcTimer = setTimeout(async () => {
    if (document.activeElement !== inp) return;
    let rows = [];
    try {
      const d = await apiGet('libs/icd-cm/' + encodeURIComponent(q));
      rows = (d && d.rows) || [];
    } catch (e) { rows = []; }
    if (requestId !== procAcRequest || document.activeElement !== inp) return;
    let list = container.querySelector('.ac-list');
    if (!list) {
      list = document.createElement('div');
      list.className = 'ac-list';
      list.setAttribute('role', 'listbox');
      list.setAttribute('aria-label', 'ผลการค้นหาหัตถการ ICD-9-CM');
      container.appendChild(list);
    }
    if (!rows.length) {
      list.innerHTML = '<div class="ac-empty">ไม่พบรหัสหัตถการที่ตรงกัน</div>';
      list.classList.add('open');
      return;
    }
    procAcRows = rows;
    list.innerHTML = rows.map(r =>
      `<div class="ac-item" data-code="${esc(r.icd)}" role="option"><span class="c">${esc(r.icd)}</span><span class="d">${esc(r.procedname || '')}</span></div>`
    ).join('');
    list.classList.add('open');
  }, 300);
}

/* ================= QUICK PICKS ================= */
const COMMON_DX = [
  ['I10', 'ความดันโลหิตสูง'], ['E119', 'เบาหวาน'], ['E789', 'ไขมันในเลือด'],
  ['N189', 'ไตวายเรื้อรัง'], ['J449', 'COPD'], ['I509', 'หัวใจล้มเหลว'],
  ['I489', 'หัวใจเต้นผิดจังหวะ'], ['J189', 'ปอดบวม'], ['A419', 'ติดเชื้อในเลือด'], ['N390', 'ทางเดินปัสสาวะอักเสบ']
];
const COMMON_PROC = [['8703', 'ฟอกเลือด'], ['4709', 'ผ่าตัดไส้ติ่ง'], ['9904', 'ให้เลือด/ส่วนประกอบ']];
function bindQuick(row, arr, chipsId) {
  row.querySelectorAll('.qchip').forEach(b => {
    b.addEventListener('click', () => {
      const c = b.dataset.code;
      const target = $(chipsId);
      const targetArr = (target && target._arr) || arr;
      const pdxCur = clean($('pdx').value);
      if (chipsId === 'sdxChips' && c === pdxCur) {
        toast('รหัส ' + c + ' ซ้ำกับ PDx — ไม่เพิ่ม', 3000, 'warn');
        return;
      }
      const limit = chipsId === 'procChips' ? PROC_LIMIT : SDX_LIMIT;
      if (!targetArr.includes(c) && targetArr.length < limit) { targetArr.push(c); chipRow(target, targetArr); }
      else if (!targetArr.includes(c)) { toast('เพิ่มได้สูงสุด ' + limit + ' รหัส', 3000, 'warn'); return; }
      b.classList.add('added');
      b.setAttribute('aria-pressed', 'true');
      setTimeout(() => b.classList.remove('added'), 600);
    });
  });
}
function renderQuick() {
  $('sdxQuick').innerHTML = '<span class="qlbl">พบบ่อย:</span>' + COMMON_DX.map(([c, label]) =>
    `<button type="button" class="qchip" data-code="${c}" aria-pressed="${SDX.includes(c)}" title="เพิ่ม ${c} — ${label}">${c}</button>`).join('');
  $('procQuick').innerHTML = '<span class="qlbl">พบบ่อย:</span>' + COMMON_PROC.map(([c, label]) =>
    `<button type="button" class="qchip" data-code="${c}" aria-pressed="${PROC.includes(c)}" title="เพิ่ม ${c} — ${label}">${c}</button>`).join('');
  bindQuick($('sdxQuick'), SDX, 'sdxChips');
  bindQuick($('procQuick'), PROC, 'procChips');
  renderRecent();
}
function getRecent() { try { return JSON.parse(localStorage.getItem('ktl_drg_recent') || '[]'); } catch (e) { return []; } }
function saveRecent(codes) {
  let r = getRecent();
  codes.forEach(c => { if (c && !r.includes(c)) r.unshift(c); });
  r = r.slice(0, 10);
  try { localStorage.setItem('ktl_drg_recent', JSON.stringify(r)); } catch (e) {}
}
function renderRecent() {
  const r = getRecent().filter(c => !SDX.includes(c)).slice(0, 6);
  const row = $('sdxRecent');
  if (!r.length) { row.style.display = 'none'; return; }
  row.style.display = 'flex';
  row.innerHTML = '<span class="qlbl">ล่าสุด:</span>' + r.map(c =>
    `<button type="button" class="qchip" data-code="${c}" title="เพิ่ม ${c}">${c}</button>`).join('');
  bindQuick(row, SDX, 'sdxChips');
}
function syncQuickState() {
  [['sdxQuick', SDX], ['procQuick', PROC]].forEach(([id, values]) => {
    const row = $(id);
    if (!row) return;
    row.querySelectorAll('.qchip').forEach(b => {
      const active = values.includes(b.dataset.code);
      b.classList.toggle('added', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  });
}

/* ================= COPY ================= */
function copyText(txt) {
  const done = () => toast('คัดลอกผลลัพธ์แล้ว', 2200, 'ok');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(done).catch(() => fallbackCopy(txt, done));
  } else fallbackCopy(txt, done);
}
function fallbackCopy(txt, done) {
  const ta = document.createElement('textarea');
  ta.value = txt;
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { toast('คัดลอกไม่สำเร็จ', 2500, 'warn'); }
  ta.remove();
}

/* ================= GLOBAL SHORTCUTS ================= */
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) $('btnPermute').click();
    else $('btnCalc').click();
  }
});

/* ================= MOBILE BOTTOM BAR ================= */
['btnCalcM', 'btnPermuteM', 'btnResetM'].forEach(mid => {
  const mb = $(mid), t = $(mid.replace('M', ''));
  if (mb && t) mb.addEventListener('click', () => t.click());
});

/* ================= SEX TOGGLE ================= */
const segBtns = [...$('sexSeg').querySelectorAll('button')];
function setSex(v) {
  SEX = v;
  segBtns.forEach(b => {
    const on = +b.dataset.sex === v;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}
segBtns.forEach(b => b.addEventListener('click', () => setSex(+b.dataset.sex)));
$('sexSeg').addEventListener('keydown', e => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  const cur = segBtns.findIndex(b => +b.dataset.sex === SEX);
  const next = e.key === 'ArrowRight' ? (cur + 1) % segBtns.length : (cur - 1 + segBtns.length) % segBtns.length;
  setSex(+segBtns[next].dataset.sex);
  segBtns[next].focus();
});

/* ================= PAYLOAD BUILDER ================= */
function clampNum(v, min, max, def) {
  if (v === null || v === undefined || String(v).trim() === '') return def;
  const n = +v;
  if (Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function readNumberField(id, min, max, def) {
  const input = $(id);
  const raw = input ? input.value.trim() : '';
  const value = clampNum(raw, min, max, def);
  if (input && raw !== '' && Number.isFinite(+raw) && +raw !== value) input.value = String(value);
  if (input && raw === '') input.value = String(def);
  return value;
}

function setInputError(id, errorId, show) {
  const input = $(id);
  const field = input && input.closest('.field');
  if (field) field.classList.toggle('has-error', !!show);
  if (input) input.setAttribute('aria-invalid', show ? 'true' : 'false');
  const message = $(errorId);
  if (message) message.hidden = !show;
}

function validateCase(pdx) {
  const hcode = $('hcode').value.trim().replace(/\D/g, '');
  const validHcode = /^\d{5}$/.test(hcode);
  const validPdx = !!pdx;
  setInputError('hcode', 'hcodeError', !validHcode);
  setPdxError(!validPdx);
  if (!validHcode) {
    $('hcode').focus();
    setCaseStatus('error', 'ข้อมูลยังไม่ครบ', 'กรุณาระบุรหัสสถานพยาบาลเป็นตัวเลข 5 หลัก');
    toast('กรุณาตรวจสอบ HCode ให้เป็นตัวเลข 5 หลัก', 3000, 'warn');
    return false;
  }
  if (!validPdx) {
    $('pdx').classList.add('invalid');
    $('pdx').focus();
    setCaseStatus('error', 'ข้อมูลยังไม่ครบ', 'กรุณาระบุ PDx ก่อนคำนวณ');
    toast('กรุณาระบุ PDx (รหัสวินิจฉัยหลัก)', 3000, 'warn');
    setTimeout(() => $('pdx').classList.remove('invalid'), 1800);
    return false;
  }
  return true;
}

function readFormState(pdx, sdx) {
  const dcStatus = $('dcStatus').value || '11';
  return {
    hcode: $('hcode').value.trim().replace(/\D/g, ''),
    sex: SEX,
    age: readNumberField('age', 0, 120, 65),
    ageDay: readNumberField('ageDay', 0, 364, 0),
    weight: readNumberField('weight', 0, 300, 60),
    losDay: readNumberField('losDay', 0, 9999, 5),
    losHour: readNumberField('losHour', 0, 23, 0),
    baseRate: readNumberField('baseRate', 0, 1e7, 3504),
    dcStatus,
    pdx: clean(pdx || ''),
    sdx: [...new Set((sdx || []).map(clean).filter(Boolean))].slice(0, SDX_LIMIT),
    proc: [...new Set(PROC.map(clean).filter(Boolean))].slice(0, PROC_LIMIT)
  };
}

function buildPayloadFromState(state) {
  const dcCode = state.dcStatus || '11';
  return {
    version: '6',
    data: [{
      hcode: state.hcode,
      hn: '', an: '1',
      sex: state.sex,
      age: state.age,
      age_day: state.ageDay,
      los_day: state.losDay,
      los_hour: state.losHour,
      weight: state.weight,
      dischs: dcCode.charAt(0),
      discht: dcCode.charAt(1) || '1',
      pdx: state.pdx,
      sdx: state.sdx,
      proc: state.proc
    }]
  };
}
function buildPayload(pdx, sdx) { return buildPayloadFromState(readFormState(pdx, sdx)); }
async function calcOne(payload, signal) {
  const d = await apiPost('drg/calculate', payload, { signal });
  if (!d || d.status !== 200) throw new Error('Grouper ไม่ตอบกลับผลลัพธ์ (status ' + (d && d.status) + ')');
  return d;
}

/* ================= CALCULATE ================= */
$('btnCalc').addEventListener('click', async () => {
  if (BUSY) return;
  const pdx = clean($('pdx').value);
  if (!validateCase(pdx)) return;
  const state = readFormState(pdx, SDX);
  const payload = buildPayloadFromState(state);
  const controller = beginOperation();
  setBusy(true, 'btnCalc');
  setCaseStatus('working', 'กำลังคำนวณ', 'ส่งข้อมูลไปยัง Grouper ทางการ');
  $('loaderTxt').textContent = 'กำลังคำนวณ DRG ผ่าน Grouper ทางการ...';
  $('loader').classList.add('show');
  try {
    const d = await calcOne(payload, controller.signal);
    const r = (d.data && d.data[0]) || {};
    if (!r.drg) throw new Error('ไม่ได้รับผลลัพธ์จาก grouper');
    renderResult(r, d.tgrp || {});
    saveHistory(Object.assign({}, payload.data[0], state), r);
    saveRecent([pdx, ...SDX]);
    toast('คำนวณเสร็จ · DRG ' + r.drg + ' · ADJRW ' + fmt(r.adjrw), 3000, 'ok');
    setCaseStatus('success', 'คำนวณสำเร็จ', 'DRG ' + r.drg + ' · ADJRW ' + fmt(r.adjrw));
  } catch (e) {
    if (isAbortError(e)) {
      setCaseStatus('error', 'ยกเลิกคำขอแล้ว', 'ยังไม่มีการบันทึกผลลัพธ์');
      return;
    }
    renderError(e);
    setCaseStatus('error', 'คำนวณไม่สำเร็จ', friendlyError(e));
  } finally {
    $('loader').classList.remove('show');
    endOperation(controller);
    setBusy(false);
  }
});

/* ================= PERMUTE ================= */
const SDX_GROUP = SDX_LIMIT;
let STOP_PERMUTE = false;

function* combinations(arr, k) {
  const n = arr.length;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield idx.map(i => arr[i]);
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}
function buildScenarios(codes, currentPdx) {
  const seen = new Set(), list = [];
  let capped = false;
  const addOne = (pdxCand, pool) => {
    if (list.length >= MAX_SCENARIOS) { capped = true; return; }
    const combos = pool.length <= SDX_GROUP ? [pool] : combinations(pool, SDX_GROUP);
    for (const combo of combos) {
      if (list.length >= MAX_SCENARIOS) { capped = true; return; }
      const key = pdxCand + '|' + [...combo].sort().join(',');
      if (!seen.has(key)) { seen.add(key); list.push({ pdx: pdxCand, sdx: combo }); }
    }
  };
  addOne(currentPdx, codes.filter(c => c !== currentPdx));
  for (const c of codes) if (c !== currentPdx) addOne(c, codes.filter(x => x !== c));
  return { scenarios: list, capped };
}

$('btnPermute').addEventListener('click', async () => {
  if (BUSY) return;
  const pdx = clean($('pdx').value);
  if (!validateCase(pdx)) return;
  const codes = [...new Set([pdx, ...SDX.map(clean)])].filter(Boolean);
  if (codes.length < 2) { toast('เพิ่ม SDx อย่างน้อย 1 รหัส เพื่อให้สลับเป็น PDx ได้', 3500, 'warn'); return; }
  if (codes.length > 30) { toast('รหัสเยอะเกินไป (สูงสุด 30) — ลด SDx ก่อน', 3500, 'warn'); return; }

  const { scenarios, capped } = buildScenarios(codes, pdx);
  if (scenarios.length > 60 && !window.confirm(
    'จะทดสอบ ' + scenarios.length + ' ทางเลือก (สลับ SDx→PDx)\n' +
    'ประมาณ ' + Math.ceil(scenarios.length * 1.4 / 60) + ' นาที\n\n' +
    'แน่ใจว่าจะเปรียบเทียบทั้งหมด?\n(กด OK เพื่อดำเนินต่อ / Cancel เพื่อยกเลิก)'
  )) { return; }
  const t0 = Date.now();
  STOP_PERMUTE = false;
  const controller = beginOperation();

  setBusy(true);
  setCaseStatus('working', 'กำลังเปรียบเทียบ PDx', 'ทดสอบ ' + scenarios.length + ' ทางเลือก · หยุดได้ทุกเมื่อ');
  renderPermuteStream(scenarios.length, capped, controller);
  const results = [];
  try {
    for (let i = 0; i < scenarios.length; i++) {
      if (STOP_PERMUTE) break;
      const s = scenarios[i];
      updatePermuteProgress(i + 1, scenarios.length, s.pdx, t0);
      const payload = buildPayload(s.pdx, s.sdx);
      try {
        const d = await calcOne(payload, controller.signal);
        const r = (d.data && d.data[0]) || {};
        results.push({ pdx: s.pdx, sdx: s.sdx, r, err: false });
        permAppendRow(i + 1, s, r, false);
      } catch (e) {
        if (isAbortError(e) && STOP_PERMUTE) break;
        results.push({ pdx: s.pdx, sdx: s.sdx, r: { drg: '—', err: -1, error: String(e.message || e) }, err: true });
        permAppendRow(i + 1, s, null, true);
      }
    }
  } finally {
    endOperation(controller);
    setBusy(false);
  }
  saveRecent(codes);
  renderPermute(results, pdx, Date.now() - t0, capped, STOP_PERMUTE);
  setCaseStatus('success', STOP_PERMUTE ? 'หยุดการเปรียบเทียบแล้ว' : 'เปรียบเทียบเสร็จ', results.length + ' ทางเลือก · ดูอันดับ PDx ด้านล่าง');
});

function renderPermuteStream(total, capped, controller) {
  $('resultBody').innerHTML = `
    <div class="alert ok" style="margin-bottom:4px;">${IC.repeat} <span>
      กำลังทดสอบ <b id="permDone">0</b>/<b>${total}</b> แบบ${capped ? ' (จำกัดสูงสุด ' + MAX_SCENARIOS + ' แบบ)' : ''}
      · เหลือเวลาประมาณ <b id="permEta">${Math.ceil(total * 1.4 / 60)}</b> นาที
    </span></div>
    <div class="prog"><i id="permBar"></i></div>
    <div class="perm-status-line">
      <span class="hint" id="permNow">กำลังส่งแบบที่ 1 ...</span>
      <button type="button" class="mini-btn" id="btnStopPerm">${IC.square} หยุด</button>
    </div>
    <div class="perm-wrap"><table class="perm-table stream" id="permTable">
      <tr><th>#</th><th>PDx</th><th>SDx</th><th>DRG</th><th>MDC</th><th>RW</th><th>ADJRW</th><th>WTLOS</th><th>OT</th><th>ผล</th></tr>
      <tr id="permEmpty"><td colspan="10" class="n" style="text-align:center;">กำลังรอผลแรก...</td></tr>
    </table></div>`;
  const st = $('btnStopPerm');
  if (st) st.addEventListener('click', () => {
    STOP_PERMUTE = true;
    st.disabled = true;
    st.textContent = 'กำลังหยุด...';
    if (controller) controller.abort();
  });
}
function updatePermuteProgress(done, total, pdx, t0) {
  const el = $('permDone'), bar = $('permBar'), eta = $('permEta'), now = $('permNow');
  if (el) el.textContent = done;
  if (bar) bar.style.width = Math.min(100, (done / total) * 100) + '%';
  if (now) now.textContent = 'กำลังส่งแบบที่ ' + done + '/' + total + ' · PDx=' + pdx + ' ...';
  if (eta && done > 0) {
    const spent = (Date.now() - t0) / 1000;
    const remain = Math.max(0, (spent / done) * (total - done));
    eta.textContent = Math.floor(remain / 60) + ' นาที ' + Math.ceil(remain % 60) + ' วินาที';
  }
}
function permAppendRow(i, s, r, isErr) {
  const tb = $('permTable'), empty = $('permEmpty');
  if (!tb) return;
  if (empty) empty.remove();
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="n">${i}</td>
    <td><b>${esc(s.pdx)}</b></td>
    <td class="n">${esc(s.sdx.join(', '))}</td>
    <td class="drg">${isErr ? '—' : esc(r.drg)}</td>
    <td>${isErr ? '—' : esc(r.mdc || '—')}</td>
    <td>${isErr ? '—' : fmt(r.rw)}</td>
    <td>${isErr ? '—' : fmt(r.adjrw || 0)}</td>
    <td>${isErr ? '—' : fmt(r.wtlos)}</td>
    <td>${isErr ? '—' : (r.ot ?? '—')}</td>
    <td>${isErr ? '<span class="gain-dn">ERR</span>' : (r.err > 0 ? `<span class="gain-dn">err=${r.err}</span>` : (r.warn > 0 ? `<span style="color:var(--warn)">warn=${r.warn}</span>` : IC.check))}</td>`;
  tb.appendChild(tr);
}

function renderPermute(results, currentPdx, elapsedMs, capped, stopped) {
  const cur = results.find(x => x.pdx === currentPdx && !x.err);
  const curAdj = cur ? (cur.r.adjrw || 0) : null;

  const sorted = [...results].sort((a, b) => {
    const va = a.err ? -1 : (a.r.adjrw || 0);
    const vb = b.err ? -1 : (b.r.adjrw || 0);
    return vb - va;
  });
  const bestPdx = sorted.length && !sorted[0].err ? sorted[0].pdx : null;
  const note = capped ? ' · จำกัดสูงสุด ' + MAX_SCENARIOS + ' แบบ (รหัสเยอะเกิน)' : (stopped ? ' · หยุดก่อนครบ (แสดงผลที่มีอยู่)' : '');

  const pdxBest = new Map();
  sorted.filter(s => !s.err).forEach(s => {
    const a = s.r.adjrw || 0;
    if (!pdxBest.has(s.pdx) || a > pdxBest.get(s.pdx)) pdxBest.set(s.pdx, a);
  });
  const rank = [...pdxBest.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const rankHtml = rank.length > 1
    ? '<div class="rank-row">' + rank.map(([p, a], i) =>
        `<span class="rank-item ${i === 0 ? 'rank-top' : ''}">${i + 1}. <b>${esc(p)}</b> · ADJRW ${fmt(a)}</span>`).join('') + '</div>'
    : '';

  let html = `
    <div class="alert ok" style="margin-bottom:4px;">${IC.repeat} <span>ทดสอบ <b>${results.length}</b> แบบ (สลับ SDx→PDx ทุกชุด ${SDX_GROUP} ตัว) · ใช้เวลา ${(elapsedMs / 1000).toFixed(1)} วินาที${note}
    ${bestPdx ? ` · <b>แนะนำ PDx = ${esc(bestPdx)}</b> (ADJRW สูงสุด)` : ''}</span></div>
    ${rankHtml}
    <div class="perm-wrap"><table class="perm-table">
      <tr><th>#</th><th>PDx</th><th>SDx</th><th>DRG</th><th>MDC</th><th>RW</th><th>ADJRW</th><th>ΔADJRW</th><th>WTLOS</th><th>OT</th><th>ผล</th></tr>`;

  sorted.forEach((s, i) => {
    const isCur = s.pdx === currentPdx;
    const isBest = !s.err && bestPdx && s.pdx === bestPdx;
    const adj = s.err ? null : (s.r.adjrw || 0);
    let delta = '—';
    if (adj !== null && curAdj !== null) {
      const d = adj - curAdj;
      delta = `<span class="${d >= 0 ? 'gain-up' : 'gain-dn'}">${d >= 0 ? '+' : ''}${d.toFixed(4)}</span>`;
    }
    const tags = [];
    if (isBest) tags.push('<span class="tag best">ดีที่สุด</span>');
    if (isCur) tags.push('<span class="tag cur">ปัจจุบัน</span>');
    let statusTxt;
    if (s.err) statusTxt = '<span class="gain-dn">ERR</span>';
    else if (s.r.err > 0) statusTxt = `<span class="gain-dn">err=${s.r.err}</span>`;
    else if (s.r.warn > 0) statusTxt = `<span style="color:var(--warn)">warn=${s.r.warn}</span>`;
    else statusTxt = IC.check;
    html += `
      <tr class="${(isBest ? 'best ' : '') + (isCur ? 'current' : '')}">
        <td class="n">${i + 1}</td>
        <td><b>${esc(s.pdx)}</b>${tags.join(' ')}</td>
        <td class="n">${esc(s.sdx.join(', ')) || '—'}</td>
        <td class="drg">${s.err ? '—' : esc(s.r.drg)}</td>
        <td>${s.err ? '—' : esc(s.r.mdc || '—')}</td>
        <td>${s.err ? '—' : fmt(s.r.rw)}</td>
        <td>${s.err ? '—' : fmt(adj)}</td>
        <td>${delta}</td>
        <td>${s.err ? '—' : fmt(s.r.wtlos)}</td>
        <td>${s.err ? '—' : esc(s.r.ot ?? '—')}</td>
        <td>${statusTxt}</td>
      </tr>`;
  });

  html += `</table></div>
    <div class="hint" style="margin-top:8px;">แต่ละแบบใช้ Grouper ทางการ ~1.4 วินาที · ถ้า SDx เกิน ${SDX_GROUP} รหัส จะทดสอบทุกชุด ${SDX_GROUP} ตัว เพื่อให้เห็น RW ทุกรูปแบบ</div>`;
  $('resultBody').innerHTML = html;
  scrollToEl($('resultCard'));
  if (stopped) toast('หยุดการทดสอบแล้ว — แสดงผลที่มีอยู่', 3500, 'warn');
  else toast('ทดสอบเสร็จสิ้น · ' + results.length + ' แบบ', 3000, 'ok');
}

/* ================= RENDER ================= */
let libCache = {};
function cacheGet(key) { try { return libCache[key] != null ? libCache[key] : localStorage.getItem('ktl_lib_' + key); } catch (e) { return libCache[key]; } }
function cacheSet(key, val) { libCache[key] = val; try { localStorage.setItem('ktl_lib_' + key, val); } catch (e) {} }

function renderResult(r, tgrp) {
  const baseRate = clampNum($('baseRate').value, 0, 1e7, 3504);
  const pay = (r.adjrw || 0) * baseRate;
  const losShow = (r.los != null && r.los !== '') ? r.los : ((+r.los_day || 0) + (+r.los_hour || 0) / 24);
  const errs = [], warns = [];
  if (r.err > 0) errs.push(r.err);
  if (r.warn > 0) { for (let b = 0; b <= 15; b++) { if (r.warn & (1 << b)) warns.push(1 << b); } }

  let html = `
    <div class="drg-hero">
      <div>
        <div class="drg-code">${esc(r.drg)}</div>
        <div class="drg-name" id="drgNameRow">กำลังโหลดชื่อ DRG...</div>
      </div>
      <span class="mdc-badge">MDC ${esc(r.mdc || '—')}</span>
    </div>
    <div class="stats">
      <div class="stat"><div class="k">RW</div><div class="v">${fmt(r.rw)}</div></div>
      <div class="stat"><div class="k">ADJRW</div><div class="v amber">${fmt(r.adjrw)}</div></div>
      <div class="stat"><div class="k">WTLOS</div><div class="v">${fmt(r.wtlos)}</div></div>
      <div class="stat"><div class="k">OT</div><div class="v">${esc(r.ot ?? '—')}</div></div>
      <div class="stat"><div class="k">LOS</div><div class="v">${fmt(losShow)}</div></div>
    </div>
    <div class="alert ok" style="margin-top:14px;">
      ${IC.money} <span>ประมาณการค่าใช้จ่าย (ADJRW × Base Rate ${fmtNum(baseRate)}): <b class="ml">${fmtNum(pay)} บาท</b></span>
    </div>`;

  if (errs.length) {
    html += `<div class="alert err">${IC.err} <span>Error ${errs.join(', ')}: <span id="errTxt">กำลังโหลด...</span></span></div>`;
  }
  if (warns.length) {
    html += `<div class="alert warn">${IC.warn} <span>Warning ${warns.join(', ')}: <span id="warnTxt">กำลังโหลด...</span></span></div>`;
  }
  if (!errs.length && !warns.length) {
    html += `<div class="alert ok">${IC.checkC} <span>Grouper ประมวลผลผ่าน ไม่มี Error / Warning</span></div>`;
  }
  html += `<div class="meta"><span>ชุดข้อมูล: PDx ${esc(clean($('pdx').value))} · Grouper: ${esc(tgrp.FileDescription || 'TGrp6305')} (${esc(tgrp.ProductVersion || '6.3.5')})</span><span>${new Date().toLocaleString('th-TH')}</span></div>
  <button type="button" class="mini-btn" id="btnCopy" style="margin-top:10px;">${IC.copy} คัดลอกผลลัพธ์</button>`;

  $('resultBody').innerHTML = html;
  scrollToEl($('resultCard'));

  const cp = $('btnCopy');
  if (cp) cp.addEventListener('click', () =>
    copyText(`DRG ${r.drg} · MDC ${r.mdc} · RW ${fmt(r.rw)} · ADJRW ${fmt(r.adjrw)} · ประมาณการ ${fmtNum(pay)} บาท`));

  loadDrgName(r.drg);
  if (errs.length) loadDesc('drg-error/' + errs[0], 'errTxt');
  if (warns.length) {
    const txt = $('warnTxt');
    Promise.all(warns.map(w => loadDesc('drg-warning/' + w))).then(names => {
      if (txt) txt.textContent = names.filter(Boolean).join('; ') || 'ไม่พบคำอธิบายเพิ่มเติม';
    });
  }
}
function fmt(n) { return (n === null || n === undefined || n === '') ? '—' : (+n).toLocaleString('th-TH', { maximumFractionDigits: 4 }); }
function fmtNum(n) { return (+n || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 }); }

async function loadDrgName(drg) {
  const cached = cacheGet('drg_' + drg);
  if (cached) { if ($('drgNameRow')) $('drgNameRow').textContent = cached; return cached; }
  try {
    const d = await apiGet('libs/drg-name/' + drg);
    const row = (d && d.rows && d.rows[0]);
    const name = (row && row.drgname) || '';
    if (name) cacheSet('drg_' + drg, name);
    if ($('drgNameRow')) $('drgNameRow').textContent = name || 'ไม่พบชื่อ DRG จาก API';
    return name || 'ไม่พบชื่อ DRG จาก API';
  } catch (e) {
    if ($('drgNameRow')) $('drgNameRow').textContent = 'โหลดชื่อ DRG ไม่สำเร็จ';
    return 'โหลดชื่อ DRG ไม่สำเร็จ';
  }
}
async function loadDesc(path, elId) {
  const key = path.replace(/[^A-Za-z0-9]/g, '_');
  const cached = cacheGet(key);
  if (cached) {
    if (elId && $(elId)) $(elId).textContent = cached;
    return cached;
  }
  try {
    const d = await apiGet(path);
    const row = (d && d.rows && d.rows[0]);
    const name = row ? (row.name || row.name_th || '') : '';
    if (name) cacheSet(key, name);
    if (elId && $(elId)) $(elId).textContent = name || 'ไม่พบคำอธิบายเพิ่มเติม';
    return name || 'ไม่พบคำอธิบายเพิ่มเติม';
  } catch (e) {
    if (elId && $(elId)) $(elId).textContent = 'โหลดคำอธิบายไม่สำเร็จ';
    return 'โหลดคำอธิบายไม่สำเร็จ';
  }
}

function friendlyError(e) {
  const msg = String(e && (e.message || e) || '');
  if (isAbortError(e) || /timeout/i.test(msg)) return 'การเชื่อมต่อใช้เวลานานเกินไปหรือถูกยกเลิก กรุณาตรวจสอบเครือข่ายแล้วลองใหม่';
  if (e && e.status === 404) return 'ไม่พบ API หรือคำขอถูกปฏิเสธจากตำแหน่งเครือข่าย — API นี้ใช้งานจากเครือข่ายในประเทศไทยหรือ VPN ของโรงพยาบาล';
  if (e && (e.status === 400 || e.status === 422)) return 'ข้อมูลเคสไม่ถูกต้อง กรุณาตรวจสอบรหัสและข้อมูลผู้ป่วย';
  if (/network|fetch/i.test(msg)) return 'เชื่อมต่อ CMI@MoPH ไม่สำเร็จ กรุณาใช้งานจากเครือข่ายในประเทศไทยหรือ VPN ของโรงพยาบาล';
  if (/grouper|ผลลัพธ์|status/i.test(msg)) return 'Grouper ไม่ส่งผลลัพธ์กลับมา กรุณาตรวจสอบรหัสและลองใหม่';
  return 'ตรวจสอบข้อมูลที่กรอก แล้วลองคำนวณอีกครั้ง';
}
function renderError(e) {
  $('resultBody').innerHTML = `
    <div class="alert err" style="margin-top:4px;">${IC.err} <span><b>ไม่สามารถคำนวณ DRG ได้</b><br>
      ${esc(friendlyError(e))}<br><br>
      หมายเหตุ: API ของ CMI@MoPH จำกัดการเข้าถึงเฉพาะเครือข่ายในประเทศไทย<br>
      — ถ้าเปิดจากนอกเครือข่ายไทย กรุณาใช้ภายใน รพ. หรือ VPN ไทย</span></div>
    <div class="empty" style="padding:30px 20px;"><div class="empty-ic" aria-hidden="true">${IC.xlSearch}</div><h2>ลองอีกครั้ง</h2><p>ตรวจสอบข้อมูลแล้วกดคำนวณใหม่</p></div>`;
}

/* ================= HISTORY ================= */
function readHistory() {
  try {
    const value = JSON.parse(localStorage.getItem('ktl_drg_hist') || '[]');
    return Array.isArray(value) ? value : [];
  } catch (e) { return []; }
}
function historyCase(item) {
  const c = item && item.case && typeof item.case === 'object' ? item.case : (item || {});
  return {
    hcode: String(c.hcode || '10929').replace(/\D/g, ''),
    sex: +c.sex === 2 ? 2 : 1,
    age: c.age ?? 65,
    ageDay: c.ageDay ?? c.age_day ?? 0,
    weight: c.weight ?? 60,
    losDay: c.losDay ?? c.los_day ?? 5,
    losHour: c.losHour ?? c.los_hour ?? 0,
    baseRate: c.baseRate ?? 3504,
    dcStatus: c.dcStatus || String(c.dischs || '1') + String(c.discht || '1'),
    pdx: clean(c.pdx || ''),
    sdx: Array.isArray(c.sdx) ? c.sdx.map(clean).filter(Boolean).slice(0, SDX_LIMIT) : [],
    proc: Array.isArray(c.proc) ? c.proc.map(clean).filter(Boolean).slice(0, PROC_LIMIT) : []
  };
}
function saveHistory(pat, r) {
  const state = historyCase(Object.assign({}, pat, { pdx: pat.pdx, sdx: pat.sdx, proc: pat.proc }));
  let h = readHistory();
  h.unshift({
    schema: 2,
    ts: Date.now(),
    pdx: state.pdx,
    drg: r.drg,
    rw: r.rw,
    adjrw: r.adjrw,
    hcode: state.hcode,
    sex: state.sex,
    age: state.age,
    ageDay: state.ageDay,
    weight: state.weight,
    losDay: state.losDay,
    losHour: state.losHour,
    baseRate: state.baseRate,
    dcStatus: state.dcStatus,
    sdx: state.sdx,
    proc: state.proc
  });
  h = h.slice(0, 10);
  try { localStorage.setItem('ktl_drg_hist', JSON.stringify(h)); } catch (e) {}
  renderHistory();
}
function renderHistory() {
  const h = readHistory();
  $('histBody').innerHTML = h.length ? h.map((x, i) =>
    `<div class="hist-item" data-idx="${i}" role="button" tabindex="0" title="โหลดเคส ${esc(historyCase(x).pdx)} กลับมาทั้งหมด">
       <span class="drg">${esc(x.drg)}</span>
       <span>${esc(historyCase(x).pdx)}${historyCase(x).sdx.length ? ' +' + historyCase(x).sdx.length : ''}</span>
       <span class="rw">RW ${fmt(x.rw)} · ADJRW ${fmt(x.adjrw)}</span>
       <span class="time">${new Date(x.ts).toLocaleTimeString('th-TH')}</span>
     </div>`
  ).join('') : '<div class="hist-empty"><div class="hist-empty-ic" aria-hidden="true"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>ยังไม่มีประวัติ<br><span>คำนวณเคสแรกเพื่อบันทึกไว้ที่นี่</span></div>';
  $('histBody').querySelectorAll('.hist-item').forEach(el => {
    const activate = () => {
      const idx = +el.dataset.idx;
      const item = h[idx];
      if (!item) return;
      restoreHistoryItem(item, true);
    };
    el.addEventListener('click', activate);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
  });
}

function restoreHistoryItem(item, announce) {
  const c = historyCase(item);
  $('hcode').value = c.hcode || '10929';
  $('age').value = c.age;
  $('ageDay').value = c.ageDay;
  $('weight').value = c.weight;
  $('losDay').value = c.losDay;
  $('losHour').value = c.losHour;
  $('baseRate').value = c.baseRate;
  $('pdx').value = c.pdx;
  setSex(c.sex);
  SDX = c.sdx;
  PROC = c.proc;
  PENDING_DC_STATUS = c.dcStatus;
  const dc = $('dcStatus');
  if ([...dc.options].some(o => o.value === c.dcStatus)) dc.value = c.dcStatus;
  chipRow($('sdxChips'), SDX);
  chipRow($('procChips'), PROC);
  syncSdxVsPdx();
  setInputError('hcode', 'hcodeError', false);
  setPdxError(false);
  updatePdxReadiness();
  if (announce) {
    $('resultBody').innerHTML = emptyState();
    setCaseStatus('ready', 'โหลดเคสแล้ว', 'ตรวจสอบข้อมูลแล้วกดคำนวณเพื่ออัปเดตผลลัพธ์');
    toast('โหลดเคส ' + c.pdx + ' กลับมาพร้อมข้อมูลทั้งเคสแล้ว', 2500, 'ok');
  }
}
$('btnClearHist').addEventListener('click', () => {
  try { localStorage.removeItem('ktl_drg_hist'); } catch (e) {}
  renderHistory();
  toast('ลบประวัติทั้งหมดแล้ว', 2500, 'ok');
});

/* ================= RESET ================= */
$('btnReset').addEventListener('click', () => {
  if (BUSY) return;
  $('hcode').value = '10929';
  $('age').value = 65; $('ageDay').value = 0; $('weight').value = 60;
  $('losDay').value = 5; $('losHour').value = 0; $('baseRate').value = 3504;
  $('pdx').value = '';
  $('dcStatus').value = '11';
  PENDING_DC_STATUS = null;
  setSex(1);
  SDX = []; PROC = [];
  chipRow($('sdxChips'), SDX);
  chipRow($('procChips'), PROC);
  $('resultBody').innerHTML = emptyState();
  $('pdx').classList.remove('invalid');
  setInputError('hcode', 'hcodeError', false);
  setPdxError(false);
  setCaseStatus('ready', 'พร้อมคำนวณ', 'ฟอร์มถูกล้างแล้ว · กรอก PDx เพื่อเริ่มใหม่');
  closePdxList();
});

/* ================= THEME TOGGLE ================= */
const THEME_SUN = '<svg class="theme-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
const THEME_MOON = '<svg class="theme-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
function applyTheme(dark) {
  document.body.setAttribute('data-theme', dark ? 'dark' : 'light');
  const btn = $('btnTheme'), ic = $('themeIc'), lbl = $('themeLbl');
  if (btn) btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
  if (ic) ic.outerHTML = dark ? THEME_MOON : THEME_SUN;
  if (lbl) lbl.textContent = dark ? 'ธีมเข้ม' : 'ธีมสว่าง';
}
function initTheme() {
  let dark = false;
  try { dark = localStorage.getItem('ktl_drg_theme') === 'dark'; } catch (e) {}
  applyTheme(dark);
  const btn = $('btnTheme');
  if (btn) btn.addEventListener('click', () => {
    const nd = document.body.getAttribute('data-theme') !== 'dark';
    applyTheme(nd);
    try { localStorage.setItem('ktl_drg_theme', nd ? 'dark' : 'light'); } catch (e) {}
    toast('เปลี่ยนเป็นธีม' + (nd ? 'เข้ม' : 'สว่าง') + 'แล้ว', 2200, 'ok');
  });
}

/* ================= INIT ================= */
bindChips($('sdxChips'), SDX, 'sdx');
bindChips($('procChips'), PROC, 'proc');
chipRow($('sdxChips'), SDX);
chipRow($('procChips'), PROC);
(function restore() {
  const h = readHistory();
  if (h.length) restoreHistoryItem(h[0], false);
})();
loadDc();
renderHistory();
renderQuick();
initTheme();
updatePdxReadiness();
$('hcode').addEventListener('input', () => {
  if (/^\d{5}$/.test($('hcode').value.trim())) setInputError('hcode', 'hcodeError', false);
});
if (window.matchMedia && window.matchMedia('(pointer:fine)').matches && window.innerWidth > 640) {
  $('pdx').focus();
}
