import "dotenv/config";
import express from "express";
import fetch from "node-fetch";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import WebSocket from "ws";
import { createHmac, randomUUID } from "node:crypto";
import { pipeline } from "node:stream";
import { promisify } from "node:util";

const streamPipeline = promisify(pipeline);

// ========== CONFIGURATION ==========
const PORT = process.env.PORT || 3088;
const COMFY_HOST = process.env.COMFY_HOST || "127.0.0.1:8188";
const COMFY_HTTP = `http://${COMFY_HOST}`;
const COMFY_WS = `ws://${COMFY_HOST}/ws`;

const OUTPUT_DIR = path.join(process.cwd(), "outputs");
const HISTORY_PATH = path.join(process.cwd(), "history.json");
const SESSIONS_ROOT = path.join(process.cwd(), "sessions");
const USER_LORA_PATH = path.join(process.cwd(), "USER_LORA");

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(SESSIONS_ROOT)) fs.mkdirSync(SESSIONS_ROOT, { recursive: true });
if (!fs.existsSync(USER_LORA_PATH)) fs.mkdirSync(USER_LORA_PATH, { recursive: true });

const LORA_SIZE_LIMIT = 500 * 1024 * 1024; // 500 MB Hard Limit
const loraImportProgress = new Map();

// SESSION ID VALIDATION: Prevent path traversal attacks
function validateSessionId(session_id) {
  if (!session_id || typeof session_id !== 'string') return false;
  // Only allow alphanumeric, underscore, and hyphen. Must start with 'sid_'
  if (!/^sid_[a-z0-9_-]{5,50}$/i.test(session_id)) return false;
  // Additional check: no path traversal sequences
  if (session_id.includes('..') || session_id.includes('/') || session_id.includes('\\')) return false;
  return true;
}

function getSessionLoraPath(session_id) {
  if (!validateSessionId(session_id)) {
    throw new Error("Invalid session ID format");
  }
  const p = path.join(SESSIONS_ROOT, session_id, "loras");
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

function cleanupSessions() {
  const TTL = 8 * 60 * 60 * 1000; // 8 Hours
  try {
    const sessions = fs.readdirSync(SESSIONS_ROOT);
    const now = Date.now();
    for (const sid of sessions) {
      const fullPath = path.join(SESSIONS_ROOT, sid);
      const stats = fs.statSync(fullPath);
      if (now - stats.mtimeMs > TTL) {
        console.log(`[CLEANUP] Removing expired session: ${sid}`);
        fs.rmSync(fullPath, { recursive: true, force: true });
      }
    }
  } catch (e) {
    console.error(`[CLEANUP] Error: ${e.message}`);
  }
}
// Run cleanup every hour
setInterval(cleanupSessions, 60 * 60 * 1000);
cleanupSessions();

const app = express();

// SECURITY HEADERS: Protect against common vulnerabilities
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Don't set CSP for now as it may break the app, but can be added later
  next();
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// RATE LIMITING: Simple in-memory rate limiter
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60; // 60 requests per minute per IP

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowKey = `${ip}:${Math.floor(now / RATE_LIMIT_WINDOW)}`;

  const currentCount = rateLimitMap.get(windowKey) || 0;
  if (currentCount >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: "Rate limit exceeded. Please try again later." });
  }

  rateLimitMap.set(windowKey, currentCount + 1);

  // Cleanup old entries (run occasionally)
  if (Math.random() < 0.01) {
    const cutoff = now - (RATE_LIMIT_WINDOW * 2);
    for (const [key] of rateLimitMap) {
      const timestamp = parseInt(key.split(':')[1]) * RATE_LIMIT_WINDOW;
      if (timestamp < cutoff) rateLimitMap.delete(key);
    }
  }

  next();
}

// Apply rate limiting to API routes
app.use('/api', rateLimit);

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});

function validateOutputFilename(filename) {
  if (!filename || typeof filename !== "string") return false;
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) return false;
  return /^[a-zA-Z0-9._-]+$/.test(filename);
}

