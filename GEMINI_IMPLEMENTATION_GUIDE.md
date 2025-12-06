# Gemini 3 Implementation Guide for Dashboard Development

## About This Document

This guide explains the process and best practices for using the dashboard prompt with **Gemini 3** (Google's latest AI model released November 2025) in **Antigravity IDE**.

---

## What is Gemini 3?

**Gemini 3** is Google's most advanced AI model, released November 18, 2025, with state-of-the-art capabilities:

### Key Capabilities
- **Advanced Reasoning:** 91.9% on GPQA Diamond (PhD-level questions), 95% on AIME 2025 (math competition)
- **Superior Coding:** Tops WebDev Arena leaderboard (1487 Elo), 76.2% on SWE-bench Verified, 54.2% on Terminal-Bench 2.0
- **Multimodal Understanding:** Best-in-class for complex image/video understanding
- **Large Context:** 1 million token input window, 64k token output
- **Knowledge Cutoff:** January 2025

### What Makes It Special
Gemini 3 excels at:
- Understanding complex codebases with minimal prompting
- Agentic tool use (terminal operations, file management, web browsing)
- Context-aware reasoning (figures out intent without verbose instructions)
- Multi-step task execution with error recovery

---

## Gemini 3 Prompting Best Practices

Based on [official Google documentation](https://ai.google.dev/gemini-api/docs/gemini-3) and [prompting guides](https://www.philschmid.de/gemini-3-prompt-practices):

### 1. Be Direct and Concise
❌ **Don't:** Use elaborate chain-of-thought instructions or persuasive language
✅ **Do:** State requirements clearly and directly

**Example:**
```
❌ "I would really appreciate it if you could perhaps consider implementing..."
✅ "Implement a dashboard with these features: [list features]"
```

### 2. Favor Logic Over Verbosity
Gemini 3 favors **directness over persuasion** and **logic over verbosity**.
- Skip motivational preambles
- Avoid repeating information
- Provide structured, logical requirements

### 3. Use Uniform Prompt Structure
- Maintain consistent formatting (e.g., use markdown headers, XML tags)
- Define ambiguous terms explicitly
- Group related information together

**Example:**
```markdown
## Context
[Background information]

## Requirements
[What needs to be built]

## Technical Constraints
[Limitations and requirements]
```

### 4. Keep Temperature at Default (1.0)
**Critical:** Gemini 3's reasoning is optimized for temperature = 1.0
- Don't lower temperature expecting more "focused" output
- Changing temperature may cause looping or degraded performance
- Trust the default setting

### 5. Leverage Context Understanding
Gemini 3 is excellent at inferring context:
- You don't need to explain obvious programming concepts
- It understands project structure from file exploration
- It can infer best practices for common tasks

### 6. Provide Examples When Helpful
If specific patterns are important (like the authentication flow in `example.html`), reference them:
```
"Reference `/HTML-example/example.html` for authentication implementation patterns"
```

---

## Using Antigravity IDE

**Antigravity** is Google's AI-powered development environment that gives Gemini 3 full access to:
- **Terminal:** Run bash commands, install packages, test code
- **File System:** Read, write, edit files across the repository
- **Browser:** Test web applications, verify deployments
- **Git Operations:** Commit, push, pull, branch management

### Key Features for This Project

1. **Full Repository Access:** Gemini can explore the codebase, understand structure
2. **Backend Testing:** Can start the Node.js server locally, test endpoints
3. **Frontend Testing:** Can serve the dashboard, open it in browser, verify functionality
4. **Git Integration:** Can commit changes, push to `dashboard-dev` branch
5. **Multi-Step Execution:** Can handle complex workflows autonomously

---

## Implementation Process

### Phase 1: Preparation (Before Giving Prompt)

1. **Ensure you're on the correct branch:**
   ```bash
   git checkout dashboard-dev
   git pull origin dashboard-dev
   ```

2. **Verify environment:**
   - Check that backend is accessible: `https://registo-horas.onrender.com/health`
   - Ensure you have the Custo Funcionários database ID: `284a33537eff807c97f1eb42c26f95cc`

3. **Open Antigravity IDE** with the repository loaded

### Phase 2: Giving the Prompt

1. **Copy the entire content** of `GEMINI_DASHBOARD_PROMPT.md`

2. **Paste into Antigravity IDE** chat

3. **Let Gemini 3 work autonomously:**
   - It will read existing code to understand patterns
   - It will create backend endpoints in `server/index.js`
   - It will create the `/dashboard/` directory structure
   - It will implement all features
   - It will test the implementation
   - It will commit and push to `dashboard-dev`

### Phase 3: Monitoring Progress

Gemini 3 will show you:
- Files being read/created/modified
- Terminal commands being executed
- Test results and outputs
- Commit messages

**You can intervene at any time:**
- Ask for clarification: "Why did you structure the API this way?"
- Request changes: "Make the charts use a different color scheme"
- Debug issues: "The authentication isn't working, can you investigate?"

### Phase 4: Verification

After Gemini completes:

1. **Review the code:**
   - Check `server/index.js` for new endpoints
   - Review `/dashboard/` directory structure
   - Verify authentication implementation

2. **Test locally:**
   ```bash
   cd server
   npm start
   ```
   Then open `/dashboard/` in browser

3. **Test deployment:**
   - Verify GitHub Pages settings for `dashboard-dev` branch
   - Access deployed dashboard: `https://cifcoelho.github.io/registo-horas/dashboard/`

4. **Test functionality:**
   - Login with credentials
   - Verify charts load data
   - Test year selector
   - Test OF/employee detail pages
   - Test CRUD operations

---

## Expected Workflow (What Gemini Will Do)

### Step 1: Codebase Analysis
Gemini will:
- Read `server/index.js` to understand backend patterns
- Read `/HTML-example/example.html` to understand auth and charting
- Read `README.md` and `CLAUDE.md` for context
- Understand Notion database structures

### Step 2: Backend Development
Gemini will:
- Add `CUSTO_FUNCIONARIOS_DB_ID` to environment variables
- Create helper functions for Notion queries
- Implement `/api/dashboard/*` endpoints
- Add employee cost CRUD endpoints
- Test endpoints with sample requests

### Step 3: Frontend Structure
Gemini will:
- Create `/dashboard/` directory
- Set up HTML, CSS, JS files
- Implement authentication (similar to example.html)
- Create API client module

### Step 4: Core Features
Gemini will:
- Implement active workers display
- Build OF progress chart
- Build employee performance chart with year selector
- Create summary statistics cards

### Step 5: Detail Pages
Gemini will:
- Implement OF detail page with URL routing
- Implement employee detail page with URL routing
- Add navigation and deep linking

### Step 6: Database Management
Gemini will:
- Create employee cost management UI
- Implement CRUD operations
- Add confirmation dialogs and notifications

### Step 7: Additional Features
Gemini will:
- Implement cost efficiency visualizations
- Add performance trend charts
- Create work distribution analysis

### Step 8: Testing & Deployment
Gemini will:
- Test authentication flow
- Verify charts render correctly
- Test responsive design
- Commit and push to `dashboard-dev`
- Document changes

---

## Troubleshooting Common Issues

### Issue: Gemini Asks for Clarification

**Cause:** Ambiguity in requirements or missing context

**Solution:** Provide specific answers based on the context:
- "Use URL parameters for OF detail pages"
- "Fetch data in real-time from the backend, no static JSON"
- "Use a single page with filtering for employee selection"

### Issue: Backend Endpoints Not Working

**Cause:** CORS issues, missing environment variables, or Notion API errors

**Solution:** Ask Gemini to:
- "Check CORS configuration in server/index.js"
- "Verify CUSTO_FUNCIONARIOS_DB_ID is added to environment"
- "Test Notion API calls with sample queries"

### Issue: Charts Not Rendering

**Cause:** Missing Chart.js library, incorrect data format, or API errors

**Solution:** Ask Gemini to:
- "Verify Chart.js is loaded via CDN"
- "Console.log the data being passed to charts"
- "Check browser console for errors"

### Issue: Authentication Loop

**Cause:** sessionStorage not persisting or incorrect credential check

**Solution:** Ask Gemini to:
- "Debug the authentication flow - check sessionStorage"
- "Verify credentials match exactly: certoma/certomaSRP"
- "Test in incognito mode to rule out cached state"

### Issue: Mobile Layout Broken

**Cause:** Missing responsive CSS or incorrect media queries

**Solution:** Ask Gemini to:
- "Test the dashboard in responsive mode (mobile viewport)"
- "Add missing mobile breakpoints"
- "Ensure charts are responsive with maintainAspectRatio: false"

---

## Advanced Usage Tips

### Requesting Specific Changes

If you want to modify Gemini's implementation:

**Be specific:**
```
"Change the OF progress chart from stacked bars to grouped bars"
```

**Reference examples:**
```
"Use the same chart style as in example.html for the productivity chart"
```

**Provide context:**
```
"The year selector should be a dropdown, not buttons, to save space on mobile"
```

### Iterative Refinement

You can iterate with Gemini after initial implementation:

1. **Test the dashboard yourself**
2. **Note issues or desired improvements**
3. **Ask Gemini to make specific changes:**
   - "Add a loading spinner when fetching OF details"
   - "Change the color scheme to be more muted"
   - "Add export to CSV functionality for employee reports"

### Code Review with Gemini

Ask Gemini to review its own code:
```
"Review the dashboard API endpoints for potential performance issues"
"Check if there are any security vulnerabilities in the CRUD endpoints"
"Suggest optimizations for reducing API calls"
```

---

## Performance Optimization

Gemini 3 is excellent at optimization. If the dashboard is slow, ask:

```
"Optimize the dashboard for performance:
- Cache employee costs in memory
- Implement pagination for large OF lists
- Add request debouncing for search inputs
- Minimize redundant API calls"
```

---

## Documentation

After Gemini finishes, ask it to:

```
"Update README.md with:
- Dashboard access URL
- New environment variables needed
- Dashboard usage instructions

Update server/.env.example with new variables

Create a DASHBOARD.md file documenting:
- API endpoints
- Data flow
- Troubleshooting guide"
```

---

## Best Practices Specific to This Project

### 1. Maintain Branch Separation
Always verify Gemini is working on `dashboard-dev`:
```bash
git branch  # Should show * dashboard-dev
```

### 2. Test with Real Data
Ask Gemini to:
- "Test with actual production backend data"
- "Verify calculations match the example.html results"

### 3. Preserve Existing Functionality
Ensure Gemini doesn't break tablet interfaces:
- "Do not modify /frontend/ directory"
- "Do not change existing backend endpoints"
- "Only add new endpoints, don't modify existing ones"

### 4. Use Incremental Commits
Ask Gemini to commit frequently:
- "Commit backend endpoints separately from frontend"
- "Use descriptive commit messages"
- "Don't commit everything in one giant commit"

---

## Resources

### Official Documentation
- [Gemini 3 Developer Guide](https://ai.google.dev/gemini-api/docs/gemini-3)
- [Gemini 3 Prompting Best Practices](https://www.philschmid.de/gemini-3-prompt-practices)
- [Gemini 3 for Developers](https://blog.google/technology/developers/gemini-3-developers/)

### Related Technologies
- [Chart.js Documentation](https://www.chartjs.org/docs/latest/)
- [Notion API Documentation](https://developers.notion.com/)
- [GitHub Pages Deployment](https://docs.github.com/en/pages)

---

## Final Checklist

Before considering the project complete:

- [ ] Dashboard accessible at `/dashboard/` on `dashboard-dev` branch
- [ ] Authentication works with correct credentials
- [ ] All required visualizations render with real data
- [ ] Real-time active workers display updates correctly
- [ ] Year selector filters data properly
- [ ] OF detail pages work via URL parameters
- [ ] Employee detail pages work via URL parameters
- [ ] Employee cost CRUD operations work
- [ ] Mobile-responsive design verified
- [ ] Error handling works for all edge cases
- [ ] Performance is acceptable (< 3 second load)
- [ ] All commits are on `dashboard-dev` branch only
- [ ] Documentation updated (README, API docs)
- [ ] Backend deployed to Render with new environment variables
- [ ] GitHub Pages configured for `dashboard-dev` branch
- [ ] Deployed dashboard tested and working

---

## Support

If you encounter issues Gemini can't resolve:

1. **Check Gemini 3 Status:** Verify the model is available and not experiencing outages
2. **Review Error Messages:** Share complete error messages with Gemini
3. **Simplify the Request:** Break complex tasks into smaller steps
4. **Provide More Context:** Share relevant code snippets or error logs
5. **Restart Conversation:** Sometimes starting fresh with a clearer prompt helps

---

**Ready to build? Copy `GEMINI_DASHBOARD_PROMPT.md` into Antigravity IDE and let Gemini 3 work its magic!** 🚀
