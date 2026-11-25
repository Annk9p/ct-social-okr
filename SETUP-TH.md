# ติดตั้งระบบข้อมูลจริง (TikTok + YouTube)

ระบบประกอบด้วย 3 ส่วน (TikTok, YouTube, Facebook)

```
ไฟล์ TikTok (วางใน Google Drive) ─┐
YouTube / Facebook (ล็อกอินครั้งเดียว)  ┼─► Google Sheet + Apps Script (ดึงทุกเช้า 06:00) ─► เว็บ annk9p.github.io/social-one
```

ส่วน A ทำในชีตครั้งเดียว ที่เหลือทำบนหน้าเว็บทั้งหมด รวมประมาณ 30 นาที ใช้บัญชี Google ของเจ้าของระบบ ไม่ต้องสมัครอะไรเพิ่ม
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
   - กด **Deploy** แล้วส่ง **Web app URL** (ลงท้ายด้วย `/exec`) ให้ Claude ใส่ในเว็บ (ทำแล้ว)

## ส่วน B · ตั้งค่าที่เหลือทั้งหมดบนหน้าเว็บ

เปิด https://annk9p.github.io/social-one/#setup แล้วทำตามกล่อง **ตั้งค่าระบบ** ทีละข้อ ไม่ต้องกลับไปที่ชีตหรือ Apps Script อีก

1. **รหัสทีม** ตั้งครั้งเดียว ใช้ทุกครั้งที่แก้ข้อมูลในระบบ (ตั้งค่า เชื่อม/ยกเลิกบัญชี อัปโหลดไฟล์ แก้เป้า) ระบบเก็บแบบเข้ารหัส ลืมรหัสให้กด **CT OKR → ล้างรหัสทีม** ในชีต แล้วตั้งใหม่บนเว็บ
2. **กุญแจ Google สำหรับ YouTube** หน้าเว็บมีลิงก์ไปหน้า Google Cloud ทีละขั้น และปุ่มคัดลอกลิงก์ redirect ให้ สร้างเสร็จแล้ววาง Client ID กับ Client secret ในช่องบนหน้าเว็บ
   - ⚠️ หน้า Audience ต้องเป็น **In production** ถ้าค้างที่ Testing สิทธิ์ YouTube หลุดทุก 7 วัน
3. **เชื่อม YouTube** กล่อง **การเชื่อมต่อ** → **เชื่อมด้วย Gmail ของช่อง** → ล็อกอิน Gmail ที่เป็นเจ้าของช่อง → เจอ "Google hasn't verified this app" กด **Advanced → Go to … (unsafe)** → **Allow** ทำทีละช่อง ระบบดึงย้อนหลังตั้งแต่ 1 ม.ค. ให้เอง
   - ปุ่ม **ดึงข้อมูลตอนนี้** และ **ยกเลิกการเชื่อม** อยู่ในกล่องเดียวกัน
   - ระบบล็อกช่องแรกที่เชื่อมไว้ ถ้ามีคนล็อกอินช่องอื่นระบบจะปฏิเสธ ถ้าจะเปลี่ยนช่องจริง ๆ กด **ยกเลิกการเชื่อม** ก่อน
   - ระบบได้สิทธิ์อ่านสถิติอย่างเดียว รหัสผ่าน Gmail พิมพ์ที่หน้าของ Google เท่านั้น
4. **กุญแจ Facebook** ใช้แอป Meta ที่ทีมใช้ดึงข้อมูลเพจอยู่แล้ว หน้าเว็บบอกทีละขั้น
   - App settings → Basic: คัดลอก App ID และ App secret มาวางบนเว็บ
   - Facebook Login → Settings → **Valid OAuth Redirect URIs** วางลิงก์ `/exec` (มีปุ่มคัดลอกบนเว็บ)
   - แอปต้องขอสิทธิ์ `pages_show_list`, `pages_read_engagement`, `read_insights` ได้ (โหมด Development ใช้ได้ ถ้าคนกดเชื่อมเป็นแอดมินของแอป)