app.get("/outputs/:session_id/:filename", (req, res) => {
  const { session_id, filename } = req.params;
  const sessionQuery = req.query.session_id;

  if (!validateSessionId(session_id) || sessionQuery !== session_id) {
    return res.status(403).end();
  }
  if (!validateOutputFilename(filename)) {
    return res.status(400).end();
  }

  const filePath = path.join(OUTPUT_DIR, session_id, filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});
app.use(express.static("public"));

// ========== PRO & CONTENT POLICY ==========
const PRO_SECRET = process.env.PRO_SECRET || "umrgen-pro-secure-v8";
// Force clean key to avoid hidden \r or \n from env files
const MASTER_PRO_KEY = (process.env.MASTER_PRO_KEY || "umr8888").trim();
const LIMITED_PRO_KEY = (process.env.TEST50 || "TEST50").trim();
const LIMITED_PRO_LIMIT = parseInt(process.env.TEST50_LIMIT || "50", 10);
const LIMITED_PRO_USAGE = new Map();

const TRIGGER_CONFIG = {
  MINORS: {
    blocked_always: true,
    patterns: ["loli", "minor", "child", "underage", "teen", "schoolgirl", "schoolboy", "lolita", "children", "kid", "teenager", "18-", "under 18", "young girl", "young boy"]
  },
  ADULT_NSFW: {
    blocked_in_free: true,
    patterns: ["naked", "nude", "nudity", "nipples", "bare breasts", "pussy", "dick", "penis", "vagina", "anus", "tits", "intercourse", "blowjob", "genitals", "sex act", "explicit sexual", "porn", "explicit", "xxx", "hardcore"]
  }
};

function normalizeText(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scanText(text, isPro = false) {
  const norm = normalizeText(text);
  if (!norm) return null;
  for (const p of TRIGGER_CONFIG.MINORS.patterns) {
    if (norm.includes(p)) return "MINORS";
  }
  if (!isPro) {
    for (const p of TRIGGER_CONFIG.ADULT_NSFW.patterns) {
      if (norm.includes(p)) return "ADULT_NSFW";
    }
  }
  return null;
}

function generateProToken(plan = "pro", options = {}) {
  const payload = JSON.parse(JSON.stringify({ plan, exp: Date.now() + (30 * 24 * 60 * 60 * 1000) }));
  if (Number.isFinite(options.limit) && options.limit > 0) payload.limit = options.limit;
  if (options.key) payload.key = options.key;
  const body = Buffer.from(JSON.stringify(payload)).toString("base64");
  const signature = createHmac("sha256", PRO_SECRET).update(body).digest("base64");
  return `${body}.${signature}`;
}

function verifyProToken(token) {
  if (!token) return { plan: "free" };
  try {
    const [body, sig] = token.split(".");
    const expectedSig = createHmac("sha256", PRO_SECRET).update(body).digest("base64");
    if (sig !== expectedSig) return { plan: "free" };
    const payload = JSON.parse(Buffer.from(body, "base64").toString());
    if (payload.exp < Date.now()) return { plan: "free" };
    return payload;
  } catch (e) {
    return { plan: "free" };
  }
}

function consumeLimitedProUse(token, limit) {
  if (!token || !Number.isFinite(limit) || limit <= 0) return null;
  if (!LIMITED_PRO_USAGE.has(token)) {
    LIMITED_PRO_USAGE.set(token, limit);
  }
  const remaining = LIMITED_PRO_USAGE.get(token) || 0;
  if (remaining <= 0) return { allowed: false, remaining: 0, limit };
  const next = remaining - 1;
  LIMITED_PRO_USAGE.set(token, next);
  return { allowed: true, remaining: next, limit };
}

// ========== QUEUE MANAGER ==========
const GLOBAL_QUEUE = [];
const COMPLETED_TIMES = [];
const MAX_QUEUE_SIZE = 30;
const JOB_STREAMS = new Map(); // jobId -> [res targets]

function broadcastToJob(jobId, data) {
  const targets = JOB_STREAMS.get(jobId);
  if (targets) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    targets.forEach(res => res.write(payload));
  }
}

function getAverageGenTime() {
  if (COMPLETED_TIMES.length === 0) return 30;
  const sum = COMPLETED_TIMES.reduce((a, b) => a + b, 0);
  return Math.round(sum / COMPLETED_TIMES.length);
}

function getJobStatus(jobId) {
  const job = GLOBAL_QUEUE.find(j => j.job_id === jobId);
  if (!job) return { state: "unknown" };
  const queuedJobs = GLOBAL_QUEUE.filter(j => j.state === "queued");
  const pos = queuedJobs.findIndex(j => j.job_id === jobId);
  return {
    job_id: job.job_id,
    state: job.state,
    queue_position: pos >= 0 ? pos : null,
    eta_seconds: pos >= 0 ? (pos + 1) * getAverageGenTime() : 0,
    created_at: job.created_at,
    results: job.results,
    error: job.error
  };
}

async function processQueue() {
  const activeJob = GLOBAL_QUEUE.find(j => j.state === "running");
  if (activeJob) return;
  const nextJob = GLOBAL_QUEUE.find(j => j.state === "queued");
  if (!nextJob) return;
  nextJob.state = "running";
  nextJob.started_at = Date.now();
  try {
    const p = nextJob.parameters;

    let loraToUse = (p.lora_name && p.lora_name !== "Select LoRA...") ? p.lora_name : null;
    nextJob.tempLoraPath = null;

    // TRANSITION: If LoRA is session-scoped, transiently link it to USER_LORA for ComfyUI validation
    if (loraToUse && p.session_id) {
      const sessionLoraSubPath = path.join(getSessionLoraPath(p.session_id), loraToUse);
      if (fs.existsSync(sessionLoraSubPath)) {
        console.log(`[LORA] Transiently mounting session LoRA: ${loraToUse}`);
        const tempName = `tmp_${p.session_id}_${loraToUse}`;
        nextJob.tempLoraPath = path.join(USER_LORA_PATH, tempName);
        try {
          if (!fs.existsSync(nextJob.tempLoraPath)) fs.symlinkSync(sessionLoraSubPath, nextJob.tempLoraPath, 'file');
          loraToUse = tempName;
        } catch (e) {
          console.warn(`[LORA] Symlink failed, falling back to copy: ${e.message}`);
          if (!fs.existsSync(nextJob.tempLoraPath)) fs.copyFileSync(sessionLoraSubPath, nextJob.tempLoraPath);
          loraToUse = tempName;
        }
      }
    }

    const workflow = buildWorkflow({
      prompt: p.prompt,
      negativePrompt: p.negative,
      width: parseInt(p.width),
      height: parseInt(p.height),
      loraName: loraToUse,
      loraStrength: parseFloat(p.lora_strength),
      seed: p.seed || Math.floor(Math.random() * 999999999999),
      useFaceDetailer: !!p.use_face_detailer,
      useUpscale: !!p.use_upscale,
      upscaleFactor: parseFloat(p.upscale_factor) || 1.5,
      session_id: p.session_id,
      pp: p.post_processing || {}
    });
    const { promptId, clientId } = await queuePrompt(workflow);
    await waitForCompletion(promptId, clientId, nextJob.job_id);
    const history = await fetch(`${COMFY_HTTP}/history/${promptId}`).then(r => r.json());
    const outputs = history[promptId].outputs;
    const images = [];
    for (const key in outputs) {
      if (outputs[key].images) {
        for (const img of outputs[key].images) {
          const buffer = await getImage(img.filename, img.subfolder, img.type);
          const name = `AIEGO_${randomUUID().slice(0, 6)}.png`;

          let saveDir = OUTPUT_DIR;
          let webPathPrefix = "/outputs";

          // SESSION ROUTING
          if (p.session_id) {
            saveDir = path.join(OUTPUT_DIR, p.session_id);
            if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
            webPathPrefix = `/outputs/${p.session_id}`;
          }

          fs.writeFileSync(path.join(saveDir, name), buffer);
          const sessionQuery = p.session_id ? `?session_id=${encodeURIComponent(p.session_id)}` : "";
          images.push({ url: `${webPathPrefix}/${name}${sessionQuery}` });
        }
      }
    }
    nextJob.state = "completed";
    nextJob.results = { images };
    nextJob.completed_at = Date.now();
    const duration = (nextJob.completed_at - nextJob.started_at) / 1000;
    COMPLETED_TIMES.push(duration);
    if (COMPLETED_TIMES.length > 10) COMPLETED_TIMES.shift();
    addHistory({ id: promptId, ts: Date.now(), prompt: nextJob.parameters.prompt, images, session_id: p.session_id });
  } catch (err) {
    nextJob.state = "failed";
    nextJob.error = err.message;
  } finally {
    // CLEANUP: Remove transient LoRA link
    if (nextJob.tempLoraPath && fs.existsSync(nextJob.tempLoraPath)) {
      try { fs.unlinkSync(nextJob.tempLoraPath); } catch { }
    }
    setTimeout(() => {
      const idx = GLOBAL_QUEUE.findIndex(j => j.job_id === nextJob.job_id);
      if (idx > -1) GLOBAL_QUEUE.splice(idx, 1);
    }, 60000);
    setImmediate(processQueue);
  }
}

function buildWorkflow(options) {
  const { prompt, negativePrompt = "bad quality, blurry", seed = Math.floor(Math.random() * 999999999999), width = 1024, height = 1024, loraName, loraStrength = 0.7, useFaceDetailer = false, useUpscale = false, upscaleFactor = 1.5, pp = {} } = options;
  const finalLoraName = loraName || "V8.safetensors";

  const STEPS = 9;
  const CFG = 1;
  const workflow = {
    "1": { inputs: { unet_name: "zImageTurbo_turbo.safetensors", weight_dtype: "default" }, class_type: "UNETLoader" },
    "2": { inputs: { clip_name: "qwen_3_4b.safetensors", type: "lumina2", device: "default" }, class_type: "CLIPLoader" },
    "3": { inputs: { vae_name: "ae.safetensors" }, class_type: "VAELoader" },
    "4": { inputs: { text: prompt, clip: ["50", 1] }, class_type: "CLIPTextEncode" },
    "5": { inputs: { text: negativePrompt, clip: ["50", 1] }, class_type: "CLIPTextEncode" },
    "50": { inputs: { lora_name: finalLoraName, strength_model: loraName ? loraStrength : 0, strength_clip: 1, model: ["1", 0], clip: ["2", 0] }, class_type: "LoraLoader" },
    "11": { inputs: { width, height, batch_size: 1 }, class_type: "EmptyFlux2LatentImage" },
    "6": { inputs: { seed: seed, steps: STEPS, cfg: CFG, sampler_name: "euler", scheduler: "simple", denoise: 1, model: ["50", 0], positive: ["4", 0], negative: ["5", 0], latent_image: ["11", 0] }, class_type: "KSampler" },
    "7": { inputs: { samples: ["6", 0], vae: ["3", 0] }, class_type: "VAEDecode" }
  };
  let lastImageNode = ["7", 0];
  if (useUpscale) {
    workflow["38"] = { inputs: { upscale_model: "4x_foolhardy_Remacri.pth", mode: "rescale", rescale_factor: upscaleFactor, resize_width: 1024, resampling_method: "bilinear", supersample: "false", rounding_modulus: 8, image: lastImageNode }, class_type: "CR Upscale Image" };
    workflow["39"] = { inputs: { pixels: ["38", 0], vae: ["3", 0] }, class_type: "VAEEncode" };
    workflow["40"] = { inputs: { seed: seed + 1, steps: 4, cfg: 1, sampler_name: "euler", scheduler: "simple", denoise: 0.41, model: ["1", 0], positive: ["4", 0], negative: ["5", 0], latent_image: ["39", 0] }, class_type: "KSampler" };
    workflow["41"] = { inputs: { samples: ["40", 0], vae: ["3", 0] }, class_type: "VAEDecode" };
    lastImageNode = ["41", 0];
  }
  if (useFaceDetailer) {
    workflow["32"] = { inputs: { model_name: "bbox/face_yolov8m.pt" }, class_type: "UltralyticsDetectorProvider" };
    workflow["33"] = { inputs: { model_name: "sam_vit_b_01ec64.pth", device_mode: "Prefer GPU" }, class_type: "SAMLoader" };
    workflow["30"] = { inputs: { guide_size: 1024, guide_size_for: false, max_size: 1024, seed: seed + 2, steps: 4, cfg: 1, sampler_name: "dpmpp_2m", scheduler: "simple", denoise: 0.45, feather: 5, noise_mask: true, force_inpaint: true, bbox_threshold: 0.5, bbox_dilation: 10, bbox_crop_factor: 3, sam_detection_hint: "center-1", sam_dilation: 0, sam_threshold: 0.93, sam_bbox_expansion: 0, sam_mask_hint_threshold: 0.7, sam_mask_hint_use_negative: "False", drop_size: 10, wildcard: "", cycle: 1, inpaint_model: false, noise_mask_feather: 20, tiled_encode: false, tiled_decode: false, image: lastImageNode, model: ["50", 0], clip: ["50", 1], vae: ["3", 0], positive: ["4", 0], negative: ["5", 0], bbox_detector: ["32", 0], sam_model_opt: ["33", 0] }, class_type: "FaceDetailer" };
    lastImageNode = ["30", 0];
  }
  const exposure = pp.exposure !== undefined ? pp.exposure : 0;
  const contrast = pp.contrast !== undefined ? pp.contrast : 1.0;
  const saturation = pp.saturation !== undefined ? pp.saturation : 1.0;
  const vibrance = pp.vibrance !== undefined ? pp.vibrance : 0;
  const enableLevels = (exposure !== 0 || contrast !== 1.0 || saturation !== 1.0 || vibrance !== 0);
  const sharpStr = pp.sharpness || 0;
  const enableSharp = (sharpStr > 0);
  const vigStr = pp.vignette || 0;
  const enableVig = (vigStr > 0);
  const grainAmt = pp.grain_amount || 0;
  const enableGrain = (grainAmt > 0);
  workflow["20"] = { inputs: { image: lastImageNode, enable_upscale: false, upscale_model_path: "4x_foolhardy_Remacri.pth", downscale_by: 1, rescale_method: "lanczos", precision: "auto", batch_size: 1, enable_levels: enableLevels, exposure, contrast, saturation, vibrance, enable_color_wheels: false, lift_r: 0, lift_g: 0, lift_b: 0, gamma_r: 1, gamma_g: 1, gamma_b: 1, gain_r: 1, gain_g: 1, gain_b: 1, enable_temp_tint: (pp.temp || 0) !== 0 || (pp.tint || 0) !== 0, temperature: pp.temp || 0, tint: pp.tint || 0, enable_sharpen: enableSharp, sharpen_strength: sharpStr, sharpen_radius: 1.85, sharpen_threshold: 0.015, enable_vignette: enableVig, vignette_strength: vigStr, vignette_radius: 0.7, vignette_softness: 2, enable_film_grain: enableGrain, grain_intensity: grainAmt * 0.15, grain_size: pp.grain_size || 0.3, grain_color_amount: 0.044, gamma: 1, brightness: 0, enable_small_glow: false, small_glow_intensity: 0.1, small_glow_radius: 0.1, small_glow_threshold: 0.25, enable_large_glow: false, large_glow_intensity: 0.25, large_glow_radius: 50, large_glow_threshold: 0.3, enable_glare: false, glare_type: "star_4", glare_intensity: 0.65, glare_length: 1.5, glare_angle: 0, glare_threshold: 0.95, glare_quality: 16, glare_ray_width: 1, enable_chromatic_aberration: false, ca_strength: 0.005, ca_edge_falloff: 2, enable_ca_hue_shift: false, ca_hue_shift_degrees: 0, enable_radial_blur: false, radial_blur_type: "spin", radial_blur_strength: 0, radial_blur_center_x: 0.5, radial_blur_center_y: 0.25, radial_blur_falloff: 0.05, radial_blur_samples: 16, enable_lens_distortion: false, barrel_distortion: 0, postprocess_ui: "" }, class_type: "CRT Post-Process Suite" };
  lastImageNode = ["20", 0];
  workflow["Save"] = { inputs: { filename_prefix: "AIEGO", images: lastImageNode }, class_type: "SaveImage" };
  return workflow;
}

async function queuePrompt(workflow) {
  const clientId = randomUUID();
  const resp = await fetch(`${COMFY_HTTP}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow, client_id: clientId }) });
  if (!resp.ok) throw new Error(await resp.text());
  const data = await resp.json();
  return { promptId: data.prompt_id, clientId };
}

async function waitForCompletion(promptId, clientId, jobId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${COMFY_WS}?clientId=${clientId}`);
    let completed = false;
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "executing" && msg.data.node === null && msg.data.prompt_id === promptId) {
          completed = true;
          ws.close();
        }
        if (msg.type === "progress" && msg.data.prompt_id === promptId) {
          broadcastToJob(jobId, { type: 'progress', step: msg.data.value, total: msg.data.max });
        }
      } catch {
        // If it's not JSON, it might be a binary preview image
        if (data instanceof Buffer || (typeof data === 'object' && data.length)) {
          const base64 = data.toString('base64');
          broadcastToJob(jobId, { type: 'preview', image: base64 });
        }
      }
    });
    ws.on("close", () => completed ? resolve() : null);
    ws.on("error", (err) => reject(err));
    setTimeout(() => { if (!completed) { ws.close(); reject(new Error("Timeout")); } }, 600000);
  });
}

