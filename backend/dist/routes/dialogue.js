/**
 * EPIC 2: Dialogue Engine Endpoint
 * Returns fixed JSON format with text and 2 choices
 */
import { Router } from 'express';
import { getLLMService } from '../services/llm.js';
export const dialogueRouter = Router();
/**
 * POST /api/dialogue
 *
 * Request body:
 * - sceneId: string
 * - flags: UserFlags
 * - history: HistoryEntry[]
 *
 * Response:
 * - text: string (dialogue text, possibly LLM-generated)
 * - choices: [Choice, Choice] (exactly 2 choices)
 * - usedLLM: boolean
 */
dialogueRouter.post('/', async (req, res) => {
    try {
        const request = req.body;
        // Validate request
        if (!request.sceneId || !request.flags || !request.history) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Missing required fields: sceneId, flags, history'
            });
        }
        // Get LLM service
        const llmService = getLLMService();
        // Generate dialogue
        // EPIC 4: If LLM is enabled, use it for text generation
        // Otherwise, return static dialogue from scene definitions
        const response = await llmService.generateDialogue(request);
        res.json(response);
    }
    catch (error) {
        console.error('Dialogue generation error:', error);
        res.status(500).json({
            error: 'Failed to generate dialogue',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
/**
 * GET /api/dialogue/test
 * Test endpoint to verify dialogue engine is working
 */
dialogueRouter.get('/test', async (req, res) => {
    const testRequest = {
        sceneId: 'scene_01',
        flags: {
            curious: 0,
            cautious: 0,
            goal_oriented: 0
        },
        history: []
    };
    try {
        const llmService = getLLMService();
        const response = await llmService.generateDialogue(testRequest);
        res.json({
            status: 'success',
            test: testRequest,
            response
        });
    }
    catch (error) {
        res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
