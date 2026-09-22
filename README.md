# PDF Diff Checker

Two browser tools on one site: compare two PDFs, or split a booklet PDF into PNG pieces.

**Privacy:** All processing happens in your browser. PDFs are never uploaded to any server.

Open **PDF Split** from the title next to PDF Diff Checker, or go to `#split`.

---

## Features

- Drag-and-drop upload for two PDF files
- Choose which pages to compare (for example, old pages 2–5 against new pages 3–6)
- Page-by-page visual comparison
- **Deleted text** shown in dark red, **added text** in dark blue
- **Identical Text Opacity** slider (0% = invisible, 100% = fully visible)
- Download the comparison as a new PDF with selectable export resolution (150–400 DPI)
- Export respects your opacity setting and re-renders at full quality (not upscaled from the preview)
- Works on GitHub Pages — free public hosting, no backend required

### PDF Split

- Upload one booklet PDF and download a ZIP of PNGs
- A tall sheet is cut into `top` and `bottom` (2 PNGs)
- A wide sheet is cut into `top-left`, `bottom-left`, `top-right`, and `bottom-right` (4 PNGs)
- Names follow the booklet order: `1-top.png`, then `2-3-top-left.png`, and a tall last sheet such as `66-top.png`
- Choose 100, 150, or 300 DPI

---

## Project structure

```
PDF_Diff/
├── index.html      ← The website (both tools)
├── script.js       ← PDF comparison
├── split.js        ← Booklet split into PNGs
├── README.md       ← This file
├── server.js       ← Optional: local testing only
├── package.json    ← Optional: local testing only
└── .gitignore
```

For **GitHub Pages**, `index.html`, `script.js`, and `split.js` are the site. The rest is for local development and documentation.

---

## Run locally (optional)

1. Open Terminal in this folder.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the local server:
   ```bash
   npm start
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Deploy to GitHub Pages (from scratch)

Yes — you need to **create a repository on GitHub** and upload this project. GitHub Pages will then host your site at a public URL like:

`https://YOUR_USERNAME.github.io/pdf-diff-checker/`

### Step 1: Create a GitHub account (if you don't have one)

1. Go to [https://github.com](https://github.com)
2. Sign up for a free account

### Step 2: Create a new repository on GitHub

1. Log in to GitHub
2. Click the **+** icon (top right) → **New repository**
3. Fill in:
   - **Repository name:** e.g. `pdf-diff-checker`
   - **Description:** (optional) e.g. `Compare two PDFs in the browser`
   - **Public** (required for free GitHub Pages)
   - **Do NOT** check "Add a README file" (you already have one locally)
4. Click **Create repository**

You will see a page with setup instructions. Keep it open — you will need the repository URL.

### Step 3: Upload your project from your Mac

Open **Terminal** and run these commands. Replace `YOUR_USERNAME` and `pdf-diff-checker` with your actual GitHub username and repo name.

```bash
cd /Users/fung/Documents/AI_test/PDF_Diff

git init
git add index.html script.js README.md .gitignore
git commit -m "Initial commit: PDF Diff Checker"

git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/pdf-diff-checker.git
git push -u origin main
```

If Git asks you to sign in, follow the prompts (GitHub may ask for a Personal Access Token instead of a password).

**Optional:** If you also want `server.js` and `package.json` in the repo (for others to run locally), use:

```bash
git add .
git commit -m "Initial commit: PDF Diff Checker"
git push -u origin main
```

(`node_modules/` is ignored and will not be uploaded.)

### Step 4: Turn on GitHub Pages

1. On GitHub, open your repository (`https://github.com/YOUR_USERNAME/pdf-diff-checker`)
2. Click **Settings** (top tab)
3. In the left sidebar, click **Pages**
4. Under **Build and deployment**:
   - **Source:** Deploy from a branch
   - **Branch:** `main`
   - **Folder:** `/ (root)`
5. Click **Save**

### Step 5: Wait and open your live site

1. Wait 1–3 minutes for GitHub to deploy
2. Refresh the **Pages** settings page
3. You will see: **Your site is live at** `https://YOUR_USERNAME.github.io/pdf-diff-checker/`
4. Open that URL in any browser — anyone can use it

---

## How to use the website

1. Open the site (locally or on GitHub Pages)
2. Upload **Old PDF (Base)** and **New PDF (Modified)**
3. Set the page ranges. Pages are paired in order: old 2–5 with new 3–6 compares 2↔3, 3↔4, 4↔5, and 5↔6. Both ranges must contain the same number of pages. Leave the defaults to compare every page.
4. Click **Compare PDFs**
5. Use the **Identical Text Opacity** slider:
   - Lower = identical parts fade out (easier to spot changes)
   - 0% = only red/blue differences remain visible
6. Click **Download PDF** to save the result. The download includes only the page pairs you selected.

### PDF Split

1. Click **PDF Split** in the header (or open `#split`).
2. Upload one PDF.
3. Choose **100**, **150**, or **300** DPI.
4. Click **Split and download ZIP**. The file stays on your computer and the ZIP downloads when it is ready.

---

## Updating the site after changes

If you edit `index.html` or `script.js` locally:

```bash
cd /Users/fung/Documents/AI_test/PDF_Diff
git add .
git commit -m "Describe your change"
git push
```

GitHub Pages will redeploy automatically within a few minutes.

---

## Troubleshooting

| Problem | What to try |
|--------|-------------|
| Site shows 404 | Wait a few minutes; confirm Pages is set to `main` branch and `/ (root)` folder |
| Blank page | Open browser DevTools (F12) → Console for errors; check that `script.js` is in the repo |
| Compare is slow | Large PDFs take longer; this is normal — processing is in the browser |
| `git push` fails | Sign in to GitHub; you may need a [Personal Access Token](https://github.com/settings/tokens) |

---

## Tech stack

- [PDF.js](https://mozilla.github.io/pdf.js/) — render PDFs in the browser
- [jsPDF](https://github.com/parallax/jsPDF) — export comparison as PDF
- [Tailwind CSS](https://tailwindcss.com/) — UI styling

No backend server is required for the live GitHub Pages site.