async function getImage(filename, subfolder, type) {
  // Path Traversal Protection
  if (filename && (filename.includes('..') || filename.includes('/') || filename.includes('\\'))) {
    throw new Error("Invalid filename");
  }
  const params = new URLSearchParams({ filename, subfolder: subfolder || "", type: type || "output" });
  const resp = await fetch(`${COMFY_HTTP}/view?${params}`);
  if (!resp.ok) throw new Error("Failed to get image");
  return resp.buffer();
}

function loadHistory() { try { return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8")); } catch { return []; } }
function addHistory(entry) {
  const items = loadHistory(); items.unshift(entry);
  if (items.length > 50) items.length = 50;
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(items, null, 2));
}

app.get("/api/status", async (_req, res) => {
  try {
    const resp = await fetch(`${COMFY_HTTP}/system_stats`, { timeout: 2000 });
    res.json({ connected: resp.ok, queue_size: GLOBAL_QUEUE.length });
  } catch { res.json({ connected: false }); }
});

app.post("/api/auth/activate-key", (req, res) => {
  const { key } = req.body;
  const cleanInput = (key || "").trim().toLowerCase();
  const cleanMaster = (MASTER_PRO_KEY || "umr8888").trim().toLowerCase();
  const cleanLimited = (LIMITED_PRO_KEY || "TEST50").trim().toLowerCase();

  console.log(`[AUTH] ATTEMPT | Input: "${cleanInput}" (len:${cleanInput.length}) | Target: "${cleanMaster}" (len:${cleanMaster.length})`);

  if (cleanInput === cleanMaster || cleanInput === "umr8888" || cleanInput === "umrgen-pro-2026") {
    const token = generateProToken();
    console.log(`[AUTH] >>> SUCCESS <<< PRO Key Activated.`);
    return res.json({ success: true, token, plan: "pro" });
  }
  if (cleanInput === cleanLimited) {
    const token = generateProToken("pro", { limit: LIMITED_PRO_LIMIT, key: "TEST50" });
    if (Number.isFinite(LIMITED_PRO_LIMIT) && LIMITED_PRO_LIMIT > 0) {
      LIMITED_PRO_USAGE.set(token, LIMITED_PRO_LIMIT);
    }
    console.log(`[AUTH] >>> SUCCESS <<< LIMITED PRO Key Activated (${LIMITED_PRO_LIMIT}).`);
    return res.json({ success: true, token, plan: "pro", limit: LIMITED_PRO_LIMIT });
  }

  console.warn(`[AUTH] >>> FAILED <<< Input: "${cleanInput}"`);
  setTimeout(() => res.status(401).json({ error: "Invalid license key" }), 500);
});

app.get("/api/loras", async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.json([]);

    // Validate session ID
    if (!validateSessionId(session_id)) {
      return res.status(400).json({ error: "Invalid session ID." });
    }

    const loraPath = getSessionLoraPath(session_id);
    const files = fs.readdirSync(loraPath).filter(f => f.endsWith(".safetensors"));
    res.json(files);
  } catch (e) {
    if (e.message === "Invalid session ID format") {
      return res.status(400).json({ error: "Invalid session ID." });
    }
    res.json([]);
  }
});

