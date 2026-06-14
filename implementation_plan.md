# Implementation Plan: Smart Booking Audit

เว็บแอปสำหรับทีมปฏิบัติการโรงแรมที่เปลี่ยนข้อมูล `hotels.json` และ `hotel_bookings.json` ให้เป็น **Smart Booking Audit**: ระบบช่วยตรวจ booking อัตโนมัติก่อนส่งต่อให้โรงแรมหรือลูกค้า เพื่อจับความผิดพลาด เช่น ราคาไม่ตรง วันที่ผิด โรงแรมหายจาก master data หรือ booking ที่ยังไม่ confirm

แนวคิดหลัก: จากข้อมูล booking ดิบ -> ระบบตรวจปัญหาให้เอง -> ops เห็นรายการที่ต้องแก้ก่อน -> คลิกดูหลักฐาน -> ได้ action ที่ควรทำวันนี้

เลือกทำเป็น **HTML5 + CSS3 + Vanilla JavaScript (ES Modules)** เพราะเหมาะกับโจทย์ static JSON, deploy ง่าย, โหลดเร็ว, คุม Lighthouse ได้ดี และยังเปิดพื้นที่ให้ใส่ product detail ที่เฉียบกว่าการเสียเวลาไปกับ framework setup

---

## Direction After Review

### Security & AI Policy

* จะไม่ฝัง Gemini API Key หรือ secret ใด ๆ ลงใน source code, README, demo config หรือ repository
* สำหรับ MVP แบบ static frontend จะใช้แนวทาง Bring Your Own Key:
  * ผู้ใช้กรอก API Key เองในหน้าเว็บ
  * เก็บใน `localStorage` เฉพาะ browser ของผู้ใช้
  * มีปุ่มล้าง API Key
  * ถ้าไม่กรอก key แอปยังใช้งาน dashboard, search, filter, detail และ mock insight ได้ครบ
* ถ้าต้องการซ่อน key จริงในการ deploy ให้เพิ่ม serverless API proxy:
  * เก็บ `CLAUDE_API_KEY` หรือ `GEMINI_API_KEY` ใน `.env` หรือ environment variables ของ Vercel/Netlify/Firebase
  * frontend เรียก `/api/ai-brief` แทนการเรียก Gemini โดยตรง
  * ห้าม expose key ผ่าน `VITE_`, `NEXT_PUBLIC_` หรือ config ที่ถูก bundle ไปฝั่ง browser
  * provider priority: ใช้ Claude ก่อนด้วย `claude-haiku-4-5-20251001`; ถ้าไม่มี Claude key ค่อยใช้ Gemini `gemini-2.0-flash`
* การใช้ AI ต้องประหยัด API:
  * ไม่เรียกอัตโนมัติทุกครั้งที่โหลดหน้า
  * เรียกเฉพาะเมื่อผู้ใช้กด `Generate AI Brief` หรือ `Analyze Spotlight`
  * ส่งเฉพาะ aggregate KPI + top alerts ไม่ส่ง JSON เต็มทั้งไฟล์
  * cache response ไว้จนกว่าข้อมูลหรือ filter สำคัญจะเปลี่ยน
  * จำกัด output เป็น executive summary 1 ย่อหน้า + action items 3-5 ข้อ
* Key ที่เคยถูกใส่ไว้ในแผนเดิมควรถูก revoke/regenerate ก่อนส่งงาน

### Tech Stack

* `index.html`: HTML5 semantic layout
* `style.css`: CSS3 responsive design, system font, accessible contrast
* `app.js`: ES Module entry point
* `src/data.js`: load JSON and build derived rows
* `src/metrics.js`: KPI and chart data calculation
* `src/audit.js`: Smart Booking Audit rules and `/ops/alerts` response builder
* `src/ai.js`: Gemini BYOK call, optional serverless proxy adapter, local fallback summary
* `src/ui.js`: render dashboard, filters, tables, detail drawer, AI brief
* No React/Vue build step for MVP
* No hard dependency on Chart.js; use DOM/SVG/CSS charts first

### Product Framing

ฟีเจอร์หลักที่ควรขายคือ **Smart Booking Audit / Operation Assistant / Issue Detector** ไม่ใช่ API เฉย ๆ เพราะ API เป็น infrastructure ส่วน value จริงคือระบบที่ช่วย ops จับปัญหา booking ได้ทันที

