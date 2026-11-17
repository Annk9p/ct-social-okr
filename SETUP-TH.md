# ติดตั้งระบบข้อมูลจริง (TikTok + YouTube)

ระบบประกอบด้วย 3 ส่วน

```
ไฟล์ TikTok (วางใน Google Drive) ─┐
YouTube (เจ้าของช่องล็อกอินครั้งเดียว) ┼─► Google Sheet + Apps Script (ดึงทุกเช้า 06:00) ─► เว็บ annk9p.github.io/ct-social-okr
```

ทำครั้งเดียวประมาณ 30 นาที ใช้บัญชี Google ของเจ้าของระบบ ไม่ต้องสมัครอะไรเพิ่ม
โค้ดอยู่ในโฟลเดอร์ `apps-script/` ของ repo นี้ (4 ไฟล์)

---

## ส่วน A · สร้างชีตและวางโค้ด (10 นาที)

1. เปิด https://sheets.new ด้วยบัญชี Google ของเจ้าของระบบ ตั้งชื่อชีตว่า **CT Social OKR · ข้อมูล**
2. เมนู **ส่วนขยาย (Extensions) → Apps Script** จะเปิดแท็บใหม่ ตั้งชื่อโปรเจกต์ว่า **CT Social OKR**
3. วางโค้ด
   - ไฟล์ `Code.gs` ที่มีอยู่แล้ว: ลบของเดิมทั้งหมด แล้ววางเนื้อหาจาก `apps-script/Code.gs`
   - กด **＋ → Script** สร้างไฟล์ชื่อ `TikTok` แล้ววางจาก `apps-script/TikTok.gs`
   - กด **＋ → Script** สร้างไฟล์ชื่อ `YouTube` แล้ววางจาก `apps-script/YouTube.gs`
   - กดรูปเฟือง **Project Settings** → ติ๊ก **Show "appsscript.json" manifest file in editor** → กลับไปที่ไฟล์ `appsscript.json` ลบของเดิม แล้ววางจาก `apps-script/appsscript.json`
   - กด **Save** (ไอคอนแผ่นดิสก์)
4. กลับไปที่แท็บชีต กด **รีเฟรชหน้า** รอสักครู่ จะมีเมนู **CT OKR** โผล่บนแถบเมนู
5. **CT OKR → 1) ติดตั้งครั้งแรก**
   - Google ขอสิทธิ์ ให้เลือกบัญชีเจ้าของระบบ
   - ถ้าเจอ "Google hasn't verified this app" กด **Advanced → Go to CT Social OKR (unsafe)** → **Allow**
   - กดเมนูเดิมอีกครั้ง จะขึ้นว่า "ติดตั้งเสร็จแล้ว" พร้อมลิงก์โฟลเดอร์ TikTok ใน Google Drive
6. กลับไปแท็บ Apps Script → ปุ่ม **Deploy → New deployment**
   - กดเฟืองข้าง "Select type" เลือก **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - กด **Deploy** แล้วคัดลอก **Web app URL** (ลงท้ายด้วย `/exec`) เก็บไว้ ใช้อีก 2 ที่

## ส่วน B · ตั้งค่า Google Cloud สำหรับ YouTube (10 นาที, ทำครั้งเดียว)

1. เปิด https://console.cloud.google.com เลือกโปรเจกต์เดิมที่มี API key อยู่แล้ว (มุมซ้ายบน)
2. **เปิด API 2 ตัว**: เมนู APIs & Services → Library → ค้นหาแล้วกด **Enable** ทีละตัว
   - **YouTube Analytics API**
   - **YouTube Data API v3**
3. **หน้าขออนุญาต (OAuth consent screen)**: เมนู Google Auth Platform (หรือ APIs & Services → OAuth consent screen)
   - ถ้ายังไม่เคยตั้ง: กด Get started → App name `CT Social OKR` → อีเมลซัพพอร์ต = อีเมลของคุณ → Audience เลือก **External** → ใส่อีเมลติดต่อ → Create
   - ไปที่ **Audience** → กด **Publish app** → ยืนยัน ให้สถานะเป็น **In production**
   - ⚠️ ถ้าค้างไว้ที่ "Testing" Google จะตัดสิทธิ์ทุก 7 วัน ต้องกดเชื่อม YouTube ใหม่ทุกสัปดาห์
4. **สร้างกุญแจ OAuth**: เมนู **Clients** (หรือ Credentials → Create credentials → OAuth client ID)
   - Application type: **Web application** · Name: `CT Social OKR`
   - **Authorized redirect URIs** → Add URI → วาง **Web app URL** จากส่วน A ข้อ 6 (ที่ลงท้าย `/exec`)
   - กด **Create** แล้วคัดลอก **Client ID** และ **Client secret**
5. กลับไปที่ชีต → **CT OKR → 2) ตั้งค่า OAuth และลิงก์เว็บแอป**
   - วาง Web app URL, Client ID, Client secret แล้วกด **บันทึกการตั้งค่า**
   - Client secret เป็นความลับ ใส่ในหน้าต่างนี้เท่านั้น ไม่ต้องส่งให้ใคร

## ส่วน C · เชื่อม YouTube (ช่องละ 1 นาที)

ทำ 2 รอบ: **CT OKR → เชื่อม YouTube Eloop** และ **CT OKR → เชื่อม YouTube Moov**

1. กดปุ่ม **ล็อกอินด้วย Gmail ของช่อง** หน้าล็อกอิน Google จะเปิดในแท็บใหม่
2. เลือกหรือล็อกอิน **Gmail ที่เป็นเจ้าของช่องนั้น** (Eloop กับ Moov คนละ Gmail)
3. เจอ "Google hasn't verified this app" → **Advanced → Go to … (unsafe)**
4. กด **Allow (อนุญาต)** จะขึ้นหน้า "เชื่อมสำเร็จ" พร้อมชื่อช่อง
5. ระบบดึงข้อมูลย้อนหลังตั้งแต่ 1 ม.ค. ให้เองภายในไม่กี่นาที