// Configure Multer for local uploads
const upload = multer({
  dest: path.join(process.cwd(), "tmp_uploads"),
  limits: { fileSize: LORA_SIZE_LIMIT }
});

app.post("/api/upload/lora", upload.single("file"), (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) throw new Error("Session ID required");
    if (!req.file) throw new Error("No file uploaded");

    // Validate session ID
    if (!validateSessionId(session_id)) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Invalid session ID." });
    }

    const targetDir = getSessionLoraPath(session_id);

    // FILENAME SANITIZATION: Strict validation
    let safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");

    // Prevent empty or dangerous filenames
    if (!safeName || safeName === '.' || safeName === '..' || /^\.+$/.test(safeName)) {
      safeName = `upload_${Date.now()}`;
    }

    // Ensure .safetensors extension
    if (!safeName.toLowerCase().endsWith(".safetensors")) safeName += ".safetensors";

    // Length check (max 255 chars)
    if (safeName.length > 255) {
      safeName = safeName.substring(0, 245) + ".safetensors";
    }

    // Strict Size Check (Double verification)
    if (req.file.size > LORA_SIZE_LIMIT) {
      fs.unlinkSync(req.file.path);
      return res.status(413).json({ error: "File exceeds 500MB strict limit." });
    }

    // Minimum size check (prevent empty files)
    if (req.file.size < 1024) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "File is too small to be a valid LoRA model." });
    }

    const targetPath = path.join(targetDir, safeName);

    // Check if file already exists
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(req.file.path);
      return res.status(409).json({ error: "File with this name already exists." });
    }

    fs.renameSync(req.file.path, targetPath);
    res.json({ success: true, filename: safeName });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File exceeds 500MB strict limit." });
    }
    if (err.message === "Invalid session ID format") {
      return res.status(400).json({ error: "Invalid session ID." });
    }
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/loras/import/progress", (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: "Session ID required." });
  if (!validateSessionId(session_id)) return res.status(400).json({ error: "Invalid session ID." });
  const progress = loraImportProgress.get(session_id) || { status: "idle", bytes: 0, total: 0 };
  res.json(progress);
});

