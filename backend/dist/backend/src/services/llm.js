/**
 * EPIC 4: LLM Integration Service
 * Manages LLM communication with strict context limits
 */
import axios from 'axios';
import { GAME_CONFIG, getStep } from '@shared/gameScript.js';
import { generatorService } from './generator.js';
import { imageGenerator } from './imageGenerator.js';
/**
 * Static dialogue fallback (no LLM)
 * EPIC 8: Fallback when LLM fails or is disabled
 */
class StaticDialogueService {
    isEnabled() {
        return false;
    }
    async generateDialogue(request) {
        const staticResponses = {
            scene_01: {
                text: 'Welcome. I\'m your guide through this experience.\n\nBefore we begin, tell me: what brings you here today?',
                choices: [
                    {
                        id: 'curious',
                        text: 'I\'m exploring, seeing what this is about',
                        nextSceneId: 'scene_02_curious',
                        flagModifiers: { curious: 2 },
                        style: 'primary'
                    },
                    {
                        id: 'goal',
                        text: 'I have a specific goal in mind',
                        nextSceneId: 'scene_02_goal',
                        flagModifiers: { goal_oriented: 2 },
                        style: 'secondary'
                    }
                ],
                usedLLM: false
            }
        };
        return staticResponses[request.sceneId] || {
            text: 'Scene not found. Please restart.',
            choices: [
                { id: 'restart', text: 'Restart', nextSceneId: 'scene_01', style: 'primary' },
                { id: 'restart2', text: 'Restart', nextSceneId: 'scene_01', style: 'secondary' }
            ],
            usedLLM: false
        };
    }
    async streamDialogue(request, onToken) {
        const response = await this.generateDialogue(request);
        onToken(response);
    }
}
/**
 * LLM-powered dialogue service (Ollama/local LLM)
 */