Product goal:

* ไม่ใช่แค่ dashboard สวย ๆ แต่เป็นระบบที่บอกว่า "วันนี้ ops ต้องแก้อะไร เพราะอะไร และควรเริ่มจากเคสไหน"
* ใช้ข้อมูลจริงจาก JSON ทั้งหมด เพื่อพิสูจน์ data handling และ insight
* ให้กรรมการเห็นครบทั้ง business value, UX, data logic, AI bonus และ technical quality ใน demo flow เดียว

สิ่งที่จะเน้นบนเวที:

1. ระบบตรวจ booking อัตโนมัติและแสดง alert ที่ ops ต้องแก้
2. คลิกดูรายละเอียด booking พร้อมสูตรคำนวณราคาและเหตุผลของ alert
3. เห็น KPI สนับสนุนการตัดสินใจ เช่น revenue, cancel rate, top/worst location, avg price
4. ใช้ AI ทำ Auto Executive Summary และ Anomaly Spotlight จาก KPI + alerts
5. API `/ops/alerts` เป็นตัวรองรับฟีเจอร์ audit ไม่ใช่พระเอกของ product

---

## Proposed Files

สร้างเว็บแอปแบบ Vanilla SPA ในโฟลเดอร์ `C:\BDI_HACKATON\hotel`

### [NEW] index.html

โครงสร้างหน้าเว็บและ accessibility foundation

* Header:
  * ชื่อระบบ: Smart Booking Audit
  * Theme toggle
  * Gemini API Key input แบบ password
  * Clear key button
* Main navigation:
  1. Dashboard
  2. Bookings & Alerts
  3. Hotels
  4. AI Brief
* Detail drawer/modal:
  * เปิดเมื่อคลิก booking หรือ hotel
  * แสดงข้อมูลเชิงลึกโดยไม่ต้อง reload หน้า
* Semantic HTML:
  * ใช้ `main`, `section`, `table`, `button`, `dialog`
  * ใส่ labels, focus states, aria attributes เฉพาะจุดที่จำเป็น

### [NEW] style.css

ดีไซน์ระบบที่เร็ว อ่านง่าย และเหมาะกับงาน ops

* Responsive layout สำหรับ desktop และ mobile
* ใช้ system font stack เป็นค่าเริ่มต้น เพื่อลด network dependency และช่วย Lighthouse
* โทนสี professional ops dashboard:
  * พื้นหลังสว่าง/มืดสลับได้
  * ใช้สีสถานะที่แยกชัด: confirmed, checked-in, checked-out, pending, cancelled
  * contrast ผ่าน accessibility
* ลด visual effect หนัก ๆ:
  * ไม่พึ่ง blur/glassmorphism เป็นแกนหลัก
  * animation ใช้เท่าที่จำเป็นและเคารพ `prefers-reduced-motion`
* ตารางและการ์ดมีขนาดคงที่พอสมควร ลด layout shift

### [NEW] app.js

ตรรกะหลักของแอป

#### Data Loader

* โหลด `hotels.json`
* โหลด `hotel_bookings.json`
* ข้อมูลทุกส่วนของแอปต้องมาจาก JSON สองไฟล์นี้เป็นหลัก ห้าม hardcode booking/hotel/alert ขึ้นมาเองเพื่อโชว์ demo
* ค่า mock ใช้ได้เฉพาะข้อความ fallback ของ AI หรือ sample response format เท่านั้น แต่ตัวเลข KPI และรายการ alert ต้อง derive จากข้อมูลจริง
* สร้าง index map:
  * `hotelById`
  * `bookingsByHotelId`
  * derived booking rows ที่ join hotel แล้ว
* ถ้าโหลด JSON ไม่สำเร็จ ให้แสดง empty/error state ที่อ่านง่าย ไม่สร้างข้อมูลปลอมแทน

#### Dashboard Metrics

คำนวณ KPI จากข้อมูลจริง:

* Total booking revenue
* Active revenue: `CONFIRMED` + `CHECKED_IN`
* Checked-out revenue
* Cancelled revenue
* Pending booking count และ pending amount
* Average hotel rating
* Average nightly price
* Top revenue hotels
* Revenue by month
* Booking status distribution
* Revenue by location

#### Chart Renderer

ใช้ chart แบบ lightweight:

