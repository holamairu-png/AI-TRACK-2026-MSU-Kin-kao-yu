# Smart Booking Audit

**Project:** AI-TRACK-2026-MSU-Kin-kao-yu  
**Team:** Kin-kao-yu

Smart Booking Audit คือ Mini App สำหรับทีม Hotel Operations ที่ช่วยตรวจสอบรายการจองโรงแรมจากข้อมูล JSON จริง แสดง KPI สำคัญ ค้นหาและกรองรายการจอง ตรวจจับความผิดปกติ และใช้ AI ช่วยสรุปงานที่ควรจัดการก่อนในแต่ละวัน

## Live Demo

- Web App: https://ai-track-2026-msu-kin-kao-yu.vercel.app/
- Source Code: https://github.com/holamairu-png/AI-TRACK-2026-MSU-Kin-kao-yu

## Product Idea

ระบบนี้ไม่ได้เป็นเพียง dashboard สำหรับดูข้อมูล แต่เป็น Operation Assistant ที่ช่วยทีมงานจับปัญหาการจองก่อนส่งต่อให้โรงแรมหรือลูกค้า เช่น:

- ราคารวมไม่ตรงกับราคาต่อคืนของโรงแรม
- รายการจองสถานะ `PENDING` แต่เลยวัน check-in แล้ว
- วันที่ check-out มาก่อนหรือเท่ากับ check-in
- `hotel_id` ไม่มีในข้อมูลโรงแรม
- รายการจองมูลค่าสูงที่ควรตรวจสอบก่อน โดยระบบคำนวณจาก threshold = ค่าสูงสุดระหว่าง `ค่าเฉลี่ยมูลค่าการจอง x 1.4` และ `15,000 THB`
- จังหวัดหรือโรงแรมที่มี cancellation risk สูง

## Main Features

### 1. Dashboard / Overview

- แสดง KPI สำคัญจากข้อมูล JSON จริง
- แสดงกราฟรายได้รายเดือน
- แสดงสัดส่วนสถานะการจอง
- แสดง market heatmap / top revenue locations
- แสดง top operational issue ที่ควรจัดการก่อน

### 2. List + Filter/Search

- ตารางรายการจองพร้อมข้อมูลโรงแรมและ alert
- ค้นหาจาก booking, hotel, location, user, status
- กรองตาม status, alert type, location, date range, minimum total
- เรียงตาม severity, check-in date, total price, hotel rating
- หน้ารายชื่อโรงแรมพร้อม filter ตาม location, rating, nightly price, amenities

### 3. Detail Page

- เปิดรายละเอียด booking แต่ละรายการได้
- แสดงข้อมูลการจอง โรงแรม ผู้จอง และการคำนวณราคา
- แสดง alert และ recommended action สำหรับเคสนั้น
- เปิดรายละเอียดโรงแรมและดูรายการจองที่เกี่ยวข้องได้

### 4. Performance & Accessibility

- Responsive รองรับ desktop และ mobile
- ใช้ semantic HTML เช่น `section`, `article`, `nav`, `dialog`
- มี `aria-label`, `aria-live`, skip link และ keyboard-friendly controls
- ปรับ layout stability เพื่อลด Cumulative Layout Shift
- ใช้ local/serverless API proxy เพื่อไม่เปิดเผย API key บน frontend

## Bonus Features

### AI Integration: AI Insights

ระบบมีหน้า AI Insights สำหรับช่วยทีม operation สรุปสถานการณ์จาก KPI และ alerts ที่คำนวณจาก JSON แล้ว โดยเรียกผ่าน proxy endpoint:

```text
/api/ai-insights
```

AI ไม่ได้รับ raw dataset ทั้งหมด แต่ได้รับเฉพาะ compact payload ที่ระบบคำนวณไว้แล้ว เช่น total revenue, active revenue, cancel rate, pending amount, top locations, top hotels และ top alerts

ฟีเจอร์ AI หลัก:

- Auto Executive Summary: สรุปภาพรวมผู้บริหารเป็นภาษาไทย
- Anomaly Spotlight: วิเคราะห์ alert สำคัญที่สุดและแนะนำ next action
- Local fallback: ถ้า API ไม่พร้อม เว็บยังแสดงผลสรุปจาก logic ใน browser ได้
- Response cache: เก็บผล AI ใน `localStorage` เพื่อลดการยิง API ซ้ำตอน demo

### Deep Insight / Smart Booking Audit

ระบบมี audit engine ที่คำนวณและตรวจจับปัญหาอัตโนมัติจากข้อมูลจริง เช่น:

- `PRICE_MISMATCH`
- `PAST_DUE_PENDING`
- `UPCOMING_UNCONFIRMED`
- `INVALID_DATES`
- `MISSING_HOTEL_ID`
- `HIGH_VALUE_BOOKING`
- `LOCATION_CANCEL_WATCH`
- `HOTEL_PERFORMANCE_WATCH`

