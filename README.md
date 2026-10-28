# Phu Pha Timetable (AI_2_69)

ระบบจัดตารางสอนมหาวิทยาลัยอัจฉริยะ (University Timetable Scheduler)  
Vue 3 Frontend + Express Backend + Google OR-Tools (CP-SAT) Solver + Firebase Realtime Database.

---

## สารบัญเอกสาร (Documentation)

- 🚀 **[คู่มือการ Deploy ขึ้น Render (Render Deployment Guide)](Backend/RenderBackendGuide.md)** — วิธีการนำระบบขึ้น Cloud บน Render ทีละขั้นตอน
- 🔐 **[คู่มือการตั้งค่า Authentication & Local Setup](AUTH_SETUP.md)** — ข้อมูลระบบล็อกอิน, Google OAuth, Email OTP, JWT Sessions และวิธีรันในเครื่อง
- ⚙️ **[Render Blueprint](render.yaml)** — ไฟล์ตั้งค่า Infrastructure บน Render อัตโนมัติ

---

## การเริ่มต้นพัฒนาในเครื่อง (Local Quickstart)

### 1. ติดตั้ง Dependencies
```sh
# Backend Server
cd Backend/server
npm ci

# Frontend
cd ../../frontend
npm ci

# Python Solver Dependencies
cd ..
python -m pip install -r Backend/solver/requirements.txt
```

### 2. ตั้งค่า Environment
คัดลอกไฟล์ `Backend/.env.example` เป็น `Backend/.env` และกรอกค่าที่ต้องการ:
```sh
cp Backend/.env.example Backend/.env
```

### 3. รันระบบ (โหมด Development)
- **Terminal 1 (Backend API):**
  ```sh
  cd Backend/server
  npm run dev
  ```
- **Terminal 2 (Frontend UI):**
  ```sh
  cd frontend
  npm run dev
  ```
เปิดเบราว์เซอร์ไปที่: `http://localhost:5173` (Vite จะ proxy คำขอ `/api` ไปที่ backend port 3000 อัตโนมัติ)
