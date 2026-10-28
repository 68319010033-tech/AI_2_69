# คู่มือการติดตั้งและ Deploy ขึ้น Render (Render Deployment Guide)

**Project:** Phu Pha Timetable (AI_2_69) · Vue 3 + Express + Python OR-Tools (CP-SAT) + Firebase Realtime Database

คู่มือฉบับนี้อัปเดตสำหรับเวอร์ชันล่าสุด ซึ่งรวม Frontend (Vue 3/Vite) และ Backend (Express + Python OR-Tools) เข้าด้วยกันใน Single Docker Container ที่ให้บริการทั้ง Web UI และ API แบบ Same-Origin

---

## 1. ภาพรวมสถาปัตยกรรม (Architecture Overview)

ระบบใช้ **Multi-stage Dockerfile** (`Backend/Dockerfile`):
- **Stage 1 (client-build):** Build Vue 3 Frontend ด้วย Vite ให้กลายเป็น Static assets ใน `frontend/dist`
- **Stage 2 (runtime):** รัน Node.js 24 + Python 3 (Virtual Environment พร้อมติดตั้ง Google OR-Tools)
- **Unified Service:** Express ให้บริการทั้ง Web UI (`/`) และ REST API (`/api/*`) ผ่านพอร์ตเดียวกัน (Port 3000) ทำให้ไม่มีปัญหา CORS และใช้ Cookie-based JWT Session ที่ปลอดภัย

---

## 2. สิ่งที่ต้องเตรียมก่อนเริ่ม (Prerequisites)