เกณฑ์ `HIGH_VALUE_BOOKING` ใช้เพื่อแยกรายการจองที่มีผลกระทบต่อรายได้สูงกว่าปกติ หากข้อมูลผิด สถานะไม่ชัดเจน หรือบริการไม่พร้อม จะสร้างความเสียหายมากกว่า booking ทั่วไป ระบบจึงตั้ง threshold แบบ dynamic จากข้อมูลจริง:

```text
highValueThreshold = max(averageBookingValue * 1.4, 15000)
```

หมายความว่า booking จะถูกจัดเป็นมูลค่าสูงเมื่อยอดรวมสูงกว่าเกณฑ์เชิงสถิติจากค่าเฉลี่ย หรือสูงกว่า minimum floor ที่ทีม operation กำหนดไว้ แล้วแต่ว่าเกณฑ์ใดสูงกว่า

ตัวอย่าง: หากค่าเฉลี่ยมูลค่าการจองเท่ากับ `7,785 THB`

```text
averageBookingValue * 1.4 = 10,899 THB
max(10,899, 15,000) = 15,000 THB
```

ในกรณีนี้ `10,899 THB` คือ threshold ขั้นต่ำที่คำนวณจากสถิติของ dataset จริง แต่ระบบเลือกใช้ `15,000 THB` แทน เพราะต้องการให้ alert ประเภท high-value โฟกัสเฉพาะรายการที่มีผลกระทบต่อรายได้มากพอสำหรับทีม operation ไม่เช่นนั้น booking ที่สูงกว่าค่าเฉลี่ยเล็กน้อยอาจถูกดันขึ้นมาเป็น alert มากเกินไปและลดความสำคัญของเคสที่ควรตรวจจริง

ดังนั้น `15,000 THB` คือ minimum floor เชิงธุรกิจของระบบ ไม่ใช่ค่าที่มาจาก 40% โดยตรง ใน dataset นี้ booking ที่เกิน 15,000 บาทจะถูกจัดเป็น high-value เพราะ 15,000 สูงกว่า 10,899

## Data Source

ข้อมูลหลักที่ใช้ในแอป:

- `hotels.json`
- `hotel_bookings.json`
- `users.json` เมื่อมีไฟล์นี้ ระบบจะ join ข้อมูลผู้จองผ่าน `user_id` อัตโนมัติ

หมายเหตุ: KPI, charts, alerts และ AI payload ถูกคำนวณจาก JSON จริง ไม่มีการ hardcode ตัวเลข demo ลงในหน้าจอ

## Example KPI From Provided Data

ค่าที่ระบบคำนวณได้จาก dataset ปัจจุบัน:

- Hotels: `50`
- Bookings: `50`
- Gross booking value: `389,250 THB`
- Active revenue: `100,550 THB`
- Pending amount: `48,000 THB`
- Cancelled revenue: `19,100 THB`
- Cancel rate: `6%`
- Average hotel rating: `4.32`
- Example price mismatch booking: `bk-h-012`

## Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript with ES Modules
- Node.js local server for development
- Vercel serverless function for production AI proxy
- Claude API via `CLAUDE_API_KEY`

## Environment Variables

API keys must not be committed to GitHub.

For local development, create `.env` from `.env.example`:

```text
CLAUDE_API_KEY=your_claude_key_here
```

For production deployment, set the same environment variable in Vercel:

```text
CLAUDE_API_KEY=your_claude_key_here
```

The frontend never stores or exposes the API key.

## Run Locally

Run the local server:

```bash
node server.js
```

Open:

```text
http://127.0.0.1:4173/
```

If `CLAUDE_API_KEY` is not configured, the AI section will use local fallback output so the demo remains usable.

## Project Structure

```text
.
├── api/
│   └── ai-insights.js
├── src/
│   ├── ai.js
│   ├── audit.js
│   ├── data.js
│   ├── metrics.js
│   └── ui.js
├── app.js
├── index.html
├── style.css
├── server.js
├── hotels.json
├── hotel_bookings.json
├── .env.example
└── README.md
```

## Mapping To Hackathon Requirements

| Requirement | Implementation |
| --- | --- |
| Dashboard / Overview | KPI cards, revenue chart, status chart, location heatmap |
| List + Filter/Search | Booking table and hotel grid with search, filters, sorting |
| Detail Page | Booking detail dialog and hotel detail dialog |
| Responsive + Lighthouse | Responsive CSS, semantic HTML, layout stability fixes |
| Data Handling | JSON loading, relationship mapping, derived metrics, audit engine |
| Bonus AI | Claude-powered AI Insights through `/api/ai-insights` |
| Bonus Deep Insight | Smart Booking Audit and anomaly detection |

## Security Notes

- Do not commit `.env`
- Do not place API keys in frontend JavaScript
- Use Vercel environment variables for production
- AI requests go through `/api/ai-insights` proxy only
- The AI payload contains summarized KPI/alert context, not raw secrets
