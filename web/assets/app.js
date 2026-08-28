/* ============================================================
   KTL CMI DRG Seeker — App Logic v3.0 (GitHub Pages / static)
   เรียก API CMI@MoPH ตรงจาก client (CORS เปิด *)
   fallback: ผ่าน CORS proxy สาธารณะ เมื่อ geo/network ขัดข้อง
   หมายเหตุ: ไม่พึ่ง google.script.run / GAS server อีกต่อไป
   ============================================================ */
'use strict';

/* ================= CONFIG ================= */
const API = 'https://had-api.moph.go.th/cmi';
/* CORS proxy สำรอง (สาธารณะ, ใช้เฉพาะเมื่อ fetch ตรงล้มเหลว)
   หมายเหตุ: API ของ CMI@MoPH เปิด CORS * อยู่แล้ว + geo-block เฉพาะ IP ไทย
   → proxy มีประโยชน์เฉพาะเมื่อ fetch ตรงล่มชั่วคราวจาก network/geo edge
   (ตัวหลักทำงานได้เต็มที่ในไทยโดยไม่ต้องพึ่ง proxy) */
const PROXY_FALLBACKS = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?url='
];

let SEX = 1;
let SDX = [];
let PROC = [];
let BUSY = false;

/* ================= ICONS ================= */
const S = ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const IC = {
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
const clean = s => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const parseCodes = raw => raw.trim().toUpperCase().split(/[\s,;]+/).map(clean).filter(Boolean);
/* แทนที่สมาชิก array แบบ in-place — ห้าม reassign SDX/PROC เพราะ closure
   (bindChips/bindQuick/container._arr) ถือ reference เดิมไว้ ถูกแทนที่ด้วย array
   ใหม่แล้ว UI จะเพี้ยนจากข้อมูลที่ส่งจริงไป Grouper */
const setArr = (arr, items) => { arr.length = 0; arr.push(...(items || [])); };

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

/* ================= NETWORK LAYER (fetch ตรง + proxy fallback) ================= */
async function fetchT(url, opts, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms || 30000);
  try { return await fetch(url, Object.assign({}, opts, { signal: ctl.signal })); }
  finally { clearTimeout(t); }
}
/* เรียก API แบบมี fallback ผ่าน CORS proxy สาธารณะ */
async function apiRequest(path, { method = 'GET', body = null } = {}) {
  const url = API + '/' + path;
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }

  /* 1) ลอง fetch ตรงก่อน (CORS ของ CMI@MoPH เปิด *) */
  try {
    const r = await fetchT(url, opts, method === 'POST' ? 30000 : 20000);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (directErr) {
    /* 2) fallback ผ่าน CORS proxy (best-effort — ตัวหลัก fetch ตรงเวิร์กอยู่แล้ว) */
    let lastErr = directErr;
    for (const p of PROXY_FALLBACKS) {
      try {
        const pUrl = p + encodeURIComponent(url);
        const ropts = { method, headers: {} };
        if (body) { ropts.headers['Content-Type'] = 'application/json'; ropts.body = JSON.stringify(body); }
        const r = await fetchT(pUrl, ropts, 20000);
        if (!r.ok) throw new Error('proxy HTTP ' + r.status);
        const ct = (r.headers.get('content-type') || '');
        return ct.includes('json') ? await r.json() : JSON.parse(await r.text());
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }
}
/* wrapper สะดวก */
function apiGet(path) { return apiRequest(path, { method: 'GET' }); }
function apiPost(path, body) { return apiRequest(path, { method: 'POST', body }); }

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
  try {
    const d = await apiGet('libs/ipd-result');
    const dcList = (d && d.rows) || [];
    const sel = $('dcStatus');
    sel.innerHTML = '';
    dcList.forEach(r => {
      const o = document.createElement('option');
      o.value = r.code;
      o.textContent = (r.name_th || r.name) + ' (' + r.code + ')';
      sel.appendChild(o);
    });
    if (dcList.some(r => r.code === '11')) sel.value = '11';
  } catch (e) {
    $('dcStatus').innerHTML = '<option value="11">ใช้ค่าเริ่มต้น (11)</option>';
    $('dcStatus').value = '11';
    toast('โหลดรายการ D/C Status ไม่สำเร็จ — ใช้ค่าเริ่มต้น (11)', 3500, 'warn');
  }
}

/* ================= PDx AUTOCOMPLETE (ICD-10) ================= */
let pdAcTimer = null, pdAcIndex = -1;
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
function closePdxList() {
  pdxList.classList.remove('open');
  pdxInput.setAttribute('aria-expanded', 'false');
  pdxInput.removeAttribute('aria-activedescendant');
  pdAcIndex = -1;
}
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
  pdxInput.removeAttribute('aria-activedescendant');
  clearTimeout(pdAcTimer);
  syncSdxVsPdx();
  if (!q) { closePdxList(); pdxList.innerHTML = ''; return; }
  pdAcTimer = setTimeout(async () => {
    try {
      const d = await apiGet('libs/icd10/' + encodeURIComponent(q));
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
  /* กัน blur ชนะ click: mousedown บนรายการแนะนำจะ preventDefault
     เพื่อไม่ให้ focus หลุดจากช่องพิมพ์ ก่อน click ไปถึง .ac-item */
  container.addEventListener('mousedown', e => {
    if (e.target.closest('.ac-item')) e.preventDefault();
  });
  container.addEventListener('click', e => {
    const item = e.target.closest('.ac-item');
    if (item) { pickProcAc(item, container); return; }
    const x = e.target.closest('.chip-x');
    if (x) {
      const i = arr.indexOf(x.dataset.c);
      if (i >= 0) { arr.splice(i, 1); chipRow(container, arr); }
      return;
    }
    const inp = container.querySelector('.chip-input');
    if (inp && e.target !== inp) inp.focus();
  });
}
function addCodes(container, arr, codes) {
  let skipped = 0;
  const pdxCur = clean($('pdx').value);
  codes.forEach(c => {
    if (!c || arr.includes(c)) return;
    if (container._kind === 'sdx' && c === pdxCur) { skipped++; return; }
    arr.push(c);
  });
  if (skipped) toast('ข้าม ' + skipped + ' รหัสที่ซ้ำกับ PDx (' + pdxCur + ')', 3000, 'warn');
  if (codes.length) chipRow(container, arr);
}
function syncSdxVsPdx() {
  const p = clean($('pdx').value);
  if (!p) return;
  if (SDX.includes(p)) {
    for (let i = SDX.length - 1; i >= 0; i--) if (SDX[i] === p) SDX.splice(i, 1);
    chipRow($('sdxChips'), SDX);
    toast('ลบ ' + p + ' ออกจาก SDx (ซ้ำกับ PDx)', 2500, 'warn');
  }
}
function chipRow(container, arr) {
  container._arr = arr;
  const kind = container._kind;
  const label = kind === 'proc' ? 'เพิ่มรหัสหัตถการ' : 'เพิ่มรหัสวินิจฉัย';
  const isProc = kind === 'proc';
  container.innerHTML = arr.map(c =>
    `<span class="chip">${esc(c)}<button type="button" class="chip-x" data-c="${esc(c)}" aria-label="ลบ ${esc(c)}" title="ลบ ${esc(c)}">${IC.x}</button></span>`
  ).join('') + `<input type="text" class="chip-input" aria-label="${label}" autocomplete="off"${isProc
    ? ' role="combobox" aria-expanded="false" aria-controls="procAc" aria-autocomplete="list"'
    : ''}>`;
  if (isProc) {
    const list = document.createElement('div');
    list.className = 'ac-list';
    list.id = 'procAc';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'ผลการค้นหาหัตถการ ICD-9-CM');
    container.appendChild(list);
  }
  const inp = container.querySelector('.chip-input');
  inp.addEventListener('input', () => { if (kind === 'proc') procAcSearch(inp, container); });
  inp.addEventListener('keydown', e => {
    const list = container.querySelector('.ac-list');
    const open = list && list.classList.contains('open');
    const items = open ? [...list.querySelectorAll('.ac-item')] : [];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      procAcIndex = e.key === 'ArrowDown' ? Math.min(procAcIndex + 1, items.length - 1) : Math.max(procAcIndex - 1, 0);
      items.forEach((it, i) => {
        const sel = i === procAcIndex;
        it.classList.toggle('sel', sel);
        it.setAttribute('aria-selected', sel ? 'true' : 'false');
        it.id = 'procAc-' + i;
      });
      inp.setAttribute('aria-activedescendant', 'procAc-' + procAcIndex);
      if (items[procAcIndex]) items[procAcIndex].scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'Escape') { closeProcAc(container); inp.blur(); return; }
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (open && procAcIndex >= 0 && items[procAcIndex]) { pickProcAc(items[procAcIndex], container); return; }
      const codes = parseCodes(inp.value);
      if (codes.length) { addCodes(container, arr, codes); focusChip(container); return; }
      if (kind === 'sdx') focusChip($('procChips'));
      else $('btnCalc').click();
    }
  });
  inp.addEventListener('paste', e => {
    e.preventDefault();
    const txt = (e.clipboardData || window.clipboardData).getData('text');
    const codes = parseCodes(txt);
    if (!codes.length) return;
    addCodes(container, arr, codes);
    focusChip(container);
  });
  inp.addEventListener('blur', e => {
    /* ถ้า focus กำลังจะไปที่รายการแนะนำ อย่า commit ข้อความค้างในช่อง
       — ปล่อยให้ click handler จัดการเลือกรายการแทน */
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.ac-item')) return;
    closeProcAc(container);
    const codes = parseCodes(inp.value);
    if (!codes.length) return;
    addCodes(container, arr, codes);
  });
  if (kind === 'sdx') renderRecent();
}

