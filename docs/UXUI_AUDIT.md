# KTL CMI DRG Seeker — UX/UI Audit Report

> วันที่ตรวจ: 2026-08-28 · ตรวจโดย: Hermes Agent
> ขอบเขต: `Index.html` (frontend SPA) + `Code.js` (backend GAS proxy)
> **สถานะ: รายการ 🔴/🟡/🟢 ด้านล่างได้รับการแก้ไขแล้ว (2026-08-28) — ดูสรุปการแก้ที่ท้ายไฟล์**

---

## สรุปภาพรวม

แอปนี้เป็น **งาน UX/UI ระดับสูง (PRO MAX) จริง** ไม่ใช่แค่ "หน้าสวย" แต่มีระบบ design token
ที่สมบูรณ์, a11y รอบด้าน, responsive ครบทุกจอ, และสถานะ/ความผิดพลาดทุกสถานะที่ผู้ใช้จะเจอ
เป็นเครื่องมือในสายงานที่คนใช้ทุกวัน — และถูกออกแบบมาอย่างมืออาชีพ

**ประเด็นสำคัญที่สุด (🔴):** ระบบธีมมี **dead code + meta ขัดแย้ง** — แอป render เป็น **ธีมสว่าง
(Clinical Light) เสมอ** แต่ `<meta color-scheme="dark">`, คอมเมนต์ design-system ("พื้นเขียวเข้ม"),
และ `:root` ธีมเข้มทั้งก้อน (164 บรรทัด) ยังบอกว่าเป็นธีมเข้ม กล่าวคือ **ธีมเข้มถูกเขียนเสร็จ
คุณภาพดี แต่ไม่มีทางเปิดใช้** (ไม่มี `prefers-color-scheme` ไม่มีปุ่มสลับ)

---

## เกณฑ์การให้คะแนน

| ระดับ | ความหมาย |
|---|---|
| 🔴 | ต้องแก้ — ขัดแย้ง/เสีย UX จริง/ทำให้ผู้ใช้สับสน |
| 🟡 | ควรแก้ — เพิ่มคุณภาพ / ความเสี่ยงปานกลาง |
| 🟢 | ปรับปรุงได้ — polish / ข้อแนะนำ |

---

## 🔴 ต้องแก้ (สูง)

### 1. ระบบธีมแตก — ธีมเข้มเป็น dead code + meta ขัดแย้ง
**หลักฐาน:**
- `:root` ธีมเข้ม (line 21) + `:root` ธีมสว่าง (line 484) — specificity เท่ากัน → **ธีมสว่างชนะเสมอ**
- `<meta name="color-scheme" content="dark">` (line 7) แต่ CSS `:root` (line 485) ตั้ง `color-scheme: light`
- คอมเมนต์ design-system (line 15-20): "พื้นเขียวเข้ม + teal/cyan accent" — ขัดกับที่ render จริง
- **ไม่มี** `prefers-color-scheme` (0 รายการ) และ **ไม่มี** ปุ่มสลับธีม/JS สลับธีม (0 รายการ)

**ผล:** ผู้ใช้เห็นธีมสว่างเสมอ ธีมเข้ม (เขียนเสร็จ คุณภาพดี) ไม่ถูกใช้เลย
**ข้อเสนอแนะ (แนะนำ):** ธีมเข้มเขียนเสร็จแล้ว → แค่**เพิ่มสวิตช์ธีมจริง** ที่ default ตาม
`prefers-color-scheme` + เก็บตัวเลือกใน `localStorage` และแก้ meta เป็น `light dark` (ค่าเริ่มต้นสว่าง)
ให้ผู้ใช้เลือก 3 โหมด (สว่าง/เข้ม/ตามระบบ) — ได้ทั้ง dark mode ฟรีจากโค้ดที่มีอยู่แล้ว
**หรือ** ถ้าไม่ต้องการ dark mode: ลบ `:root` เข้ม (line 21-45) + body เข้ม (48-60) ที่โดนทับ + แก้ meta/comments ให้ตรงกับธีมสว่าง

---

## 🟡 ควรแก้ (กลาง)