ระบบได้สิทธิ์ **อ่านสถิติอย่างเดียว** แก้ไขหรือลบอะไรในช่องไม่ได้ รหัสผ่าน Gmail พิมพ์ที่หน้าของ Google เท่านั้น ระบบไม่เห็น

## ส่วน D · ไฟล์ TikTok (ทุกต้นเดือน)

1. เปิดโฟลเดอร์ Google Drive **CT Social OKR · ไฟล์ TikTok** (ลิงก์อยู่ใน CT OKR → ดูสถานะ)
2. Export ไฟล์จาก TikTok Studio ของเดือนที่แล้ว แล้วลากไปวางให้ถูกโฟลเดอร์
   - **TikTok Eloop** หรือ **TikTok Moov**
   - วางได้ทั้งไฟล์ `.csv` และไฟล์ `.zip` ที่ดาวน์โหลดมา ไม่ต้องแตกไฟล์
   - ไฟล์ที่ใช้: ภาพรวม (Overview), วิดีโอ, ผู้ติดตาม (Followers)
3. ระบบนำเข้าให้ทุกชั่วโมง ถ้ารีบให้กด **CT OKR → นำเข้าไฟล์ TikTok ตอนนี้**
4. ไฟล์คลิปวิดีโอ ระบบดูจากลิงก์คลิปเองว่าเป็น @eloopth หรือ @moovthailand ถ้าวางผิดโฟลเดอร์ก็ยังถูกบัญชี

**ข้อมูลย้อนหลังปี 2026**: ลากไฟล์ export เก่าที่ยังมีอยู่ (เช่น ในโฟลเดอร์ Downloads) ไปวางได้เลย ระบบรวมให้เอง ไฟล์ซ้ำไม่นับซ้ำ

## ส่วน E · ต่อเว็บเข้ากับระบบ

ส่ง **Web app URL** (ลงท้าย `/exec`) ให้ Claude ใส่ใน `index.html` บรรทัด `const DATA_URL = '';` แล้ว push ขึ้นเว็บ
หลังจากนั้นเว็บโหลดตัวเลขจากระบบทุกครั้งที่เปิด

---

## ใช้งานประจำ

| เมื่อไหร่ | ใคร | ทำอะไร |
|---|---|---|
| ทุกวัน 06:00 | ระบบ | ดึง YouTube และนำเข้าไฟล์ TikTok ใหม่ ถ้าล้มเหลวส่งอีเมลเตือนเจ้าของระบบ |
| ต้นเดือน | ทีม | Export ไฟล์ TikTok ของเดือนที่แล้ว วางในโฟลเดอร์ Drive |
| ถ้าได้อีเมลว่าสิทธิ์ YouTube หลุด | เจ้าของช่อง | CT OKR → เชื่อม YouTube ช่องนั้นใหม่ |
| แก้เป้า/ค่าปีก่อน | เจ้าของระบบ | แก้ในแท็บ `targets` ของชีต |
| แก้ประเภทคลิป/สินค้า | ทีม | แก้คอลัมน์ `type` / `product` ในแท็บ `clips` (นำเข้าใหม่ไม่ทับ) |

## อัปเดตโค้ด Apps Script ภายหลัง

วางโค้ดใหม่ทับ → Save → **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**
ลิงก์ `/exec` เดิมใช้ต่อได้ ไม่ต้องแก้ใน Google Cloud หรือในเว็บ

## แก้ปัญหา

| อาการ | ทำอย่างนี้ |
|---|---|
| ไม่เห็นเมนู CT OKR | รีเฟรชหน้าชีต รอ 5–10 วินาที |
| กดเชื่อม YouTube แล้วขึ้น `redirect_uri_mismatch` | Authorized redirect URI ใน Google Cloud ต้องตรงกับ Web app URL ทุกตัวอักษร (ลงท้าย `/exec`) |
| ขึ้น "ลิงก์หมดอายุ" | ลิงก์เชื่อมใช้ได้ 1 ชั่วโมง กดเมนูเชื่อมใหม่ |
| ขึ้น "บัญชี Gmail นี้ไม่มีช่อง YouTube" | ล็อกอินผิด Gmail ลองใหม่แล้วเลือก Gmail ของช่อง |
| YouTube ต้องเชื่อมใหม่ทุก 7 วัน | หน้าขออนุญาตยังเป็น Testing → ส่วน B ข้อ 3 กด Publish app |
| ไฟล์ TikTok ไม่เข้า | ดูแท็บ `files` คอลัมน์ status / message ว่าระบบอ่านไฟล์ว่าอะไร |

## ข้อจำกัดที่ควรรู้

- เว็บและลิงก์ `/exec` เปิดได้ทุกคนที่มีลิงก์ (ตัวเลขในแดชบอร์ดเป็นสาธารณะ) แต่ตัวชีต โน้ต และกุญแจต่าง ๆ ยังเป็นส่วนตัว
- ตัวเลข YPP เป็นค่าประมาณ: ชั่วโมงดูคลิปยาว 365 วัน และวิว Shorts 90 วัน จาก YouTube Analytics ซึ่ง YouTube นับเฉพาะคลิปสาธารณะ ตัวเลขใน YouTube Studio อาจต่างเล็กน้อย
- คลิปยาวไม่เกิน 3 นาทีนับเป็น Shorts
- Facebook ยังไม่ได้ต่อ ตัวเลข Facebook บนเว็บยังเป็นตัวอย่างจากชีตเดิม
