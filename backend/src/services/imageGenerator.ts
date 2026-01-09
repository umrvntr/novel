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
    width?: number;
    height?: number;
    onProgress?: (progress: { queuePosition: number; eta: number }) => void;
}

export interface PortraitResult {
    imageUrl: string;
    emotion: string;
    cached: boolean;
    status?: 'success' | 'error' | 'timeout';
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

        // Prompt Truncation (Stability Fix)
        if (promptText.length > 1000) {
            console.warn('[ImageGenerator] Truncating prompt to 1000 chars');
            promptText = promptText.substring(0, 1000);
        }

        // UMRGEN API payload - requires session_id in sid_XXX format
        const sessionId = `sid_${Date.now().toString(36)}`;
        const payload = {
            prompt: promptText,
            negative: 'bad quality, blurry, ugly, deformed',
            session_id: sessionId,
            width: request.width || 512,
            height: request.height || 512
        };

        try {
            console.log(`[ImageGenerator] Sending to ${this.endpoint}/api/generate...`);

            const axios = (await import('axios')).default;

            // Step 1: Queue the job
            const queueResponse = await axios.post(
                `${this.endpoint}/api/generate`,
                payload,
                { timeout: 10000 }
            );

            const jobId = queueResponse.data?.job_id;
            if (!jobId) {
                console.warn('[ImageGenerator] No job_id returned');
                return {
                    imageUrl: this.getPlaceholderUrl(request),
                    emotion: request.emotion,
                    cached: false,
                    status: 'error' as const
                };
            }

            console.log(`[ImageGenerator] Job queued: ${jobId}`);

            // Step 2: Poll for completion (max 3 minutes)
            const maxPolls = 90;  // 90 × 2s = 180 seconds = 3 minutes
            const pollInterval = 2000;

            for (let i = 0; i < maxPolls; i++) {
                await new Promise(r => setTimeout(r, pollInterval));

                const statusResponse = await axios.get(
                    `${this.endpoint}/api/job/${jobId}/status`,
                    { timeout: 5000 }
                );

                const status = statusResponse.data;
                console.log(`[ImageGenerator] Job ${jobId} state: ${status.state}`);

                // REPORT PROGRESS: If queue data is available, trigger callback
                if (status.state === 'pending' || status.state === 'running') {
                    if (request.onProgress) {
                        request.onProgress({
                            queuePosition: status.queue_position || 0,
                            eta: status.estimated_time || 0
                        });
                    }
                }

                if (status.state === 'completed' && status.results?.images?.length > 0) {
                    const imageUrl = status.results.images[0].url;
                    // Construct full local URL
                    const localUrl = imageUrl.startsWith('http')
                        ? imageUrl
                        : `${this.endpoint}${imageUrl}`;

                    // WRAP IN PROXY: Return a URL that points to our backend's own proxy
                    // This allows remote devices (via ngrok) to see the image
                    const fullUrl = `/api/generator/image-proxy?url=${encodeURIComponent(localUrl)}`;

                    console.log('[ImageGenerator] Image proxied successfully:', fullUrl);
                    return {
                        imageUrl: fullUrl,
                        emotion: request.emotion,
                        cached: false,
                        status: 'success' as const
                    };
                }

                if (status.state === 'failed') {
                    console.warn('[ImageGenerator] Job failed:', status.error);
                    return {
                        imageUrl: this.getPlaceholderUrl(request),
                        emotion: request.emotion,
                        cached: false,
                        status: 'error' as const
                    };
                }
            }

            // Timeout
            console.warn('[ImageGenerator] Job polling timeout');
            return {
                imageUrl: this.getPlaceholderUrl(request),
                emotion: request.emotion,
                cached: false,
                status: 'timeout' as const
            };

        } catch (error: any) {
            const errorMsg = error.code === 'ECONNABORTED' ? 'timeout' : error.message;
            console.error(`[ImageGenerator] Failed: ${errorMsg}`);

            return {
                imageUrl: this.getPlaceholderUrl(request),
                emotion: request.emotion,
                cached: false,
                status: error.code === 'ECONNABORTED' ? 'timeout' as const : 'error' as const
            };
        }
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