/* ===== Proc autocomplete (ICD-9-CM /libs/icd-cm) ===== */
let procAcTimer = null, procAcIndex = -1;
function closeProcAc(container) {
  const l = container.querySelector('.ac-list');
  if (l) l.classList.remove('open');
  const inp = container.querySelector('.chip-input');
  if (inp) inp.setAttribute('aria-expanded', 'false');
  procAcIndex = -1;
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
  if (!q) { closeProcAc(container); return; }
  procAcTimer = setTimeout(async () => {
    if (document.activeElement !== inp) return;
    const list = container.querySelector('.ac-list');
    if (!list) return;
    let rows = [];
    try {
      const d = await apiGet('libs/icd-cm/' + encodeURIComponent(q));
      rows = (d && d.rows) || [];
    } catch (e) { rows = []; }
    if (!rows.length) {
      list.innerHTML = '<div class="ac-empty">ไม่พบรหัสหัตถการที่ตรงกัน</div>';
      list.classList.add('open');
      inp.setAttribute('aria-expanded', 'true');
      return;
    }
    list.innerHTML = rows.map(r =>
      `<div class="ac-item" data-code="${esc(r.icd)}" role="option"><span class="c">${esc(r.icd)}</span><span class="d">${esc(r.procedname || '')}</span></div>`
    ).join('');
    list.classList.add('open');
    inp.setAttribute('aria-expanded', 'true');
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
      const pdxCur = clean($('pdx').value);
      if (chipsId === 'sdxChips' && c === pdxCur) {
        toast('รหัส ' + c + ' ซ้ำกับ PDx — ไม่เพิ่ม', 3000, 'warn');
        return;
      }
      if (!arr.includes(c)) { arr.push(c); chipRow($(chipsId), arr); }
      b.classList.add('added');
      b.setAttribute('aria-pressed', 'true');
      setTimeout(() => b.classList.remove('added'), 600);
    });
  });
}
function renderQuick() {
  $('sdxQuick').innerHTML = '<span class="qlbl">พบบ่อย:</span>' + COMMON_DX.map(([c, label]) =>
    `<button type="button" class="qchip" data-code="${c}" aria-pressed="false" title="เพิ่ม ${c} — ${label}">${c}</button>`).join('');
  $('procQuick').innerHTML = '<span class="qlbl">พบบ่อย:</span>' + COMMON_PROC.map(([c, label]) =>
    `<button type="button" class="qchip" data-code="${c}" aria-pressed="false" title="เพิ่ม ${c} — ${label}">${c}</button>`).join('');
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
function buildPayload(pdx, sdx) {
  const dcCode = $('dcStatus').value || '11';
  const hcode = clean($('hcode').value) || '10929';
  const age = clampNum($('age').value, 0, 120, 0);
  const ageDay = clampNum($('ageDay').value, 0, 364, 0);
  const weight = clampNum($('weight').value, 0, 300, 0);
  const losDay = clampNum($('losDay').value, 0, 9999, 0);
  const losHour = clampNum($('losHour').value, 0, 23, 0);
  const baseRate = clampNum($('baseRate').value, 0, 1e7, 3504);
  return {
    version: '6',
    data: [{
      hcode: hcode,
      hn: '', an: '1',
      sex: SEX,
      age: age,
      age_day: ageDay,
      los_day: losDay,
      los_hour: losHour,
      weight: weight,
      dischs: dcCode.charAt(0),
      discht: dcCode.charAt(1) || '1',
      pdx: pdx,
      sdx: (sdx || []).slice(0, 12),
      proc: PROC.slice(0, 20)
    }]
  };
}
function clampNum(v, min, max, def) {
  const n = +v;
  if (isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}
async function calcOne(payload) {
  const d = await apiPost('drg/calculate', payload);
  if (!d || d.status !== 200) throw new Error('Grouper ไม่ตอบกลับผลลัพธ์ (status ' + (d && d.status) + ')');
  return d;
}

/* ================= CALCULATE ================= */
$('btnCalc').addEventListener('click', async () => {
  if (BUSY) return;
  const pdx = clean($('pdx').value);
  if (!pdx) {
    setPdxError(true);
    $('pdx').classList.add('invalid');
    $('pdx').focus();
    setCaseStatus('error', 'ข้อมูลยังไม่ครบ', 'กรุณาระบุ PDx ก่อนคำนวณ');
    toast('กรุณาระบุ PDx (รหัสวินิจฉัยหลัก)', 3000, 'warn');
    setTimeout(() => $('pdx').classList.remove('invalid'), 1800);
    return;
  }
  const payload = buildPayload(pdx, SDX);
  setBusy(true, 'btnCalc');
  setCaseStatus('working', 'กำลังคำนวณ', 'ส่งข้อมูลไปยัง Grouper ทางการ');
  $('loaderTxt').textContent = 'กำลังคำนวณ DRG ผ่าน Grouper ทางการ...';
  $('loader').classList.add('show');
  try {
    const d = await calcOne(payload);
    const r = (d.data && d.data[0]) || {};
    if (!r.drg) throw new Error('ไม่ได้รับผลลัพธ์จาก grouper');
    renderResult(r, d.tgrp || {});
    saveHistory(payload.data[0], r);
    saveRecent([pdx, ...SDX]);
    toast('คำนวณเสร็จ · DRG ' + r.drg + ' · ADJRW ' + fmt(r.adjrw), 3000, 'ok');
    setCaseStatus('success', 'คำนวณสำเร็จ', 'DRG ' + r.drg + ' · ADJRW ' + fmt(r.adjrw));
  } catch (e) {
    renderError(e);
    setCaseStatus('error', 'คำนวณไม่สำเร็จ', friendlyError(e));
  } finally {
    $('loader').classList.remove('show');
    setBusy(false);
  }
});

/* ================= PERMUTE ================= */
const SDX_GROUP = 12;
const MAX_SCENARIOS = 2000;
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
  if (!pdx) { setPdxError(true); setCaseStatus('error', 'ข้อมูลยังไม่ครบ', 'กรุณาระบุ PDx ก่อนเปรียบเทียบ'); toast('กรุณาระบุ PDx (รหัสวินิจฉัยหลัก)', 3000, 'warn'); return; }
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

  setBusy(true);
  setCaseStatus('working', 'กำลังเปรียบเทียบ PDx', 'ทดสอบ ' + scenarios.length + ' ทางเลือก · หยุดได้ทุกเมื่อ');
  renderPermuteStream(scenarios.length, capped);
  const results = [];
  for (let i = 0; i < scenarios.length; i++) {
    if (STOP_PERMUTE) break;
    const s = scenarios[i];
    updatePermuteProgress(i + 1, scenarios.length, s.pdx, t0);
    const payload = buildPayload(s.pdx, s.sdx);
    try {
      const d = await calcOne(payload);
      const r = (d.data && d.data[0]) || {};
      results.push({ pdx: s.pdx, sdx: s.sdx, r, err: false });
      permAppendRow(i + 1, s, r, false);
    } catch (e) {
      results.push({ pdx: s.pdx, sdx: s.sdx, r: { drg: '—', err: -1, error: String(e.message || e) }, err: true });
      permAppendRow(i + 1, s, null, true);
    }
  }
  setBusy(false);
  saveRecent(codes);
  renderPermute(results, pdx, Date.now() - t0, capped, STOP_PERMUTE);
  setCaseStatus('success', STOP_PERMUTE ? 'หยุดการเปรียบเทียบแล้ว' : 'เปรียบเทียบเสร็จ', results.length + ' ทางเลือก · ดูอันดับ PDx ด้านล่าง');
});