### 2. ประวัติบันทึกเฉพาะ PDx ไม่บันทึกทั้งเคส
`saveHistory` (line 1574) เก็บแค่ `{ts, pdx, drg, rw, adjrw}` และคลิกประวัติ (line 1591) โหลดกลับ
**แค่ค่า PDx** → ผู้ใช้ต้องกรอก SDx/Proc/อายุ/LOS ใหม่หมด
**ข้อเสนอ:** เก็บ `payload.data[0]` ทั้งก้อน (hcode/age/weight/sdx/proc/dcStatus) แล้วคลิกประวัติ
โหลดเต็มฟอร์ม — ผู้ใช้กลับมาแก้ต่อได้จริง (เหมาะกับสายงานที่ทำทีละหลายเคส)

### 3. ระบบเปรียบเทียบอาจใช้เวลานานมากโดยไม่เตือนล่วงหน้า
`MAX_SCENARIOS=2000` × ~1.4 วิ ≈ **47 นาที** (line 1278, 1463) มีปุ่มหยุด+ETA แล้ว แต่ไม่มีการ
"ยืนยันก่อนรันยาว" เมื่อ scenario เกิน เช่น 200 แบบ
**ข้อเสนอ:** ถ้า scenario > ~100 ให้ถามยืนยันก่อน ("จะทดสอบ N แบบ ใช้เวลาประมาณ X นาที — ดำเนินต่อ?")
+ แนะนำลด SDx หรือทดสอบเฉพาะชุดที่สนใจ

### 4. ไม่มี field-level validation สำหรับ hcode / ช่วงค่าก่อนส่ง
`input` มี `min`/`max` (ช่วยใน UI) แต่ `buildPayload` (line 1209) ใช้ค่าตรง ๆ ไม่ clamp ไม่ตรวจ
`hcode` ต้อง 5 หลัก, `age` 0-120 ฯลฯ — พิมพ์เกิน range ได้ถ้า bypass spinner
**ข้อเสนอ:** validate + clamp ใน `buildPayload` หรือก่อน `calcOne` และแสดง error รายฟิลด์ (มี CSS
`.field.has-error` พร้อมแล้ว)

---

## 🟢 ปรับปรุงได้ (ต่ำ / polish)

### 5. ค่า D/C status ตอน offline — fallback เงียบ
`loadDc` catch (line 881) ตั้ง `"ใช้ค่าเริ่มต้น (11)"` เงียบ — ผู้ใช้ไม่รู้ว่าไม่ได้โหลดรายการจริง
**ข้อเสนอ:** toast/small note บอกว่าใช้ค่าเริ่มต้นเพราะโหลด D/C status ไม่ได้

### 6. ตัวเลข LOS ในผลลัพธ์
`renderResult` แสดง `r.los ?? '—'` (line 1491) — ถ้า API ไม่ส่ง `los` (คำนวณจาก los_day/los_hour
เองได้) จะโชว์ "—" ทั้งที่กรอกแล้ว
**ข้อเสนอ:** fallback คำนวณ `los_day + los_hour/24`

### 7. ลำดับการยิง libs ในผลลัพธ์
`loadDrgName` + `loadDesc` ยิงทีละ request (line 1517-1528) — ใช้ได้ แต่ถ้า network ช้า ชื่อ DRG
จะโผล่ทีหลังแบบค่อย ๆ
**ข้อเสนอ:** Promise.all พร้อมกัน หรือ cache ชื่อ DRG/error/warning ที่เคยโหลดไว้ใน `localStorage`
(รหัสซ้ำบ่อยในสายงาน) — ตัด request ซ้ำ

### 8. a11y ละเอียดขึ้น
- `chip-x` ลบ chip: มี `aria-label` แล้ว ดี ✓ แต่ควรเพิ่ม `type="button"` (มีแล้ว) — ผ่าน
- `.qchip` พบบ่อย: ควรเพิ่ม `aria-pressed` ว่าเพิ่มแล้ว (ตอนนี้ `added` เป็นแค่ opacity + pointer-events)
- คอนทราสต์ `.hint` สี `#7fa8a5` / `#607c82` บนเข้ม/สว่าง — ควรเช็ค WCAG AA จริง (คอมเมนต์บอก ≥4.5:1 แต่ควรตรวจด้วย tool)

### 9. Mobile bottom bar — ปุ่ม Reset เป็น icon-only
`#btnResetM` (line 744) เป็น icon-only มี `aria-label` แล้ว ✓ แต่บนจอแคบมาก ปุ่ม 3 ปุ่ม + label
"คำนวณ/เปรียบเทียบ" อาจแคบ — ใช้ flex จัดการได้แล้ว น่าจะ OK

---

