/**
 * IMAGE GENERATOR SERVICE
 * Connects to ComfyUI/UMRGEN for speaker portrait generation
 * 
 * PLACEHOLDER: Ready for your ComfyUI API integration
 */

export interface PortraitRequest {
    emotion: string;
    customPrompt?: string;
    speakerName: string;
}

export interface PortraitResult {
    imageUrl: string;
    emotion: string;
    cached: boolean;
    // New field for Epic 2: Debug info about the generated prompt
    debugPrompt?: any;
}

class ImageGeneratorService {
    private endpoint: string;
    private cache: Map<string, string> = new Map();
    // Updated to Port 3088 as requested
    private readonly OUTPUT_PORT = 3088;

    constructor() {
        this.endpoint = process.env.COMFYUI_ENDPOINT || `http://localhost:${this.OUTPUT_PORT}`;
    }

    /**
     * Generate a speaker portrait based on emotion or custom prompt
     */
    async generatePortrait(request: PortraitRequest): Promise<PortraitResult> {
        const cacheKey = `${request.speakerName}_${request.emotion}_${request.customPrompt || ''}`;

        // Check cache first (skip for custom prompts)
        if (!request.customPrompt && this.cache.has(cacheKey)) {
            return {
                imageUrl: this.cache.get(cacheKey)!,
                emotion: request.emotion,
                cached: true
            };
        }

        console.log(`[ImageGenerator] Generating portrait for: ${request.speakerName} (${request.emotion})`);

        // Build Prompt (append V8 LoRA if generic)
        let promptText = request.customPrompt || this.buildPrompt(request);

        // Ensure V8 LoRA is active for V8 requests
        if (request.speakerName === 'V8' && !promptText.includes('v8')) {
            promptText += ', <lora:v8:1.0>, high quality, masterpiece';
        }

        const payload = {
            prompt: promptText,
            negative_prompt: "bad quality, blurry, ugly",
            width: 512,
            height: 512,
            steps: 20
        };

        try {
            console.log(`[ImageGenerator] Sending to ${this.endpoint}/prompt...`, payload);
            // Real API Call
            // Assuming the endpoint returns { image: "base64..." } or { url: "..." }
            // For now, fire and forget or expect a URL.
            // If the user says "receives back a pic", it might be a blob.
            // Let's assume it returns a JSON with a URL or we just log it for now.
            // SKELETON IMPLEMENTATION:
            /*
            const response = await axios.post(`${this.endpoint}/prompt`, payload);
            if (response.data && response.data.image) {
                return { ...result, imageUrl: response.data.image };
            }
            */

            // MOCK UNTIL API SHAPE CONFIRMED:
            // Simulate successful generation trigger
        } catch (error) {
            console.error('[ImageGenerator] Failed to generate:', error);
        }

        // Fallback/Mock return
        const placeholderUrl = this.getPlaceholderUrl(request);
        if (!request.customPrompt) {
            this.cache.set(cacheKey, placeholderUrl);
        }

        return {
            imageUrl: placeholderUrl,
            emotion: request.emotion,
            cached: false,
            debugPrompt: payload
        };
    }

    /**
   * Build a detailed prompt for portrait generation
   */
    private buildPrompt(request: PortraitRequest): string {
        const emotionDetails: Record<string, string> = {
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
    private getPlaceholderUrl(request: PortraitRequest): string {
        const emotionColors: Record<string, string> = {
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
    getComfyPayload(prompt: string) {
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
    clearCache(): void {
        this.cache.clear();
    }
}

export const imageGenerator = new ImageGeneratorService();
