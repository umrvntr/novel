/**
 * PROMPT BUILDER - V8 DNA Injection
 * Sprint 3: Injects V8 LoRA and geo-context into every prompt
 */

import { geoService, GeoData } from './geoService.js';

// V8 Character DNA
const V8_LORA = '<lora:V8:1.0>';
const V8_BASE_FEATURES = 'jet-black long hair, pale blue eyes, pale skin';

export interface PromptConfig {
    basePrompt: string;
    emotion?: 'neutral' | 'thinking' | 'scanning' | 'talking';
    includeV8?: boolean;
    geoData?: GeoData;
    quality?: 'preview' | 'highres';
}

class PromptBuilder {
    /**
     * Build a complete prompt with V8 DNA and optional geo-context
     */
    buildPrompt(config: PromptConfig): string {
        const parts: string[] = [];

        // Quality prefix
        if (config.quality === 'highres') {
            parts.push('(masterpiece:1.2), (best quality:1.2), 8k, sharp focus');
        } else {
            parts.push('good quality');
        }

        // Base prompt
        parts.push(config.basePrompt);

        // V8 DNA injection
        if (config.includeV8 !== false) {
            parts.push(this.getV8Modifier(config.emotion));
        }

        // Geo-context injection
        if (config.geoData) {
            parts.push(this.getGeoModifier(config.geoData));
        }

        // LoRA at end
        if (config.includeV8 !== false) {
            parts.push(V8_LORA);
        }

        return parts.filter(Boolean).join(', ');
    }

    /**
     * Get V8 character modifier based on emotion
     */
    private getV8Modifier(emotion?: string): string {
        const emotionModifiers: Record<string, string> = {
            neutral: `portrait of V8 girl, ${V8_BASE_FEATURES}, calm expression`,
            thinking: `portrait of V8 girl, ${V8_BASE_FEATURES}, concentrated, looking away`,
            scanning: `extreme close up of V8 girl face, pale blue eyes, blue light reflections`,
            talking: `portrait of V8 girl, ${V8_BASE_FEATURES}, slight smile, animated`
        };

        return emotionModifiers[emotion || 'neutral'];
    }

    /**
     * Get geo-context modifier
     */
    private getGeoModifier(geoData: GeoData): string {
        const timeOfDay = geoService.getTimeOfDay(geoData.timezone);

        const timeModifiers: Record<string, string> = {
            day: 'daylight, clear sky',
            night: 'night, neon lights, dark atmosphere',
            dawn: 'early morning, golden hour',
            dusk: 'sunset, orange sky'
        };

        return `cyberpunk ${geoData.city}, ${timeModifiers[timeOfDay]}`;
    }

    /**
     * Build a city background prompt
     */
    buildCityPrompt(city: string, timeOfDay: string, quality: 'preview' | 'highres' = 'preview'): string {
        const timeDesc: Record<string, string> = {
            day: 'bright daylight, clear sky, sun rays',
            night: 'night time, neon lights, dark atmosphere, rain reflections',
            dawn: 'early morning, golden hour, misty',
            dusk: 'sunset, orange sky, long shadows'
        };

        const qualityPrefix = quality === 'highres'
            ? '(masterpiece:1.2), (best quality:1.2), 8k, cinematic'
            : 'good quality';

        return `${qualityPrefix}, cyberpunk cityscape, futuristic ${city}, ${timeDesc[timeOfDay] || timeDesc.day}, high tech buildings, atmospheric perspective`;
    }

    /**
     * Get negative prompt
     */
    getNegativePrompt(): string {
        return 'cartoon, anime, blurry, bad anatomy, extra limbs, low quality, watermark, text';
    }
}

export const promptBuilder = new PromptBuilder();
