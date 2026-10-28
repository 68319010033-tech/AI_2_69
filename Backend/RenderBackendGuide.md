# How to Upload (Deploy) the Backend to Render

**Project:** Phu Pha Timetable · Express + Python CP-SAT + Firebase

> Render's website may look a little different from this guide. Follow the same idea if a button has a different name.

---

## Part 0 – Check before you start

- [ ] The server runs on your computer with `(db: firebase)`
- [ ] You have a GitHub account and a Render account (sign in with GitHub)
- [ ] You have from Firebase:
  - Database URL (`https://xxxx-default-rtdb....firebasedatabase.app`)
  - `serviceAccount.json` (the key file)
- [ ] You will **NOT** upload `.env` or `serviceAccount.json` to GitHub

---

## Part 1 – Fix one thing in the project (important)

The Dockerfile copies a folder called `client`. Your Backend project does not have it yet, so the build would **fail**.

Fix: create a placeholder file.

```powershell
cd C:\Ai\AI_2_69\Backend
New-Item -ItemType Directory -Force client | Out-Null
New-Item client\.gitkeep -ItemType File -Force | Out-Null
```

Later, when your friend's Vue project is ready, put it in the `client` folder. It must have `package.json` **and** `package-lock.json`. The Dockerfile will build it automatically.

---

## Part 2 – Push the code to GitHub

1. Open the terminal in the project folder.

2. Check what will be uploaded:

   ```powershell
   git status
   ```

   These must **NOT** appear in the list:
   `.env`, `serviceAccount.json`, `sample_data`, `cleaned`, `solution.csv`

   If any of them appear, add the name to `.gitignore`, save, and run `git status` again.

3. Upload:

   ```powershell
   git add .
   git commit -m "backend ready for deploy"
   git push
   ```

   If you have no repository yet, create an empty one on github.com, then run:

   ```powershell
   git init
   git add .
   git commit -m "backend"
   git branch -M main
   git remote add origin https://github.com/YOUR_NAME/YOUR_REPO.git
   git push -u origin main
   ```

4. Look at the repository on github.com and check:
   - You can see `Dockerfile`, `server/`, `solver/`, `tools/`
   - You can **NOT** see `.env` or `serviceAccount.json`

   > If you see `serviceAccount.json` on GitHub: **stop.** Go to Firebase → Project settings → Service accounts, delete that key, and make a new one. Never share it.

5. **Where is the Dockerfile?**
   - At the top of the repository → OK.
   - Inside the `Backend` folder (repository top folder is `AI_2_69`) → in Part 4, set **Root Directory** to `Backend`.

---

## Part 3 – Make the Firebase key text (Base64)

Render cannot use your key file, so we turn it into one line of text.

1. PowerShell:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Ai\AI_2_69\Backend\serviceAccount.json")) | Set-Clipboard
   ```

2. Open Notepad and paste (Ctrl+V).

3. **Check:** the text must start with `ew`.
   - Starts with `ew` → good.
   - Starts with something else → wrong, do step 1 again.

   It is **one** very long line: no spaces, no line breaks.

4. Keep Notepad open. You will paste this text into Render soon. Do not send it to anyone.

---

## Part 4 – Create the web service on Render

1. Go to <https://render.com> and sign in with GitHub.
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository and select it.
4. Fill in the form:

   | Field | Value |
   |---|---|
   | Name | `phupha-timetable` (any name) |
   | Region | the nearest one (e.g. Singapore) |
   | Branch | `main` |
   | Root Directory | empty (write `Backend` only if the Dockerfile is inside `Backend`, see Part 2 step 5) |
   | Runtime / Language | **Docker** |
   | Instance Type | see the notes below |

5. **Instance type**
   - **Free** is OK only for testing. It is slow, and it may go to sleep when nobody uses it. The first request after sleeping can take a long time. Solving may also be slower.
   - For competition day, use a **paid** instance with more CPU and memory if you can. OR-Tools uses several CPU cores.
   - Check current prices and limits on the Render website.

6. Scroll to **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `ADMIN_USER` | your login name |
   | `ADMIN_PASS` | your strong password |
   | `FIREBASE_DATABASE_URL` | `https://xxxx-default-rtdb....firebasedatabase.app` |
   | `FIREBASE_SERVICE_ACCOUNT_B64` | the long text from Part 3 |
   | `PYTHON_BIN` | `/opt/venv/bin/python` |

   **Do NOT add:**
   - `AUTH_DISABLED` (it would turn off the login)
   - `PORT` (Render sets it by itself)

