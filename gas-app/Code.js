/**
 * KTL CMI DRG Seeker — GAS Web App
 * ใช้ API ทางการ CMI@MoPH (had-api.moph.go.th/cmi)
 * หน้าเว็บ: เรียก API จากฝั่ง client (browser ผู้ใช้) เป็นหลัก
 * fallback: proxy ผ่าน GAS server (UrlFetchApp) ถ้า client fetch ไม่สำเร็จ
 */

const CMI_API = 'https://had-api.moph.go.th/cmi';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('KTL CMI DRG Seeker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Proxy คำนวณ DRG ผ่าน server (fallback เมื่อ client fetch ติดปัญหา เช่น CORS/geo)
 * @param {Object} payload  body เดียวกับ POST /drg/calculate
 * @returns {{code:number, body:string}}
 */
function proxyCalc(payload) {
  try {
    const res = UrlFetchApp.fetch(CMI_API + '/drg/calculate', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      timeout: 30
    });
    return { code: res.getResponseCode(), body: res.getContentText() };
  } catch (e) {
    return { code: 0, body: JSON.stringify({ status: 0, error: String(e) }) };
  }
}

/**
 * Proxy libs endpoint (fallback เดียวกัน)
 * @param {string} path  เช่น libs/icd10/I639
 */
function proxyLib(path) {
  try {
    const res = UrlFetchApp.fetch(CMI_API + '/' + path, {
      method: 'get',
      muteHttpExceptions: true,
      timeout: 20
    });
    return { code: res.getResponseCode(), body: res.getContentText() };
  } catch (e) {
    return { code: 0, body: JSON.stringify({ status: 0, error: String(e) }) };
  }
}
