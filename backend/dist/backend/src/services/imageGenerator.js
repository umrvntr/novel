/**
 * IMAGE GENERATOR SERVICE
 * Connects to ComfyUI/UMRGEN for speaker portrait generation
 *
 * PLACEHOLDER: Ready for your ComfyUI API integration
 */
class ImageGeneratorService {
    constructor() {
        this.cache = new Map();
        // Default ComfyUI port or custom image server port
        this.OUTPUT_PORT = 8188;
        // TODO: Replace with your ComfyUI endpoint
        this.endpoint = process.env.COMFYUI_ENDPOINT || `http://localhost:${this.OUTPUT_PORT}`;
    }
    /**
     * Generate a speaker portrait based on emotion
     * PLACEHOLDER: Insert your ComfyUI API call here
     */
    async generatePortrait(request) {
        const cacheKey = `${request.speakerName}_${request.emotion}`;
        // Check cache first
        if (this.cache.has(cacheKey)) {
            return {
                imageUrl: this.cache.get(cacheKey),
                emotion: request.emotion,
                cached: true
            };
        }
        console.log(`[ImageGenerator] Generating portrait for: ${request.speakerName} (${request.emotion})`);
        // === EPIC 2: PREPARE JSON PROMPT ===
        const promptText = this.buildPrompt(request);
        const comfyPayload = this.getComfyPayload(promptText);
        // === MOCK EXTERNAL SERVER CONNECTION ===
        // In the future, this will be an actual axios call to this.OUTPUT_PORT
        console.log(`[ImageGenerator] >> MOCK SEND TO PORT ${this.OUTPUT_PORT} <<`);
        console.log(`[ImageGenerator] Payload prepared:`, JSON.stringify(comfyPayload, null, 2));
        // For now, return a placeholder
        const placeholderUrl = this.getPlaceholderUrl(request);
        // Cache the result
        this.cache.set(cacheKey, placeholderUrl);
        return {
            imageUrl: placeholderUrl,
            emotion: request.emotion,
            cached: false,
            debugPrompt: comfyPayload
        };
    }
    /**
   * Build a detailed prompt for portrait generation
   */
    buildPrompt(request) {
        const emotionDetails = {
            neutral: 'calm expression, steady gaze, blue holographic interface',
            curious: 'tilted head, questioning look, raised eyebrow, analytical data overlays',
            skeptical: 'serious expression, arms crossed, narrowed eyes, red warning icons',
            excited: 'bright expression, energetic, glowing brighter, digital sparks',
            mysterious: 'hooded, shadowy, enigmatic smile, data glitching'
        };
        const basePrompt = 'high-quality cyberpunk AI guide, holographic bust portrait, neon blue glow, dark background, monospaced font overlays, digital artifacts';
        const detail = emotionDetails[request.emotion] || emotionDetails.neutral;
        return `${basePrompt}, ${detail}`;
    }
    /**
     * Get placeholder URL while ComfyUI is not connected
     */
    getPlaceholderUrl(request) {
        const emotionColors = {
            neutral: '0a0a0a/00ff41',
            curious: '0a0a0a/00aaff',
            skeptical: '0a0a0a/ff4444',
            excited: '0a0a0a/ffaa00',
            mysterious: '0a0a0a/aa00ff'
        };
        const color = emotionColors[request.emotion] || emotionColors.neutral;
        const prompt = this.buildPrompt(request).substring(0, 50) + '...';
        return `https://placehold.co/512x512/${color}?text=${request.emotion.toUpperCase()}%0A${encodeURIComponent(prompt)}`;
    }
    /**
     * ComfyUI Workflow Example (Helper for User)
     */
    getComfyPayload(prompt) {
        return {
            "prompt": {
                "3": { "class_type": "KSampler", "inputs": { "seed": Math.floor(Math.random() * 1000000), "steps": 20, "cfg": 8, "sampler_name": "euler", "scheduler": "normal", "denoise": 1, "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
                "4": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": "v1-5-pruned-emaonly.safetensors" } },
                "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 512, "height": 512, "batch_size": 1 } },
                "6": { "class_type": "CLIPTextEncode", "inputs": { "text": prompt, "clip": ["4", 1] } },
                "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "low quality, blurry, distorted, human", "clip": ["4", 1] } },
                "8": { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["4", 2] } },
                "9": { "class_type": "SaveImage", "inputs": { "filename_prefix": "cipher_portrait", "images": ["8", 0] } }
            }
        };
    }
    /**
     * Clear the portrait cache
     */
    clearCache() {
        this.cache.clear();
    }
}
export const imageGenerator = new ImageGeneratorService();