* ตัวเลือกแรก: วาดด้วย DOM/CSS/SVG เองสำหรับ bar chart และ status distribution เพื่อลด dependency
* ถ้าใช้ Chart.js ให้โหลดแบบ local หรือ CDN fallback และตรวจ Lighthouse อีกครั้ง

กราฟขั้นต่ำ:

* Revenue by month
* Booking status distribution
* Top locations by revenue

#### Bookings & Alerts

ตารางรายการ booking ที่ค้นหาและกรองได้ครบ requirement และเป็นหัวใจของ Smart Booking Audit

Search:

* booking id
* hotel name
* hotel location
* user id
* status

Filters:

* status
* location
* date range
* anomaly/alert type
* minimum total price

Sort:

* check-in date
* total price
* alert severity
* hotel rating

Alert rules:

1. **Price Mismatch**
   * คำนวณ `nights = check_out - check_in`
   * `expected = nights * price_per_night`
   * เทียบกับ `total_price`
   * ถ้าต่างกันให้แสดง expected, actual, diff
   * จากข้อมูลจริงคาดว่ามีเคสเด่น เช่น `bk-h-012`

2. **Invalid Dates**
   * `check_out <= check_in`
   * วันที่ parse ไม่ได้
   * เป็น data quality guardrail ถึงแม้ข้อมูลชุดปัจจุบันอาจไม่มีเคสนี้

3. **Missing Hotel ID**
   * `hotel_id` ใน booking ไม่มีใน `hotels.json`
   * เป็น master-data consistency check ถึงแม้ข้อมูลชุดปัจจุบัน join ได้ครบ

4. **Unconfirmed / Stale Pending**
   * booking ที่ยัง `PENDING` แต่วัน check-in ผ่านไปแล้วหรือใกล้ถึง
   * ใช้วันที่ reference เป็นวันที่ปัจจุบันของ runtime
   * ถ้า check-in ผ่านไปแล้วให้ label เป็น "Past-due pending"
   * ถ้ายังไม่ถึงวันแต่เหลือไม่เกิน 7 วันให้ label เป็น "Upcoming unconfirmed"

5. **Cancellation Impact**
   * booking ที่ `CANCELLED`
   * รวม cancelled revenue เพื่อให้เห็นมูลค่าที่หายไป
   * ใช้เป็น operational follow-up ไม่ใช่ data error

6. **High Value Booking**
   * booking มูลค่าสูงกว่าค่าเฉลี่ยมาก
   * ช่วยให้ทีม ops prioritize งาน VIP/high value

7. **Hotel / Location Performance Watch**
   * โรงแรมหรือ location ที่ cancel rate สูงผิดปกติเมื่อเทียบกับภาพรวม
   * location ที่ revenue drop หรือมี pending/cancelled amount สูง
   * ใช้เป็น input ให้ Anomaly Spotlight

Severity:

* Critical: price mismatch, invalid dates, missing hotel id, past-due pending
* Warning: cancelled high-value booking, pending amount high
* Info: performance watch, high-value booking, upcoming unconfirmed

#### Detail View

เมื่อคลิก booking ให้เปิด drawer/modal แสดง:

* Booking id, user id, status
* Hotel name, location, rating, amenities
* Check-in, check-out, nights, guests
* Total price
* Expected price calculation
* Alert reason และ severity
* Suggested operation action เช่น "contact guest", "verify rate plan", "release inventory", "review cancellation reason"

เมื่อคลิก hotel ให้เปิด:

* Hotel profile
* Booking count
* Revenue
* Status mix
* Average booking value
* Related bookings

#### Hotels View

Card/table สำหรับโรงแรม:

* Search hotel name/location/amenity
* Filter location, rating range, price range, amenity
* Sort rating, price, revenue, booking count
* คลิกเพื่อเปิด hotel detail

#### AI Brief

AI เป็น bonus feature ที่ต่อยอดจาก Smart Booking Audit ไม่ใช่ dependency หลักของแอป

AI input ต้องสร้างจากข้อมูลจริงที่คำนวณจาก `hotels.json` และ `hotel_bookings.json` เท่านั้น:

* aggregate KPI จาก Dashboard Metrics
* alert summary จาก Smart Booking Audit rules
* top/worst hotel หรือ location จาก derived rows
* ห้ามส่ง prompt ที่แต่งสถานการณ์หรือ booking id ที่ไม่มีอยู่ใน JSON

Features:

