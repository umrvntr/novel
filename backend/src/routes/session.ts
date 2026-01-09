/**
 * SESSION ROUTES
 * Handles session initialization and geo-context warmup
 */

import { Router } from 'express';
import { geoService } from '../services/geoService.js';
import { generatorService } from '../services/generator.js';
import { v4 as uuidv4 } from 'uuid';
import { sessionManager } from '../services/sessionManager.js';
import { sessionMemory } from '../services/sessionMemory.js';

export const sessionRouter = Router();

// In-memory cache for background URLs (persists during server uptime)
export const backgroundCache = new Map<string, string>();

interface InitSessionResponse {
    sessionId: string;
    geoData: {
        city: string;
        country: string;
        countryCode: string;
        timezone: string;
        timeOfDay: 'day' | 'night' | 'dawn' | 'dusk';
    };
    currentMood: string;
    warmupStarted: boolean;
}

/**
 * POST /api/init-session
 * Initialize a new session with geo-context
 */
sessionRouter.post('/', async (req, res) => {
    try {
        // Get client IP (handle proxies)
        const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
            || req.socket.remoteAddress
            || undefined;

        console.log(`[Session] Initializing session for IP: ${clientIp || 'unknown'}`);

        // Generate or use existing session ID and register in manager
        const sessionId = req.body.sessionId || uuidv4();
        await sessionManager.getSession(sessionId);

        // Sprint 5: Get profile for mood
        const { userProfile } = await import('../services/userProfile.js');
        const profile = await userProfile.getProfile(sessionId);

        // Ensure session structure exists in persistence if not already
        const existingMemory = await sessionMemory.getMemory(sessionId);
        if (!existingMemory) {
            await sessionMemory.saveMemory(sessionId, {
                sessionId,
                createdAt: Date.now(),
                lastUpdated: Date.now(),
                entries: []
            });
        }

        // Fetch geo data (IP-based, just for initial context)
        const geoData = await geoService.getGeoData(clientIp);
        const timeOfDay = geoService.getTimeOfDay(geoData.timezone);

        // AUTOMATION: Trigger background generation immediately
        if (geoData.city !== 'Unknown') {
            console.log(`[Session] Auto-triggering background generation for ${geoData.city}...`);
            (async () => {
                try {
                    const { imageGenerator } = await import('../services/imageGenerator.js');
                    const cityPrompt = buildCityPrompt(geoData.city, timeOfDay);
                    const result = await imageGenerator.generatePortrait({
                        speakerName: 'Background',
                        emotion: 'neutral',
                        customPrompt: cityPrompt,
                        width: 896,
                        height: 512
                    });
                    if (result.status === 'success') {
                        const proxiedUrl = result.imageUrl;
                        backgroundCache.set(sessionId, proxiedUrl);
                        console.log(`[Session] Auto-background ready for ${geoData.city}: ${proxiedUrl}`);
                    }
                } catch (err) {
                    console.error('[Session] Auto-background generation failed:', err);
                }
            })();
        }

        const response: InitSessionResponse = {
            sessionId,
            geoData: {
                city: geoData.city,
                country: geoData.country,
                countryCode: geoData.countryCode,
                timezone: geoData.timezone,
                timeOfDay
            },
            currentMood: profile.currentMood || 'neutral',
            warmupStarted: true
        };

        console.log(`[Session] Session initialized & Trace-Paint started: ${sessionId}`);
        res.json(response);

    } catch (error) {
        console.error('[Session] Init failed:', error);
        res.status(500).json({ error: 'Failed to initialize session' });
    }
});

/**
 * Build a city-scan prompt for warmup generation
 */
function buildCityPrompt(city: string, timeOfDay: string): string {
    const timeDescriptions: Record<string, string> = {
        day: 'bright daylight, clear sky, sun rays',
        night: 'night time, neon lights, dark atmosphere, rain reflections',
        dawn: 'early morning, golden hour, misty',
        dusk: 'sunset, orange sky, long shadows'
    };

    const timeDesc = timeDescriptions[timeOfDay] || timeDescriptions.day;

    return `cyberpunk cityscape, futuristic ${city}, ${timeDesc}, high tech buildings, atmospheric perspective, 8k, cinematic`;
}

/**
 * GET /api/init-session/background/:sessionId
 * Retrieve generated background URL for session
 */
sessionRouter.get('/background/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const backgroundUrl = backgroundCache.get(sessionId);

    if (backgroundUrl) {
        res.json({ backgroundUrl, ready: true });
    } else {
        res.json({ backgroundUrl: null, ready: false });
    }
});

/**
 * POST /api/init-session/generate-background
 * Generate background after user consents to location sharing
 * Body: { sessionId, city, timeOfDay? }
 */
sessionRouter.post('/generate-background', async (req, res) => {
    try {
        const { sessionId, city, timeOfDay = 'day' } = req.body;

        if (!sessionId || !city) {
            return res.status(400).json({ error: 'sessionId and city required' });
        }

        console.log(`[Session] User consented to location: ${city}. Generating reward background...`);

        const { imageGenerator } = await import('../services/imageGenerator.js');
        const cityPrompt = buildCityPrompt(city, timeOfDay);

        // Generate background (blocking - wait for result)
        const result = await imageGenerator.generatePortrait({
            speakerName: 'Background',
            emotion: 'neutral',
            customPrompt: cityPrompt,
            width: 896, // 16:9-ish ratio
            height: 512
        });

        if (result.status === 'success') {
            const proxiedUrl = result.imageUrl;
            console.log(`[Session] Reward background proxied: ${proxiedUrl}`);
            backgroundCache.set(sessionId, proxiedUrl);
            res.json({
                success: true,
                backgroundUrl: proxiedUrl,
                city
            });
        } else {
            console.warn(`[Session] Background generation failed: ${result.status}`);
            res.json({
                success: false,
                error: result.status,
                city
            });
        }
    } catch (error: any) {
        console.error('[Session] Generate background failed:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/init-session/generate-hacker
 * Generate a caricature hacker image for users who decline location sharing
 * Body: { sessionId }
 */
sessionRouter.post('/generate-hacker', async (req, res) => {
    try {
        const { sessionId } = req.body;

        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId required' });
        }

        console.log(`[Session] User declined location. Generating hacker caricature...`);

        const { imageGenerator } = await import('../services/imageGenerator.js');

        // Hacker caricature prompt
        const hackerPrompt = `caricature illustration, cool hacker, hooded figure, glowing keyboard, multiple monitors with green code, dark basement, mysterious atmosphere, cyberpunk style, exaggerated features, funny cartoon style, shadows, neon accents, 8k`;

        const result = await imageGenerator.generatePortrait({
            speakerName: 'Hacker',
            emotion: 'mysterious',
            customPrompt: hackerPrompt,
            width: 896, // 16:9 ratio
            height: 512
        });

        if (result.status === 'success') {
            const proxiedUrl = result.imageUrl;
            console.log(`[Session] Hacker caricature proxied: ${proxiedUrl}`);
            backgroundCache.set(sessionId, proxiedUrl);
            res.json({
                success: true,
                backgroundUrl: proxiedUrl
            });
        } else {
            res.json({
                success: false,
                error: result.status
            });
        }
    } catch (error: any) {
        console.error('[Session] Generate hacker failed:', error);
        res.status(500).json({ error: error.message });
    }
});
