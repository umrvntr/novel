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
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to check generator status' });
    }
});