1. **Auto Executive Summary**
   * Input:
     * total revenue
     * active revenue
     * cancel rate
     * cancelled revenue
     * pending amount
     * top/worst location
     * average price
     * average rating
   * Output:
     * paragraph insight ภาษาไทย
     * action items 3-5 ข้อ
     * priority ของงานวันนี้
   * API behavior:
     * user กด `Generate Executive Summary`
     * JS สร้าง compact payload จาก metrics
     * เรียก Gemini หรือ `/api/ai-brief`
     * render response ในหน้า AI Brief
     * ถ้า error ให้แสดง local fallback

2. **Anomaly Spotlight**
   * JS คำนวณ alerts ก่อน แล้วส่งเฉพาะ summary + top anomaly ให้ AI
   * Input:
     * price mismatch
     * invalid dates
     * missing hotel id
     * unconfirmed/past-due pending
     * high cancellation impact
     * location/hotel performance watch
   * Output:
     * อธิบายว่า anomaly นี้สำคัญอย่างไร
     * สาเหตุที่เป็นไปได้
     * next action สำหรับทีม ops
     * ข้อความสั้นสำหรับใช้แจ้ง manager
   * API behavior:
     * user เลือก alert หรือกด `Analyze Top Alert`
     * ส่งเฉพาะ alert ที่เลือก + context โรงแรม/booking ที่เกี่ยวข้อง
     * ไม่ส่งข้อมูลลูกค้าหรือ secret
     * จำกัดคำตอบให้สั้นและ action-oriented

Gemini BYOK direct call สำหรับ static MVP:

```js
async function callGeminiWithUserKey(apiKey, payload) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: buildBriefPrompt(payload)
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 700
        }
      })
    }
  );

  if (!res.ok) throw new Error("Gemini request failed");
  return res.json();
}
```

Optional serverless proxy ถ้ามีเวลา:

```js
async function callAiProxy(payload) {
  const res = await fetch("/api/ai-brief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error("AI proxy failed");
  return res.json();
}
```

Fallback:

* ถ้าไม่มี API key ให้แสดง local generated summary จากข้อมูลเดียวกัน
* ปุ่ม AI disabled พร้อมข้อความสั้น ๆ ว่า "ใส่ API Key เพื่อใช้ Gemini"

#### API JSON Export

API เป็น infrastructure รองรับ Smart Booking Audit ไม่ใช่ฟีเจอร์ขายหลัก จึงทำเป็น panel/action ในหน้า Bookings & Alerts

* ปุ่ม Copy alerts JSON
* ปุ่ม Download `ops-alerts.json`
* แสดงตัวอย่าง mock endpoint `GET /ops/alerts`
* response ต้องสะท้อนปัญหาที่ระบบตรวจเจอจริง:

```json
{
  "endpoint": "GET /ops/alerts",
  "generated_at": "2026-06-14T00:00:00.000Z",
  "summary": {
    "total_alerts": 0,
    "critical": 0,
    "warning": 0,
    "info": 0
  },
  "alerts": [
    {
      "booking_id": "bk-h-012",
      "type": "PRICE_MISMATCH",
      "severity": "CRITICAL",
      "expected_price": 1200,
      "actual_price": 2400,
      "diff": 1200,
      "action": "Verify rate plan before confirming with guest"
    }
  ]
}
```

---

## Requirement Mapping

| README Requirement | Implementation |
| --- | --- |
| Dashboard / Overview | KPI cards, revenue/status/location charts |
| Chart at least 1 point | Revenue by month, status distribution, location revenue |
| List & Search | Bookings & Alerts table, Hotels view |
| Filter | status, location, date range, alert type, price, rating, amenities |
| Detail Page | booking detail drawer and hotel detail drawer |
| Responsive Design | CSS grid/flex responsive layout |
| Performance >= 90 | vanilla app, system fonts, minimal dependency, local data |
| Accessibility >= 90 | semantic HTML, labels, focus states, contrast |
| Bonus AI | optional Gemini executive summary and ops action plan |
| Bonus Deep Insight | revenue trend, cancellation impact, performance watch |

---

## Demo Flow

1. เปิด Dashboard
   * โชว์ total revenue, active revenue, pending amount, cancelled revenue
   * ชี้กราฟ revenue by month และ status distribution
2. เข้า Bookings & Alerts
   * filter เฉพาะ Critical/Warning
   * เปิด price mismatch หรือ stale pending