function renderPermuteStream(total, capped) {
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
  if (st) st.addEventListener('click', () => { STOP_PERMUTE = true; st.disabled = true; st.textContent = 'กำลังหยุด...'; });
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
        <td>${s.err ? '—' : (s.r.ot ?? '—')}</td>
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
      <div class="stat"><div class="k">OT</div><div class="v">${r.ot ?? '—'}</div></div>
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
    let acc = [];
    warns.forEach((w, i) => {
      loadDesc('drg-warning/' + w, null, (name) => {
        acc[i] = name;
        if (acc.filter(x => x).length === warns.length) txt.textContent = acc.join('; ');
      });
    });
  }
}
function fmt(n) { return (n === null || n === undefined || n === '') ? '—' : (+n).toLocaleString('th-TH', { maximumFractionDigits: 4 }); }
function fmtNum(n) { return (+n || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 }); }

async function loadDrgName(drg) {
  const cached = cacheGet('drg_' + drg);
  if (cached) { if ($('drgNameRow')) $('drgNameRow').textContent = cached; return; }
  try {
    const d = await apiGet('libs/drg-name/' + drg);
    const row = (d && d.rows && d.rows[0]);
    const name = (row && row.drgname) || '';
    if (name) cacheSet('drg_' + drg, name);
    if ($('drgNameRow')) $('drgNameRow').textContent = name || '';
  } catch (e) { }
}
async function loadDesc(path, elId, cb) {
  const key = path.replace(/[^A-Za-z0-9]/g, '_');
  const cached = cacheGet(key);
  if (cached) {
    if (elId && $(elId)) $(elId).textContent = cached;
    if (cb) cb(cached);
    return;
  }
  try {
    const d = await apiGet(path);
    const row = (d && d.rows && d.rows[0]);
    const name = row ? (row.name || row.name_th || '') : '';
    if (name) cacheSet(key, name);
    if (elId && $(elId)) $(elId).textContent = name;
    if (cb) cb(name);
  } catch (e) { if (cb) cb(''); }
}