## จุดแข็งที่ควรคงไว้ (strengths)

- **Design tokens สมบูรณ์** — `:root` มีสี/ฟอนต์/รัศมีครบ มีทั้ง dark และ light พร้อม palette ย่อย
- **a11y ดีมาก** — `role="radiogroup"`+ลูกศร, `combobox`+`aria-activedescendant`, `aria-live` ทุก status,
  `:focus-visible` ring, `prefers-reduced-motion`, keyboard nav (Enter/Esc/ลูกศร), touch target ≥44px,
  iOS `font-size:16px` กัน auto-zoom
- **Responsive ครบ** — grid 2 คอลัมน์ → 1, stats 5→3→2, mobile bottom bar + safe-area,
  ตารางเปรียบเทียบ scroll แนวนอน + ซ่อนคอลัมน์รองบนมือถือ
- **XSS ปลอดภัย** — `esc()` ใช้ทุกจุดที่ render ค่า user/API (verified: chip, autocomplete, result, history)
- **สถานะครบ** — loader ทึบ + button `.loading`, case-strip 4 สถานะ (ready/working/success/error),
  empty state, error state พร้อม friendly ภาษาไทย + hint geo/network, streaming progress + ETA + stop
- **UX การกรอกดี** — autocomplete debounce 300ms, paste หลายรหัสพร้อมกัน, กันรหัสซ้ำกับ PDx, quick chips + recent
- **Tag balance ผ่าน** — div 101/101, table/tr/td/th ครบ (verified)
- **Backup discipline** — มี `Index_v1.8_backup.html`, `Index_v2_od.html` เก็บ variant เก่าไว้

---

## ลำดับการแก้ที่แนะนำ

| ลำดับ | เรื่อง | ระดับ | ค่าคุ้ม/ความพยายาม |
|---|---|---|---|
| 1 | ธีม: เพิ่มสวิตช์ สว่าง/เข้ม/ระบบ + แก้ meta | 🔴 | สูง/ต่ำ (โค้ดเข้มมีแล้ว) |
| 2 | ประวัติบันทึกทั้งเคส | 🟡 | สูง/ปานกลาง |
| 3 | ยืนยันก่อนรันเปรียบเทียบยาว | 🟡 | กลาง/ต่ำ |
| 4 | Validate field ใน buildPayload | 🟡 | กลาง/ต่ำ |
| 5-9 | polish (D/C note, LOS fallback, cache libs, a11y) | 🟢 | ต่ำ/ต่ำ |

---

*ไฟล์นี้คือรายงานการตรวจสอบ UX/UI — **รายการทั้งหมดในลำดับแนะนำได้รับการแก้ไขแล้ว**
*รายละเอียดการแก้: ดู commit และโค้ดจริงใน `Index.html`*

---

## สรุปการแก้ไขที่ทำแล้ว (2026-08-28)

| # | เรื่อง | ระดับ | สถานะ |
|---|---|---|---|
| 1 | ธีม: เพิ่มสวิตช์ สว่าง/เข้ม + แก้ meta เป็น `light dark` + dark override block | 🔴 | ✅ ทำแล้ว |
| 2 | ประวัติบันทึกทั้งเคส (PDx+SDx+Proc) + โหลดกลับเต็มฟอร์ม | 🟡 | ✅ ทำแล้ว |
| 3 | ยืนยันก่อนรันเปรียบเทียบยาว (>60 scenario) | 🟡 | ✅ ทำแล้ว |
| 4 | field validation + clamp ใน `buildPayload`/`clampNum` | 🟡 | ✅ ทำแล้ว |
| 5 | D/C offline fallback + toast แจ้ง | 🟢 | ✅ ทำแล้ว |
| 6 | LOS fallback (คำนวณจาก los_day/los_hour) | 🟢 | ✅ ทำแล้ว |
| 7 | cache ชื่อ DRG/error/warning ใน localStorage | 🟢 | ✅ ทำแล้ว |
| 8 | qchip เพิ่ม `aria-pressed` | 🟢 | ✅ ทำแล้ว |

**การทดสอบ:** node --check ผ่าน, tag balance ครบ, Playwright headless + API จริง
ยืนยัน: ธีมสลับได้ + เก็บค่า, คำนวณจริงได้ผล DRG 01550, ประวัติโหลดเคสกลับครบ PDx/SDx/Proc,
clamp ค่า 999→120, D/C status โหลด 28 รายการ — ไม่มี page error