class LLMDialogueService {
    constructor(endpoint, model) {
        this.endpoint = endpoint;
        this.model = model;
    }
    isEnabled() {
        return true;
    }
    async buildContext(request) {
        const { flags, history, sessionId, userInput } = request;
        let memorySummary = 'No prior link data.';
        // Local memory logic can be added here in the future
        const recentHistory = history.slice(-5);
        return `You are ${GAME_CONFIG.speaker.name}. 
Persona: A 20-year-old operator. You are cold, distant, and efficient on the surface, but have a hidden kind heart. You act indifferent but are secretly protective.
User Memory: ${memorySummary}

Current Status: Active Neural Link.
User Traits: Curious(${flags.curious}), Cautious(${flags.cautious})

Recent Chat:
${recentHistory.length > 0
            ? recentHistory.map(h => `${h.isUserTyped ? 'User' : 'System'}: "${h.choiceText}"`).join('\n')
            : 'Link established.'}
${userInput ? `CURRENT MESSAGE: "${userInput}"` : ''}

OUTPUT FORMAT:
- Output exclusively dialogue text. 
- Do not use asterisks or emotional descriptors.
- Do not output JSON.
- Simulate a direct text messaging connection.
- Keep responses concise and direct.`;
    }
    async callLLM(prompt) {
        try {
            const response = await axios.post(`${this.endpoint}/api/generate`, {
                model: this.model,
                prompt,
                stream: false,
                options: { temperature: 0.7, max_tokens: 300, stop: ['\n\n', 'User:', 'Choice:'] }
            }, { timeout: 60000 });
            return response.data.response.trim();
        }
        catch (error) {
            console.error('LLM API error:', error);
            throw new Error('Failed to generate LLM response');
        }
    }
    generateChoices(request) {
        // Return dummy choices for endless chat format
        // The frontend should primarily rely on text input now
        return [
            {
                id: 'reply',
                text: '...',
                nextSceneId: request.sceneId, // Loop back
                flagModifiers: {},
                style: 'primary'
            },
            {
                id: 'reply_2',
                text: '...',
                nextSceneId: request.sceneId, // Loop back
                flagModifiers: {},
                style: 'secondary'
            }
        ];
    }
    getNextScene(currentScene, choiceType) {
        const currentStep = getStep(currentScene);
        if (currentStep?.nextStep)
            return currentStep.nextStep;
        const transitions = {
            curious: 'quest_curious',
            cautious: 'quest_skeptical',
            goal_oriented: 'reward_unlock'
        };
        return transitions[choiceType] || 'intro_1';
    }
    async streamDialogue(request, onToken) {
        try {
            console.log(`[LLMService] streamDialogue initiated for scene: ${request.sceneId}`);
            const context = await this.buildContext(request);
            console.log(`[LLMService] Sending streaming request to: ${this.endpoint}/api/generate`);
            const response = await axios.post(`${this.endpoint}/api/generate`, {
                model: this.model,
                prompt: context,
                stream: true,
                options: { temperature: 0.7, max_tokens: 300, stop: ['\n\n', 'User:', 'Choice:'] }
            }, { responseType: 'stream', timeout: 60000 });
            let metadataBuffer = '';
            let isMetadataParsed = false;
            let streamedCharCount = 0;
            return new Promise((resolve, reject) => {
                response.data.on('data', async (chunk) => {
                    try {
                        const lines = chunk.toString().split('\n');
                        for (const line of lines) {
                            if (!line.trim())
                                continue;
                            const json = JSON.parse(line);
                            const token = json.response;
                            if (!isMetadataParsed) {
                                metadataBuffer += token;
                                streamedCharCount += token.length;
                                // Robust Metadata Parsing
                                const firstBrace = metadataBuffer.indexOf('{');
                                const lastBrace = metadataBuffer.lastIndexOf('}');
                                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                                    try {
                                        const jsonStr = metadataBuffer.substring(firstBrace, lastBrace + 1);
                                        const metadata = JSON.parse(jsonStr);
                                        isMetadataParsed = true;
                                        console.log('[LLMService] Metadata block extracted.');
                                        onToken({
                                            detectedIntent: metadata.intent,
                                            suggestedNextSceneId: metadata.move_to_scene,
                                        });
                                        if (metadata.trigger_generation && metadata.generation_prompt) {
                                            generatorService.generate(metadata.generation_prompt).then(res => onToken({ generationResult: res }));
                                        }
                                        const emotion = metadata.intent || 'neutral';
                                        imageGenerator.generatePortrait({ emotion, speakerName: 'CIPHER' }).then(res => onToken({ portraitUrl: res.imageUrl, emotion }));
                                        if (metadata.unlock_reward) {
                                            onToken({ rewardCode: GAME_CONFIG.reward.code });
                                        }
                                        // Flush anything after JSON block as text
                                        const trailingText = metadataBuffer.substring(lastBrace + 1).trim();
                                        if (trailingText)
                                            onToken({ text: trailingText });
                                    }
                                    catch (e) {
                                        // JSON incomplete, continue buffering
                                    }
                                }
                                // Conversational Fallback: If no JSON found within 200 chars, start streaming raw text
                                if (!isMetadataParsed && streamedCharCount > 200) {
                                    console.warn('[LLMService] JSON-first constraint violated. Falling back to conversational stream.');
                                    isMetadataParsed = true;
                                    onToken({ text: metadataBuffer });
                                }
                            }
                            else {
                                // Streaming text phase
                                const cleanToken = token.replace(/`|json/g, '').trim();
                                // Maintain spaces
                                if (cleanToken || token === ' ') {
                                    onToken({ text: token });
                                }
                            }
                        }
                    }
                    catch (e) {
                        console.error('[LLMService] Error parsing stream chunk:', e);
                    }
                });
                response.data.on('end', () => {
                    if (!isMetadataParsed && metadataBuffer.trim()) {
                        console.log('[LLMService] Stream ended without JSON. Flushing buffer.');
                        onToken({ text: metadataBuffer });
                    }
                    resolve();
                });
                response.data.on('error', (err) => reject(err));
            });
        }
        catch (error) {
            console.error('[LLMService] Streaming failed:', error);
            throw error;
        }
    }
    async generateDialogue(request) {
        try {
            const context = await this.buildContext(request);
            const rawText = await this.callLLM(context);
            let text = rawText;
            let detectedIntent;
            let suggestedNextSceneId;
            let generationResult;
            let rewardCode;
            try {
                const firstBrace = rawText.indexOf('{');
                const lastBrace = rawText.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                    const jsonStr = rawText.substring(firstBrace, lastBrace + 1);
                    const metadata = JSON.parse(jsonStr);
                    detectedIntent = metadata.intent;
                    suggestedNextSceneId = metadata.move_to_scene;
                    text = rawText.replace(jsonStr, '').replace(/```json/g, '').replace(/```/g, '').trim();
                    if (metadata.trigger_generation && metadata.generation_prompt) {
                        generationResult = await generatorService.generate(metadata.generation_prompt);
                    }
                    if (metadata.unlock_reward) {
                        rewardCode = GAME_CONFIG.reward.code;
                    }
                }
            }
            catch (e) {
                text = rawText.replace(/\{[\s\S]*?\}/, '').replace(/```json/g, '').replace(/```/g, '').trim();
            }
            const choices = this.generateChoices(request);
            const emotion = detectedIntent || 'neutral';
            const portrait = await imageGenerator.generatePortrait({ emotion, speakerName: 'CIPHER' });
            return {
                text: text || "Transmission received. Proceeding...",
                choices,
                usedLLM: true,
                detectedIntent,
                suggestedNextSceneId,
                generationResult,
                rewardCode,
                portraitUrl: portrait.imageUrl,
                emotion
            };
        }
        catch (error) {
            const fallback = new StaticDialogueService();
            return fallback.generateDialogue(request);
        }
    }
}
let llmServiceInstance = null;
export function getLLMService() {
    if (llmServiceInstance)
        return llmServiceInstance;
    const llmEnabled = process.env.LLM_ENABLED === 'true';
    if (llmEnabled) {
        const endpoint = process.env.LLM_ENDPOINT || 'http://localhost:11434';
        const model = process.env.LLM_MODEL || 'llama2';
        llmServiceInstance = new LLMDialogueService(endpoint, model);
    }
    else {
        llmServiceInstance = new StaticDialogueService();
    }
    return llmServiceInstance;
}
export function resetLLMService() {
    llmServiceInstance = null;
}