5. **เชื่อม Facebook** กล่อง **การเชื่อมต่อ** → **เชื่อมด้วย Facebook** → ล็อกอินบัญชีที่เป็นแอดมินเพจ → ติ๊กเลือกเพจ Eloop และ Moov → อนุญาต ระบบจับคู่เพจให้เอง (ชื่อมี Eloop/Orsen และ Moov) ถ้าจับไม่ได้ เลือกจากรายการในกล่องเดียวกัน
   - ทางสำรอง: วาง token จาก Graph API Explorer ในหน้าตั้งค่า ระบบแลกเป็นแบบไม่หมดอายุให้เอง
   - Token ของเพจไม่หมดอายุ ยกเว้นแอดมินที่เชื่อมเปลี่ยนรหัสผ่านหรือถอดสิทธิ์ ระบบจะส่งอีเมลเตือนให้กดเชื่อมใหม่
6. **TikTok API (Sandbox)** ดึงผู้ติดตาม ถูกใจรวม และยอดรายคลิป (วิว ไลก์ คอมเมนต์ แชร์) ทุกชั่วโมง
   - developers.tiktok.com → Manage apps → Connect an app → แท็บ **Sandbox** → Create Sandbox
   - Add products: **Login Kit** + **Display API** · Scopes: `user.info.basic` `user.info.profile` `user.info.stats` `video.list`
   - Login Kit → Web → Redirect URI = ลิงก์ `/exec` (ปุ่มคัดลอกบนเว็บ)
   - Sandbox → Target users: เพิ่ม @eloopth และ @moovthailand แล้วแต่ละบัญชีกดยอมรับในแอป TikTok
   - วาง Client key / Client secret ของ Sandbox ในหน้าตั้งค่า ข้อ 6 → กด **เชื่อมบัญชี TikTok** ทีละบัญชี (ระบบเช็กว่า @ ตรงกับแบรนด์)
   - ไฟล์ export ยังใช้ต่อสำหรับวิวรายวัน Profile Views และข้อมูลผู้ติดตาม ระบบรวมให้เอง ยอดรายคลิปใช้ตัวเลขที่ใหม่กว่า
7. **ไฟล์ TikTok** ทุกต้นเดือน export จาก TikTok Studio แล้วลากไปวางที่หน้า **อัปโหลด TikTok** บนเว็บ (ได้ทั้ง .csv และ .zip) → ตรวจผล → **บันทึกเข้าระบบ** ตัวเลขทุกหน้าอัปเดตทันที
   - ระบบดูจากลิงก์คลิปเองว่าเป็น @eloopth หรือ @moovthailand
   - ข้อมูลย้อนหลังปี 2026: อัปโหลดไฟล์ export เก่าได้เลย ไฟล์ซ้ำไม่นับซ้ำ
   - ทางสำรอง: วางไฟล์ในโฟลเดอร์ Google Drive **CT Social OKR · ไฟล์ TikTok** ระบบนำเข้าทุกชั่วโมง
8. **เป้าหมาย** แก้ในตารางท้ายหน้าตั้งค่า บันทึกเข้าระบบทันที

---

## ใช้งานประจำ

| เมื่อไหร่ | ใคร | ทำอะไร |
|---|---|---|
| ทุกวัน 06:00 | ระบบ | ดึง YouTube และนำเข้าไฟล์ TikTok ใหม่ ถ้าล้มเหลวส่งอีเมลเตือนเจ้าของระบบ |
| ต้นเดือน | ทีม | อัปโหลดไฟล์ TikTok ของเดือนที่แล้วที่หน้า อัปโหลด TikTok |
| ถ้าได้อีเมลว่าสิทธิ์ YouTube หลุด | เจ้าของช่อง | หน้าตั้งค่า → เชื่อมใหม่ |
| แก้เป้า/ค่าปีก่อน | ทีม | ตารางท้ายหน้าตั้งค่า |
| แก้ประเภทคลิป/สินค้า | ทีม | แก้คอลัมน์ `type` / `product` ในแท็บ `clips` (นำเข้าใหม่ไม่ทับ) |

