# How to Test the Dashboard Locally

## Quick Start (Choose One Method)

### Method 1: Using npx http-server (Recommended)

```bash
# Navigate to the repository root
cd /Users/franciscocoelho/code/certoma/registo-horas

# Start the server (installs http-server automatically if needed)
npx http-server . -p 8080

# Open in browser
# Visit: http://localhost:8080/dashboard/
```

**Expected output:**
```
Starting up http-server, serving .

http-server version: 14.1.1

Available on:
  http://127.0.0.1:8080
  http://192.168.x.x:8080

Hit CTRL-C to stop the server
```

---

### Method 2: Using Python (Built-in)

```bash
# Navigate to the repository root
cd /Users/franciscocoelho/code/certoma/registo-horas

# Start Python HTTP server
python3 -m http.server 8080

# Open in browser
# Visit: http://localhost:8080/dashboard/
```

**Expected output:**
```
Serving HTTP on :: port 8080 (http://[::]:8080/) ...
```

---

### Method 3: Using VS Code Live Server Extension

1. **Install Extension:**
   - Open VS Code
   - Go to Extensions (⌘+Shift+X on Mac)
   - Search for "Live Server"
   - Install "Live Server" by Ritwick Dey

2. **Launch Dashboard:**
   - Open `/Users/franciscocoelho/code/certoma/registo-horas` in VS Code
   - Right-click on `dashboard/index.html`
   - Select "Open with Live Server"
   - Browser opens automatically

---

## Full Testing Workflow

### Step 1: Start Backend (Optional but Recommended)

To test with **real data** from Notion:

```bash
# Open a new terminal window
cd /Users/franciscocoelho/code/certoma/registo-horas/server

# Install dependencies (if not already done)
npm install

# Start the backend
npm start
```

**Expected output:**
```
Server listening on port 8787
📌 Basic shift section ready: Costura (/costura)
📌 Basic shift section ready: Pintura (/pintura)
...
```

**Leave this terminal running.**

---

### Step 2: Start Frontend Server

In a **different terminal**:

```bash
cd /Users/franciscocoelho/code/certoma/registo-horas
npx http-server . -p 8080
```

---

### Step 3: Test the Dashboard

1. **Open Browser:**
   ```
   http://localhost:8080/dashboard/
   ```

2. **Login:**
   - Username: `certoma`
   - Password: `certomaSRP`
   - Click "Entrar no Dashboard"

3. **Verify Features:**

   ✅ **Authentication:**
   - Should see dashboard after login
   - Click "Sair" button - should return to login
   - Refresh page - should stay logged in (sessionStorage)

   ✅ **Active Workers:**
   - Top section shows "Em Laboração Agora"
   - Should see live workers if any shifts are open
   - Updates every 30 seconds

   ✅ **Charts:**
   - "Performance por Funcionário" - bar chart with employee data
   - "Progresso por OF" - bar chart with OF data
   - "Evolução Mensal" - line chart showing trends

   ✅ **Year Selector:**
   - Dropdown at top showing "2025"
   - Change to "2024" - data should update

   ✅ **Employee Costs:**
   - Scroll to "Gestão de Custos" section
   - Should see table of employees and hourly costs
   - Click "+ Adicionar Funcionário" - modal should appear

---

### Step 4: Test Deep Linking

In browser address bar, try:

```
http://localhost:8080/dashboard/?employee=Cristina
```
- Should show employee detail page for Cristina

```
http://localhost:8080/dashboard/?of=83
```
- Should show OF detail page for OF 83

---

## Troubleshooting

### Issue: "Failed to fetch" or API Errors

**Cause:** Backend not running or CORS issue

**Solution:**
1. Check backend is running at `http://localhost:8787`
2. Test backend directly:
   ```bash
   curl http://localhost:8787/health
   ```
3. Check browser console (F12) for error details

---

### Issue: "No data" or Empty Charts

**Cause:** No data for selected year or backend issue

**Solution:**
1. Check backend terminal for errors
2. Verify Notion databases have data for 2025
3. Check browser console (F12) for API errors
4. Try switching year to 2024

---

### Issue: Login Not Working

**Cause:** Incorrect credentials or JavaScript error

**Solution:**
1. Verify credentials exactly: `certoma` / `certomaSRP`
2. Check browser console (F12) for JavaScript errors
3. Clear browser cache and try again
4. Check `dashboard/js/auth.js` is loaded (Network tab)

