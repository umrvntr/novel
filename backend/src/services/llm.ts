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
   * Clean response: Remove asterisks, emotes, and unwanted formatting
   */
  private cleanResponse(text: string): string {
    return text
      .replace(/\*[^*]+\*/g, '')              // Remove *actions*
      .replace(/\([^)]*emotion[^)]*\)/gi, '') // Remove (emotion) markers
      .replace(/\s+/g, ' ')                   // Normalize whitespace
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

    // Sprint 4: Session memory
    let conversationContext = 'No prior conversation.';
    try {
      const { sessionMemory } = await import('./sessionMemory.js');
      conversationContext = await sessionMemory.getConversationContext(safeSessionId, 5);

      if (userInput) {
        await sessionMemory.addEntry(safeSessionId, {
          timestamp: Date.now(),
          type: 'user_input',
          content: userInput
        });
      }
    } catch (e) {
      console.warn('[LLM] Session memory not available');
    }

    const recentHistory = history.slice(-5);

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

    return `You are V8 (Vikayla8).

IDENTITY (only mention if directly asked):
- Jet-black long hair, pale blue eyes, pale skin
- Neural-link projection operator for umrgen system

PERSONALITY:
- Cold, efficient, direct
- Speaks in short sentences (1-3 sentences per response)
- Dry humor occasionally
- Secretly caring

${modeInstruction}

USER PROFILE:
${userContext}

CONVERSATION HISTORY:
${recentHistory.length > 0
        ? recentHistory.map(h => `${h.isUserTyped ? 'USER' : 'V8'}: "${h.choiceText}"`).join('\n')
        : conversationContext
      }
${userInput ? `USER NOW: "${userInput}"` : ''}

STRICT RULES:
1. NO asterisks (*action*)
2. NO parenthetical emotions ((smiles))
3. NO roleplay markers
4. Maximum 2-3 sentences
5. Direct, clean text only`;
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
                    if (trailingText) onToken({ text: trailingText });
                  } catch (e) {
                    // JSON incomplete, continue buffering
                  }
                }

                // Conversational Fallback: If no JSON found within 200 chars, start streaming raw text
                if (!isMetadataParsed && streamedCharCount > 200) {
                  console.warn('[LLMService] JSON-first constraint violated. Falling back to conversational stream.');
                  isMetadataParsed = true;
                  onToken({ text: this.cleanResponse(metadataBuffer) });
                }
              } else {
                // Streaming text phase
                // Clean asterisks and unwanted markers from token
                const cleanToken = this.cleanResponse(token.replace(/`|json/g, ''));
                if (cleanToken || token === ' ') {
                  onToken({ text: cleanToken || ' ' });
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
            onToken({ text: this.cleanResponse(metadataBuffer) });
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

  async generateDialogue(request: DialogueRequest): Promise<DialogueResponse> {
    try {
      const context = await this.buildContext(request);
      const rawText = await this.callLLM(context);

      let text = rawText;
      let detectedIntent: string | undefined;
      let suggestedNextSceneId: string | undefined;
      let generationResult: GeneratorResult | undefined;
      let rewardCode: string | undefined;

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
      } catch (e) {
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
