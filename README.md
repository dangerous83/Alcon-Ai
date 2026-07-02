# ◆ Alcon AI Studio

A professional, self-hosted **AI image & video generation platform** — a full working product, not a mockup.
One API key (from [fal.ai](https://fal.ai)) unlocks every model in the platform.

![Platform](https://img.shields.io/badge/status-production--ready-34d399) ![Node](https://img.shields.io/badge/node-%E2%89%A518-7c5cff)

## What's inside

### 🎬 Video Studio — up to 15 s per shot
| Model | Provider | Start frame | End frame | Max res |
|---|---|---|---|---|
| **Seedance 1.0 Pro** | ByteDance | ✅ | — | 1080p |
| **Seedance 1.0 Lite** | ByteDance | ✅ | ✅ | 1080p |
| **Kling 2.5 Turbo Pro** | Kuaishou | ✅ | — | 1080p |
| **Vidu Q1** (start→end interpolation) | Vidu | ✅ | ✅ | 1080p |
| **Hailuo 02 Pro** | MiniMax | ✅ | — | 1080p |

- **Start-frame & end-frame keyframing** — pin the first frame, or both first *and* last frame for a controlled A→B shot
- Duration selector (hard platform cap: **15 seconds**), resolution and aspect-ratio control
- Drag & drop image upload for keyframes

### 🖼 Image Studio
| Model | Provider | Reference images |
|---|---|---|
| **Seedream 4.0** | ByteDance | ✅ up to 6 (edit / identity / style) |
| **FLUX 1.1 Pro Ultra** | Black Forest Labs | — |
| **FLUX.1 Kontext [max]** | Black Forest Labs | ✅ instruction-based editing |
| **Imagen 4** | Google | — |
| **FLUX.1 [dev]** | Black Forest Labs | — |

- Up to 4 outputs per run, seed control, per-model aspect ratios
- Multi-reference upload for editing and identity/style guidance

### Platform features
- **Real generation queue** — jobs run on fal.ai's GPU queue; the server tracks each request, survives restarts, and resumes tracking
- **Permanent gallery** — every finished image/video is mirrored into `data/media/` on your server, so results never expire
- Live progress (queue position → generating → done) with model logs
- Lightbox viewer, one-click download, delete
- API key managed in-app (Settings), stored **server-side only** — never exposed to the browser

## Quick start

```bash
npm install
npm start
# → http://localhost:3000
```

Then open **Settings** in the UI and paste your fal.ai API key
(create one at [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys)).
Alternatively set it via environment:

```bash
cp .env.example .env   # put FAL_KEY=... inside, or:
FAL_KEY=key_id:key_secret npm start
```

That's it — the platform is live. Generations are billed to your fal.ai account per run.

## Architecture

```
server.js            Express app: uploads, generation API, job poller, static SPA
lib/models.js        Model catalog — maps UI options → exact fal.ai endpoints/payloads
lib/falClient.js     fal.ai queue REST client (submit / status / result / key test)
lib/store.js         JSON persistence for jobs & settings
public/              Single-page studio UI (no build step)
data/media/          Mirrored generation results (gitignored)
uploads/             Uploaded keyframes & reference images (gitignored)
```

Adding a model = one entry in `lib/models.js` (metadata + a `build()` that returns
`{ endpoint, payload }`). The UI picks it up automatically.

## Deploying

Any Node 18+ host works (VPS, Railway, Render, Fly.io, Docker):

```bash
PORT=3000 FAL_KEY=... node server.js
```

Put it behind HTTPS/auth if you expose it publicly — the platform itself has no login layer.