3. เปิด Detail Drawer
   * โชว์ expected price calculation และ suggested action
4. เข้า Hotels
   * ค้นหาเมืองหรือ amenity
   * sort ตาม revenue หรือ rating
5. เข้า AI Brief
   * กรอก API key เฉพาะตอน demo ถ้าต้องใช้ Gemini
   * กด Generate เพื่อได้ executive summary
   * ถ้าไม่มี key ใช้ local summary เพื่อไม่ให้ demo พัง
6. ปิดท้ายด้วย Copy alerts JSON
   * แสดงว่า logic นี้ต่อยอดเป็น endpoint จริงได้

---

## Verification Plan

### Data Correctness

* ตรวจว่าโหลด `hotels.json` และ `hotel_bookings.json` สำเร็จ
* ตรวจว่า booking ทุกตัว join กับ hotel ผ่าน `hotel_id` ได้
* ตรวจว่าไม่มี hardcoded demo booking, hotel, KPI หรือ alert ใน `app.js`
* ตรวจว่า AI prompt ใช้ payload ที่ derive จาก JSON จริง ไม่ใช่ข้อความมโน
* ตรวจ KPI:
  * booking count = 50
  * hotel count = 50
  * total revenue = 389250
  * status distribution ตรงกับข้อมูลจริง
* ตรวจ price mismatch rule ด้วยเคส `bk-h-012`
* ตรวจ pending/cancelled/high-value alert ด้วยข้อมูลจริง

### UX Requirements

* Search booking id/hotel/user/status แล้วผลลัพธ์เปลี่ยนถูกต้อง
* Filter status/location/date/alert type ทำงานร่วมกันได้
* คลิก booking แล้ว detail drawer เปิดและแสดง calculation
* คลิก hotel แล้วเห็น related bookings
* Mobile viewport ยังใช้งาน search/filter/table/detail ได้

### AI & Security

* Source code ไม่มี API key hardcoded
* AI ใช้งานได้เมื่อกรอก key
* ไม่มี key แล้วแอปยังใช้งาน core features ได้
* Clear key ลบค่าออกจาก `localStorage`
* ไม่ log key ลง console

### Performance & Accessibility

* รัน Lighthouse บน local build/demo
* เป้าหมาย:
  * Performance >= 90
  * Accessibility >= 90
* ตรวจ keyboard navigation
* ตรวจ color contrast
* ตรวจว่า chart/table มี text summary สำหรับ screen reader หรือ fallback text

---

## Delivery Checklist

* Source code พร้อม push ขึ้น GitHub โดยไม่มี secret
* Live demo บน Vercel/Netlify/Firebase Hosting
* README สำหรับส่งงาน:
  * project idea
  * features
  * how to run
  * data source
  * AI usage และ BYOK policy
  * known limitations
* Video presentation 3-5 นาที:
  * pain point
  * dashboard
  * alerts/detail
  * AI brief
  * business impact

---

## Scope Control

### Build Priority

ลำดับนี้ใช้เพื่อกันหลุด requirement แต่ไม่ได้ลดคุณภาพของ product vision:

1. Data foundation: load JSON, join rows, validate schema, derive metrics
2. Audit engine: issue rules, severity, recommended action, `/ops/alerts` response
3. Core UX: Dashboard, Bookings & Alerts, Detail Drawer, Hotels view
4. Search/filter/sort: ทำให้ใช้งานจริง ไม่ใช่แค่โชว์ข้อมูล
5. AI bonus: Auto Executive Summary และ Anomaly Spotlight จาก payload ที่คำนวณแล้ว
6. Visual polish: responsive, status colors, empty/error states, accessible interactions
7. Delivery polish: Lighthouse, README, live demo, video script

Must-have:

* Dashboard KPI + charts
* Booking search/filter
* Booking detail drawer
* Hotel list/detail
* Alert engine
* Copy alerts JSON
* Responsive/accessibility baseline

Should-have:

* AI executive summary
* AI anomaly spotlight
* `/ops/alerts` JSON export
* Theme toggle

Nice-to-have:

* Download JSON
* PWA/offline
* More advanced forecasting

ถ้าต้องตัดจริง ให้ตัด PWA, animation, advanced forecasting ก่อน แต่ห้ามตัด search/filter/detail/audit engine เพราะเป็นแกนหลักของโจทย์และ product story
