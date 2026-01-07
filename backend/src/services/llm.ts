/**
 * EPIC 4: LLM Integration Service
 * Manages LLM communication with strict context limits
 */

import axios from 'axios';
import type { DialogueRequest, DialogueResponse, Choice } from '@shared/types.js';

interface LLMService {
  generateDialogue(request: DialogueRequest): Promise<DialogueResponse>;
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
    // Return hardcoded response based on scene
    // In production, this would load from scene definitions
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
        {
          id: 'restart',
          text: 'Restart',
          nextSceneId: 'scene_01',
          style: 'primary'
        },
        {
          id: 'restart2',
          text: 'Restart',
          nextSceneId: 'scene_01',
          style: 'secondary'
        }
      ],
      usedLLM: false
    };
  }
}

/**
 * LLM-powered dialogue service (Ollama/local LLM)
 * EPIC 4: Generate dynamic dialogue based on user flags and history
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
   * Build strict context for LLM
   * EPIC 4: Context is limited to scene, flags, and short history
   */
  private buildContext(request: DialogueRequest): string {
    const { sceneId, flags, history } = request;

    // Get last 3 history entries for context
    const recentHistory = history.slice(-3);

    // Build context string
    let context = `You are a guide character in an interactive visual novel that leads users toward trying a generator tool.

Scene: ${sceneId}

User Traits (0-10 scale):
- Curious: ${flags.curious}/10 (interest in creative/aesthetic aspects)
- Cautious: ${flags.cautious}/10 (skepticism, needs proof)
- Goal-Oriented: ${flags.goal_oriented}/10 (focused on practical results)

Recent Conversation:
${recentHistory.length > 0
  ? recentHistory.map(h => `User chose: "${h.choiceText}"`).join('\n')
  : 'This is the start of the conversation.'
}

Your personality adapts based on user traits:
- High Curious → Be encouraging and creative
- High Cautious → Be direct and provide evidence
- High Goal-Oriented → Be efficient and results-focused

YOUR TASK:
Generate a single dialogue line (2-3 sentences) that advances the user toward:
1. Understanding the tool
2. Trying the free demo
3. Eventually upgrading to PRO

The dialogue should feel natural and adapt to their traits.
Do NOT be overly salesy. Be helpful and direct.

IMPORTANT: Only generate the dialogue text. Do not include choices - the system handles those.`;

    return context;
  }

  /**
   * Call LLM API (Ollama format)
   */
  private async callLLM(prompt: string): Promise<string> {
    try {
      const response = await axios.post(
        `${this.endpoint}/api/generate`,
        {
          model: this.model,
          prompt,
          stream: false,
          options: {
            temperature: 0.7,
            max_tokens: 200, // Limit response length
            stop: ['\n\n', 'User:', 'Choice:']
          }
        },
        {
          timeout: 10000 // 10 second timeout
        }
      );

      return response.data.response.trim();
    } catch (error) {
      console.error('LLM API error:', error);
      throw new Error('Failed to generate LLM response');
    }
  }

  /**
   * Generate choices based on scene and flags
   * EPIC 4: LLM does NOT control transitions - only dialogue text
   */
  private generateChoices(request: DialogueRequest): [Choice, Choice] {
    // Choices are deterministic based on scene
    // This maintains funnel control while allowing dynamic dialogue

    const { sceneId, flags } = request;

    // Scene-specific choice logic
    // In production, this would be more sophisticated
    const choices: [Choice, Choice] = [
      {
        id: 'continue',
        text: 'Continue',
        nextSceneId: this.getNextScene(sceneId, 'continue'),
        flagModifiers: { curious: 1 },
        style: 'primary'
      },
      {
        id: 'ask_more',
        text: 'Tell me more',
        nextSceneId: this.getNextScene(sceneId, 'ask_more'),
        flagModifiers: { cautious: 1 },
        style: 'secondary'
      }
    ];

    return choices;
  }

  /**
   * Deterministic scene transitions (EPIC 3)
   * LLM does NOT control this - funnel logic remains fixed
   */
  private getNextScene(currentScene: string, choiceType: string): string {
    // Simplified example - in production, use the scene graph
    const transitions: Record<string, Record<string, string>> = {
      scene_01: {
        continue: 'scene_02_curious',
        ask_more: 'scene_02_goal'
      }
    };

    return transitions[currentScene]?.[choiceType] || 'scene_01';
  }

  /**
   * Generate dialogue using LLM
   */
  async generateDialogue(request: DialogueRequest): Promise<DialogueResponse> {
    try {
      // Build context
      const context = this.buildContext(request);

      // Call LLM
      const text = await this.callLLM(context);

      // Generate deterministic choices
      const choices = this.generateChoices(request);

      return {
        text,
        choices,
        usedLLM: true
      };
    } catch (error) {
      console.error('LLM generation failed, falling back to static:', error);
      // Fallback to static service
      const fallback = new StaticDialogueService();
      return fallback.generateDialogue(request);
    }
  }
}

/**
 * Get LLM service instance (singleton pattern)
 */
let llmServiceInstance: LLMService | null = null;

export function getLLMService(): LLMService {
  if (llmServiceInstance) {
    return llmServiceInstance;
  }

  // Check if LLM is enabled
  const llmEnabled = process.env.LLM_ENABLED === 'true';

  if (llmEnabled) {
    const endpoint = process.env.LLM_ENDPOINT || 'http://localhost:11434';
    const model = process.env.LLM_MODEL || 'llama2';

    console.log('Initializing LLM service:', { endpoint, model });
    llmServiceInstance = new LLMDialogueService(endpoint, model);
  } else {
    console.log('LLM disabled, using static dialogue service');
    llmServiceInstance = new StaticDialogueService();
  }

  return llmServiceInstance;
}

/**
 * Reset LLM service (for testing)
 */
export function resetLLMService(): void {
  llmServiceInstance = null;
}
