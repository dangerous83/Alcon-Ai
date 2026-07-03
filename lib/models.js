// Model catalog: every entry maps UI options to a concrete fal.ai endpoint + payload.
// Endpoint ids and input schemas verified against fal.ai docs (July 2026).
// Each model's build() receives the normalized request from the frontend and
// returns { endpoint, payload, duration }. Frames / references arrive as data URIs.

function nearest(requested, allowed) {
  if (!allowed?.length) return requested;
  return allowed.reduce((best, d) =>
    Math.abs(d - requested) < Math.abs(best - requested) ? d : best, allowed[0]);
}

function clampRange(requested, { min, max }) {
  return Math.min(Math.max(requested, min), max);
}

// ---------------------------------------------------------------------------
// IMAGE MODELS
// ---------------------------------------------------------------------------
export const IMAGE_MODELS = [
  {
    id: 'seedream-4.5',
    name: 'Seedream 4.5',
    provider: 'ByteDance',
    tagline: 'Flagship photoreal quality, strong prompt adherence, multi-reference editing',
    aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16'],
    maxImages: 4,
    supportsReference: true,
    maxReferenceImages: 6,
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
        enable_safety_checker: true
      };
      if (req.seed != null) payload.seed = req.seed;
      if (req.referenceImages?.length) {
        payload.image_urls = req.referenceImages;
        return { endpoint: 'fal-ai/bytedance/seedream/v4.5/edit', payload };
      }
      return { endpoint: 'fal-ai/bytedance/seedream/v4.5/text-to-image', payload };
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
        safety_tolerance: '2',
        output_format: 'png'
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
    aspectRatios: ['auto', '21:9', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16', '9:21'],
    maxImages: 4,
    supportsReference: true,
    requiresReference: true,
    maxReferenceImages: 1,
    build(req) {
      const payload = {
        prompt: req.prompt,
        image_url: req.referenceImages?.[0],
        num_images: req.numImages,
        guidance_scale: 3.5,
        safety_tolerance: '2',
        output_format: 'png'
      };
      if (req.aspectRatio && req.aspectRatio !== 'auto') payload.aspect_ratio = req.aspectRatio;
      if (req.seed != null) payload.seed = req.seed;
      return { endpoint: 'fal-ai/flux-pro/kontext/max', payload };
    }
  },
  {
    id: 'omnigen-v2',
    name: 'OmniGen V2',
    provider: 'VectorSpaceLab',
    tagline: 'Omni model — generation, multi-image editing & composition in one network',
    aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16'],
    maxImages: 4,
    supportsReference: true,
    maxReferenceImages: 3,
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
        enable_safety_checker: true
      };
      if (req.seed != null) payload.seed = req.seed;
      if (req.referenceImages?.length) payload.input_image_urls = req.referenceImages;
      return { endpoint: 'fal-ai/omnigen-v2', payload };
    }
  },
  {
    id: 'clarity-upscaler',
    name: 'Clarity Upscaler',
    provider: 'fal',
    tagline: 'Upscale any image 2×–4× with crisp, faithful detail enhancement',
    aspectRatios: ['2x', '3x', '4x'],
    factorPicker: true,
    maxImages: 1,
    supportsReference: true,
    requiresReference: true,
    maxReferenceImages: 1,
    promptOptional: true,
    isUpscaler: true,
    build(req) {
      const payload = {
        image_url: req.referenceImages?.[0],
        prompt: req.prompt || 'masterpiece, best quality, highres',
        upscale_factor: parseInt(req.aspectRatio, 10) || 2,
        creativity: 0.35,
        resemblance: 0.6,
        num_inference_steps: 18,
        enable_safety_checker: true
      };
      if (req.seed != null) payload.seed = req.seed;
      return { endpoint: 'fal-ai/clarity-upscaler', payload };
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
    id: 'seedance-2',
    name: 'Seedance 2.0',
    provider: 'ByteDance',
    tagline: 'State-of-the-art cinematic engine — 1080p, native audio, start+end frames, 4–15s',
    durationRange: { min: 4, max: 15 },
    defaultDuration: 8,
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    supportsStartFrame: true,
    supportsEndFrame: true,
    supportsAudio: true,
    supportsReference: true,
    maxReferenceImages: 4,
    referenceHint: 'Reference people/objects with @Image1, @Image2… in your prompt',
    build(req) {
      const duration = clampRange(req.duration, this.durationRange);
      const payload = {
        prompt: req.prompt,
        resolution: req.resolution || this.defaultResolution,
        duration: String(duration),
        generate_audio: req.audio !== false
      };
      if (req.seed != null) payload.seed = req.seed;
      if (req.startFrame) {
        payload.image_url = req.startFrame;
        if (req.endFrame) payload.end_image_url = req.endFrame;
        return { endpoint: 'bytedance/seedance-2.0/image-to-video', payload, duration };
      }
      if (req.referenceImages?.length) {
        payload.image_urls = req.referenceImages;
        payload.aspect_ratio = req.aspectRatio || '16:9';
        return { endpoint: 'bytedance/seedance-2.0/reference-to-video', payload, duration };
      }
      payload.aspect_ratio = req.aspectRatio || '16:9';
      return { endpoint: 'bytedance/seedance-2.0/text-to-video', payload, duration };
    }
  },
  {
    id: 'kling-3-pro',
    name: 'Kling 3.0 Pro',
    provider: 'Kuaishou',
    tagline: 'Premium 1080p motion with audio, start+end frames, 3–15s',
    durationRange: { min: 3, max: 15 },
    defaultDuration: 5,
    resolutions: ['1080p'],
    defaultResolution: '1080p',
    aspectRatios: ['16:9', '9:16', '1:1'],
    supportsStartFrame: true,
    supportsEndFrame: true,
    supportsAudio: true,
    build(req) {
      const duration = clampRange(req.duration, this.durationRange);
      const payload = {
        prompt: req.prompt,
        duration: String(duration),
        generate_audio: req.audio !== false
      };
      if (req.startFrame) {
        payload.start_image_url = req.startFrame;
        if (req.endFrame) payload.end_image_url = req.endFrame;
        return { endpoint: 'fal-ai/kling-video/v3/pro/image-to-video', payload, duration };
      }
      payload.aspect_ratio = req.aspectRatio || '16:9';
      return { endpoint: 'fal-ai/kling-video/v3/pro/text-to-video', payload, duration };
    }
  },
  {
    id: 'kling-2.5-pro',
    name: 'Kling 2.5 Turbo Pro',
    provider: 'Kuaishou',
    tagline: 'Fast premium motion — great price/quality balance',
    durations: [5, 10],
    defaultDuration: 5,
    resolutions: ['1080p'],
    defaultResolution: '1080p',
    aspectRatios: ['16:9', '9:16', '1:1'],
    supportsStartFrame: true,
    supportsEndFrame: true,
    build(req) {
      const duration = nearest(req.duration, this.durations);
      const payload = {
        prompt: req.prompt,
        duration: String(duration),
        negative_prompt: 'blur, distort, and low quality',
        cfg_scale: 0.5
      };
      if (req.startFrame) {
        payload.image_url = req.startFrame;
        if (req.endFrame) payload.tail_image_url = req.endFrame;
        return { endpoint: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', payload, duration };
      }
      payload.aspect_ratio = req.aspectRatio || '16:9';
      return { endpoint: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video', payload, duration };
    }
  },
  {
    id: 'seedance-1-pro',
    name: 'Seedance 1.0 Pro',
    provider: 'ByteDance',
    tagline: 'Proven cinematic workhorse — 1080p, start+end frames',
    durations: [5, 10],
    defaultDuration: 5,
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '1080p',
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    supportsStartFrame: true,
    supportsEndFrame: true,
    build(req) {
      const duration = nearest(req.duration, this.durations);
      const payload = {
        prompt: req.prompt,
        resolution: req.resolution || this.defaultResolution,
        duration: String(duration)
      };
      if (req.seed != null) payload.seed = req.seed;
      if (req.startFrame) {
        payload.image_url = req.startFrame;
        if (req.endFrame) payload.end_image_url = req.endFrame;
        return { endpoint: 'fal-ai/bytedance/seedance/v1/pro/image-to-video', payload, duration };
      }
      payload.aspect_ratio = req.aspectRatio || '16:9';
      return { endpoint: 'fal-ai/bytedance/seedance/v1/pro/text-to-video', payload, duration };
    }
  },
  {
    id: 'vidu-q1',
    name: 'Vidu Q1',
    provider: 'Vidu',
    tagline: 'Purpose-built start→end frame interpolation',
    durations: [5],
    defaultDuration: 5,
    resolutions: ['1080p'],
    defaultResolution: '1080p',
    aspectRatios: ['16:9', '9:16', '1:1'],
    supportsStartFrame: true,
    supportsEndFrame: true,
    requiresBothFrames: true,
    build(req) {
      const payload = {
        prompt: req.prompt,
        start_image_url: req.startFrame,
        end_image_url: req.endFrame,
        movement_amplitude: 'auto'
      };
      if (req.seed != null) payload.seed = req.seed;
      return { endpoint: 'fal-ai/vidu/q1/start-end-to-video', payload, duration: 5 };
    }
  },
  {
    id: 'hailuo-02-pro',
    name: 'Hailuo 02 Pro',
    provider: 'MiniMax',
    tagline: 'Excellent physics and character performance — 1080p, 6s',
    durations: [6],
    defaultDuration: 6,
    resolutions: ['1080p'],
    defaultResolution: '1080p',
    aspectRatios: ['16:9'],
    supportsStartFrame: true,
    supportsEndFrame: false,
    build(req) {
      const payload = {
        prompt: req.prompt,
        prompt_optimizer: true
      };
      if (req.startFrame) {
        payload.image_url = req.startFrame;
        return { endpoint: 'fal-ai/minimax/hailuo-02/pro/image-to-video', payload, duration: 6 };
      }
      return { endpoint: 'fal-ai/minimax/hailuo-02/pro/text-to-video', payload, duration: 6 };
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