---

### Issue: Page Doesn't Load

**Cause:** Wrong URL or server not running

**Solution:**
1. Verify URL is **exactly**: `http://localhost:8080/dashboard/` (note trailing slash)
2. Check terminal - server should be running
3. Try: `http://localhost:8080/dashboard/index.html`

---

### Issue: "CORS Error" in Console

**Cause:** Backend CORS not allowing localhost

**Solution:**
1. Edit `server/index.js` temporarily
2. Find line with `ALLOW_ORIGIN`
3. Add localhost:
   ```javascript
   const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || 'http://localhost:8080,https://cifcoelho.github.io';
   ```
4. Restart backend server

**OR** use production backend (if already deployed):
- Dashboard will auto-detect and use `https://registo-horas.onrender.com`

---

## Testing with Production Backend

If you **don't want to run backend locally**, the dashboard will automatically use production:

```bash
# Just run frontend
cd /Users/franciscocoelho/code/certoma/registo-horas
npx http-server . -p 8080

# Visit: http://localhost:8080/dashboard/
```

The dashboard detects `localhost` and switches to production backend automatically (see `dashboard/js/api.js:1-3`).

**Note:** Production backend must have `CUSTO_FUNCIONARIOS_DB_ID` environment variable set.

---

## Browser Developer Tools

**Open Console (F12 or ⌘+Option+I on Mac)** to see:
- API requests and responses
- JavaScript errors
- Network activity
- Console logs from dashboard code

**Useful Console Commands:**
```javascript
// Check if authenticated
sessionStorage.getItem('certoma-auth-session')

// Check API base URL
API_BASE

// Manually call API
API.getSummary().then(console.log)
```

---

## Mobile Testing

To test on mobile device (phone/tablet) on same network:

1. **Find your computer's IP address:**
   ```bash
   # On Mac:
   ifconfig | grep "inet " | grep -v 127.0.0.1

   # Look for something like: 192.168.1.x
   ```

2. **Start server:**
   ```bash
   npx http-server . -p 8080
   ```

3. **On mobile device browser:**
   ```
   http://192.168.1.x:8080/dashboard/
   ```
   (Replace `x` with your actual IP)

4. **Test responsive design:**
   - Layout should adapt to mobile screen
   - Charts should be readable
   - Touch interactions should work

---

## Performance Testing

### Check API Response Times

Open browser console and run:

```javascript
// Test summary endpoint
console.time('summary');
API.getSummary().then(() => console.timeEnd('summary'));

// Test employees endpoint
console.time('employees');
API.getEmployees(2025).then(() => console.timeEnd('employees'));

// Test OFs endpoint
console.time('ofs');
API.getOFs(2025).then(() => console.timeEnd('ofs'));
```

**Expected times:**
- summary: < 500ms
- employees: 1-5 seconds (depends on data volume)
- ofs: 1-5 seconds

---

## Next Steps After Local Testing

Once local testing is successful:

1. ✅ Verify all features work
2. ✅ Test on mobile viewport (browser dev tools)
3. ✅ Check performance is acceptable
4. ✅ Add `CUSTO_FUNCIONARIOS_DB_ID` to Render
5. ✅ Configure GitHub Pages for `dashboard-dev` branch
6. ✅ Test deployed version

---

## Quick Reference

**Dashboard URL (local):** `http://localhost:8080/dashboard/`
**Backend URL (local):** `http://localhost:8787`
**Login:** `certoma` / `certomaSRP`

**Endpoints to test:**
- Health: `http://localhost:8787/health`
- Summary: `http://localhost:8787/api/dashboard/summary`
- Employees: `http://localhost:8787/api/dashboard/employees?year=2025`
- OFs: `http://localhost:8787/api/dashboard/ofs?year=2025`
- Costs: `http://localhost:8787/api/dashboard/costs`

**Stop servers:**
- Press `CTRL+C` in terminal where server is running

---

## Summary

**Fastest way to test:**
```bash
# Terminal 1 (optional - for real data)
cd server && npm start

# Terminal 2 (required)
cd /Users/franciscocoelho/code/certoma/registo-horas
npx http-server . -p 8080

# Browser
# Visit: http://localhost:8080/dashboard/
# Login: certoma / certomaSRP
```

That's it! 🚀
