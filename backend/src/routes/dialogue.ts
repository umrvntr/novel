/**
 * EPIC 2: Dialogue Engine Endpoint
 * Returns fixed JSON format with text and 2 choices
 */

import { Router } from 'express';
import type { DialogueRequest, DialogueResponse } from '@shared/types.js';
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
    const request = req.body as DialogueRequest;

    // Validate request
    if (!request.sceneId || !request.flags || !request.history) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Missing required fields: sceneId, flags, history'
      });
    }

    // Get LLM service
    const llmService = getLLMService();

    const response: DialogueResponse = await llmService.generateDialogue(request);

    res.json(response);
  } catch (error) {
    console.error('Dialogue generation error:', error);
    res.status(500).json({
      error: 'Failed to generate dialogue',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/dialogue/stream
 * SSE version for performance overdrive
 */
dialogueRouter.post('/stream', async (req, res) => {
  try {
    const request = req.body as DialogueRequest;

    // SSE Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const llmService = getLLMService();

    await llmService.streamDialogue(request, (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    });

    res.write('event: end\ndata: {}\n\n');
    res.end();
  } catch (error) {
    console.error('Dialogue streaming error:', error);
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'Stream failed' })}\n\n`);
    res.end();
  }
});

/**
 * GET /api/dialogue/test
 * Test endpoint to verify dialogue engine is working
 */
dialogueRouter.get('/test', async (req, res) => {
  const testRequest: DialogueRequest = {
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
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
