// Simple JSON-file persistence for jobs and settings.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const UPLOADS_DIR = path.join(ROOT, 'uploads');

for (const dir of [DATA_DIR, MEDIA_DIR, UPLOADS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// ---- Jobs ----
const jobs = new Map(Object.entries(readJson(JOBS_FILE, {})));
let persistTimer = null;

function persistJobs() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    fs.writeFileSync(JOBS_FILE, JSON.stringify(Object.fromEntries(jobs), null, 2));
  }, 150);
}

export function saveJob(job) {
  job.updatedAt = Date.now();
  jobs.set(job.id, job);
  persistJobs();
  return job;
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function deleteJob(id) {
  const job = jobs.get(id);
  if (job) {
    for (const out of job.outputs || []) {
      if (out.localPath) {
        try { fs.unlinkSync(out.localPath); } catch {}
      }
    }
    jobs.delete(id);
    persistJobs();
  }
  return !!job;
}

export function listJobs() {
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function pendingJobs() {
  return [...jobs.values()].filter(j => j.status === 'queued' || j.status === 'running');
}

// ---- Settings ----
let settings = readJson(SETTINGS_FILE, {});

export function getSettings() {
  return settings;
}

export function updateSettings(patch) {
  settings = { ...settings, ...patch };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  return settings;
}

export function getFalKey() {
  return settings.falKey || process.env.FAL_KEY || '';
}
