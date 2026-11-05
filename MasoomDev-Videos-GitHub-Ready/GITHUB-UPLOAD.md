# Upload to shayanmila/masoomdev-videos

## GitHub web method
1. Unzip `MasoomDev-Videos-GitHub-Ready.zip`.
2. Open https://github.com/shayanmila/masoomdev-videos and select **uploading an existing file** (or **Add file > Upload files**).
3. Drag the **contents** of `MasoomDev-Videos-GitHub-Ready/`, not the folder/ZIP itself. Keep directory structure: `src/worker.js`, `public/index.html`, `extension/`, `schema.sql`, `wrangler.jsonc`, `package.json`.
4. Commit to main. GitHub website may not include `.gitignore` when uploading folders from some browsers; verify it appears or add manually.

## Git CLI method (recommended for preserving folder structure)
From Windows PowerShell in the **extracted project root**:

```powershell
git init
git branch -M main
git remote add origin https://github.com/shayanmila/masoomdev-videos.git
git add .
git status --short
git commit -m "Initial Cloudflare Worker and D1 production candidate"
git push -u origin main
```

Do not push `.env`, `.dev.vars`, `private-data.json` or OAuth/client secrets.

## Cloudflare after GitHub upload
Cloudflare Workers Git integration is optional. To avoid premature production deployment, first configure the D1 database, replace the database ID in `wrangler.jsonc`, set Worker secrets, and deploy/test through Wrangler CLI as specified in `DEPLOYMENT.md`. Use GitHub auto deploy only after those values are ready.

Cloudflare automatic builds cannot run successfully with the placeholder `REPLACE_WITH_YOUR_D1_DATABASE_ID`.
