# KTL CMI DRG Seeker — Deployment / UX / Runtime Audit

> วันที่ตรวจ: 2026-08-31 · ขอบเขต: raw-static deployment, `web/index.html`, `web/assets/app.js`, CI และ browser regression suite
> สถานะ: แก้ไขตาม audit แล้วใน working tree นี้; ต้อง push และตั้งค่า provider ตาม deployment contract ก่อนใช้งานจริง

## สรุปผล

สาเหตุของ SPA build ที่แจ้งว่าไม่พบ `package.json` และ `index.html` ไม่ใช่การขาด entrypoint ในแอปปัจจุบัน แต่เป็น source tree ที่ builder clone ไม่ตรงกับ repository source of truth:

- repository ที่ถูกต้องคือ `https://github.com/planningktl-creator/DRGSeekerAPI.git`
- branch ที่ถูกต้องคือ `main`
- commit ที่ตรวจสอบคือ `a42769507c71bb7e92c7af9d4c53315f6bbbcb8d`
- root มี `index.html` เป็น redirect ไป `web/`; application source อยู่ใน `web/`
- ไม่มี root `package.json` โดยตั้งใจ เพราะ deploy แบบ raw static
- `origin` ใน local Git ถูกแก้จาก `DRGSeeker.git` เป็น `DRGSeekerAPI.git`

รายการจาก failed build ที่มี `proxy/` แต่ไม่มี root `index.html` จึงไม่ใช่ tree ของ `DRGSeekerAPI/main` ที่ตรวจสอบข้างต้น ต้องแก้ source/branch/cache ของ provider และทำ fresh clone

| ระดับ | ประเด็น | ผลการแก้ |
|---|---|---|
| P0 | clone ผิด repository/branch/commit | เพิ่ม contract ใน README/CI และแก้ local remote แล้ว |
| P0 | builder หา root entrypoint ไม่พบ | คง root redirect และเพิ่ม static preflight |
| P1 | input ถูก clamp/truncate เงียบ ๆ | validation ก่อนสร้าง payload; block เมื่อเกินช่วง/limit |
| P1 | response/API output ไม่ถูกตรวจและ OT เสี่ยง injection | parse response contract และ escape dynamic output ทุกจุด |
| P1 | autocomplete/metadata มี stale response | เพิ่ม sequence และ calculation generation guard |
| P1 | permute อาจค้าง BUSY เมื่อ throw | ครอบ lifecycle ด้วย `try/catch/finally` |
| P1 | history เก็บข้อมูลสุขภาพอัตโนมัติ | default memory-only; localStorage ต้อง opt-in |
| P2 | CI/docs ไม่สื่อ dual deployment | เพิ่ม preflight, E2E workflow และ provider documentation |

## Deployment contract

### SPA Builder

ตั้ง provider ให้:

1. clone `https://github.com/planningktl-creator/DRGSeekerAPI.git` แบบ fresh
2. ใช้ branch `main` และตรวจว่าเห็น commit `a42769507c71bb7e92c7af9d4c53315f6bbbcb8d` หรือใหม่กว่า
3. publish repository root (`.`) แบบ recursive
4. เลือก raw static/no npm build
5. ใช้ root `index.html` เป็น entrypoint

root entrypoint redirect ไป `/web/` และ relative asset path จะโหลดจาก `web/assets/` หลัง redirect สำเร็จ ห้ามแก้ด้วยการเพิ่ม root `package.json` หรือ duplicate application ไป root เพราะจะเปลี่ยน contract ของ repository

### GitHub Pages

`.github/workflows/deploy-pages.yml` upload `web/` เป็น Pages artifact ดังนั้น document root ของ Pages คือ:

`https://planningktl-creator.github.io/DRGSeekerAPI/`

บน Pages URL นี้จะโหลด `web/index.html` และ asset เป็น `/assets/...`; `/DRGSeekerAPI/web/` ตอบ 404 ได้ตามปกติ ไม่ใช่ URL ที่ต้องใช้ตรวจ Pages

### Static preflight

`node scripts/check-static.mjs` ตรวจ:

- root `index.html` มี redirect/link ไป `web/`
- `web/index.html` และ `web/.nojekyll` มีอยู่จริง
- asset ที่อ้างจาก `web/index.html` มีอยู่จริง รวม `assets/app.js` และ `assets/styles.css`
- ไม่มี root `package.json` ที่จะทำให้ raw-static builder เปลี่ยนไปใช้ npm build

## Runtime hardening

### Wire contract

ยังคง contract เดิมทั้งหมด:

- `POST https://had-api.moph.go.th/cmi/drg/calculate`
- `GET /libs/*` สำหรับ metadata/autocomplete
- payload `version: "6"` และ `data[0]`
- POST case data ไม่ผ่าน public CORS proxy; fallback จำกัดเฉพาะ GET `/libs/*`