## อัปเดตโค้ด Apps Script ภายหลัง

วางโค้ดใหม่ทับ → Save → **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**
ลิงก์ `/exec` เดิมใช้ต่อได้ ไม่ต้องแก้ใน Google Cloud หรือในเว็บ

## แก้ปัญหา

| อาการ | ทำอย่างนี้ |
|---|---|
| หน้าตั้งค่าขึ้นว่า "ต้องอัปเดตโค้ดในระบบก่อน" | วางโค้ดใหม่แล้ว Deploy เวอร์ชันใหม่ ตามหัวข้อ "อัปเดตโค้ด Apps Script ภายหลัง" |
| ไม่เห็นเมนู CT OKR | รีเฟรชหน้าชีต รอ 5–10 วินาที |
| กดเชื่อม YouTube แล้วขึ้น `redirect_uri_mismatch` | Authorized redirect URI ใน Google Cloud ต้องตรงกับ Web app URL ทุกตัวอักษร (ลงท้าย `/exec`) |
| ขึ้น "ลิงก์หมดอายุ" | ลิงก์เชื่อมใช้ได้ 1 ชั่วโมง กดปุ่มเชื่อมบนเว็บใหม่ |
| ขึ้น "ใส่รหัสผิดหลายครั้ง" | ระบบล็อก 15 นาที รอแล้วลองใหม่ |
| ขึ้น "บัญชี Gmail นี้ไม่มีช่อง YouTube" | ล็อกอินผิด Gmail ลองใหม่แล้วเลือก Gmail ของช่อง |
| YouTube ต้องเชื่อมใหม่ทุก 7 วัน | หน้า Audience ใน Google Cloud ยังเป็น Testing → กด Publish app (ส่วน B ข้อ 2) |
| กดเชื่อม Facebook แล้วขึ้น "URL blocked" หรือ redirect ไม่ถูก | ลิงก์ใน Valid OAuth Redirect URIs ต้องตรงกับลิงก์ `/exec` ทุกตัวอักษร |
| ไฟล์ TikTok ไม่เข้า | ดูตาราง "ไฟล์ที่ระบบนำเข้าล่าสุด" ในหน้าอัปโหลด TikTok ว่าระบบอ่านไฟล์ว่าอะไร |

## ข้อจำกัดที่ควรรู้

- เว็บและลิงก์ `/exec` เปิดได้ทุกคนที่มีลิงก์ (ตัวเลขในแดชบอร์ดเป็นสาธารณะ) แต่ตัวชีต โน้ต และกุญแจต่าง ๆ ยังเป็นส่วนตัว
- ตัวเลข YPP เป็นค่าประมาณ: ชั่วโมงดูคลิปยาว 365 วัน และวิว Shorts 90 วัน จาก YouTube Analytics ซึ่ง YouTube นับเฉพาะคลิปสาธารณะ ตัวเลขใน YouTube Studio อาจต่างเล็กน้อย
- คลิปยาวไม่เกิน 3 นาทีนับเป็น Shorts
- Facebook: Views = `page_media_view` ส่วนที่มาจาก organic (ตรงกับ "From organic" ใน Business Suite), Watch time = `page_video_view_time` × สัดส่วนวิว organic (Meta ไม่แยก organic ของ watch time ให้ จึงเป็นค่าประมาณ), Content interactions = ไลก์+คอมเมนต์+แชร์ของโพสต์และ Reels ที่ลงในเดือน, Net Follower = follows − unfollows, ER = `page_post_engagements` ÷ Views, จำนวนคลิป = Reels ที่โพสต์ในเดือน ตัวเลขอาจต่างจาก Meta Business Suite เล็กน้อย และวันตัดยอดเป็นเวลาแปซิฟิกตามที่ Meta ส่งมา
