# saiparuchuri1118.github.io

Personal portfolio. Plain HTML, CSS and JS with no build step. GitHub Pages serves it as is.

## Structure

```
index.html                  the whole site (one page)
assets/css/styles.css       design tokens at the top, light + dark themes
assets/js/main.js           optional: highlights the current nav section
assets/favicon.svg
Sai_Paruchuri_Resume.pdf    linked from the nav, hero and footer
.nojekyll                   tells GitHub Pages to serve files untouched
```

## Preview locally

```
py -m http.server 8090
```

Then open http://localhost:8090.

## Deploy to saiparuchuri1118.github.io

1. On GitHub, signed in as `saiparuchuri1118`, create a **public** repo named exactly `saiparuchuri1118.github.io`.
2. From this folder:
   ```
   git init
   git add .
   git commit -m "Initial portfolio"
   git branch -M main
   git remote add origin https://github.com/saiparuchuri1118/saiparuchuri1118.github.io.git
   git push -u origin main
   ```
3. Repo **Settings → Pages**: Source = "Deploy from a branch", Branch = `main` / root.
4. The site is live at https://saiparuchuri1118.github.io within a minute or two.

The address always matches the GitHub username. For a cleaner one (e.g. `saiparuchuri.dev`), buy the domain and add it under Settings → Pages → Custom domain.

## Optional: sharper numbers

The site is ready to publish. Two spots marked `TODO(metric)` in `index.html` could be stronger with a before → after:

- Truist front end: load time before → after (e.g. "8 s to 3 s")
- Truist JMS pipeline: throughput before → after, or a percentage

The résumé source is `../resume/resume.html`. Edit it, then print it to PDF and copy it here as `Sai_Paruchuri_Resume.pdf`.

Use only numbers you can explain in an interview. Leave out anything Amazon considers confidential.

## Later

- Add `agentfault` to the Open source section once it has code
- Photo and a short "outside work" line
- Updated résumé PDF (replace `Sai_Paruchuri_Resume.pdf`, keep the filename)