ฟังก์ชันภายในที่ใช้เป็น boundary ใหม่:

- `validateCaseInput(mode)` คืน `{ ok, errors, value }`
- `buildPayload(value)` สร้าง payload หลัง validation และตรวจซ้ำ
- `parseCalcResponse(response)` บังคับ API status 200, array `data` และ `data[0].drg`

### Validation limits

- HCode ต้องเป็นตัวเลข 5 หลัก
- PDx ต้องไม่ว่างหลัง normalizer
- อายุ 0–120 ปี และอายุวัน 0–364 เป็นจำนวนเต็ม
- น้ำหนัก 0–300 เป็น finite number
- LOS วัน 0–9999 และ LOS ชั่วโมง 0–23 เป็นจำนวนเต็ม
- Base Rate 0–10,000,000 เป็น finite number
- normal calculation: SDx ไม่เกิน 12 และ Proc ไม่เกิน 20
- comparison: candidate รวม PDx/SDx ไม่เกิน 30; ทุก request ที่สร้างยังมี SDx ไม่เกิน 12

ไม่มีการ clamp หรือ slice รายการเพื่อซ่อน input ที่ผิด; ผู้ใช้จะเห็น error รายฟิลด์และต้องแก้ก่อนส่ง

### Output safety and async state

ค่าจาก API ที่อยู่ใน `innerHTML` ใช้ `esc()` รวม `r.ot` ในผลปกติ, `r.ot` ในตาราง comparison และ `baselineRes.ot` ส่วนค่าที่ควรเป็นข้อความใช้ `textContent` และ URL metadata encode ด้วย `encodeURIComponent`

ICD autocomplete มี sequence guard ต่อ query และ procedure autocomplete ตรวจทั้ง sequence, input node, focus และ query ล่าสุด จึงไม่ให้ response เก่าเขียนทับรายการใหม่

ผลชื่อ DRG/error/warning ผูกกับ `calculationGeneration`; callback ของ calculation เก่าจะไม่แก้ DOM ของผลลัพธ์ปัจจุบัน

permute ตรวจ response ทุก request, เก็บ error ต่อ scenario และคืน loader/button/BUSY ใน `finally` แม้ baseline, request หรือ render จะ throw

## Privacy ของ history

- default: history และ recent codes อยู่ใน memory ของ tab เท่านั้น
- ไม่มี auto-restore หลัง reload เมื่อไม่ได้ opt-in
- checkbox “จำประวัติบนเครื่องนี้” ต้องเปิดก่อนจึงจะ persist ลง `ktl_drg_hist`/`ktl_drg_recent`
- legacy health storage ที่ไม่มี opt-in flag ถูก purge และไม่ถูกโหลดกลับ
- opt-out ล้าง memory และ keys ของเคสทั้งสองรายการ
- theme และ dictionary cache `ktl_lib_*` ไม่ถูกล้าง เพราะไม่ใช่ case history
- UI เตือนชัดเจนว่า localStorage เป็นข้อมูลสุขภาพบนเครื่องนี้ และไม่ควรเปิดบนเครื่องสาธารณะ

## CI / test coverage

root ยังคงไม่มี `package.json`; Playwright อยู่ใน `tests/package.json` แยกจาก application root และ workflow `.github/workflows/web-e2e.yml` ใช้ synthetic/mock payload เท่านั้น

Regression suite ครอบคลุม:

- static discovery, root redirect, `/web/`, asset loading และ mobile 375px overflow
- version 6 mock calculation และ response contract
- HCode/numeric validation, SDx/Proc limits และ comparison cap 30
- ห้าม POST ผ่าน proxy
- history default-off, opt-in, restore, clear และ legacy purge
- malicious `OT` output ใน normal/comparison result
- stale ICD autocomplete และ stale DRG metadata
- permute baseline failure, stop และ BUSY/loader/button recovery

คำสั่งตรวจ local:

```bash
node scripts/check-static.mjs
node --check web/assets/app.js
cd tests
npm ci
npx playwright install chromium
npm test
```

## Production acceptance checklist

- [ ] provider clone `DRGSeekerAPI/main` แบบ fresh และพบ root `index.html`
- [ ] SPA Builder publish root recursive และ redirect ไป `/web/` สำเร็จ
- [ ] `/web/assets/app.js` และ `/web/assets/styles.css` ตอบ 200 หลัง redirect
- [ ] Pages ใช้ URL root ของ Pages ไม่ใช่ `/web/`
- [ ] browser ไม่มี console/page error
- [ ] จากเครือข่ายไทย GET metadata และ synthetic POST ไป CMI API สำเร็จ
- [ ] หาก provider inject CSP ต้องอนุญาต `connect-src` ไป `https://had-api.moph.go.th` และ GET proxy ที่จำเป็น
- [ ] CI/test ไม่ใช้ข้อมูลผู้ป่วยจริง
