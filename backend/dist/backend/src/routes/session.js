/**
 * SESSION ROUTES
 * Handles session initialization and geo-context warmup
 */
import { Router } from 'express';
import { geoService } from '../services/geoService.js';
import { generatorService } from '../services/generator.js';
import { v4 as uuidv4 } from 'uuid';
export const sessionRouter = Router();
/**
 * POST /api/init-session
 * Initialize a new session with geo-context
 */
sessionRouter.post('/', async (req, res) => {
    try {
        // Get client IP (handle proxies)
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
            || req.socket.remoteAddress
            || undefined;
        console.log(`[Session] Initializing session for IP: ${clientIp || 'unknown'}`);
        // Generate or use existing session ID
        const sessionId = req.body.sessionId || uuidv4();
        // Fetch geo data
        const geoData = await geoService.getGeoData(clientIp);
        const timeOfDay = geoService.getTimeOfDay(geoData.timezone);
        // Trigger background city-scan generation (non-blocking)
        let warmupStarted = false;
        try {
            const cityPrompt = buildCityPrompt(geoData.city, timeOfDay);
            console.log(`[Session] Triggering warmup generation: ${cityPrompt.substring(0, 50)}...`);
            // Fire and forget - don't await
            generatorService.generate(cityPrompt).catch(err => {
                console.warn('[Session] Warmup generation failed:', err.message);
            });
            warmupStarted = true;
        }
        catch (e) {
            console.warn('[Session] Could not start warmup generation');
        }
        const response = {
            sessionId,
            geoData: {
                city: geoData.city,
                country: geoData.country,
                countryCode: geoData.countryCode,
                timezone: geoData.timezone,
                timeOfDay
            },
            warmupStarted
        };
        console.log(`[Session] Session initialized: ${sessionId} (${geoData.city}, ${geoData.country})`);
        res.json(response);
    }
    catch (error) {
        console.error('[Session] Init failed:', error);
        res.status(500).json({ error: 'Failed to initialize session' });
    }
});
/**
 * Build a city-scan prompt for warmup generation
 */
function buildCityPrompt(city, timeOfDay) {
    const timeDescriptions = {
        day: 'bright daylight, clear sky, sun rays',
        night: 'night time, neon lights, dark atmosphere, rain reflections',
        dawn: 'early morning, golden hour, misty',
        dusk: 'sunset, orange sky, long shadows'
    };
    const timeDesc = timeDescriptions[timeOfDay] || timeDescriptions.day;
    return `cyberpunk cityscape, futuristic ${city}, ${timeDesc}, high tech buildings, atmospheric perspective, 8k, cinematic`;
}