function friendlyError(e) {
  const msg = String(e && (e.message || e) || '');
  if (/abort|timeout/i.test(msg)) return 'การเชื่อมต่อใช้เวลานานเกินไป กรุณาตรวจสอบเครือข่ายแล้วลองใหม่';
  if (/network|fetch|proxy/i.test(msg)) return 'เชื่อมต่อ CMI@MoPH ไม่สำเร็จ กรุณาใช้งานจากเครือข่ายในประเทศไทยหรือ VPN ของโรงพยาบาล';
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
function saveHistory(pat, r) {
  let h = [];
  try { h = JSON.parse(localStorage.getItem('ktl_drg_hist') || '[]'); } catch (e) {}
  h.unshift({ ts: Date.now(), pdx: pat.pdx, drg: r.drg, rw: r.rw, adjrw: r.adjrw, sdx: pat.sdx || [], proc: pat.proc || [] });
  h = h.slice(0, 10);
  try { localStorage.setItem('ktl_drg_hist', JSON.stringify(h)); } catch (e) {}
  renderHistory();
}
function renderHistory() {
  let h = [];
  try { h = JSON.parse(localStorage.getItem('ktl_drg_hist') || '[]'); } catch (e) {}
  $('histBody').innerHTML = h.length ? h.map((x, i) =>
    `<div class="hist-item" data-idx="${i}" role="button" tabindex="0" title="โหลดเคส ${esc(x.pdx)} กลับมาทั้งหมด">
       <span class="drg">${esc(x.drg)}</span>
       <span>${esc(x.pdx)}${(x.sdx && x.sdx.length) ? ' +' + x.sdx.length : ''}</span>
       <span class="rw">RW ${(+x.rw).toFixed(4)} · ADJRW ${(+x.adjrw).toFixed(4)}</span>
       <span class="time">${new Date(x.ts).toLocaleTimeString('th-TH')}</span>
     </div>`
  ).join('') : '<div class="hist-empty"><div class="hist-empty-ic" aria-hidden="true"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>ยังไม่มีประวัติ<br><span>คำนวณเคสแรกเพื่อบันทึกไว้ที่นี่</span></div>';
  $('histBody').querySelectorAll('.hist-item').forEach(el => {
    const activate = () => {
      const idx = +el.dataset.idx;
      const item = h[idx];
      if (!item) return;
      $('pdx').value = item.pdx;
      setArr(SDX, item.sdx); setArr(PROC, item.proc);
      chipRow($('sdxChips'), SDX); chipRow($('procChips'), PROC);
      syncSdxVsPdx();
      updatePdxReadiness();
      toast('โหลดเคส ' + item.pdx + ' กลับมาแล้ว', 2500, 'ok');
    };
    el.addEventListener('click', activate);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
  });
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
  setSex(1);
  setArr(SDX, []); setArr(PROC, []);
  chipRow($('sdxChips'), SDX);
  chipRow($('procChips'), PROC);
  $('resultBody').innerHTML = emptyState();
  $('pdx').classList.remove('invalid');
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
(function restore() {
  try {
    const h = JSON.parse(localStorage.getItem('ktl_drg_hist') || '[]');
    if (h.length) $('pdx').value = h[0].pdx;
  } catch (e) {}
})();
bindChips($('sdxChips'), SDX, 'sdx');
bindChips($('procChips'), PROC, 'proc');
chipRow($('sdxChips'), SDX);
chipRow($('procChips'), PROC);
loadDc();
renderHistory();
renderQuick();
initTheme();
updatePdxReadiness();
if (window.matchMedia && window.matchMedia('(pointer:fine)').matches) {
  $('pdx').focus();
}
