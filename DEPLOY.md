# Deploying Alcon AI Studio

> **GitHub Pages will NOT work.** This is a full-stack Node app — Pages only
> serves static files and cannot run `server.js`, handle uploads, or keep your
> fal.ai key server-side. Use one of the Node hosts below. All are free to start.

You need a running Node process, not static hosting. Pick one:

---

## Option 1 — Render (easiest, free)

1. Go to [render.com](https://render.com) → **New +** → **Blueprint**.
2. Connect your GitHub and select the **Alcon-Ai** repo.
3. Render reads `render.yaml` and creates the web service automatically.
4. In the service's **Environment** tab, add `FAL_KEY` = your fal.ai key
   (or skip this and paste it in-app under **Settings** after it boots).
5. Click **Deploy**. In ~2 minutes you get a live URL like
   `https://alcon-ai-studio.onrender.com`.

The blueprint is pinned to the `claude/ai-image-video-platform-vqqfvh` branch.
Once that branch is merged to `main`, change `branch:` in `render.yaml` to `main`.

## Option 2 — Railway

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
2. Pick the repo/branch. Railway detects `package.json` and runs `npm start`
   (or uses the included `Dockerfile`).
3. Add a `FAL_KEY` variable in the **Variables** tab.
4. Under **Settings → Networking**, click **Generate Domain** for a public URL.

## Option 3 — Any Docker host (Fly.io, Cloud Run, a VPS)

```bash
docker build -t alcon-ai .
docker run -p 3000:3000 -e FAL_KEY=your_key_here \
  -v $(pwd)/data:/app/data alcon-ai
# → http://localhost:3000
```

The `-v` volume mount keeps generated media across restarts.

## Option 4 — Run it locally right now

```bash
git checkout claude/ai-image-video-platform-vqqfvh
npm install
FAL_KEY=your_key_here npm start
# → http://localhost:3000
```

---

### After it's live
Open the URL, go to **Settings**, paste your fal.ai key (from
[fal.ai/dashboard/keys](https://fal.ai/dashboard/keys)) if you didn't set the
env var — the status dot turns green and every model is active.

### Note on free tiers
Free instances sleep when idle and have ephemeral disk, so generated media
resets on redeploy/sleep. For a permanent gallery, attach a persistent disk
(commented example in `render.yaml`) or mount a Docker volume.