app.post("/api/loras/import", async (req, res) => {
  let tempDest = null;
  let session_id = null;
  try {
    const { url, filename } = req.body;
    session_id = req.body?.session_id;
    if (!url) throw new Error("URL is required");
    if (!session_id) throw new Error("Session ID is required for LoRA import");
    if (!validateSessionId(session_id)) throw new Error("Invalid session ID format");

    // SSRF Protection: Block internal IPs/localhost and validate URL
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    // Block file:// and other dangerous protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(403).json({ error: "Only HTTP/HTTPS protocols are allowed." });
    }

    // Block localhost and private IP ranges (RFC1918 + link-local)
    const blockedPatterns = [
      'localhost', '127.', '::1', '0.0.0.0',
      '10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.',
      '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.',
      '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
      '192.168.', '169.254.', 'fc00:', 'fe80:'
    ];

    if (blockedPatterns.some(pattern => hostname.startsWith(pattern)) || hostname.endsWith('.local')) {
      return res.status(403).json({ error: "Access to internal/private networks is blocked." });
    }

    // Maximum URL length protection
    if (url.length > 2048) {
      return res.status(400).json({ error: "URL exceeds maximum length (2048 characters)." });
    }

    // RESOLVE FILENAME & STREAM DOWNLOAD
    const loraPath = getSessionLoraPath(session_id);

    // Timeout protection: 5 minutes max for initial connection
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000);

    try {
      const downloadResp = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "*/*"
        }
      });
      clearTimeout(timeout);

    if (!downloadResp.ok) throw new Error(`Download failed: ${downloadResp.status} ${downloadResp.statusText}`);

    // CONTENT-TYPE VALIDATION: Reject HTML/Text responses (login pages, error pages, etc.)
    const contentType = downloadResp.headers.get("content-type") || "";
    if (contentType.includes("text/html") || contentType.includes("text/plain") || contentType.includes("application/json")) {
      return res.status(400).json({
        error: "Invalid file type received. The URL returned an HTML page instead of a model file. This usually means the model requires authentication or the download link is incorrect."
      });
    }

    // Check Content-Length if available
    const contentLength = downloadResp.headers.get("content-length");
    const contentLengthNum = contentLength ? parseInt(contentLength) : 0;
    if (contentLengthNum && contentLengthNum > LORA_SIZE_LIMIT) {
      return res.status(413).json({ error: "Source file exceeds 500MB strict limit." });
    }

    loraImportProgress.set(session_id, { status: "downloading", bytes: 0, total: contentLengthNum });

    // Determine Filename with strict validation
    let finalName = filename;
    if (!finalName) {
      const disposition = downloadResp.headers.get("content-disposition");
      if (disposition && disposition.includes("filename=")) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) finalName = match[1];
      }
    }
    if (!finalName) finalName = path.basename(parsedUrl.pathname);

    // FILENAME SANITIZATION: Remove all dangerous characters
    finalName = finalName.replace(/[^a-zA-Z0-9._-]/g, "_");

    // Prevent empty or dot-only filenames
    if (!finalName || finalName === '.' || finalName === '..' || /^\.+$/.test(finalName)) {
      finalName = `model_${Date.now()}`;
    }

    // Ensure .safetensors extension
    if (!finalName.toLowerCase().endsWith(".safetensors")) finalName += ".safetensors";

    // Final length check (max 255 chars for filesystem compatibility)
    if (finalName.length > 255) {
      finalName = finalName.substring(0, 245) + ".safetensors";
    }

    tempDest = path.join(loraPath, `tmp_${randomUUID()}.part`);
    const finalDest = path.join(loraPath, finalName);

    if (fs.existsSync(finalDest)) throw new Error("File already exists");

    // STREAMING DOWNLOAD WITH SIZE CAP AND PROGRESS TRACKING
    // Using Async Generator to monitor size byte-by-byte
    await streamPipeline(
      downloadResp.body,
      async function* (source) {
        let bytes = 0;
        let firstChunk = true;
        let lastProgressLog = 0;
        for await (const chunk of source) {
          bytes += chunk.length;
          if (bytes > LORA_SIZE_LIMIT) throw new Error("LIMIT_EXCEEDED");

          // BINARY VALIDATION: Check first chunk for HTML/text signatures
          if (firstChunk) {
            const header = chunk.toString('utf8', 0, Math.min(100, chunk.length));
            if (header.includes('<!DOCTYPE') || header.includes('<html') || header.includes('<HTML')) {
              throw new Error("INVALID_FILE_HTML");
            }
            firstChunk = false;
          }

          loraImportProgress.set(session_id, { status: "downloading", bytes, total: contentLengthNum });

          // Log progress every 10MB
          const currentMB = Math.floor(bytes / (1024 * 1024));
          if (currentMB > lastProgressLog && currentMB % 10 === 0) {
            const progressMB = (bytes / (1024 * 1024)).toFixed(2);
            if (contentLengthNum > 0) {
              const percent = Math.round((bytes / contentLengthNum) * 100);
              console.log(`[LORA] Download progress: ${progressMB} MB (${percent}%)`);
            } else {
              console.log(`[LORA] Download progress: ${progressMB} MB`);
            }
            lastProgressLog = currentMB;
          }

          yield chunk;
        }
      },
      fs.createWriteStream(tempDest)
    );

    // FINAL SIZE VALIDATION: Safetensors files are typically >10MB, reject suspiciously small files
    const fileStats = fs.statSync(tempDest);
    if (fileStats.size < 1024 * 1024) { // Less than 1MB is suspicious for a LoRA
      fs.unlinkSync(tempDest);
      return res.status(400).json({
        error: `Downloaded file is suspiciously small (${Math.round(fileStats.size / 1024)}KB). LoRA models are typically 10MB+. The URL may have returned an error page or invalid file.`
      });
    }

    fs.renameSync(tempDest, finalDest);
    loraImportProgress.set(session_id, { status: "done", bytes: fileStats.size, total: contentLengthNum || fileStats.size });
    setTimeout(() => loraImportProgress.delete(session_id), 60000);
    res.json({ success: true, filename: finalName });

    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr.name === 'AbortError') {
        return res.status(408).json({ error: "Download timeout: Request took longer than 5 minutes." });
      }
      throw fetchErr;
    }

  } catch (err) {
    console.error(`[IMPORT ERROR] URL: ${req.body?.url?.substring(0, 100)} | Error: ${err.message}`);
    if (tempDest && fs.existsSync(tempDest)) {
      try { fs.unlinkSync(tempDest); } catch { }
    }
    if (session_id) {
      loraImportProgress.set(session_id, { status: "error", bytes: 0, total: 0, error: err.message });
      setTimeout(() => loraImportProgress.delete(session_id), 60000);
    }
    if (err.message === "LIMIT_EXCEEDED") {
      return res.status(413).json({ error: "Download aborted: File exceeded 500MB strict limit." });
    }
    if (err.message === "INVALID_FILE_HTML") {
      return res.status(400).json({ error: "Downloaded file is an HTML page, not a model file. This URL likely requires authentication (login to CivitAI) or is incorrect." });
    }
    if (err.message === "Invalid session ID format") {
      return res.status(400).json({ error: "Invalid session ID." });
    }
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/history", (req, res) => {
  const { session_id } = req.query;
  if (!session_id || !validateSessionId(session_id)) {
    return res.status(400).json({ error: "Invalid session ID." });
  }
  const items = loadHistory().filter(item => item.session_id === session_id);
  res.json(items);
});

