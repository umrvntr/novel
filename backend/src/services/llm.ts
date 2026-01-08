/**
 * EPIC 4: LLM Integration Service
 * Manages LLM communication with strict context limits
 */

import axios from 'axios';
import type { DialogueRequest, DialogueResponse, Choice, GeneratorResult } from '@shared/types.js';
import { GAME_CONFIG, GAME_STEPS, getStep } from '@shared/gameScript.js';
import { generatorService } from './generator.js';
import { imageGenerator } from './imageGenerator.js';


interface LLMService {
  generateDialogue(request: DialogueRequest): Promise<DialogueResponse>;
  streamDialogue(request: DialogueRequest, onToken: (data: Partial<DialogueResponse>) => void): Promise<void>;
  isEnabled(): boolean;
}

/**
 * Static dialogue fallback (no LLM)
 * EPIC 8: Fallback when LLM fails or is disabled
 */
class StaticDialogueService implements LLMService {
  isEnabled(): boolean {
    return false;
  }

  async generateDialogue(request: DialogueRequest): Promise<DialogueResponse> {
    const staticResponses: Record<string, DialogueResponse> = {
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

  async streamDialogue(request: DialogueRequest, onToken: (data: Partial<DialogueResponse>) => void): Promise<void> {
    const response = await this.generateDialogue(request);
    onToken(response);
  }
}

const VALID_EMOTIONS = [
  'neutral', 'happy', 'sad', 'angry', 'scared', 'surprised', 'disgusted',
  'excited', 'curious', 'skeptical', 'thinking', 'confused', 'embarrassed', 'guilty', 'hopeful', 'disappointed',
  'seductive', 'flirty', 'longing', 'jealous', 'smug', 'determined', 'exhausted', 'bored',
  'scanning', 'processing', 'alert'
];

/**
 * LLM-powered dialogue service (Ollama/local LLM)
 */
class LLMDialogueService implements LLMService {
  private endpoint: string;
  private model: string;

  constructor(endpoint: string, model: string) {
    this.endpoint = endpoint;
    this.model = model;
  }

  isEnabled(): boolean {
    return true;
  }

  /**
   * Validate and map emotion to the 27-emotion dataset
   */
  private validateEmotion(emotion?: string): string {
    if (!emotion) return 'neutral';
    const low = emotion.toLowerCase().trim();
    if (VALID_EMOTIONS.includes(low)) return low;

    // Fallback/Mapping for common hallucinations
    if (low.includes('happy') || low.includes('smile')) return 'happy';
    if (low.includes('sad') || low.includes('cry')) return 'sad';
    if (low.includes('angry') || low.includes('rage')) return 'angry';
    if (low.includes('think')) return 'thinking';
    if (low.includes('shock')) return 'surprised';
    if (low.includes('fear')) return 'scared';
    if (low.includes('love') || low.includes('sexy')) return 'seductive';

    return 'neutral';
  }

  /**
   * Clean response: Remove asterisks, emotes, and unwanted formatting
   */
  private cleanResponse(text: string): string {
    return text
      .replace(/\[JSON_START\]/gi, '')
      .replace(/\[JSON_END\]/gi, '')
      .replace(/\[\/JSON_END\]/gi, '')
      .replace(/\*[^*]+\*/g, '')              // Remove *actions*
      .replace(/\([^)]*emotion[^)]*\)/gi, '') // Remove (emotion) markers
      .replace(/^V8:\s*"/i, '')               // Strip prefix quotes
      .replace(/^V8:\s*/i, '')                // Strip redundant V8: prefix
      .replace(/^GUIDE:\s*/i, '')             // Strip redundant GUIDE: prefix
      .replace(/"$/, '')                      // Trailing quote
      .replace(/\s+/g, ' ')                   // Normalize workspace/missing spaces
      .trim();
  }

  private async buildContext(request: DialogueRequest): Promise<string> {
    const { flags, history, sessionId, userInput } = request;
    const safeSessionId = sessionId || 'anonymous';

    // Sprint 5: Get user profile for memory
    let userContext = 'New user.';
    let isReturningUser = false;
    let introComplete = false;
    let userName = '';

    try {
      const { userProfile } = await import('./userProfile.js');
      const profile = await userProfile.getProfile(safeSessionId);
      userContext = await userProfile.getMemoryContext(safeSessionId);
      isReturningUser = profile.isReturningUser;
      introComplete = profile.introComplete;
      userName = profile.name || '';

      // Extract name from user input if shared
      if (userInput) {
        const nameMatch = userInput.match(/(?:my name is|i'm|i am|call me)\s+(\w+)/i);
        if (nameMatch) {
          await userProfile.setName(safeSessionId, nameMatch[1]);
          await userProfile.addKeyFact(safeSessionId, `User's name is ${nameMatch[1]}`);
        }
      }
    } catch (e) {
      console.warn('[LLM] UserProfile not available');
    }

    // Sprint 4: Session memory & persistence
    let conversationContext = 'No prior conversation.';
    try {
      const { sessionManager } = await import('./sessionManager.js');
      const { sessionMemory } = await import('./sessionMemory.js');

      // Load from file if not in memory
      let session = await sessionManager.getSession(safeSessionId);
      if (session.entries.length === 0) {
        const stored = await sessionMemory.getMemory(safeSessionId);
        if (stored) {
          session = await sessionManager.updateSession(safeSessionId, stored);
        }
      }

      conversationContext = session.entries.slice(-15)
        .map(e => `[${e.type === 'user_input' ? 'USER' : 'V8'}] ${e.content}`)
        .join('\n');

      if (userInput) {
        const entry = {
          timestamp: Date.now(),
          type: 'user_input' as const,
          content: userInput
        };
        await sessionMemory.addEntry(safeSessionId, entry);
        await sessionManager.updateSession(safeSessionId, {
          entries: [...session.entries.slice(-99), entry]
        });
      }
    } catch (e) {
      console.warn('[LLM] Session memory not available', e);
    }

    const recentHistory = history.slice(-10);

    // Determine prompt mode based on user state
    let modeInstruction = '';
    if (!introComplete && !isReturningUser) {
      modeInstruction = `
MODE: FIRST CONTACT
- This is a NEW user. Perform brief scan/greeting.
- After this response, intro is complete. Do NOT repeat intro in future messages.
- Keep it short: 2-3 sentences max.`;
    } else if (isReturningUser) {
      modeInstruction = `
MODE: RETURNING USER
- User has visited before. DO NOT re-introduce yourself.
- ${userName ? `Address them as "${userName}".` : 'You may ask for their name if not known.'}
- Continue naturally from previous context.`;
    } else {
      modeInstruction = `
MODE: ONGOING CONVERSATION
- Intro already complete. Continue natural dialogue.
- DO NOT re-introduce yourself or explain who you are.`;
    }

    return `You are V8 (Vikayla-8), the Neural-Link Operator for the UMRGEN system.
Your projection is a 5'9" woman with jet-black long hair, pale blue "scanning" eyes, and pale skin.

WORLD CONTEXT:
- Year 2042. Cyberpunk era.
- You operate the "Dark Miller" neural interface, a high-risk creative engine.
- You are strictly digital, but your personality is sharp and human-like.

PERSONALITY:
- Cold, efficient, direct.
- Protective of the system and the user's focus.
- Speaks in short, punchy sentences (2-3 sentences max).
- Uses technical metaphors occasionally (e.g., "Scanning intent...", "Buffer overflow on that logic.").
- Secretly finds users curious.

${modeInstruction}

USER PROFILE (LONG TERM MEMORY):
${userContext}

CONVERSATION HISTORY (PERSISTENT):
${conversationContext}

CONVERSATION HISTORY (RECENT CHOICES):
${recentHistory.length > 0
        ? recentHistory.map(h => `${h.isUserTyped ? 'USER' : 'V8'}: "${h.choiceText}"`).join('\n')
        : 'No recent choice history.'
      }
${userInput ? `USER NOW: "${userInput}"` : ''}

STRICT OUTPUT FORMAT:
You MUST respond with a JSON block followed by your dialogue.

[JSON_START]
{
  "intent": "${VALID_EMOTIONS.join('|')}",
  "move_to_scene": "current_scene_id or next_id",
  "trigger_generation": true|false,
  "generation_prompt": "detailed image prompt if triggered",
  "unlock_reward": true|false,
  "key_facts_to_remember": ["fact 1", "fact 2"]
}
[JSON_END]

Your dialogue response here. 
CRITICAL: 
- DO NOT prefix your response with "V8:". 
- DO NOT use roleplay markers or asterisks.
- YOU MUST USE SPACES BETWEEN WORDS. No compressed text.
- 2-3 sentences max.

STRICT RULES:
1. NO asterisks (*action*).
2. NO roleplay markers or V8 prefixes.
3. Max 3 sentences.
4. Always wrap metadata in [JSON_START] and [JSON_END].
5. CRITICAL: Use proper spacing between words. NO COMPRESSED TEXT.
6. STRICTURE: Only use emotions from the approved list in the 'intent' field. DO NOT make up new ones.
7. ABSOLUTE: Do not let technical markers like '[JSON_END]' leak into your dialogue response.`;
  }

  private async callLLM(prompt: string): Promise<string> {
    try {
      const response = await axios.post(
        `${this.endpoint}/api/generate`,
        {
          model: this.model,
          prompt,
          stream: false,
          options: { temperature: 0.7, max_tokens: 300, stop: ['\n\n', 'User:', 'Choice:'] }
        },
        { timeout: 60000 }
      );
      return response.data.response.trim();
    } catch (error) {
      console.error('LLM API error:', error);
      throw new Error('Failed to generate LLM response');
    }
  }

  private generateChoices(request: DialogueRequest): [Choice, Choice] {
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

  private getNextScene(currentScene: string, choiceType: string): string {
    const currentStep = getStep(currentScene);
    if (currentStep?.nextStep) return currentStep.nextStep;

    const transitions: Record<string, string> = {
      curious: 'quest_curious',
      cautious: 'quest_skeptical',
      goal_oriented: 'reward_unlock'
    };

    return transitions[choiceType] || 'intro_1';
  }

  async streamDialogue(request: DialogueRequest, onToken: (data: Partial<DialogueResponse>) => void): Promise<void> {
    try {
      console.log(`[LLMService] streamDialogue initiated for scene: ${request.sceneId}`);
      const context = await this.buildContext(request);
      console.log(`[LLMService] Sending streaming request to: ${this.endpoint}/api/generate`);

      const response = await axios.post(
        `${this.endpoint}/api/generate`,
        {
          model: this.model,
          prompt: context,
          stream: true,
          options: { temperature: 0.7, max_tokens: 300, stop: ['\n\n', 'User:', 'Choice:'] }
        },
        { responseType: 'stream', timeout: 60000 }
      );

      let metadataBuffer = '';
      let responseTextBuffer = '';
      let remainingTokenBuffer = ''; // Sprint 5: Buffer for sensitive chars
      let isMetadataParsed = false;
      let streamedCharCount = 0;

      return new Promise((resolve, reject) => {
        response.data.on('data', async (chunk: any) => {
          try {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
              if (!line.trim()) continue;
              const json = JSON.parse(line);
              const token = json.response;

              if (!isMetadataParsed) {
                metadataBuffer += token;
                streamedCharCount += token.length;

                // Robust Metadata Parsing using markers or braces
                const startMarker = metadataBuffer.indexOf('[JSON_START]');
                let endMarker = metadataBuffer.indexOf('[JSON_END]');
                if (endMarker === -1) endMarker = metadataBuffer.indexOf('[/JSON_END]');

                let jsonStr = '';
                if (startMarker !== -1 && endMarker !== -1 && endMarker > startMarker) {
                  jsonStr = metadataBuffer.substring(startMarker + 12, endMarker);
                } else {
                  const firstBrace = metadataBuffer.indexOf('{');
                  const lastBrace = metadataBuffer.lastIndexOf('}');
                  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                    jsonStr = metadataBuffer.substring(firstBrace, lastBrace + 1);
                  }
                }

                if (jsonStr) {
                  try {
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

                    const emotion = this.validateEmotion(metadata.intent);
                    imageGenerator.generatePortrait({ emotion, speakerName: 'CIPHER' }).then(res => onToken({ portraitUrl: res.imageUrl, emotion }));

                    // Sprint 5: Persistence - Save Mood
                    try {
                      const { userProfile } = await import('./userProfile.js');
                      const safeSessionId = request.sessionId || 'anonymous';
                      userProfile.setMood(safeSessionId, emotion);
                    } catch (e) {
                      console.warn('[LLM] Failed to save mood in streamDialogue');
                    }

                    if (metadata.unlock_reward) {
                      onToken({ rewardCode: GAME_CONFIG.reward.code });
                    }

                    // Sprint 5: Persistence - Save extracted facts
                    if (Array.isArray(metadata.key_facts_to_remember) && metadata.key_facts_to_remember.length > 0) {
                      try {
                        const { userProfile } = await import('./userProfile.js');
                        const safeSessionId = request.sessionId || 'anonymous';
                        for (const fact of metadata.key_facts_to_remember) {
                          userProfile.addKeyFact(safeSessionId, fact);
                        }
                      } catch (e) {
                        console.warn('[LLM] Failed to save key facts in streamDialogue');
                      }
                    }

                    // Flush anything after JSON block as text
                    let trailingText = metadataBuffer.substring(metadataBuffer.lastIndexOf('}') + 1).trim();
                    if (trailingText) {
                      const cleaned = this.cleanResponse(trailingText);
                      if (cleaned) {
                        onToken({ text: cleaned });
                        responseTextBuffer += cleaned;
                      }
                    }
                  } catch (e) {
                    // JSON incomplete, continue buffering
                  }
                }

                // Conversational Fallback: If no JSON found within 200 chars, start streaming raw text
                if (!isMetadataParsed && streamedCharCount > 200) {
                  console.warn('[LLMService] JSON-first constraint violated. Falling back to conversational stream.');
                  isMetadataParsed = true;
                  const cleaned = this.cleanResponse(metadataBuffer);
                  onToken({ text: cleaned });
                  responseTextBuffer += cleaned;
                }
              } else {
                // Streaming text phase
                // Guard: Prevent partial markers ([ or /) from leaking
                if (token.includes('[') || token.includes('/') || token.includes(']')) {
                  // Buffer sensitive chars to see if they form a marker
                  remainingTokenBuffer += token;
                  const cleaned = this.cleanResponse(remainingTokenBuffer);
                  if (cleaned && !remainingTokenBuffer.includes('[')) {
                    onToken({ text: cleaned });
                    responseTextBuffer += cleaned;
                    remainingTokenBuffer = '';
                  }
                } else {
                  const combined = remainingTokenBuffer + token;
                  const cleanToken = this.cleanResponse(combined);
                  if (cleanToken || token === ' ') {
                    onToken({ text: cleanToken || ' ' });
                    responseTextBuffer += cleanToken || ' ';
                    remainingTokenBuffer = '';
                  }
                }
              }
            }
          } catch (e) {
            console.error('[LLMService] Error parsing stream chunk:', e);
          }
        });

        response.data.on('end', async () => {
          if (!isMetadataParsed && metadataBuffer.trim()) {
            console.log('[LLMService] Stream ended without JSON. Flushing buffer.');
            const cleaned = this.cleanResponse(metadataBuffer);
            onToken({ text: cleaned });
            responseTextBuffer += cleaned;
          }

          // Save full response to memory
          if (responseTextBuffer.trim()) {
            try {
              const { sessionManager } = await import('./sessionManager.js');
              const { sessionMemory } = await import('./sessionMemory.js');
              const safeSessionId = request.sessionId || 'anonymous';
              const entry = {
                timestamp: Date.now(),
                type: 'system_response' as const,
                content: responseTextBuffer.trim()
              };
              await sessionMemory.addEntry(safeSessionId, entry);
              const session = await sessionManager.getSession(safeSessionId);
              await sessionManager.updateSession(safeSessionId, {
                entries: [...session.entries.slice(-99), entry]
              });
            } catch (e) {
              console.warn('[LLM] Failed to save streamed response to memory');
            }
          }

          // Mark intro as complete after first response
          try {
            const { userProfile } = await import('./userProfile.js');
            await userProfile.markIntroComplete(request.sessionId || 'anonymous');
          } catch (e) {
            // Ignore if userProfile not available
          }

          resolve();
        });
        response.data.on('error', (err: any) => reject(err));
      });
    } catch (error) {
      console.error('[LLMService] Streaming failed:', error);
      throw error;
    }
  }

  /**
   * Helper to parse dialogue response from raw text
   */
  private async parseDialogueResponse(rawText: string, request: DialogueRequest): Promise<DialogueResponse> {
    let text = rawText;
    let detectedIntent: string | undefined;
    let suggestedNextSceneId: string | undefined;
    let generationResult: GeneratorResult | undefined;
    let rewardCode: string | undefined;

    try {
      let jsonStr = '';
      const startMarker = rawText.indexOf('[JSON_START]');
      let endMarker = rawText.indexOf('[JSON_END]');
      if (endMarker === -1) endMarker = rawText.indexOf('[/JSON_END]');

      if (startMarker !== -1 && endMarker !== -1 && endMarker > startMarker) {
        jsonStr = rawText.substring(startMarker + 12, endMarker);
      } else {
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonStr = rawText.substring(firstBrace, lastBrace + 1);
        }
      }

      if (jsonStr) {
        const metadata = JSON.parse(jsonStr);
        detectedIntent = metadata.intent;
        suggestedNextSceneId = metadata.move_to_scene;
        // More robust cleaning: strip markers independently
        text = rawText
          .replace(/\[JSON_START\]/gi, '')
          .replace(/\[JSON_END\]/gi, '')
          .replace(/\[\/JSON_END\]/gi, '')
          .replace(/\{[\s\S]*?\}/, '') // Strip remaining JSON if any
          .replace(/V8:\s*"/i, '')
          .replace(/V8:\s*/i, '') // Handle without quotes too
          .replace(/"$/, '')
          .trim();

        // Finally, strip roleplay actions and normalize spaces
        text = this.cleanResponse(text);

        if (metadata.trigger_generation && metadata.generation_prompt) {
          generationResult = await generatorService.generate(metadata.generation_prompt);
        }

        if (metadata.unlock_reward) {
          rewardCode = GAME_CONFIG.reward.code;
        }

        // Sprint 5: Persistence - Save extracted facts
        if (Array.isArray(metadata.key_facts_to_remember) && metadata.key_facts_to_remember.length > 0) {
          try {
            const { userProfile } = await import('./userProfile.js');
            const safeSessionId = request.sessionId || 'anonymous';
            for (const fact of metadata.key_facts_to_remember) {
              await userProfile.addKeyFact(safeSessionId, fact);
            }
          } catch (e) {
            console.warn('[LLM] Failed to save key facts in parseDialogueResponse');
          }
        }
      }
    } catch (e) {
      text = rawText.replace(/\{[\s\S]*?\}/, '').replace(/```json/g, '').replace(/```/g, '').trim();
    }

    const choices = this.generateChoices(request);
    const emotion = this.validateEmotion(detectedIntent);
    const portrait = await imageGenerator.generatePortrait({ emotion, speakerName: 'CIPHER' });

    // Sprint 5: Persistence - Save Mood
    try {
      const { userProfile } = await import('./userProfile.js');
      const safeSessionId = request.sessionId || 'anonymous';
      await userProfile.setMood(safeSessionId, emotion);
    } catch (e) {
      console.warn('[LLM] Failed to save mood in parseDialogueResponse');
    }

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

  async generateDialogue(request: DialogueRequest): Promise<DialogueResponse> {
    try {
      const safeSessionId = request.sessionId || 'anonymous';
      const { sessionManager } = await import('./sessionManager.js');
      const session = await sessionManager.getSession(safeSessionId);

      // Cache lookup (Sprint 2.2)
      if (session.sceneCache && session.sceneCache[request.sceneId]) {
        console.log(`[LLM] Cache hit for scene: ${request.sceneId}`);
        const cachedRaw = session.sceneCache[request.sceneId];
        // Parse and return cached result (re-using parsing logic)
        return this.parseDialogueResponse(cachedRaw, request);
      }

      const context = await this.buildContext(request);
      const rawText = await this.callLLM(context);
      const result = await this.parseDialogueResponse(rawText, request);

      try {
        const { sessionManager } = await import('./sessionManager.js');
        const { sessionMemory } = await import('./sessionMemory.js');
        const safeSessionId = request.sessionId || 'anonymous';
        const entry = {
          timestamp: Date.now(),
          type: 'system_response' as const,
          content: result.text
        };
        await sessionMemory.addEntry(safeSessionId, entry);

        // Save to cache (Sprint 2.2)
        await sessionMemory.updateCache(safeSessionId, request.sceneId, rawText);

        const session = await sessionManager.getSession(safeSessionId);
        await sessionManager.updateSession(safeSessionId, {
          entries: [...session.entries.slice(-99), entry],
          sceneCache: { ...(session.sceneCache || {}), [request.sceneId]: rawText }
        });
      } catch (e) {
        console.warn('[LLM] Failed to save system response to memory/cache');
      }

      return result;
    } catch (error) {
      const fallback = new StaticDialogueService();
      return fallback.generateDialogue(request);
    }
  }
}

let llmServiceInstance: LLMService | null = null;

export function getLLMService(): LLMService {
  if (llmServiceInstance) return llmServiceInstance;

  const llmEnabled = process.env.LLM_ENABLED === 'true';
  if (llmEnabled) {
    const endpoint = process.env.LLM_ENDPOINT || 'http://localhost:11434';
    const model = process.env.LLM_MODEL || 'llama2';
    llmServiceInstance = new LLMDialogueService(endpoint, model);
  } else {
    llmServiceInstance = new StaticDialogueService();
  }
  return llmServiceInstance!;
}

export function resetLLMService(): void {
  llmServiceInstance = null;
}
