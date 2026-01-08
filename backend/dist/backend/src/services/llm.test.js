import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { EventEmitter } from 'events';
import { getLLMService, resetLLMService } from './llm.js';
vi.mock('axios');
vi.mock('./generator.js', () => ({
    generatorService: { generate: vi.fn() }
}));
vi.mock('./imageGenerator.js', () => ({
    imageGenerator: { generatePortrait: vi.fn().mockResolvedValue({ imageUrl: 'test.png' }) }
}));
// Mock environment variables
process.env.LLM_ENABLED = 'true';
process.env.LLM_ENDPOINT = 'http://test-llm';
describe('LLMService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetLLMService();
    });
    it('should flush buffer on stream end if no JSON metadata was found', async () => {
        const service = getLLMService();
        const mockStream = new EventEmitter();
        // Mock axios post to return our stream
        axios.post.mockResolvedValue({
            data: mockStream
        });
        const onToken = vi.fn();
        const promise = service.streamDialogue({ sceneId: 'test', flags: { curious: 0, cautious: 0, goal_oriented: 0 }, history: [], sessionId: 'test' }, onToken);
        // Wait for async setup
        await new Promise(resolve => setTimeout(resolve, 50));
        // Simulate streaming data (short text, no JSON)
        mockStream.emit('data', Buffer.from(JSON.stringify({ response: 'Hello' }) + '\n'));
        mockStream.emit('data', Buffer.from(JSON.stringify({ response: ' world' }) + '\n'));
        // Check that we haven't emitted yet (buffering phase)
        // Note: The implementation might emit partials depending on the logic, 
        // but the critical part is capturing the *rest* at the end.
        // In current logic: buffered until JSON or > 200 chars.
        // End the stream
        mockStream.emit('end');
        await promise;
        // Verify onToken was called with the flushed text
        // The implementation buffers everything until it decides it's valid or gives up
        // So we expect "Hello world" to be flushed at the end.
        expect(onToken).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('Hello world') }));
    });
    it('should parse JSON metadata correctly', async () => {
        const service = getLLMService();
        const mockStream = new EventEmitter();
        axios.post.mockResolvedValue({ data: mockStream });
        const onToken = vi.fn();
        const promise = service.streamDialogue({ sceneId: 'test', flags: { curious: 0, cautious: 0, goal_oriented: 0 }, history: [], sessionId: 'test' }, onToken);
        // Wait for async setup
        await new Promise(resolve => setTimeout(resolve, 50));
        const jsonPayload = JSON.stringify({ intent: 'curious', move_to_scene: 'scene_2' });
        mockStream.emit('data', Buffer.from(JSON.stringify({ response: jsonPayload }) + '\n'));
        mockStream.emit('data', Buffer.from(JSON.stringify({ response: 'Text after' }) + '\n'));
        mockStream.emit('end');
        await promise;
        expect(onToken).toHaveBeenCalledWith(expect.objectContaining({ detectedIntent: 'curious' }));
        expect(onToken).toHaveBeenCalledWith(expect.objectContaining({ text: 'Text after' }));
    });
});
