// Minimal client for the fal.ai queue REST API.
// Docs: https://docs.fal.ai/model-apis/queue
import { getFalKey } from './store.js';

const QUEUE_BASE = 'https://queue.fal.run';

class FalError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = 'FalError';
    this.status = status;
    this.detail = detail;
  }
}

function authHeaders() {
  const key = getFalKey();
  if (!key) {
    throw new FalError(
      'No fal.ai API key configured. Open Settings and paste your key (get one at fal.ai/dashboard/keys).',
      401
    );
  }
  return { Authorization: `Key ${key}` };
}

async function parseError(res) {
  let detail = '';
  try {
    const body = await res.json();
    if (Array.isArray(body.detail)) {
      detail = body.detail.map(d => `${(d.loc || []).join('.')}: ${d.msg}`).join('; ');
    } else {
      detail = body.detail || body.message || JSON.stringify(body);
    }
  } catch {
    detail = await res.text().catch(() => '');
  }
  const prefix =
    res.status === 401 ? 'Invalid API key' :
    res.status === 403 ? 'API key not authorized for this model' :
    res.status === 422 ? 'The model rejected the request parameters' :
    res.status === 429 ? 'Rate limited by fal.ai — try again shortly' :
    `fal.ai error ${res.status}`;
  return new FalError(detail ? `${prefix}: ${detail}` : prefix, res.status, detail);
}

/**
 * Submit a generation to the fal queue.
 * Returns { requestId, statusUrl, responseUrl }.
 */
export async function submit(endpoint, input) {
  const res = await fetch(`${QUEUE_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!res.ok) throw await parseError(res);
  const body = await res.json();
  return {
    requestId: body.request_id,
    statusUrl: body.status_url || `${QUEUE_BASE}/${endpoint}/requests/${body.request_id}/status`,
    responseUrl: body.response_url || `${QUEUE_BASE}/${endpoint}/requests/${body.request_id}`
  };
}

/** Get queue status: { status: 'IN_QUEUE'|'IN_PROGRESS'|'COMPLETED', queuePosition, logs } */
export async function status(statusUrl) {
  const res = await fetch(`${statusUrl}?logs=1`, { headers: authHeaders() });
  if (!res.ok) throw await parseError(res);
  const body = await res.json();
  return {
    status: body.status,
    queuePosition: body.queue_position,
    logs: (body.logs || []).map(l => l.message).filter(Boolean)
  };
}

/** Fetch the final result payload once status is COMPLETED. */
export async function result(responseUrl) {
  const res = await fetch(responseUrl, { headers: authHeaders() });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * Cheap key validation: an authorized key gets 404/422 for a nonexistent
 * request id, an invalid key gets 401.
 */
export async function testKey(key) {
  const res = await fetch(
    `${QUEUE_BASE}/fal-ai/flux/dev/requests/00000000-0000-0000-0000-000000000000/status`,
    { headers: { Authorization: `Key ${key}` } }
  );
  if (res.status === 401 || res.status === 403) return { ok: false, message: 'fal.ai rejected this key.' };
  return { ok: true, message: 'API key accepted — platform is live.' };
}

export { FalError };