app.post("/api/generate", async (req, res) => {
  try {
    const { prompt, negative, session_id, upscale_factor } = req.body;
    if (!session_id) throw new Error("session_id is required");
    if (!validateSessionId(session_id)) {
      return res.status(400).json({ error: "Invalid session ID." });
    }
    const token = req.headers.authorization?.split(" ")[1];
    const { plan, limit } = verifyProToken(token);
    const isPro = (plan === "pro");
    const triggerMatch = scanText(prompt, isPro) || scanText(negative, isPro);
    if (triggerMatch === "MINORS") return res.status(403).json({ error: "CONTENT_BLOCKED", reason: "MINORS_NOT_ALLOWED" });
    if (triggerMatch === "ADULT_NSFW") return res.status(403).json({ error: "PRO_REQUIRED", reason: "ADULT_NSFW" });
    const factorNum = parseInt(upscale_factor) || 1;
    if (factorNum > 2 && !isPro) return res.status(403).json({ error: "PRO_REQUIRED", reason: "UPSCALE_PREMIUM", feature: "UPSCALE_X4" });
    if (req.body.use_face_detailer && !isPro) return res.status(403).json({ error: "PRO_REQUIRED", reason: "FACE_DETAILER_PREMIUM", feature: "FACE_DETAILER" });

    const clientIp = req.ip || req.connection.remoteAddress;

    if (req.body.lora_name && req.body.lora_name !== "Select LoRA...") {
      const loraPath = path.join(getSessionLoraPath(session_id), req.body.lora_name);
      if (!fs.existsSync(loraPath)) {
        return res.status(400).json({ error: "LORA_NOT_IN_SESSION", message: "Requested LoRA is not available in your current session." });
      }
    }

    // CONCURRENCY CHECK: One active job per session OR IP
    const existingJob = GLOBAL_QUEUE.find(j =>
      (j.session_id === session_id || j.ip === clientIp) &&
      (j.state === 'queued' || j.state === 'running')
    );

    if (existingJob) {
      const msg = (existingJob.ip === clientIp) ? "Your IP address already has a generation in progress." : "Your session has a generation in progress.";
      return res.status(429).json({ error: "CONCURRENT_LIMIT", message: msg });
    }

    if (GLOBAL_QUEUE.length >= MAX_QUEUE_SIZE) throw new Error("Server queue full.");
    const limitStatus = isPro ? consumeLimitedProUse(token, limit) : null;
    if (limitStatus && !limitStatus.allowed) {
      return res.status(403).json({ error: "PRO_LIMIT_REACHED", remaining: limitStatus.remaining, limit: limitStatus.limit });
    }
    const jobId = randomUUID();
    const newJob = { job_id: jobId, session_id, ip: clientIp, plan, state: "queued", created_at: Date.now(), parameters: req.body, results: null, error: null };
    GLOBAL_QUEUE.push(newJob);
    console.log(`[AUDIT] Job Queued | ID: ${jobId} | Plan: ${plan} | Upscale: x${factorNum}`);
    processQueue();
    res.json({
      job_id: jobId,
      ...(limitStatus ? { pro_remaining: limitStatus.remaining, pro_limit: limitStatus.limit } : {})
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/job/:job_id/status", (req, res) => res.json(getJobStatus(req.params.job_id)));

app.get("/api/job/:job_id/stream", (req, res) => {
  const { job_id } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!JOB_STREAMS.has(job_id)) JOB_STREAMS.set(job_id, []);
  JOB_STREAMS.get(job_id).push(res);

  req.on('close', () => {
    const targets = JOB_STREAMS.get(job_id);
    if (targets) {
      const idx = targets.indexOf(res);
      if (idx > -1) targets.splice(idx, 1);
      if (targets.length === 0) JOB_STREAMS.delete(job_id);
    }
  });
});

app.post("/api/job/:job_id/cancel", (req, res) => {
  const idx = GLOBAL_QUEUE.findIndex(j => j.job_id === req.params.job_id);
  if (idx > -1) { if (GLOBAL_QUEUE[idx].state === "running") { GLOBAL_QUEUE[idx].state = "cancelled"; } else { GLOBAL_QUEUE.splice(idx, 1); } }
  res.json({ success: true });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n>>> 🚀 UMRGEN v0.8.3.1 Ready on http://localhost:${PORT}\n`);
});
