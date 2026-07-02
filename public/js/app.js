/* Alcon AI Studio — frontend application */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const state = {
    catalog: null,
    jobs: [],
    galleryFilter: 'all',
    img: { modelId: null, aspect: null, count: 1, seed: '', refs: [] },
    vid: { modelId: null, duration: 8, resolution: null, aspect: null, seed: '', audio: true,
           startFrame: null, endFrame: null, refs: [] },
    pollTimer: null
  };

  // ------------------------------------------------------------------
  // Utilities
  // ------------------------------------------------------------------
  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
      ...opts,
      body: opts.body instanceof FormData ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function toast(msg, type = 'err', ms = 5200) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function uploadFile(file) {
    const fd = new FormData();
    fd.append('file', file);
    return api('/api/upload', { method: 'POST', body: fd });
  }

  // ------------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------------
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.nav-item').forEach(b => b.classList.toggle('active', b === btn));
      $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${btn.dataset.view}`));
      if (btn.dataset.view === 'gallery') renderGallery();
    });
  });

  // ------------------------------------------------------------------
  // Model / option rendering
  // ------------------------------------------------------------------
  function imgModel() { return state.catalog.image.find(m => m.id === state.img.modelId); }
  function vidModel() { return state.catalog.video.find(m => m.id === state.vid.modelId); }

  function renderChips(container, values, active, onPick, labelFn = v => v) {
    container.innerHTML = '';
    values.forEach(v => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (v === active ? ' active' : '');
      b.textContent = labelFn(v);
      b.addEventListener('click', () => onPick(v));
      container.appendChild(b);
    });
  }

  function renderImageControls() {
    const m = imgModel();
    // model cards
    const wrap = $('#img-models');
    wrap.innerHTML = '';
    state.catalog.image.forEach(mm => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'model-card' + (mm.id === state.img.modelId ? ' active' : '');
      card.innerHTML = `
        <div class="mc-info">
          <div class="mc-name">${esc(mm.name)} <small>${esc(mm.provider)}</small></div>
          <div class="mc-tag">${esc(mm.tagline)}</div>
        </div>
        <div class="mc-badges">${mm.supportsReference ? '<span class="badge">REF</span>' : ''}</div>`;
      card.addEventListener('click', () => {
        state.img.modelId = mm.id;
        if (!mm.aspectRatios.includes(state.img.aspect)) state.img.aspect = mm.aspectRatios[0];
        renderImageControls();
      });
      wrap.appendChild(card);
    });

    if (!m.aspectRatios.includes(state.img.aspect)) state.img.aspect = m.aspectRatios[0];
    renderChips($('#img-aspect'), m.aspectRatios, state.img.aspect, v => { state.img.aspect = v; renderImageControls(); });

    state.img.count = Math.min(state.img.count, m.maxImages || 4);
    $('#img-count span').textContent = state.img.count;

    const refField = $('#img-ref-field');
    refField.style.display = m.supportsReference ? '' : 'none';
    $('#img-ref-hint').textContent = m.requiresReference
      ? `(required — ${m.name} edits your uploaded image)`
      : `(optional — up to ${m.maxReferenceImages || 1}, guides style / identity)`;
  }

  function renderVideoControls() {
    const m = vidModel();
    const wrap = $('#vid-models');
    wrap.innerHTML = '';
    state.catalog.video.forEach(mm => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'model-card' + (mm.id === state.vid.modelId ? ' active' : '');
      const frameBadge = mm.supportsEndFrame ? '<span class="badge frames">START+END</span>'
        : mm.supportsStartFrame ? '<span class="badge frames">START</span>' : '';
      card.innerHTML = `
        <div class="mc-info">
          <div class="mc-name">${esc(mm.name)} <small>${esc(mm.provider)}</small></div>
          <div class="mc-tag">${esc(mm.tagline)}</div>
        </div>
        <div class="mc-badges">${frameBadge}</div>`;
      card.addEventListener('click', () => {
        state.vid.modelId = mm.id;
        renderVideoControls();
      });
      wrap.appendChild(card);
    });

    // durations — slider for continuous ranges, chips for fixed steps.
    // Hard-capped at 15s platform-wide.
    const durWrap = $('#vid-duration');
    if (m.durationRange) {
      const max = Math.min(m.durationRange.max, state.catalog.maxVideoSeconds);
      const min = m.durationRange.min;
      state.vid.duration = Math.min(Math.max(state.vid.duration, min), max);
      durWrap.innerHTML = `
        <div class="duration-slider">
          <input type="range" min="${min}" max="${max}" step="1" value="${state.vid.duration}" />
          <span class="duration-value">${state.vid.duration}s</span>
        </div>`;
      const slider = durWrap.querySelector('input');
      slider.addEventListener('input', () => {
        state.vid.duration = Number(slider.value);
        durWrap.querySelector('.duration-value').textContent = `${state.vid.duration}s`;
      });
      $('#vid-duration-note').textContent = `${m.name} supports ${min}–${max}s · platform max ${state.catalog.maxVideoSeconds}s`;
    } else {
      const durations = m.durations.filter(d => d <= state.catalog.maxVideoSeconds);
      if (!durations.includes(state.vid.duration)) {
        state.vid.duration = durations.reduce((best, d) =>
          Math.abs(d - state.vid.duration) < Math.abs(best - state.vid.duration) ? d : best, durations[0]);
      }
      renderChips(durWrap, durations, state.vid.duration,
        v => { state.vid.duration = v; renderVideoControls(); }, v => `${v}s`);
      $('#vid-duration-note').textContent = `${m.name} supports ${durations.map(d => d + 's').join(' / ')} · platform max ${state.catalog.maxVideoSeconds}s`;
    }

    // audio toggle — only for models with native audio generation
    $('#vid-audio-field').style.display = m.supportsAudio ? '' : 'none';
    $('#vid-audio').setAttribute('aria-pressed', String(state.vid.audio));
    $('#vid-audio').classList.toggle('on', state.vid.audio);

    if (!m.resolutions.includes(state.vid.resolution)) state.vid.resolution = m.defaultResolution;
    renderChips($('#vid-resolution'), m.resolutions, state.vid.resolution,
      v => { state.vid.resolution = v; renderVideoControls(); });

    if (!m.aspectRatios.includes(state.vid.aspect)) state.vid.aspect = m.aspectRatios[0];
    renderChips($('#vid-aspect'), m.aspectRatios, state.vid.aspect, v => { state.vid.aspect = v; renderVideoControls(); });
    // aspect only applies to pure text-to-video (frames define composition otherwise)
    $('#vid-aspect-field').style.display = state.vid.startFrame ? 'none' : '';

    // frame slots
    const endSlot = $('#frame-end');
    const endSupported = m.supportsEndFrame;
    endSlot.classList.toggle('disabled', !endSupported);
    const note = $('#vid-frames-note');
    if (m.requiresBothFrames) {
      note.innerHTML = `<b>${esc(m.name)}</b> interpolates between two keyframes — upload BOTH a start and an end frame.`;
    } else if (endSupported) {
      note.innerHTML = `Optional. Pin the first frame, or both first <b>and</b> last frame for a controlled A→B shot.`;
    } else {
      note.innerHTML = `<b>${esc(m.name)}</b> supports a start frame. For end-frame control pick <b>Seedance 2.0</b>, <b>Kling 3.0 Pro</b> or <b>Vidu Q1</b>.`;
    }
    if (!endSupported && state.vid.endFrame) {
      state.vid.endFrame = null;
      renderFrameSlot('end');
    }

    // reference images (Seedance 2.0 reference-to-video)
    const refField = $('#vid-ref-field');
    const refsAvailable = m.supportsReference && !state.vid.startFrame;
    refField.style.display = refsAvailable ? '' : 'none';
    if (refsAvailable) {
      $('#vid-ref-hint').textContent = `(optional, up to ${m.maxReferenceImages} — ${m.referenceHint || 'guide characters and objects'})`;
    } else if (state.vid.refs.length && !m.supportsReference) {
      state.vid.refs = [];
      renderVidRefThumbs();
    }
  }

  $('#vid-audio').addEventListener('click', () => {
    state.vid.audio = !state.vid.audio;
    renderVideoControls();
  });

  // ------------------------------------------------------------------
  // Image reference uploads
  // ------------------------------------------------------------------
  const refDrop = $('#img-ref-drop');
  const refInput = $('#img-ref-input');
  refDrop.addEventListener('click', () => refInput.click());
  refDrop.addEventListener('dragover', e => { e.preventDefault(); refDrop.classList.add('drag'); });
  refDrop.addEventListener('dragleave', () => refDrop.classList.remove('drag'));
  refDrop.addEventListener('drop', e => {
    e.preventDefault(); refDrop.classList.remove('drag');
    addRefFiles([...e.dataTransfer.files]);
  });
  refInput.addEventListener('change', () => { addRefFiles([...refInput.files]); refInput.value = ''; });

  async function addRefFiles(files) {
    const m = imgModel();
    const max = m.maxReferenceImages || 1;
    for (const f of files.filter(f => f.type.startsWith('image/'))) {
      if (state.img.refs.length >= max) { toast(`${m.name} accepts up to ${max} reference image${max > 1 ? 's' : ''}.`); break; }
      try {
        const up = await uploadFile(f);
        state.img.refs.push(up);
        renderRefThumbs();
      } catch (err) { toast(err.message); }
    }
  }

  function renderRefThumbs() {
    const row = $('#img-ref-thumbs');
    row.innerHTML = '';
    state.img.refs.forEach((r, i) => {
      const t = document.createElement('div');
      t.className = 'thumb';
      t.innerHTML = `<img src="${esc(r.url)}" alt=""><button type="button" title="Remove">×</button>`;
      t.querySelector('button').addEventListener('click', () => {
        state.img.refs.splice(i, 1);
        renderRefThumbs();
      });
      row.appendChild(t);
    });
  }

  // ------------------------------------------------------------------
  // Video reference uploads (reference-to-video)
  // ------------------------------------------------------------------
  const vidRefDrop = $('#vid-ref-drop');
  const vidRefInput = $('#vid-ref-input');
  vidRefDrop.addEventListener('click', () => vidRefInput.click());
  vidRefDrop.addEventListener('dragover', e => { e.preventDefault(); vidRefDrop.classList.add('drag'); });
  vidRefDrop.addEventListener('dragleave', () => vidRefDrop.classList.remove('drag'));
  vidRefDrop.addEventListener('drop', e => {
    e.preventDefault(); vidRefDrop.classList.remove('drag');
    addVidRefFiles([...e.dataTransfer.files]);
  });
  vidRefInput.addEventListener('change', () => { addVidRefFiles([...vidRefInput.files]); vidRefInput.value = ''; });

  async function addVidRefFiles(files) {
    const m = vidModel();
    const max = m.maxReferenceImages || 1;
    for (const f of files.filter(f => f.type.startsWith('image/'))) {
      if (state.vid.refs.length >= max) { toast(`${m.name} accepts up to ${max} reference images.`); break; }
      try {
        const up = await uploadFile(f);
        state.vid.refs.push(up);
        renderVidRefThumbs();
      } catch (err) { toast(err.message); }
    }
  }

  function renderVidRefThumbs() {
    const row = $('#vid-ref-thumbs');
    row.innerHTML = '';
    state.vid.refs.forEach((r, i) => {
      const t = document.createElement('div');
      t.className = 'thumb';
      t.innerHTML = `<img src="${esc(r.url)}" alt=""><button type="button" title="Remove">×</button>`;
      t.querySelector('button').addEventListener('click', () => {
        state.vid.refs.splice(i, 1);
        renderVidRefThumbs();
      });
      row.appendChild(t);
    });
  }

  // ------------------------------------------------------------------
  // Video keyframe slots
  // ------------------------------------------------------------------
  function setupFrameSlot(which) {
    const slot = $(`#frame-${which}`);
    const input = slot.querySelector('input[type=file]');
    slot.addEventListener('click', e => {
      if (e.target.closest('.frame-remove')) return;
      if (slot.classList.contains('disabled')) {
        toast('This model does not support an end frame — pick Seedance 1.0 Lite or Vidu Q1.', 'err', 4200);
        return;
      }
      input.click();
    });
    slot.addEventListener('dragover', e => { e.preventDefault(); if (!slot.classList.contains('disabled')) slot.classList.add('drag'); });
    slot.addEventListener('dragleave', () => slot.classList.remove('drag'));
    slot.addEventListener('drop', async e => {
      e.preventDefault(); slot.classList.remove('drag');
      if (slot.classList.contains('disabled')) return;
      const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'));
      if (f) await setFrame(which, f);
    });
    input.addEventListener('change', async () => {
      if (input.files[0]) await setFrame(which, input.files[0]);
      input.value = '';
    });
    slot.querySelector('.frame-remove').addEventListener('click', () => {
      state.vid[which === 'start' ? 'startFrame' : 'endFrame'] = null;
      renderFrameSlot(which);
      renderVideoControls();
    });
  }

  async function setFrame(which, file) {
    try {
      const up = await uploadFile(file);
      state.vid[which === 'start' ? 'startFrame' : 'endFrame'] = up;
      renderFrameSlot(which);
      renderVideoControls();
    } catch (err) { toast(err.message); }
  }

  function renderFrameSlot(which) {
    const slot = $(`#frame-${which}`);
    const frame = state.vid[which === 'start' ? 'startFrame' : 'endFrame'];
    slot.classList.toggle('filled', !!frame);
    slot.querySelector('.frame-empty').hidden = !!frame;
    const prev = slot.querySelector('.frame-preview');
    prev.hidden = !frame;
    if (frame) prev.querySelector('img').src = frame.url;
  }

  setupFrameSlot('start');
  setupFrameSlot('end');

  // ------------------------------------------------------------------
  // Steppers
  // ------------------------------------------------------------------
  $('#img-count').addEventListener('click', e => {
    const step = e.target.closest('[data-step]');
    if (!step) return;
    const max = imgModel().maxImages || 4;
    state.img.count = Math.min(Math.max(state.img.count + Number(step.dataset.step), 1), max);
    $('#img-count span').textContent = state.img.count;
  });

  // ------------------------------------------------------------------
  // Generation
  // ------------------------------------------------------------------
  $('#img-generate').addEventListener('click', async () => {
    const btn = $('#img-generate');
    const note = $('#img-note');
    const prompt = $('#img-prompt').value.trim();
    const m = imgModel();
    note.classList.remove('error');
    note.textContent = '';
    if (!prompt) return showNote(note, 'Write a prompt first.', true);
    if (m.requiresReference && !state.img.refs.length) {
      return showNote(note, `${m.name} needs a reference image — upload one above.`, true);
    }
    btn.disabled = true;
    $('.btn-label', btn).textContent = 'Submitting…';
    try {
      await api('/api/generate/image', {
        method: 'POST',
        body: {
          prompt,
          modelId: m.id,
          aspectRatio: state.img.aspect,
          numImages: state.img.count,
          seed: $('#img-seed').value.trim() || null,
          referenceUploadIds: state.img.refs.map(r => r.id)
        }
      });
      showNote(note, 'Queued — track progress on the right.');
      refreshJobs(true);
    } catch (err) {
      showNote(note, err.message, true);
    } finally {
      btn.disabled = false;
      $('.btn-label', btn).textContent = 'Generate';
    }
  });

  $('#vid-generate').addEventListener('click', async () => {
    const btn = $('#vid-generate');
    const note = $('#vid-note');
    const prompt = $('#vid-prompt').value.trim();
    const m = vidModel();
    note.classList.remove('error');
    note.textContent = '';
    if (!prompt) return showNote(note, 'Describe the shot first.', true);
    if (m.requiresBothFrames && (!state.vid.startFrame || !state.vid.endFrame)) {
      return showNote(note, `${m.name} needs BOTH start and end frames.`, true);
    }
    if (state.vid.endFrame && !state.vid.startFrame) {
      return showNote(note, 'Add a start frame to go with your end frame.', true);
    }
    btn.disabled = true;
    $('.btn-label', btn).textContent = 'Submitting…';
    try {
      await api('/api/generate/video', {
        method: 'POST',
        body: {
          prompt,
          modelId: m.id,
          aspectRatio: state.vid.aspect,
          resolution: state.vid.resolution,
          duration: state.vid.duration,
          audio: state.vid.audio,
          seed: $('#vid-seed').value.trim() || null,
          startFrameUploadId: state.vid.startFrame?.id || null,
          endFrameUploadId: state.vid.endFrame?.id || null,
          referenceUploadIds: state.vid.startFrame ? [] : state.vid.refs.map(r => r.id)
        }
      });
      showNote(note, 'Queued — video generation typically takes 1–4 minutes.');
      refreshJobs(true);
    } catch (err) {
      showNote(note, err.message, true);
    } finally {
      btn.disabled = false;
      $('.btn-label', btn).textContent = 'Generate video';
    }
  });

  function showNote(el, msg, isError = false) {
    el.textContent = msg;
    el.classList.toggle('error', isError);
    if (isError) toast(msg);
  }

  // ------------------------------------------------------------------
  // Jobs rendering + polling
  // ------------------------------------------------------------------
  async function refreshJobs(immediate = false) {
    try {
      state.jobs = await api('/api/jobs');
    } catch { /* server briefly unavailable — keep last state */ }
    renderJobs();
    if ($('#view-gallery').classList.contains('active')) renderGallery();
    const anyPending = state.jobs.some(j => j.status === 'queued' || j.status === 'running');
    clearTimeout(state.pollTimer);
    if (anyPending) state.pollTimer = setTimeout(() => refreshJobs(), immediate ? 1500 : 3000);
  }

  function jobCard(job) {
    const card = document.createElement('div');
    card.className = `job-card ${job.kind}`;
    const media = document.createElement('div');
    media.className = 'job-media';

    if (job.status === 'queued' || job.status === 'running') {
      media.innerHTML = `
        <div class="job-progress">
          <div class="spinner"></div>
          <span class="status-text">${job.status === 'queued' ? esc(job.progress || 'Queued') : 'Generating…'}</span>
          ${job.logs?.length ? `<span class="status-sub">${esc(job.logs[job.logs.length - 1]).slice(0, 120)}</span>` : ''}
        </div>
        <div class="shimmer"></div>`;
    } else if (job.status === 'failed') {
      media.innerHTML = `
        <div class="job-error">
          <div class="err-icon">⚠</div>
          <p>${esc(job.error || 'Generation failed')}</p>
        </div>`;
    } else if (job.kind === 'video') {
      const out = job.outputs[0];
      media.innerHTML = `<video src="${esc(out.url)}" controls preload="metadata" playsinline></video>`;
    } else if (job.outputs.length > 1) {
      const grid = document.createElement('div');
      grid.className = 'multi';
      job.outputs.forEach((o, i) => {
        const img = document.createElement('img');
        img.src = o.url;
        img.alt = '';
        img.loading = 'lazy';
        img.addEventListener('click', () => openLightbox(job, i));
        grid.appendChild(img);
      });
      media.appendChild(grid);
    } else if (job.outputs.length === 1) {
      const img = document.createElement('img');
      img.src = job.outputs[0].url;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('click', () => openLightbox(job, 0));
      media.appendChild(img);
    }
    card.appendChild(media);

    const info = document.createElement('div');
    info.className = 'job-info';
    const metaTags = [`<span class="tag model">${esc(job.modelName)}</span>`];
    if (job.kind === 'video') {
      if (job.meta?.duration) metaTags.push(`<span class="tag">${esc(job.meta.duration)}s</span>`);
      if (job.meta?.resolution) metaTags.push(`<span class="tag">${esc(job.meta.resolution)}</span>`);
      if (job.meta?.hasStartFrame && job.meta?.hasEndFrame) metaTags.push('<span class="tag">A→B</span>');
      else if (job.meta?.hasStartFrame) metaTags.push('<span class="tag">I2V</span>');
      if (job.meta?.referenceCount) metaTags.push(`<span class="tag">${job.meta.referenceCount} REF</span>`);
      if (job.meta?.audio) metaTags.push('<span class="tag">♪ AUDIO</span>');
    } else {
      if (job.meta?.aspectRatio) metaTags.push(`<span class="tag">${esc(job.meta.aspectRatio)}</span>`);
      if (job.meta?.referenceCount) metaTags.push(`<span class="tag">${job.meta.referenceCount} REF</span>`);
    }
    info.innerHTML = `
      <div class="job-prompt" title="${esc(job.meta?.prompt)}">${esc(job.meta?.prompt || '')}</div>
      <div class="job-meta">
        ${metaTags.join('')}
        <div class="job-actions">
          ${job.status === 'completed' ? `
          <button class="icon-btn dl" title="Download">
            <svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16"/></svg>
          </button>` : ''}
          <button class="icon-btn danger del" title="Delete">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13h8l1-13"/></svg>
          </button>
        </div>
      </div>`;
    card.appendChild(info);

    info.querySelector('.dl')?.addEventListener('click', () => {
      job.outputs.forEach((o, i) => {
        const a = document.createElement('a');
        a.href = o.url;
        a.download = `alcon-${job.kind}-${job.id.slice(0, 8)}-${i}${o.type === 'video' ? '.mp4' : '.png'}`;
        a.click();
      });
    });
    info.querySelector('.del')?.addEventListener('click', async () => {
      await api(`/api/jobs/${job.id}`, { method: 'DELETE' }).catch(() => {});
      state.jobs = state.jobs.filter(j => j.id !== job.id);
      renderJobs();
      renderGallery();
    });

    return card;
  }

  function renderInto(containerId, emptyId, jobs) {
    const grid = $(containerId);
    grid.innerHTML = '';
    jobs.forEach(j => grid.appendChild(jobCard(j)));
    $(emptyId).classList.toggle('show', !jobs.length);
  }

  function renderJobs() {
    renderInto('#img-jobs', '#img-empty', state.jobs.filter(j => j.kind === 'image'));
    renderInto('#vid-jobs', '#vid-empty', state.jobs.filter(j => j.kind === 'video'));
  }

  function renderGallery() {
    const done = state.jobs.filter(j => j.status === 'completed' &&
      (state.galleryFilter === 'all' || j.kind === state.galleryFilter));
    renderInto('#gallery-jobs', '#gallery-empty', done);
  }

  $('#gallery-filter').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.galleryFilter = chip.dataset.filter;
    $$('#gallery-filter .chip').forEach(c => c.classList.toggle('active', c === chip));
    renderGallery();
  });

  // ------------------------------------------------------------------
  // Lightbox
  // ------------------------------------------------------------------
  function openLightbox(job, index = 0) {
    const out = job.outputs[index];
    if (!out) return;
    const body = $('#lb-body');
    body.innerHTML = out.type === 'video'
      ? `<video src="${esc(out.url)}" controls autoplay playsinline></video>`
      : `<img src="${esc(out.url)}" alt="">`;
    $('#lb-caption').textContent = `${job.modelName} — ${job.meta?.prompt || ''}`;
    $('#lightbox').hidden = false;
  }
  $('#lb-close').addEventListener('click', () => { $('#lightbox').hidden = true; $('#lb-body').innerHTML = ''; });
  $('#lightbox').addEventListener('click', e => {
    if (e.target === e.currentTarget) { $('#lightbox').hidden = true; $('#lb-body').innerHTML = ''; }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { $('#lightbox').hidden = true; $('#lb-body').innerHTML = ''; }
  });

  // ------------------------------------------------------------------
  // Settings
  // ------------------------------------------------------------------
  async function refreshApiStatus() {
    const el = $('#api-status');
    try {
      const s = await api('/api/settings');
      el.className = 'api-status ' + (s.hasKey ? 'ok' : 'missing');
      $('.label', el).textContent = s.hasKey ? `API connected (${s.keyPreview})` : 'Add API key in Settings';
      $('#settings-key-status').textContent = s.hasKey
        ? `Key configured (${s.keyPreview})${s.source === 'env' ? ' via FAL_KEY env var' : ''}.`
        : 'No key configured.';
    } catch {
      el.className = 'api-status missing';
      $('.label', el).textContent = 'Server unreachable';
    }
  }

  $('#settings-save').addEventListener('click', async () => {
    const input = $('#settings-key');
    const key = input.value.trim();
    if (!key) return toast('Paste your fal.ai API key first.');
    try {
      const res = await api('/api/settings', { method: 'POST', body: { falKey: key } });
      toast(res.message || 'API key saved — platform is live.', 'ok');
      input.value = '';
      refreshApiStatus();
    } catch (err) {
      toast(err.message);
    }
  });

  $('#settings-test').addEventListener('click', async () => {
    try {
      const res = await api('/api/settings/test', { method: 'POST' });
      toast(res.message, res.ok ? 'ok' : 'err');
    } catch (err) { toast(err.message); }
  });

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------
  (async function init() {
    try {
      state.catalog = await api('/api/models');
    } catch {
      toast('Could not load model catalog — is the server running?');
      return;
    }
    state.img.modelId = state.catalog.image[0].id;
    state.vid.modelId = state.catalog.video[0].id;
    renderImageControls();
    renderVideoControls();
    refreshApiStatus();
    refreshJobs();
  })();
})();
