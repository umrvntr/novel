/**
 * GENERATOR ROUTES
 * API endpoints for image generator control and status
 */

import { Router } from 'express';
import { generatorService } from '../services/generator.js';

export const generatorRouter = Router();

/**
 * GET /api/generator/ping
 * Check if the image generator (umrgen) is online
 */
generatorRouter.get('/ping', async (req, res) => {
    try {
        const status = await generatorService.getHealthStatus();
        res.json({
            status: status.connected ? 'ONLINE' : 'OFFLINE',
            ...status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to check generator status' });
    }
});
/**
 * GET /api/generator/image-proxy?url=[TARGET_URL]
 * Proxy images from local ports to public link (for remote devices)
 */
generatorRouter.get('/image-proxy', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ error: 'URL parameter required' });
        }

        const axios = (await import('axios')).default;
        const response = await axios.get(url, { responseType: 'stream' });

        // Pass through content type
        res.setHeader('Content-Type', response.headers['content-type'] || 'image/png');

        // Pipe the image stream
        response.data.pipe(res);
    } catch (error: any) {
        console.error('[Generator Proxy] Failed to proxy image:', error.message);
        res.status(500).json({ error: 'Failed to proxy image' });
    }
});
