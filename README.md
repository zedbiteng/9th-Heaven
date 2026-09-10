# Materia Finance

A local-first, installable personal finance tracker.

## Features
- Bank, cash, and credit-card accounts
- Expenses and income
- Account-to-account transfers
- Transfers never count as income/expense/budget spend/cash flow
- Custom categories
- Custom month start date
- Category budgets
- Dashboard for balances, current-period income/expense/cash flow, budgets and recent transactions
- Monthly/yearly category spending comparisons
- Bar and line charts
- Income/expense/cash-flow trend report
- IndexedDB local storage
- JSON backup and restore
- Offline support via service worker
- Installable PWA

## Important local-storage note
Your finance data is stored only inside the browser/site storage for the URL where you run Materia Finance.
Clearing site data, changing browser profile, or using another device will not carry the data across.
Use Export JSON regularly.

## Best way to run it
A PWA needs to be served over HTTPS (or localhost) for installation and service-worker offline mode.

### Option A — GitHub Pages
1. Create a new GitHub repository.
2. Upload the CONTENTS of this folder, not the zip itself.
3. In GitHub: Settings → Pages.
4. Set Source to "Deploy from a branch".
5. Select main / root and Save.
6. Open the GitHub Pages URL on Android Chrome.
7. Tap the browser menu → Add to Home screen / Install app.

### Option B — Cloudflare Pages / Netlify
Upload this folder as a static site, then open the HTTPS URL on your phone and install it.

### Local PC test
If you have Python installed:
    python -m http.server 8080
Then visit:
    http://localhost:8080

## Artwork
The included dashboard artwork is a locally bundled, stylized martial-artist heroine illustration created for the theme. 
You can replace `assets/tifa-inspired.svg` with another locally stored image if you prefer.
