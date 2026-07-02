// Model catalog: every entry maps UI options to a concrete fal.ai endpoint + payload.
// Each model's build() receives the normalized request from the frontend and
// returns { endpoint, payload }. Frames / reference images arrive as data URIs.

function clampDuration(requested, allowed) {
  if (!allowed?.length) return requested;
  return allowed.reduce((best, d) =>
    Math.abs(d - requested) < Math.abs(best - requested) ? d : best, allowed[0]);
}

// ---------------------------------------------------------------------------
// IMAGE MODELS
// ---------------------------------------------------------------------------
export const IMAGE_MODELS = [
  {
    id: 'seedream-4',
    name: 'Seedream 4.0',
    provider: 'ByteDance',
    tagline: 'Flagship photoreal quality, strong prompt adherence, reference-image editing',
    aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9'],
    maxImages: 4,
    supportsReference: true,
    maxReferenceImages: 6,
    build(req) {
      const sizeMap = {
        '1:1': { width: 2048, height: 2048 },
        '4:3': { width: 2304, height: 1728 },
        '3:4': { width: 1728, height: 2304 },
        '16:9': { width: 2560, height: 1440 },
        '9:16': { width: 1440, height: 2560 },
        '3:2': { width: 2496, height: 1664 },
        '2:3': { width: 1664, height: 2496 },
        '21:9': { width: 3024, height: 1296 }
      };
      const payload = {
        prompt: req.prompt,
        image_size: sizeMap[req.aspectRatio] || sizeMap['1:1'],
        num_images: req.numImages,
        enable_safety_checker: true
      };
      if (req.seed != null) payload.seed = req.seed;
      if (req.referenceImages?.length) {
        payload.image_urls = req.referenceImages;
        return { endpoint: 'fal-ai/bytedance/seedream/v4/edit', payload };
      }
      return { endpoint: 'fal-ai/bytedance/seedream/v4/text-to-image', payload };
    }
  },
  {
    id: 'flux-pro-ultra',
    name: 'FLUX 1.1 Pro Ultra',
    provider: 'Black Forest Labs',
    tagline: 'Up to 4MP ultra-detailed renders, best-in-class realism',
    aspectRatios: ['21:9', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16', '9:21'],
    maxImages: 4,
    supportsReference: false,
    build(req) {
      const payload = {
        prompt: req.prompt,
        aspect_ratio: req.aspectRatio || '16:9',
        num_images: req.numImages,
        enable_safety_checker: true,
        safety_tolerance: '2'
      };
      if (req.seed != null) payload.seed = req.seed;
      return { endpoint: 'fal-ai/flux-pro/v1.1-ultra', payload };
    }
  },
  {
    id: 'flux-kontext-max',
    name: 'FLUX.1 Kontext [max]',
    provider: 'Black Forest Labs',
    tagline: 'Instruction-based editing of an uploaded image — restyle, replace, refine',
    aspectRatios: ['21:9', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16', '9:21'],
    maxImages: 4,
    supportsReference: true,
    requiresReference: true,
    maxReferenceImages: 1,
    build(req) {
      const payload = {
        prompt: req.prompt,
        image_url: req.referenceImages?.[0],
        num_images: req.numImages,
        aspect_ratio: req.aspectRatio || undefined,
        safety_tolerance: '2'
      };
      if (req.seed != null) payload.seed = req.seed;
      return { endpoint: 'fal-ai/flux-pro/kontext/max', payload };
    }
  },
  {
    id: 'imagen-4',
    name: 'Imagen 4',
    provider: 'Google',
    tagline: 'Excellent typography and natural language understanding',
    aspectRatios: ['1:1', '16:9', '9:16', '3:4', '4:3'],
    maxImages: 4,
    supportsReference: false,
    build(req) {
      const payload = {
        prompt: req.prompt,
        aspect_ratio: req.aspectRatio || '1:1',
        num_images: req.numImages
      };
      if (req.seed != null) payload.seed = req.seed;
      return { endpoint: 'fal-ai/imagen4/preview', payload };
    }
  },
  {
    id: 'flux-dev',
    name: 'FLUX.1 [dev]',
    provider: 'Black Forest Labs',
    tagline: 'Fast, economical drafts and ideation',
    aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16'],
    maxImages: 4,
    supportsReference: false,
    build(req) {
      const sizeMap = {
        '1:1': 'square_hd',
        '4:3': 'landscape_4_3',
        '3:4': 'portrait_4_3',
        '16:9': 'landscape_16_9',
        '9:16': 'portrait_16_9'
      };
      const payload = {
        prompt: req.prompt,
        image_size: sizeMap[req.aspectRatio] || 'square_hd',
        num_images: req.numImages,
        num_inference_steps: 28,
        guidance_scale: 3.5,
        enable_safety_checker: true
      };
      if (req.seed != null) payload.seed = req.seed;
      return { endpoint: 'fal-ai/flux/dev', payload };
    }
  }
];

// ---------------------------------------------------------------------------
// VIDEO MODELS  (platform-wide hard cap: 15 s)
// ---------------------------------------------------------------------------
export const MAX_VIDEO_SECONDS = 15;

export const VIDEO_MODELS = [
  {
    id: 'seedance-pro',
    name: 'Seedance 1.0 Pro',
    provider: 'ByteDance',
    tagline: 'Cinematic flagship — fluid multi-shot motion, 1080p',
    durations: [5, 10],
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '1080p',
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    supportsStartFrame: true,
    supportsEndFrame: false,
    build(req) {
      const duration = clampDuration(req.duration, this.durations);
      const payload = {
        prompt: req.prompt,
        resolution: req.resolution || this.defaultResolution,
        duration: String(duration),
        camera_fixed: false
      };
      if (req.seed != null) payload.seed = req.seed;
      if (req.startFrame) {
        payload.image_url = req.startFrame;
        return { endpoint: 'fal-ai/bytedance/seedance/v1/pro/image-to-video', payload, duration };
      }
      payload.aspect_ratio = req.aspectRatio || '16:9';
      return { endpoint: 'fal-ai/bytedance/seedance/v1/pro/text-to-video', payload, duration };
    }
  },
  {
    id: 'seedance-lite',
    name: 'Seedance 1.0 Lite',
    provider: 'ByteDance',
    tagline: 'Fast + supports start AND end frame keyframing',
    durations: [5, 10],
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    supportsStartFrame: true,
    supportsEndFrame: true,
    build(req) {
      const duration = clampDuration(req.duration, this.durations);
      const payload = {
        prompt: req.prompt,
        resolution: req.resolution || this.defaultResolution,
        duration: String(duration)
      };
      if (req.seed != null) payload.seed = req.seed;
      if (req.startFrame) {
        payload.image_url = req.startFrame;
        if (req.endFrame) payload.end_image_url = req.endFrame;
        return { endpoint: 'fal-ai/bytedance/seedance/v1/lite/image-to-video', payload, duration };
      }
      payload.aspect_ratio = req.aspectRatio || '16:9';
      return { endpoint: 'fal-ai/bytedance/seedance/v1/lite/text-to-video', payload, duration };
    }
  },
  {
    id: 'kling-2.5-pro',
    name: 'Kling 2.5 Turbo Pro',
    provider: 'Kuaishou',
    tagline: 'Premium motion quality and dynamics',
    durations: [5, 10],
    resolutions: ['1080p'],
    defaultResolution: '1080p',
    aspectRatios: ['16:9', '9:16', '1:1'],
    supportsStartFrame: true,
    supportsEndFrame: false,
    build(req) {
      const duration = clampDuration(req.duration, this.durations);
      const payload = {
        prompt: req.prompt,
        duration: String(duration),
        negative_prompt: 'blur, distort, and low quality',
        cfg_scale: 0.5
      };
      if (req.startFrame) {
        payload.image_url = req.startFrame;
        return { endpoint: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', payload, duration };
      }
      payload.aspect_ratio = req.aspectRatio || '16:9';
      return { endpoint: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video', payload, duration };
    }
  },
  {
    id: 'vidu-q1',
    name: 'Vidu Q1',
    provider: 'Vidu',
    tagline: 'Purpose-built start→end frame interpolation',
    durations: [5],
    resolutions: ['1080p'],
    defaultResolution: '1080p',
    aspectRatios: ['16:9', '9:16', '1:1'],
    supportsStartFrame: true,
    supportsEndFrame: true,
    requiresBothFrames: true,
    build(req) {
      const duration = clampDuration(req.duration, this.durations);
      const payload = {
        prompt: req.prompt,
        start_image_url: req.startFrame,
        end_image_url: req.endFrame
      };
      if (req.seed != null) payload.seed = req.seed;
      return { endpoint: 'fal-ai/vidu/q1/start-end-to-video', payload, duration };
    }
  },
  {
    id: 'hailuo-02-pro',
    name: 'Hailuo 02 Pro',
    provider: 'MiniMax',
    tagline: 'Excellent physics and character performance, 1080p',
    durations: [6, 10],
    resolutions: ['1080p'],
    defaultResolution: '1080p',
    aspectRatios: ['16:9'],
    supportsStartFrame: true,
    supportsEndFrame: false,
    build(req) {
      const duration = clampDuration(req.duration, this.durations);
      const payload = {
        prompt: req.prompt,
        prompt_optimizer: true
      };
      if (req.startFrame) {
        payload.image_url = req.startFrame;
        return { endpoint: 'fal-ai/minimax/hailuo-02/pro/image-to-video', payload, duration };
      }
      return { endpoint: 'fal-ai/minimax/hailuo-02/pro/text-to-video', payload, duration };
    }
  }
];

export function findModel(kind, id) {
  const list = kind === 'image' ? IMAGE_MODELS : VIDEO_MODELS;
  return list.find(m => m.id === id) || null;
}

/** Public catalog for the frontend (no build functions). */
export function catalog() {
  const strip = m => {
    const { build, ...rest } = m;
    return rest;
  };
  return {
    maxVideoSeconds: MAX_VIDEO_SECONDS,
    image: IMAGE_MODELS.map(strip),
    video: VIDEO_MODELS.map(strip)
  };
}
