/**
 * GENERATOR SERVICE - Umrgen API Integration
 * Sprint 3: Two-tier generation (Fast Preview + High-Res)
 * Connects to umrgen server on Port 3088
 */

import axios from 'axios';
import { GeneratorResult } from '@shared/types.js';
import { promptBuilder } from './promptBuilder.js';
import { GeoData } from './geoService.js';

// Umrgen API Configuration
const UMRGEN_PORT = 3088;
const UMRGEN_ENDPOINT = process.env.UMRGEN_ENDPOINT || `http://localhost:${UMRGEN_PORT}`;

interface GenerationRequest {
    prompt: string;
    negativePrompt?: string;
    steps?: number;
    cfg?: number;
    seed?: number;
}

interface GenerationResponse {
    images: string[];
    seed: number;
}

export class GeneratorService {
    private isConnected: boolean = false;

    constructor() {
        this.checkConnection();
    }

    /**
     * Get current connection status for Ping API
     */
    public async getHealthStatus(): Promise<{ connected: boolean; endpoint: string }> {
        await this.checkConnection();
        return {
            connected: this.isConnected,
            endpoint: UMRGEN_ENDPOINT
        };
    }

    /**
     * Check if umrgen server is available
     */
    private async checkConnection(): Promise<void> {
        try {
            await axios.get(`${UMRGEN_ENDPOINT}/health`, { timeout: 2000 });
            this.isConnected = true;
            console.log(`[Generator] Connected to umrgen at ${UMRGEN_ENDPOINT}`);
        } catch (error: any) {
            // If we get a response (even 404), the server is alive
            if (error.response) {
                this.isConnected = true;
                console.log(`[Generator] Connected to umrgen at ${UMRGEN_ENDPOINT} (Server alive, /health missing)`);
            } else {
                this.isConnected = false;
                console.warn(`[Generator] umrgen not available at ${UMRGEN_ENDPOINT}, using fallback`);
            }
        }
    }

    /**
     * Two-tier generation: Fast Preview (8 steps) + High-Res refinement
     */
    async generate(prompt: string, options?: { geoData?: GeoData }): Promise<GeneratorResult> {
        console.log(`[Generator] Generating: "${prompt.substring(0, 50)}..."`);

        // Build enhanced prompt with V8 DNA
        const enhancedPrompt = promptBuilder.buildPrompt({
            basePrompt: prompt,
            includeV8: true,
            geoData: options?.geoData,
            quality: 'preview'
        });

        if (!this.isConnected) {
            return this.generateFallback(enhancedPrompt);
        }

        try {
            // Tier 1: Fast Preview (8 steps, ~3-5 seconds)
            const previewResult = await this.callUmrgen({
                prompt: enhancedPrompt,
                negativePrompt: promptBuilder.getNegativePrompt(),
                steps: 8,
                cfg: 7
            });

            // Return preview immediately
            // TODO: Tier 2 background upscale can be added later
            return {
                imageUrl: previewResult.images[0],
                prompt: enhancedPrompt,
                isFreeVersion: false,
                limitations: []
            };

        } catch (error) {
            console.error('[Generator] umrgen call failed:', error);
            return this.generateFallback(enhancedPrompt);
        }
    }

    /**
     * Generate high-resolution refinement (background task)
     */
    async generateHighRes(prompt: string, seed: number): Promise<GeneratorResult> {
        const enhancedPrompt = promptBuilder.buildPrompt({
            basePrompt: prompt,
            includeV8: true,
            quality: 'highres'
        });

        if (!this.isConnected) {
            return this.generateFallback(enhancedPrompt);
        }

        try {
            const result = await this.callUmrgen({
                prompt: enhancedPrompt,
                negativePrompt: promptBuilder.getNegativePrompt(),
                steps: 20,
                cfg: 7,
                seed
            });

            return {
                imageUrl: result.images[0],
                prompt: enhancedPrompt,
                isFreeVersion: false,
                limitations: []
            };
        } catch (error) {
            console.error('[Generator] High-res generation failed:', error);
            return this.generateFallback(enhancedPrompt);
        }
    }

    /**
     * Call the umrgen API
     */
    private async callUmrgen(request: GenerationRequest): Promise<GenerationResponse> {
        console.log(`[Generator] Calling umrgen: steps=${request.steps}, cfg=${request.cfg}`);

        const response = await axios.post(`${UMRGEN_ENDPOINT}/generate`, {
            prompt: request.prompt,
            negative_prompt: request.negativePrompt,
            steps: request.steps || 20,
            cfg: request.cfg || 7,
            seed: request.seed || -1
        }, { timeout: 60000 });

        return {
            images: response.data.images || [response.data.image],
            seed: response.data.seed
        };
    }

    /**
     * Fallback when umrgen is not available
     */
    private async generateFallback(prompt: string): Promise<GeneratorResult> {
        console.log('[Generator] Using placeholder fallback');

        // Simulate generation delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        return {
            imageUrl: `https://placehold.co/600x400/001400/00ff41?text=${encodeURIComponent(prompt.substring(0, 30))}`,
            prompt: prompt,
            isFreeVersion: true,
            limitations: [
                'Placeholder mode (umrgen not connected)',
                'Connect umrgen on port 3088 for real generation'
            ]
        };
    }
}

export const generatorService = new GeneratorService();
