# Interactive Dashboard Development - Registo de Produtividade

## CRITICAL: Branch and Deployment Instructions

**⚠️ MANDATORY**: All changes MUST be made, committed, and pushed ONLY to the `dashboard-dev` branch. The `main` branch must remain completely untouched.

Before starting:
```bash
git checkout dashboard-dev
git pull origin dashboard-dev
```

After completing work:
```bash
git add .
git commit -m "Implement interactive productivity dashboard with real-time data visualization"
git push origin dashboard-dev
```

**DO NOT merge, touch, or modify the `main` branch under any circumstances.**

---

## Project Context

You are working on a productivity tracking system for an industrial company (Certoma) that uses legacy iPad 2 tablets in kiosk mode to register employee shift data. The existing tablet interfaces are deployed at GitHub Pages under `/registo-horas/` and send data to a Node.js backend (https://registo-horas.onrender.com) which stores records in Notion databases.

**Repository:** `registo-horas` (GitHub Pages deployment)
**Current production URL:** `https://cifcoelho.github.io/registo-horas/`
**Backend:** `https://registo-horas.onrender.com` (Node.js + Express + Notion API)

---

## Your Mission

Build a comprehensive, real-time **interactive dashboard** for the company owner to analyze productivity data from workers across different factory sections. The dashboard should be accessible at `/dashboard/` on GitHub Pages and protected by simple authentication.

---

## Data Sources & Database Structure

### Notion Databases Available

1. **Acabamento** (Finishing section - time tracking)
   - Environment variable: `ACABAMENTO_DB_ID`
   - Properties:
     - `Funcionário` (title/text) - Employee name
     - `Ordem de Fabrico` (number) - Work order number (0 = general work)
     - `Início do Turno` (date) - Shift start timestamp
     - `Final do Turno` (date) - Shift end timestamp
     - `Notas do Sistema` (rich_text) - System notes

2. **Estofagem - Tempo** (Upholstery section - time tracking)
   - Environment variable: `ESTOFAGEM_TEMPO_DB_ID`
   - Same structure as Acabamento

3. **Estofagem - Registos Acab.** (Upholstery finishing records - unit tracking)
   - Environment variable: `ESTOFAGEM_ACABAMENTOS_DB_ID`
   - Properties:
     - `Funcionário` (title/text) - Employee who registered
     - `Data` (date) - Registration date
     - `Ordem de Fabrico` (number) - Work order
     - `Cru Por:` (rich_text) - Employee(s) who did "Cru" finishing (comma-separated)
     - `TP por:` (rich_text) - Employee(s) who did "Tapa-Poros" finishing (comma-separated)
   - **Important**: Each line represents ONE finished urn unit

4. **Custo Funcionários** (Employee hourly costs - salary database)
   - Database ID: `284a33537eff807c97f1eb42c26f95cc`
   - Properties:
     - `Funcionário` (text) - Employee name
     - `Custo do Funcionário (€/h)` (number) - Hourly cost in euros
     - `Última Atualização` (Last Edited Time) - Auto-updated timestamp

### Current Backend Endpoints

The backend (`server/index.js`) already exposes:
- `GET /health` - Health check
- `GET /notion/whoami` - Validate Notion token
- `GET /notion/meta?db=acabamento` - Database metadata
- `GET /acabamento/open` - List currently open shifts (workers currently working)
- `GET /estofagem/open` - List currently open shifts in Estofagem
- `POST /acabamento`, `POST /estofagem` - Handle shift actions (used by tablets)

**You will need to create NEW backend endpoints** to efficiently serve dashboard data.

---

## Productivity Metrics Calculation

### Time per Employee per OF
Query "Acabamento" or "Estofagem - Tempo" databases, calculate duration for each closed shift:
```
Duration = Final do Turno - Início do Turno
```
Sum by employee and/or OF number.

### Units (Urns) Finished per Employee
Query "Estofagem - Registos Acab." database:
- Parse `Cru Por:` and `TP por:` fields (comma-separated employee names)
- Each line = 1 urn unit
- Count how many times each employee appears across all records

### Productivity Rate
```
Productivity = Total Units Finished / Total Hours Worked
```

### Cost Calculations
Join with "Custo Funcionários" database to calculate:
- Cost per OF: `Sum(Hours × Employee Cost)`
- Cost per urn: `Total Cost / Total Units`
- Employee cost breakdown

---

## Required Dashboard Features

### 1. Authentication
- Simple login page on dashboard access
- Credentials: `username: "certoma"`, `password: "certomaSRP"`
- Store auth state in `sessionStorage` (similar to `/HTML-example/example.html`)
- Block all dashboard content until authenticated

### 2. Real-Time Active Workers Display
**Prominent section at top of dashboard:**
- Show which workers are currently active in each section (Acabamento, Estofagem)
- Fetch from `GET /acabamento/open` and `GET /estofagem/open`
- Display: Employee name, OF they're working on, time elapsed since shift start
- Update every 30-60 seconds
- Visual indicator (e.g., green pulse/badge) for active workers

### 3. OF Progress Visualization
**Graph showing the last 5-8 completed OFs:**
- X-axis: OF numbers (sorted chronologically or by OF number)
- Y-axis: Time in hours
- Stacked or grouped bars showing time breakdown by section:
  - Acabamento time (one color)
  - Estofagem time (another color)
- Tooltip: Show detailed breakdown (employees involved, total units, cost)

### 4. Annual Employee Performance Overview
**"Tempo Total por Funcionário" (Total Time per Employee):**
- Bar chart with all employees mentioned in the databases
- For each employee, show TWO adjacent bars:
  - Left bar: Total hours worked (sum across all shifts)
  - Right bar: Total urns finished (count from Registos Acab.)
- Separate views/tabs for Acabamento and Estofagem sections
- **Year selector:** Dropdown to switch between years (default: 2025)
  - Filter all queries by year to avoid massive database queries
  - Show "No data" message for years without records
- Tooltip: Include productivity rate (urns/hour) and total cost

### 5. Individual OF Detail Page
**Dedicated page/modal for each OF:**
- Access via clicking OF in charts or from a searchable OF list
- Display:
  - Total time by section (Acabamento, Estofagem)
  - Breakdown by employee (name, hours, units finished, cost)
  - Timeline visualization (when work started/ended in each section)
  - Total cost for this OF
  - Average cost per urn
  - Productivity metrics (units/hour)
  - List of all workers involved with their contributions
- **Recommendation:** Use URL parameters (e.g., `/dashboard/?of=83`) for deep linking and shareability

### 6. Individual Employee Detail Page
**Dedicated page/modal for each employee:**
- Access via clicking employee name in charts
- Display:
  - Performance over time (line chart: productivity trend month-by-month)
  - Breakdown by OF (which OFs they worked on, hours per OF, units per OF)
  - Total hours, total units, productivity rate
  - Cost per hour (from Custo Funcionários database)
  - Total cost generated by this employee
  - Section distribution (time split between Acabamento/Estofagem)
- **Recommendation:** Use URL parameters (e.g., `/dashboard/?employee=Cristina`) for deep linking

### 7. Database Management Interface
**CRUD operations for managing data:**
- **Employee Management:**
  - View all employees with their hourly costs
  - Add new employee (name + cost)
  - Edit employee hourly cost
  - Delete/archive employee
  - Update Custo Funcionários database via new backend endpoints
- **OF Management (optional but recommended):**
  - View all OFs with summary stats
  - Manually create/edit OF records if needed
- Use modals or dedicated admin section
- Confirm destructive actions (delete) with confirmation dialogs
- Show success/error notifications after operations

---

## Additional Useful Visualizations (Your Recommendations)

Based on the data available, implement these valuable metrics:

### 8. Cost Efficiency Dashboard
- **Cost per Unit by OF:** Bar chart showing which OFs had best/worst cost efficiency
- **Employee Cost Efficiency:** Compare productivity vs. cost for each employee
- **Section Cost Comparison:** Acabamento vs. Estofagem cost breakdown

### 9. Performance Trends
- **Daily/Weekly/Monthly productivity trends:** Line chart showing productivity over time
- **Best/Worst performing days:** Highlight peak productivity periods
- **Section utilization:** Bar chart showing average workers per section per day

### 10. Work Distribution Analysis
- **OF Complexity Heatmap:** Color-coded grid showing time intensity per OF per section
- **Employee Specialization:** Which employees work most efficiently in which sections
- **Work Balance:** Identify overloaded vs. underutilized employees

### 11. Quality Indicators
- **Completion Rate:** Percentage of OFs fully completed vs. in-progress
- **Average Time per Unit:** Track if finishing time improves over time
- **Rework Analysis:** Identify OFs with unusually high time/unit (potential quality issues)

### 12. Summary Statistics Cards
At top of dashboard, show prominent KPI cards:
- Total OFs completed (selected period)
- Total hours worked (all sections)
- Total units finished
- Average productivity (units/hour)
- Total labor cost
- Average cost per unit

---

## Technical Implementation Requirements

### Backend Development (server/index.js)

**Create new API endpoints:**

```javascript
// Dashboard data endpoints
app.get('/api/dashboard/summary', async (req, res) => {
  // Return summary stats (total hours, units, cost, active workers)
  // Optional query params: ?year=2025&section=acabamento
});

app.get('/api/dashboard/employees', async (req, res) => {
  // Return employee performance data
  // Query params: ?year=2025&section=acabamento
});

app.get('/api/dashboard/ofs', async (req, res) => {
  // Return OF performance data
  // Query params: ?year=2025&status=completed
});

app.get('/api/dashboard/of/:ofNumber', async (req, res) => {
  // Return detailed data for specific OF
});

app.get('/api/dashboard/employee/:name', async (req, res) => {
  // Return detailed data for specific employee
});

app.get('/api/dashboard/costs', async (req, res) => {
  // Return employee costs from Custo Funcionários database
});

// CRUD endpoints for employee costs
app.post('/api/dashboard/employee-cost', async (req, res) => {
  // Create/update employee cost in Custo Funcionários database
});

app.delete('/api/dashboard/employee-cost/:name', async (req, res) => {
  // Delete employee cost record
});
```

**Environment Variables:**
Add to `.env.example` and configure in Render:
```
CUSTO_FUNCIONARIOS_DB_ID=284a33537eff807c97f1eb42c26f95cc
```

**Data Fetching Strategy:**
- Use Notion API client (`@notionhq/client`)
- Implement pagination for large result sets
- Cache frequently accessed data (e.g., employee costs) with TTL
- Filter by date ranges server-side to minimize data transfer
- Handle timezone correctly (Europe/Lisbon)

### Frontend Development (dashboard/)

**Structure:**
```
dashboard/
├── index.html          # Main dashboard page with authentication
├── css/
│   └── dashboard.css   # Dashboard styles (reuse Certoma colors from example.html)
├── js/
│   ├── auth.js         # Authentication logic
│   ├── api.js          # API client for backend
│   ├── charts.js       # Chart.js configuration and rendering
│   ├── main.js         # Main dashboard logic
│   ├── of-detail.js    # OF detail page logic
│   └── employee-detail.js  # Employee detail page logic
└── assets/
    └── images/         # Logo, icons, etc.
```

**Technology Stack:**
- **Vanilla JavaScript** (ES6+ is fine - modern browsers only, no iPad 2 constraint)
- **Chart.js** (v4.4.0 via CDN - already used in example.html)
- **CSS Grid/Flexbox** for responsive layout
- **Fetch API** for backend communication
- **sessionStorage** for auth state
- **URL parameters** for deep linking (OF/employee detail pages)

**Design System:**
Reuse the color scheme from `/HTML-example/example.html`:
```css
--primary: #E6692D (Certoma orange)
--primary-dark: #c95a24
--secondary: #2c3e50
--success: #28a745
--info: #17a2b8
--warning: #ffc107
```

**Responsive Design:**
- **Mobile-first:** Optimize for mobile viewing (phone/tablet)
- **Desktop enhancement:** Use wider layouts, multi-column grids on desktop
- **Breakpoints:** 768px (tablet), 1024px (desktop)
- Test that charts are readable on small screens

**User Experience:**
- **Loading states:** Show spinners/skeletons while fetching data
- **Error handling:** Display user-friendly error messages if API fails
- **Empty states:** Show helpful messages when no data exists
- **Notifications:** Toast notifications for CRUD operations success/failure
- **Date pickers:** Use native HTML5 date inputs for filtering
- **Search/filter:** Allow searching employees/OFs in tables

### GitHub Pages Deployment Considerations

**Important:** The repository is deployed from the root directory (`/`), so:
- Current structure: `/index.html` is the section selector landing page
- Dashboard should live at `/dashboard/index.html`
- Tablets continue using `/frontend/HTML/acabamento.html`, etc.
- Ensure `/dashboard/` directory is NOT ignored in `.gitignore`

**CORS Configuration:**
Update `ALLOW_ORIGIN` in backend to include dashboard access:
```
ALLOW_ORIGIN=https://cifcoelho.github.io
```
(Already configured - confirm this works for `/dashboard/` subdirectory)

**Testing Deployment:**
After pushing to `dashboard-dev`, verify:
1. GitHub Pages is enabled for `dashboard-dev` branch (Settings → Pages)
2. Dashboard is accessible at: `https://cifcoelho.github.io/registo-horas/dashboard/`
3. API calls to `https://registo-horas.onrender.com` work (CORS)
4. Authentication works correctly
5. All charts render properly

---

## Development Workflow

### Step 1: Backend API Development
1. Add `CUSTO_FUNCIONARIOS_DB_ID` to environment variables
2. Create helper functions to query Notion databases efficiently
3. Implement all dashboard API endpoints
4. Test endpoints locally with `curl` or Postman
5. Deploy to Render and verify in production

### Step 2: Frontend Structure
1. Create `/dashboard/` directory structure
2. Build authentication page (block all content until logged in)
3. Set up API client with error handling
4. Create layout with responsive CSS

### Step 3: Core Visualizations
1. Implement active workers display (real-time)
2. Build OF progress chart
3. Build annual employee performance chart with year selector
4. Implement summary statistics cards

### Step 4: Detail Pages
1. Build OF detail page with URL parameter routing
2. Build employee detail page with URL parameter routing
3. Implement navigation between main dashboard and detail pages

### Step 5: Database Management
1. Create employee cost management UI (CRUD)
2. Implement backend endpoints for create/update/delete
3. Add confirmation dialogs and notifications

### Step 6: Additional Visualizations
1. Implement cost efficiency dashboard
2. Add performance trend charts
3. Build work distribution analysis

### Step 7: Polish & Testing
1. Test on mobile devices and desktop
2. Verify real-time updates work correctly
3. Test authentication flow
4. Test error scenarios (backend down, no data, etc.)
5. Optimize performance (minimize API calls, add caching)

### Step 8: Deployment
1. Commit and push to `dashboard-dev` branch
2. Configure GitHub Pages for `dashboard-dev` branch
3. Test deployed version thoroughly
4. Document any environment variable changes needed

---

## Code Quality Guidelines

- **DRY Principle:** Extract reusable functions (especially for API calls, chart rendering)
- **Error Handling:** Wrap all `fetch` calls in try-catch, show user-friendly errors
- **Comments:** Add JSDoc comments for complex functions
- **Naming:** Use descriptive variable/function names
- **Constants:** Define API URLs, colors, breakpoints as constants
- **Modularity:** Separate concerns (auth, API, charts, UI) into different files
- **Performance:** Debounce search inputs, paginate large tables
- **Accessibility:** Use semantic HTML, ARIA labels for screen readers

---

## Reference Implementation

Study `/HTML-example/example.html` for:
- Authentication implementation (session storage, login form)
- Chart.js usage patterns and configurations
- Color scheme and styling approach
- Responsive grid layouts
- Data structure and calculation patterns

**Key patterns to reuse:**
- Authentication overlay and modal design
- Chart.js default configuration
- Color gradient arrays for multi-series charts
- Tooltip formatters for better UX
- Table styling with hover effects

---

## Expected Deliverables

1. **Backend API endpoints** (in `server/index.js`)
   - All `/api/dashboard/*` endpoints documented above
   - Employee cost CRUD endpoints
   - Proper error handling and validation

2. **Dashboard frontend** (in `/dashboard/` directory)
   - Complete HTML/CSS/JS implementation
   - All visualizations working with real data
   - Authentication functional
   - Responsive design tested

3. **Documentation updates**
   - Update `README.md` with dashboard access instructions
   - Document new API endpoints
   - Add dashboard URL to deployment section

4. **Environment configuration**
   - Update `server/.env.example` with new variables
   - Document any Render configuration changes needed

---

## Success Criteria

✅ Dashboard is accessible at `/dashboard/` on GitHub Pages
✅ Authentication blocks access until correct credentials entered
✅ Real-time active workers display updates automatically
✅ All required charts render correctly with actual database data
✅ Year selector filters data without excessive API calls
✅ OF detail pages work via URL parameters
✅ Employee detail pages work via URL parameters
✅ Employee cost CRUD operations work correctly
✅ Dashboard is mobile-friendly and responsive
✅ Error states are handled gracefully
✅ Performance is acceptable (page loads < 3 seconds)
✅ All work is committed to `dashboard-dev` branch only

---

## Final Notes

- **Prioritize functionality over perfection:** Get core features working first, then polish
- **Use modern JavaScript:** Async/await, arrow functions, template literals (no iPad 2 constraint here)
- **Leverage existing code:** The example.html shows working patterns - adapt them
- **Think like a factory owner:** What insights would help make better business decisions?
- **Test with real data:** Use the production backend to ensure calculations are accurate

**You have full access to the repository, terminal, and browser. Implement this dashboard end-to-end in one go.**

Good luck! 🚀