1. **บัญชี GitHub** พร้อม Repository โค้ดโปรเจกต์นี้
2. **บัญชี Render** (สมัครผ่าน https://render.com โดย Sign in with GitHub)
3. **Firebase Realtime Database:**
   - Database URL (เช่น `https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app`)
   - ไฟล์ Service Account JSON (`serviceAccount.json`) จาก Firebase Console:
     *เข้า Project Settings → Service accounts → กดปุ่ม "Generate new private key"*
4. **ความปลอดภัย:** ห้าม Commit ไฟล์ `.env` หรือ `serviceAccount.json` ขึ้น GitHub โดยเด็ดขาด (โปรเจกต์มี `.gitignore` และ `.dockerignore` บล็อกไว้แล้ว)

---

## 3. เตรียมค่า Environment Variables สำคัญ

ก่อนเริ่มสร้าง Web Service บน Render ให้เตรียมค่า 3 ตัวนี้ไว้ใน Notepad:

### 3.1 แปลง Firebase Service Account เป็น Base64 (1 บรรทัด)
เปิด PowerShell บนเครื่องของคุณ แล้วรันคำสั่ง:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\serviceAccount.json")) | Set-Clipboard
```
*(เปลี่ยน `C:\path\to\serviceAccount.json` ให้เป็นที่อยู่ไฟล์จริงของคุณ)*
เมื่อรันแล้ว ข้อความ Base64 จะถูกคัดลอกลง Clipboard อัตโนมัติ (ลองกด Ctrl+V ใน Notepad ดู จะได้ข้อความยาว 1 บรรทัดที่ขึ้นต้นด้วย `ew...`)

### 3.2 สุ่มรหัส `JWT_SECRET` (อย่างน้อย 32 bytes)
เปิด PowerShell หรือ Terminal แล้วรัน:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
คัดลอกรหัส hex ยาวๆ ที่ได้เก็บไว้เป็นค่า `JWT_SECRET`

### 3.3 กำหนด `APP_ORIGIN`
จะเป็น URL ของ Render Service ของคุณ เช่น:
`https://phupha-timetable.onrender.com`
*(หากยังไม่ทราบชื่อตอนสร้าง ให้ใส่เป็นชื่อที่คุณจะตั้ง แล้วมาอัปเดตหลัง Service ถูกสร้างเสร็จ)*

---

## 4. ขั้นตอนการสร้าง Web Service บน Render

### วิธีที่ 1: ใช้ Render Blueprint (แนะนำ - ง่ายที่สุด)
1. ไปที่ Dashboard ของ Render: <https://dashboard.render.com>
2. คลิก **New +** → **Blueprint**
3. เลือก GitHub Repository ของคุณ
4. Render จะอ่านไฟล์ `render.yaml` ที่เราเตรียมไว้ให้โดยอัตโนมัติ
5. กรอกค่า Environment Variables ตามช่องที่ Render ร้องขอ
6. กด **Apply** เพื่อเริ่ม Deploy ทันที

---

### วิธีที่ 2: สร้าง Web Service แบบ Manual (กำหนดเองทีละขั้นตอน)

1. ไปที่ Dashboard ของ Render: <https://dashboard.render.com>
2. คลิกปุ่ม **New +** → เลือก **Web Service**
3. เลือก **Build and deploy from a Git repository** แล้วกด **Next**
4. เลือก Repository ของคุณ แล้วกด **Connect**
5. กำหนดการตั้งค่าในหน้า Form ดังนี้:

| ฟิลด์ (Field) | ค่าที่ต้องกรอก (Value) | คำอธิบาย |
|---|---|---|
| **Name** | `phupha-timetable` | ชื่อ Web Service (จะกลายเป็น subdomain `.onrender.com`) |
| **Region** | `Singapore` | แนะนำเลือกสิงคโปร์ เพื่อความเร็วและ latency ต่ำ |
| **Branch** | `main` หรือ `Demo_1` | Branch ที่ต้องการ Deploy |
| **Root Directory** | *เว้นว่างไว้ (Empty)* | **สำคัญมาก:** ต้องเว้นว่าง เพื่อให้ Docker build context อยู่ที่ root ของ repo |
| **Runtime / Environment** | **Docker** | เลือกเป็น Docker |
| **Dockerfile Path** | `Backend/Dockerfile` | **สำคัญ:** ระบุ path ไปยัง Dockerfile |
| **Instance Type** | `Free` หรือ `Starter` | ฟรีใช้ทดสอบได้ (หากใช้แข่งขัน/งานจริง แนะนำ Starter ขึ้นไปเพื่อ CPU สำหรับ OR-Tools) |

6. เลื่อนลงมาที่หัวข้อ **Environment Variables** แล้วกด **Add Environment Variable** เพิ่มทีละรายการ:

| Key | Value ตัวอย่าง / คำอธิบาย | จำเป็นหรือไม่ |
|---|---|---|
| `NODE_ENV` | `production` | **จำเป็น** |
| `PORT` | `3000` | **จำเป็น** |
| `PYTHON_BIN` | `/opt/venv/bin/python` | **จำเป็น** |
| `APP_ORIGIN` | `https://phupha-timetable.onrender.com` | **จำเป็น** (ต้องขึ้นต้นด้วย `https://` ตรงกับ URL ของ Render) |
| `JWT_SECRET` | *(ค่า hex ที่สุ่มได้จากข้อ 3.2)* | **จำเป็น** (อย่างน้อย 32 ตัวอักษร) |
| `FIREBASE_DATABASE_URL` | `https://xxxx-default-rtdb.asia-southeast1.firebasedatabase.app` | **จำเป็น** |
| `FIREBASE_SERVICE_ACCOUNT_B64` | *(ข้อความ Base64 ที่ได้จากข้อ 3.1)* | **จำเป็น** |
| `TRUST_PROXY_HOPS` | `1` | **แนะนำ** (สำหรับการทำงานหลัง Reverse Proxy ของ Render) |
| `GOOGLE_CLIENT_ID` | `xxxx.apps.googleusercontent.com` | ใส่หากต้องการใช้ปุ่ม Google Sign-In |
| `SMTP_HOST` | `smtp.gmail.com` | ใส่หากต้องการระบบส่ง OTP ทาง Email |
| `SMTP_PORT` | `465` | พอร์ต SMTP (465 สำหรับ SSL/TLS) |
| `SMTP_USER` | `your-email@gmail.com` | อีเมลที่ใช้ส่ง |
| `SMTP_PASS` | `xxxx xxxx xxxx xxxx` | Google App Password (16 หลัก) |
| `SMTP_FROM` | `your-email@gmail.com` | อีเมลผู้ส่ง |
| `SEED_TEST_USERS` | `0` (หรือ `1` เฉพาะตอนสร้างบัญชีเริ่มต้น) | หากตั้งเป็น `1` จะสร้าง test accounts อัตโนมัติ |

7. ขยายหัวข้อ **Advanced**:
   - **Health Check Path:** ใส่ `/api/health`
   - **Auto-Deploy:** เลือก `Yes` หากต้องการให้ Deploy อัตโนมัติทุกครั้งที่ git push

8. คลิกปุ่ม **Create Web Service**

---

## 5. การตรวจสอบผลการ Deploy (Verification)

1. ดูแท็บ **Logs** บน Render:
   - Render จะดึง Docker Image, ติดตั้ง dependencies ของ Vue, build frontend, ติดตั้ง Python venv + OR-Tools และ Node dependencies
   - เมื่อเสร็จสิ้น จะมี Log ขึ้นว่า:
     ```text
     Server on :3000 (db: firebase)
     ==> Your service is live 🎉
     ```
2. **ทดสอบ Health Check:**
   เปิดเบราว์เซอร์ไปที่:
   ```text
   https://YOUR-APP.onrender.com/api/health
   ```
   ผลลัพธ์ที่ถูกต้องจะเป็น JSON:
   ```json
   {
     "ok": true,
     "db": {
       "mode": "firebase",
       "ok": true
     },
     "python": {
       "ok": true,
       "version": "3.10.x 9.15.x"
     }
   }
   ```
3. **ทดสอบเปิดหน้าเว็บ:**
   เปิดไปที่ `https://YOUR-APP.onrender.com`
   - ระบบจะแสดงหน้า Login/Register ของ Phu Pha Digital Campus
   - สามารถสมัครสมาชิก และเข้าใช้งานระบบจัดตารางสอนได้ทันที

---

## 6. การสร้างบัญชีผู้ดูแลระบบ (Admin Account Setup)

มี 2 วิธีในการสร้าง Admin:

### วิธีที่ 1: ผ่าน Firebase Console โดยตรง (แนะนำและปลอดภัยที่สุด)
1. สมัครสมาชิกผ่านหน้าเว็บที่ Deploy แล้วตามปกติ
2. เปิด **Firebase Console** → ไปที่ **Realtime Database**
3. ไปที่ node `authUsers` → หา user ที่คุณเพิ่งสมัคร
4. เปลี่ยนฟิลด์ `"role": "user"` ให้เป็น `"role": "admin"`
5. บัญชีของคุณจะมีสิทธิ์เข้าเมนู `/admin` ทันที

### วิธีที่ 2: ใช้คำสั่ง Seed ในเครื่อง
หากต้องการรัน seed ไปยัง Firebase จากเครื่องของคุณ:
1. ตั้งค่า `.env` ในโฟลเดอร์ `Backend/` ให้เชื่อมต่อ Firebase
2. รันคำสั่งใน `Backend/server`:
   ```powershell
   npm run seed
   ```
3. ระบบจะสร้าง admin account ตามที่กำหนดไว้

---

## 7. ปัญหาที่พบบ่อยและการแก้ไข (Troubleshooting)

### Q1: กดปุ่มหรือส่งคำขอแล้วขึ้น Error `403 Untrusted request origin`
- **สาเหตุ:** ค่า `APP_ORIGIN` ใน Render ไม่ตรงกับ URL จริงของ Web Service
- **วิธีแก้:** ไปที่ Render Dashboard → Environment Variables → ตรวจสอบว่า `APP_ORIGIN` มีค่าตรงกับ `https://your-service.onrender.com` (ต้องมี `https://` และไม่มี `/` ปิดท้าย) จากนั้นกด Save Changes

### Q2: Deploy ล้มเหลวที่ขั้นตอน Docker Build
- **สาเหตุ:** ตั้งค่า **Root Directory** เป็น `Backend` แทนที่จะเว้นว่างไว้
- **วิธีแก้:** ไปที่ Settings บน Render → ตรวจสอบว่า **Root Directory** ว่างเปล่า และ **Dockerfile Path** คือ `Backend/Dockerfile`

### Q3: Server เริ่มต้นไม่สำเร็จ (Firebase is required in production)
- **สาเหตุ:** ไม่ได้ใส่ `FIREBASE_DATABASE_URL` หรือ `FIREBASE_SERVICE_ACCOUNT_B64` หรือใส่ผิดรูปแบบ
- **วิธีแก้:** ตรวจสอบว่าแปลงไฟล์ `serviceAccount.json` เป็น Base64 ครบถ้วน ไม่มีเว้นวรรค และ URL ถูกต้อง

### Q4: หน้าเว็บโหลดช้ามากในครั้งแรก (Render Free Tier)
- **สาเหตุ:** บนแพ็กเกจ Free ของ Render เมื่อไม่มีผู้ใช้งานประมาณ 15 นาที ระบบจะเข้าสู่โหมด Sleep (Spindown)
- **วิธีแก้:** คำขอแรกจะใช้เวลาตื่นประมาณ 30-50 วินาที ซึ่งเป็นปกติของ Free Tier หากต้องการให้ระบบพร้อมใช้งานตลอดเวลา แนะนำอัปเกรดเป็นแพ็กเกจ Starter หรือใช้บริการ Uptime monitoring ยิง ping มาที่ `/api/health` เป็นระยะ