7. In **Advanced** (if you see it), set **Health Check Path** to `/api/health`.

8. Click **Create Web Service** (or Deploy).

---

## Part 5 – Wait for the build

1. Render shows a log. The first build can take several minutes (it installs Python and OR-Tools).
2. Success looks like `Server on :XXXX (db: firebase)`, and the status becomes **Live**.
3. Copy your address from the top of the page, for example `https://phupha-timetable.onrender.com`.

---

## Part 6 – Test the live server

1. Open in the browser:

   ```
   https://YOUR-URL/api/health
   ```

   You want `"ok":true`, `"mode":"firebase"` and a python version.

2. Log in (PowerShell). The server now needs a login:

   ```powershell
   $u = "https://YOUR-URL/api"
   $t = (Invoke-RestMethod -Method Post -Uri "$u/login" -ContentType "application/json" -Body (@{user="your_login_name"; pass="your_strong_password"} | ConvertTo-Json)).token
   $h = @{Authorization="Bearer $t"}
   ```

3. Upload the sample data:

   ```powershell
   $files = Get-ChildItem sample_data\*.csv | ForEach-Object { "-F"; "files=@$($_.FullName)" }
   $r = curl.exe -s -H "Authorization: Bearer $t" @files "$u/upload" | ConvertFrom-Json
   $sid = $r.sessionId
   ```

4. Validate:

   ```powershell
   $v = Invoke-RestMethod -Method Post -Uri "$u/validate" -Headers $h -ContentType "application/json" -Body (@{sessionId=$sid} | ConvertTo-Json)
   $v.canGenerate
   ```

5. Generate:

   ```powershell
   $j = Invoke-RestMethod -Method Post -Uri "$u/generate" -Headers $h -ContentType "application/json" -Body (@{sessionId=$sid; method="cpsat"; timeLimitSec=20} | ConvertTo-Json)
   Invoke-RestMethod "$u/jobs/$($j.jobId)" -Headers $h
   ```

   Run the last line again until `status` is `done`.

6. Download and check:

   ```powershell
   Invoke-WebRequest "$u/export/$sid/solution.csv" -Headers $h -OutFile solution_live.csv
   ```

7. Test from your **phone** (mobile data, not your Wi-Fi): open `https://YOUR-URL/api/health`. If it opens, the judges can open it too.

8. Write down how long Generate took on Render. Use it to set the time limit for competition day.

---

## Part 7 – Update the server later

Every time you change the code:

```powershell
git add .
git commit -m "what you changed"
git push
```

Render builds again by itself (Auto-Deploy). Wait until it is **Live**, then test `/api/health` again.

If you change only an environment variable: Render dashboard → your service → **Environment** → edit → save. It will restart.

---

## Part 8 – If something fails

| Problem | What to do |
|---|---|
| Build fails with `client: not found` | You skipped Part 1. Create `client\.gitkeep`, commit, push. |
| Build fails: `Dockerfile: no such file` | Set **Root Directory** to `Backend` (Part 2 step 5), or move the Dockerfile to the top of the repository. |
| Health shows `"mode":"memory"` | `FIREBASE_DATABASE_URL` or `FIREBASE_SERVICE_ACCOUNT_B64` is missing or wrong. Find `[db] Firebase init failed ...` in the Render logs. The base64 text must start with `ew` and be one line. |
| Health shows `ok:false` and python not ok | `PYTHON_BIN` must be exactly `/opt/venv/bin/python` on Render. |
| Job `failed`: `Cannot start Python` | Same: on Render `PYTHON_BIN` is `/opt/venv/bin/python` (on your Windows computer it is just `python`). |
| Every request says `Login required` | Call `/api/login` first and send the token (Part 6 step 2). This is correct behaviour. |
| Generate is very slow, or the service restarts while solving | The instance may be too small (CPU or memory). Use a bigger instance or lower `timeLimitSec`. |
| First request after a while is very slow | A free instance may be sleeping. Open `/api/health` a few minutes before the judges test, to wake it up. |

---

## Final checklist before 16:30

- [ ] `/api/health` is `ok:true` and `mode:firebase`
- [ ] Login works with `ADMIN_USER` / `ADMIN_PASS`
- [ ] Upload → Validate → Generate → Export works on the live URL
- [ ] It opens from a phone or another computer
- [ ] `ADMIN_PASS` is not the default
- [ ] No secret key is on GitHub
- [ ] You sent the URL, the test account, the GitHub link and `solution.csv`
