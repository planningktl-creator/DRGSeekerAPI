# KTL CMI DRG Seeker

> เครื่องมือคำนวณ DRG (Diagnosis Related Groups) ออนไลน์ — รพ.กันทรลักษ์
> ใช้ **Grouper ทางการ CMI@MoPH (TGrp6305 v6.3.5 / TDRG 6.3.4)** ผ่าน API สาธารณะ `had-api.moph.go.th`

Web App บน **Google Apps Script (GAS)** สำหรับบุคลากรทางการแพทย์คำนวณ DRG รายเคสออนไลน์
โดยเรียก Grouper ทางการของกระทรวงสาธารณสุข ไม่ต้องมีเซิร์ฟเวอร์ส่วนตัว โฮสต์ฟรีบน Google
และเข้าถึงได้จากทุกที่ผ่านลิงก์

- **ภาษา UI**: ไทย
- **ธีม**: dark teal/cyan + amber (แบรนด์ รพ.กันทรลักษ์)
- **ผู้พัฒนา**: งานยุทธศาสตร์ รพ.กันทรลักษ์ (10929)

---

## ✨ ฟีเจอร์

- **คำนวณ DRG รายเคส** — กรอก PDx / SDx (สูงสุด 12) / หัตถการ / อายุ / น้ำหนัก / LOS / อัตราฐาน
- **ผลลัพธ์ครบถ้วน** — DRG, MDC, RW, ADJRW, WTLOS, OT, Error/Warning (เทียบกับ bridge ท้องถิ่น 1:1)
- **ค้นหา ICD-10 / ICD-9-CM** — อัตโนมัติจาก API libs พร้อมคำอธิบาย WHO
- **ชื่อ DRG / Error / Warning** — ใช้ `/libs/drg-name`, `/libs/drg-error`, `/libs/drg-warning`
- **ทดสอบหลายชุด SDx** — ถ้า SDx เกิน 12 ตัว จะทดสอบทุกชุดเพื่อดู RW ทุกรูปแบบ
- **ประวัติการคำนวณ** — เก็บใน `localStorage`
- **การ์ดลัด (Quick)** — ชุดค่าตัวอย่างกดใช้เร็ว
- **Proxy fallback** — ถ้า client fetch ติด CORS/geo จะส่งผ่าน GAS server (`UrlFetchApp`)

---

## 🏗️ สถาปัตยกรรม

```
เบราว์เซอร์ผู้ใช้ (Index.html)
   │  fetch (หลัก)  ────────────►  https://had-api.moph.go.th/cmi
   │  fallback: google.script.run.proxyCalc/proxyLib  ──►  GAS server (Code.js)
   │                                                  │        │
   └──────────────────────────────────────────────────┴────────┘
                              UrlFetchApp
```

- **ฝั่ง client**: `Index.html` เรียก API CMI@MoPH โดยตรง (CORS เปิด `*`)
- **ฝั่ง server (fallback)**: `Code.js` → `doGet()` + `proxyCalc()` / `proxyLib()` ผ่าน `UrlFetchApp`
- API จำกัดเฉพาะ **IP ไทย** (IP ต่างประเทศได้ 404)

### โครงสร้างไฟล์

```
gas-app/
├── appsscript.json        # manifest (V8, executeAs=USER_DEPLOYING, access=ANYONE_ANONYMOUS)
├── Code.js                # backend: doGet + proxy ผ่าน UrlFetchApp
├── Index.html             # frontend หลัก (v2.0) — SPA ธีม dark
├── Index_v1.8_backup.html # backup เวอร์ชันเก่า
└── Index_v2_od.html       # backup เวอร์ชัน 2 (variant)
```

---

## 🔌 API ที่ใช้ (CMI@MoPH)

| Method | Path | ใช้ทำ |
|---|---|---|
| POST | `/drg/calculate` | คำนวณ DRG (หัวใจของระบบ) |
| GET | `/libs/icd10/{code}` | ข้อมูล ICD-10 + คำอธิบาย WHO |
| GET | `/libs/icd-cm/{code}` | ชื่อหัตถการ ICD-9-CM |
| GET | `/libs/drg-name/{drg}` | ตาราง DRG (rw0d, rw, wtlos, ot, mdf, drgname) |
| GET | `/libs/drg-error/{code}` | คำอธิบาย error code |
| GET | `/libs/drg-warning/{code}` | คำอธิบาย warning code (ภาษาไทย) |
| GET | `/libs/ipd-result` | รายการสถานะจำหน่าย 29 รายการ |

> เอกสารอ้างอิงฉบับเต็ม: `CMI_MOPH_DRG_API_Reference.md` (โฟลเดอร์ parent)

---

## 🚀 Deploy

ใช้ **clasp** (จาก WSL ให้รันผ่าน `cmd.exe` — Windows clasp เท่านั้นที่ใช้ได้, WSL Node HTTPS ไป Google จะพัง)

```bash
cd gas-app
# login ครั้งแรก
clasp login

# push ขึ้น Google Apps Script
clasp push -f

# deploy เป็น Web App (ครั้งแรก)
clasp deploy

# แก้ Index.html แล้ว push ทับ
clasp push -f
```

**Script ID**: `14OkFJvkNKVd9THChmSfK355aDsypEBWl7hIIAMQhm4TKVopAm7UkBhkT`

> ⚠️ Manifest: `access: ANYONE_ANONYMOUS` + `executeAs: USER_DEPLOYING` เป็นแบบตั้งใจ
> (เป็นเว็บสาธารณะ) อย่าเปลี่ยนเป็น DOMAIN/MYSELF

---

## 🛠️ หมายเหตุทางเทคนิค

- **manifest enum**: `executeAs`/`access` ใช้ตัวพิมพ์ใหญ่ (เช่น `ANYONE_ANONYMOUS`) ไม่งั้น deploy พัง
- **`.claspignore`**: กันไฟล์ที่ไม่ใช่ GAS ถูก push ขึ้น (เช่น README, `.git/*`)
- **`Code.gs` vs `code.gs`**: บน drvfs (`/mnt/c/...`) ตัวพิมพ์ใหญ่/เล็กเป็นไฟล์เดียวกัน ระวังอย่า `rm` ตัวอื่น
- **API เร็ว ~1.4 วินาที/เคส** (รัน EXE บนเซิร์ฟเวอร์เขา)

---

## 📄 License

MIT License — ดูไฟล์ [LICENSE](LICENSE)
