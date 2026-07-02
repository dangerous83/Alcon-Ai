// Alcon AI Studio — professional AI image & video generation platform.
// Backend: Express API that proxies generations to fal.ai's queue API,
// tracks jobs, downloads finished media locally, and serves the SPA.
import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import * as fal from './lib/falClient.js';
import { catalog, findModel, MAX_VIDEO_SECONDS } from './lib/models.js';
import {
  saveJob, getJob, deleteJob, listJobs, pendingJobs,
  getSettings, updateSettings, getFalKey,
  MEDIA_DIR, UPLOADS_DIR
} from './lib/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '80mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/media', express.static(MEDIA_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

// ---------------------------------------------------------------------------
// Uploads (start/end frames, reference images)
// ---------------------------------------------------------------------------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.png').toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\/(png|jpe?g|webp|gif|avif)$/i.test(file.mimetype));
  }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Upload a PNG, JPEG, WEBP, GIF or AVIF image (max 25 MB).' });
  }
  res.json({
    id: req.file.filename,
    url: `/uploads/${req.file.filename}`,
    name: req.file.originalname,
    size: req.file.size
  });
});

/** Convert a previously uploaded file id into a base64 data URI for fal. */
function uploadToDataUri(uploadId) {
  if (!uploadId) return null;
  const safe = path.basename(uploadId); // prevent traversal
  const file = path.join(UPLOADS_DIR, safe);
  if (!fs.existsSync(file)) throw new Error(`Uploaded file not found: ${safe}`);
  const ext = path.extname(safe).slice(1).toLowerCase();
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext || 'png'}`;
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

// ---------------------------------------------------------------------------
// Model catalog + settings
// ---------------------------------------------------------------------------
app.get('/api/models', (_req, res) => res.json(catalog()));

app.get('/api/settings', (_req, res) => {
  const key = getFalKey();
  res.json({
    hasKey: !!key,
    keyPreview: key ? `${key.slice(0, 6)}…${key.slice(-4)}` : null,
    source: getSettings().falKey ? 'settings' : (process.env.FAL_KEY ? 'env' : null)
  });
});

app.post('/api/settings', async (req, res) => {
  const { falKey } = req.body || {};
  if (typeof falKey !== 'string' || falKey.trim().length < 8) {
    return res.status(400).json({ error: 'Provide a valid fal.ai API key.' });
  }
  const test = await fal.testKey(falKey.trim()).catch(() => ({ ok: true, message: 'Saved (could not reach fal.ai to verify).' }));
  if (!test.ok) return res.status(400).json({ error: test.message });
  updateSettings({ falKey: falKey.trim() });
  res.json({ ok: true, message: test.message });
});

app.post('/api/settings/test', async (_req, res) => {
  const key = getFalKey();
  if (!key) return res.status(400).json({ ok: false, message: 'No API key configured yet.' });
  const test = await fal.testKey(key).catch(e => ({ ok: false, message: `Could not reach fal.ai: ${e.message}` }));
  res.json(test);
});

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------
function badRequest(res, msg) {
  return res.status(400).json({ error: msg });
}

app.post('/api/generate/image', async (req, res) => {
  try {
    const { prompt, modelId, aspectRatio, numImages, referenceUploadIds, seed } = req.body || {};
    if (!prompt?.trim()) return badRequest(res, 'Describe what you want to create.');
    const model = findModel('image', modelId);
    if (!model) return badRequest(res, `Unknown image model: ${modelId}`);

    const referenceImages = (referenceUploadIds || [])
      .slice(0, model.maxReferenceImages || 0)
      .map(uploadToDataUri)
      .filter(Boolean);

    if (model.requiresReference && !referenceImages.length) {
      return badRequest(res, `${model.name} edits an existing image — upload a reference image first.`);
    }

    const { endpoint, payload } = model.build({
      prompt: prompt.trim(),
      aspectRatio,
      numImages: Math.min(Math.max(parseInt(numImages, 10) || 1, 1), model.maxImages || 4),
      referenceImages,
      seed: Number.isFinite(+seed) && seed !== '' && seed != null ? +seed : null
    });

    const job = await submitJob({
      kind: 'image',
      model,
      endpoint,
      payload,
      meta: {
        prompt: prompt.trim(),
        aspectRatio,
        numImages: payload.num_images,
        referenceCount: referenceImages.length,
        referenceUploadIds: referenceUploadIds || []
      }
    });
    res.json(job);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/generate/video', async (req, res) => {
  try {
    const { prompt, modelId, aspectRatio, resolution, duration,
            startFrameUploadId, endFrameUploadId, seed } = req.body || {};
    if (!prompt?.trim()) return badRequest(res, 'Describe the shot you want to generate.');
    const model = findModel('video', modelId);
    if (!model) return badRequest(res, `Unknown video model: ${modelId}`);

    const requested = Math.min(Math.max(parseInt(duration, 10) || 5, 2), MAX_VIDEO_SECONDS);
    const startFrame = uploadToDataUri(startFrameUploadId);
    const endFrame = uploadToDataUri(endFrameUploadId);

    if (endFrame && !startFrame) {
      return badRequest(res, 'An end frame needs a start frame — upload the start frame too.');
    }
    if (endFrame && !model.supportsEndFrame) {
      return badRequest(res, `${model.name} does not support an end frame. Use Seedance 1.0 Lite or Vidu Q1 for start→end keyframing.`);
    }
    if (model.requiresBothFrames && (!startFrame || !endFrame)) {
      return badRequest(res, `${model.name} needs BOTH a start and an end frame.`);
    }

    const { endpoint, payload, duration: finalDuration } = model.build({
      prompt: prompt.trim(),
      aspectRatio,
      resolution,
      duration: requested,
      startFrame,
      endFrame,
      seed: Number.isFinite(+seed) && seed !== '' && seed != null ? +seed : null
    });

    const job = await submitJob({
      kind: 'video',
      model,
      endpoint,
      payload,
      meta: {
        prompt: prompt.trim(),
        aspectRatio,
        resolution: payload.resolution || resolution || model.defaultResolution,
        duration: finalDuration,
        requestedDuration: requested,
        hasStartFrame: !!startFrame,
        hasEndFrame: !!endFrame,
        startFrameUploadId: startFrameUploadId || null,
        endFrameUploadId: endFrameUploadId || null
      }
    });
    res.json(job);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

async function submitJob({ kind, model, endpoint, payload, meta }) {
  const submission = await fal.submit(endpoint, payload);
  const job = saveJob({
    id: crypto.randomUUID(),
    kind,
    modelId: model.id,
    modelName: model.name,
    provider: model.provider,
    endpoint,
    status: 'queued',
    progress: null,
    logs: [],
    outputs: [],
    error: null,
    meta,
    fal: submission,
    createdAt: Date.now()
  });
  pollSoon();
  return job;
}

// ---------------------------------------------------------------------------
// Job polling — server-side watcher for all pending fal requests
// ---------------------------------------------------------------------------
let pollTimer = null;
let polling = false;

function pollSoon(delay = 1500) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(pollPending, delay);
}

async function pollPending() {
  if (polling) return pollSoon(2000);
  polling = true;
  try {
    const pending = pendingJobs();
    for (const job of pending) {
      try {
        const s = await fal.status(job.fal.statusUrl);
        if (s.status === 'IN_QUEUE') {
          job.status = 'queued';
          job.progress = s.queuePosition != null ? `Position ${s.queuePosition} in queue` : 'Queued';
        } else if (s.status === 'IN_PROGRESS') {
          job.status = 'running';
          job.progress = 'Generating…';
          if (s.logs?.length) job.logs = s.logs.slice(-8);
        } else if (s.status === 'COMPLETED') {
          const payload = await fal.result(job.fal.responseUrl);
          job.outputs = await collectOutputs(job, payload);
          job.status = job.outputs.length ? 'completed' : 'failed';
          if (!job.outputs.length) job.error = 'The model returned no media.';
          job.progress = null;
          job.completedAt = Date.now();
        }
        saveJob(job);
      } catch (err) {
        // 4xx from fal on status/result = terminal; transient network errors are retried.
        if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) {
          job.status = 'failed';
          job.error = err.message;
          saveJob(job);
        }
      }
    }
    if (pendingJobs().length) pollSoon(2500);
  } finally {
    polling = false;
  }
}

/** Normalize fal output payloads and mirror media into local storage. */
async function collectOutputs(job, payload) {
  const found = [];
  const push = (item, type) => {
    if (item?.url) found.push({ url: item.url, type, width: item.width, height: item.height });
  };
  if (Array.isArray(payload.images)) payload.images.forEach(i => push(i, 'image'));
  push(payload.image, 'image');
  push(payload.video, 'video');
  if (Array.isArray(payload.videos)) payload.videos.forEach(v => push(v, 'video'));
  if (payload.seed != null) job.meta.seedUsed = payload.seed;

  const outputs = [];
  for (const [i, out] of found.entries()) {
    const entry = { type: out.type, remoteUrl: out.url, width: out.width, height: out.height };
    try {
      const ext = out.type === 'video' ? '.mp4'
        : path.extname(new URL(out.url).pathname) || '.png';
      const filename = `${job.id}-${i}${ext}`;
      const dest = path.join(MEDIA_DIR, filename);
      const res = await fetch(out.url);
      if (res.ok) {
        fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
        entry.url = `/media/${filename}`;
        entry.localPath = dest;
      } else {
        entry.url = out.url;
      }
    } catch {
      entry.url = out.url;
    }
    outputs.push(entry);
  }
  return outputs;
}

// resume polling for any jobs that were pending when the server restarted
if (pendingJobs().length) pollSoon(500);

// ---------------------------------------------------------------------------
// Jobs API
// ---------------------------------------------------------------------------
app.get('/api/jobs', (req, res) => {
  let jobs = listJobs();
  if (req.query.kind) jobs = jobs.filter(j => j.kind === req.query.kind);
  if (req.query.status) jobs = jobs.filter(j => j.status === req.query.status);
  res.json(jobs.slice(0, parseInt(req.query.limit, 10) || 200));
});

app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

app.delete('/api/jobs/:id', (req, res) => {
  res.json({ ok: deleteJob(req.params.id) });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  Alcon AI Studio running → http://localhost:${PORT}`);
  console.log(getFalKey()
    ? '  fal.ai key configured — platform is live.\n'
    : '  No fal.ai key yet — open Settings in the UI to add one.\n');
});
