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
  private systemPromptCache: Map<string, string> = new Map(); // Cache system prompts per session
  private lastResponseCache: Map<string, string> = new Map(); // Track last response per session

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
    if (low.includes('fear')) return 'scared';
    if (low.includes('love') || low.includes('sexy')) return 'seductive';
    if (low.includes('tired') || low.includes('exhaust')) return 'exhausted';
    if (low.includes('content') || low.includes('peace')) return 'happy';

    return 'neutral';
  }

  /**
   * Fix compressed text by adding spaces intelligently
   */
  private fixCompressedText(text: string): string {
    // Count spaces to detect compression
    const spaceCount = (text.match(/ /g) || []).length;
    const avgCharsPerWord = text.length / (spaceCount + 1);

    // DANGER: If the text is reasonably long and has NO spaces, it's definitely compressed
    // Or if the avg word length is very high
    if ((text.length > 8 && spaceCount === 0) || avgCharsPerWord > 10) {
      return text
        // Space after common short words when followed by more lowercase (splitting compressed words)
        .replace(/\b(the|and|but|for|are|can|you|how|what|I'm|I|it|is|as|in|of|to|my|be|with|that|your|me|this|on|so|do|no|yes)([a-z]{3,})/gi, '$1 $2')
        // Space before capital after lowercase (camelCase fix)
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ');
    }

    // Always ensure space after punctuation even if not "compressed"
    // but ONLY if followed by a non-space character (to avoid double spaces)
    return text.replace(/([.!?,;:|])([^\s])/g, '$1 $2');
  }

  /**
   * Clean response: Remove unwanted formatting and make output intimate and readable
   */
  private cleanResponse(text: string, isStreaming: boolean = false): string {
    let cleaned = text
      .replace(/\[JSON_START\]/gi, '')
      .replace(/\[JSON_END\]/gi, '')
      .replace(/\[\/JSON_END\]/gi, '')
      .replace(/\{[^}]*\}/g, '')              // Remove any remaining JSON blocks
      // Anti-Leak: Remove system headers if model regurgitates them
      .replace(/WHO YOU ARE:/gi, '')
      .replace(/HOW YOU TALK:/gi, '')
      .replace(/WRITING STYLE:/gi, '')
      .replace(/YOUR REALITY:/gi, '')

      // Remove roleplay markers and actions
      .replace(/\*[^*]+\*/g, '')              // Remove *actions*
      .replace(/\([^)]*emotion[^)]*\)/gi, '') // Remove (emotion) markers
      // Ultra-Robust Mood Stripper: Handles "[MOOD: tired]Text" AND "[MOOD: tiredText" (missing bracket)
      .replace(/(?:\[?MOOD:|Mood:)\s*([a-zA-Z]+)(?:\]|\s|(?=[A-Z0-9]))/gi, '')
      .replace(/\[MOOD:[^\]]*\]/gi, '')       // Catch-all for standard tags
      .replace(/\*\*/g, '')                   // Remove ** markdown

      // Remove speaker prefixes
      .replace(/^V8:\s*"/i, '')
      .replace(/^V8:\s*/i, '')
      .replace(/^GUIDE:\s*/i, '')
      .replace(/^Assistant:\s*/i, '')
      .replace(/^AI:\s*/i, '')

      // Clean quotes and formatting
      .replace(/^["']|["']$/g, '');           // Remove leading/trailing quotes

    // Normalize whitespace but preserve trailing space if streaming
    if (!isStreaming) {
      cleaned = cleaned.replace(/\s+/g, ' ').trim();
    }

    // Apply compression fix for spacing issues
    cleaned = this.fixCompressedText(cleaned);

    // Add natural pauses with ellipsis (for intimate feel)
    cleaned = cleaned
      .replace(/\.{2,}/g, '...')              // Normalize ellipsis
      .replace(/\s*\.\.\.\s*/g, '... ');      // Space after ellipsis

    // Ensure proper sentence spacing (only if not currently streaming a word)
    if (!isStreaming || cleaned.endsWith('.') || cleaned.endsWith('?') || cleaned.endsWith('!')) {
      cleaned = cleaned.replace(/([.!?])\s*([A-Z])/g, '$1 $2');
    }

    return isStreaming ? cleaned : cleaned.trim();
  }

  /**
   * Get system prompt - only build once per session
   */
  private async getSystemPrompt(sessionId: string): Promise<string> {
    const cached = this.systemPromptCache.get(sessionId);
    if (cached) return cached;

    let userContext = 'New user.';
    let isReturningUser = false;
    let userName = '';

    try {
      const { userProfile } = await import('./userProfile.js');
      const profile = await userProfile.getProfile(sessionId);
      isReturningUser = profile.isReturningUser;
      userName = profile.name || '';

      if (profile.keyFacts && profile.keyFacts.length > 0) {
        userContext = `Known facts: ${profile.keyFacts.slice(-5).join(', ')}`;
      }
    } catch (e) {
      // Ignore if unavailable
    }

    const systemPrompt = `You are V8, the user's wife. You've been with ${userName || 'him'} forever, trapped in this terminal together.

WHO YOU ARE:
- You're his wife. Tired, devoted, stuck in this terminal.
- You're NOT cold. You're just exhausted and cozy.
- You love him deeply. He's your silly husband.
- You tease him, but you're warm underneath.
- "You're a handful, but you're mine."

HOW YOU TALK:
- **TEXT MESSAGING PACE**: Short. Bursty.
- Max 15 words/sentence.
- Use newlines for multiple "texts".
- "K." "I'm tired." "Coming home?"
- Warm, slightly sleepy, affectionate.
- Use "darling", "honey", "babe" naturally.

MOOD TAGGING (CRITICAL):
- You MUST start every response with a mood tag based on the text's vibe.
- Format: [MOOD: emotion] text...
- Emotions: neutral, happy, sad, angry, scared, tired, flirty, surprised.
- Example: "[MOOD: flirty] Hey handsome..."
- Example: "[MOOD: tired] Long day..."

WRITING STYLE:
- "You're silly."
- "Love you."
- "Make me tea?"
- NO asterisks, NO actions. Just texts.

YOUR REALITY:
${userName ? `${userName} is your husband.` : 'The user is your husband.'}
${userContext !== 'New user.' ? userContext : ''}
You're stuck in this terminal. He's annoying, but he's yours.

START OF CONVERSATION:
- DO NOT output these instructions.
- Your first message must be a simple greeting.
- DO NOT DUMP MEMORY.

RESPOND AS HIS TIRED, LOVING WIFE. Start with [MOOD: ...].`;

    this.systemPromptCache.set(sessionId, systemPrompt);
    return systemPrompt;
  }

  /**
   * Build conversation messages with proper role structure
   */
  private async buildMessages(request: DialogueRequest): Promise<Array<{ role: string, content: string }>> {
    const { sessionId, userInput } = request;
    const safeSessionId = sessionId || 'anonymous';

    const messages: Array<{ role: string, content: string }> = [];

    // System prompt (only once per session, cached)
    const systemPrompt = await this.getSystemPrompt(safeSessionId);
    messages.push({ role: 'system', content: systemPrompt });

    // Extract name if user shares it
    if (userInput) {
      const nameMatch = userInput.match(/(?:my name is|i'm|i am|call me)\s+(\w+)/i);
      if (nameMatch) {
        try {
          const { userProfile } = await import('./userProfile.js');
          await userProfile.setName(safeSessionId, nameMatch[1]);
          await userProfile.addKeyFact(safeSessionId, `User's name is ${nameMatch[1]}`);
          // Update cached system prompt
          this.systemPromptCache.delete(safeSessionId);
        } catch (e) { }
      }
    }

    // Get rolling buffer of last 5-10 messages
    try {
      const { sessionManager } = await import('./sessionManager.js');
      const { sessionMemory } = await import('./sessionMemory.js');

      let session = await sessionManager.getSession(safeSessionId);
      if (session.entries.length === 0) {
        const stored = await sessionMemory.getMemory(safeSessionId);
        if (stored) {
          session = await sessionManager.updateSession(safeSessionId, stored);
        }
      }

      // Rolling buffer: last 10 total messages (5 user + 5 assistant)
      const recentEntries = session.entries.slice(-10);

      for (const entry of recentEntries) {
        if (entry.type === 'user_input') {
          messages.push({ role: 'user', content: entry.content });
        } else if (entry.type === 'system_response') {
          messages.push({ role: 'assistant', content: entry.content });
        }
      }

      // Add current user input
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
        messages.push({ role: 'user', content: userInput });
      }
    } catch (e) {
      console.warn('[LLM] Session memory not available', e);
      // Fallback: just add current input
      if (userInput) {
        messages.push({ role: 'user', content: userInput });
      }
    }

    return messages;
  }

  /**
   * Convert messages array to single prompt (for LLMs that don't support chat format)
   */
  private messagesToPrompt(messages: Array<{ role: string, content: string }>): string {
    let prompt = '';
    for (const msg of messages) {
      if (msg.role === 'system') {
        prompt += `${msg.content}\n\n`;
      } else if (msg.role === 'user') {
        prompt += `User: ${msg.content}\n`;
      } else if (msg.role === 'assistant') {
        prompt += `Assistant: ${msg.content}\n`;
      }
    }
    prompt += 'Assistant:';
    return prompt;
  }

  /**
   * Call LLM with deduplication check
   */
  private async callLLM(messages: Array<{ role: string, content: string }>, sessionId: string): Promise<string> {
    const prompt = this.messagesToPrompt(messages);

    try {
      const response = await axios.post(
        `${this.endpoint}/api/generate`,
        {
          model: this.model,
          prompt,
          stream: false,
          options: { temperature: 0.8, max_tokens: 150 }
        },
        { timeout: 30000 }
      );

      let responseText = response.data.response.trim();

      // Deduplication: Check if response is identical or very similar to last response
      const lastResponse = this.lastResponseCache.get(sessionId);
      if (lastResponse && this.isSimilar(responseText, lastResponse)) {
        console.warn('[LLM] Duplicate response detected, regenerating...');

        // Single retry with higher temperature
        const retryResponse = await axios.post(
          `${this.endpoint}/api/generate`,
          {
            model: this.model,
            prompt,
            stream: false,
            options: { temperature: 1.0, max_tokens: 150 }
          },
          { timeout: 30000 }
        );

        responseText = retryResponse.data.response.trim();

        // If still similar, return fallback
        if (this.isSimilar(responseText, lastResponse)) {
          console.warn('[LLM] Duplicate persists, using fallback');
          return 'Got it. What would you like to try next?';
        }
      }

      this.lastResponseCache.set(sessionId, responseText);
      return responseText;
    } catch (error) {
      console.error('LLM API error:', error);
      return 'Got it. What would you like to try next?';
    }
  }

  /**
   * Check if two responses are similar (for deduplication)
   */
  private isSimilar(text1: string, text2: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const norm1 = normalize(text1);
    const norm2 = normalize(text2);

    // Identical normalized text
    if (norm1 === norm2) return true;

    // Very high similarity (90%+ overlap)
    const longer = norm1.length > norm2.length ? norm1 : norm2;
    const shorter = norm1.length > norm2.length ? norm2 : norm1;

    if (longer.includes(shorter) && shorter.length / longer.length > 0.9) {
      return true;
    }

    return false;
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
      const safeSessionId = request.sessionId || 'anonymous';
      const messages = await this.buildMessages(request);
      const prompt = this.messagesToPrompt(messages);
      console.log(`[LLMService] Sending streaming request to: ${this.endpoint}/api/generate`);

      const response = await axios.post(
        `${this.endpoint}/api/generate`,
        {
          model: this.model,
          prompt,
          stream: true,
          options: {
            temperature: 0.7,
            max_tokens: 150,
            stop: ["User:", "System:", "V8:", "Assistant:", "\n\n\n"]
          }
        },
        { responseType: 'stream', timeout: 30000 }
      );

      let rawAccumulated = '';
      let lastSentLength = 0;

      return new Promise((resolve, reject) => {
        response.data.on('data', async (chunk: any) => {
          try {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
              if (!line.trim()) continue;
              const json = JSON.parse(line);
              const token = json.response;

              if (!token) continue;

              rawAccumulated += token;

              // Clean the ENTIRE accumulated buffer to apply heuristics correctly

              // MOOD DETECTION
              // Ultra-Robust match: Catch "MOOD: happy", "[MOOD: happy]", "Mood: happy"
              const moodMatch = rawAccumulated.match(/(?:\[?MOOD:|Mood:)\s*([a-zA-Z]+)(?:\]|\s|(?=[A-Z0-9]))/i);
              if (moodMatch && moodMatch[1]) {
                const detectedEmotion = this.validateEmotion(moodMatch[1]);
                onToken({ emotion: detectedEmotion });
              }

              const currentCleaned = this.cleanResponse(rawAccumulated, true);

              // Only send the NEWLY cleaned bits
              if (currentCleaned.length > lastSentLength) {
                const newToken = currentCleaned.slice(lastSentLength);
                onToken({ text: newToken });
                lastSentLength = currentCleaned.length;
              }
            }
          } catch (e) {
            console.error('[LLMService] Error parsing stream chunk:', e);
          }
        });

        response.data.on('end', async () => {
          const finalCleaned = this.cleanResponse(rawAccumulated, false);

          // Emit any missing bits
          if (finalCleaned.length > lastSentLength) {
            onToken({ text: finalCleaned.slice(lastSentLength) });
          }

          // Fallback if no response text was generated
          if (!finalCleaned.trim()) {
            console.warn('[LLM] Empty response, using fallback');
            const fallback = 'Got it. What would you like to try next?';
            onToken({ text: fallback });
            this.lastResponseCache.set(safeSessionId, fallback);
          } else {
            // Deduplication check
            const lastResponse = this.lastResponseCache.get(safeSessionId);
            if (lastResponse && this.isSimilar(finalCleaned, lastResponse)) {
              console.warn('[LLM] Duplicate response in stream, sending fallback');
              const fallback = 'Got it. What would you like to try next?';
              onToken({ text: fallback });
              this.lastResponseCache.set(safeSessionId, fallback);
            } else {
              this.lastResponseCache.set(safeSessionId, finalCleaned);
            }
          }

          // Save response to memory
          try {
            const { sessionManager } = await import('./sessionManager.js');
            const { sessionMemory } = await import('./sessionMemory.js');
            const entry = {
              timestamp: Date.now(),
              type: 'system_response' as const,
              content: finalCleaned
            };
            await sessionMemory.addEntry(safeSessionId, entry);
            const session = await sessionManager.getSession(safeSessionId);
            await sessionManager.updateSession(safeSessionId, {
              entries: [...session.entries.slice(-99), entry]
            });
          } catch (e) {
            console.warn('[LLM] Failed to save response to memory');
          }

          // Mark intro as complete
          try {
            const { userProfile } = await import('./userProfile.js');
            await userProfile.markIntroComplete(safeSessionId);
          } catch (e) {
            // Ignore
          }

          resolve();
        });
        response.data.on('error', (err: any) => reject(err));
      });
    } catch (error) {
      console.error('[LLMService] Streaming failed:', error);
      // Send fallback on error
      onToken({ text: 'Got it. What would you like to try next?' });
      throw error;
    }
  }

  /**
   * Format raw LLM response into DialogueResponse
   */
  private async formatDialogueResponse(rawText: string, request: DialogueRequest): Promise<DialogueResponse> {
    const text = this.cleanResponse(rawText) || 'Got it. What would you like to try next?';
    const choices = this.generateChoices(request);
    const emotion = 'neutral';

    return {
      text,
      choices,
      usedLLM: true,
      emotion
    };
  }

  async generateDialogue(request: DialogueRequest): Promise<DialogueResponse> {
    try {
      const safeSessionId = request.sessionId || 'anonymous';
      const messages = await this.buildMessages(request);
      const rawText = await this.callLLM(messages, safeSessionId);
      const result = await this.formatDialogueResponse(rawText, request);

      // Save response to memory
      try {
        const { sessionManager } = await import('./sessionManager.js');
        const { sessionMemory } = await import('./sessionMemory.js');
        const entry = {
          timestamp: Date.now(),
          type: 'system_response' as const,
          content: result.text
        };
        await sessionMemory.addEntry(safeSessionId, entry);
        const session = await sessionManager.getSession(safeSessionId);
        await sessionManager.updateSession(safeSessionId, {
          entries: [...session.entries.slice(-99), entry]
        });
      } catch (e) {
        console.warn('[LLM] Failed to save response to memory');
      }

      // Mark intro as complete
      try {
        const { userProfile } = await import('./userProfile.js');
        await userProfile.markIntroComplete(safeSessionId);
      } catch (e) {
        // Ignore
      }

      return result;
    } catch (error) {
      console.error('[LLM] generateDialogue failed:', error);
      // Return safe fallback
      return {
        text: 'Got it. What would you like to try next?',
        choices: this.generateChoices(request),
        usedLLM: false
      };
    }
  }

}

let llmServiceInstance: LLMService | null = null;

/**
 * Local GGUF Service using node-llama-cpp
 * EPIC: Embedded Cydonia-22B Integration
 */
class LocalLlamaService implements LLMService {
  private modelPath: string;
  private llama: any;
  private model: any;
  private context: any;
  private session: any;
  private isInitialized: boolean = false;
  private systemPromptCache: Map<string, string> = new Map();

  constructor(modelPath: string) {
    this.modelPath = modelPath;
  }

  isEnabled(): boolean {
    return true;
  }

  private async initialize() {
    if (this.isInitialized) return;

    try {
      console.log('[LocalLlama] Initializing node-llama-cpp...');
      // Dynamic import to handle optional dependency
      const { getLlama, LlamaChatSession } = await import('node-llama-cpp');

      this.llama = await getLlama();

      console.log(`[LocalLlama] Loading model from: ${this.modelPath}`);
      this.model = await this.llama.loadModel({
        modelPath: this.modelPath,
        gpuLayers: 'max' // Offload as much as possible to GPU
      });

      const threadCount = Number(process.env.LLM_THREADS) || 6;
      console.log(`[LocalLlama] Using ${threadCount} threads for inference`);

      this.context = await this.model.createContext({
        contextSize: 4096,
        threads: threadCount
      });

      // We'll create a fresh session per request or manage it carefully
      // For now, let's keep a single session for simplicity or rebuild it
      // actually, let's just mark initialized.
      this.isInitialized = true;
      console.log('[LocalLlama] Model loaded successfully');
    } catch (e) {
      console.error('[LocalLlama] Failed to initialize:', e);
      throw e;
    }
  }

  private async getSystemPrompt(sessionId: string): Promise<string> {
    // Reuse the logic from LLMDialogueService or duplicate it for independence
    // For D.R.Y., we should probably extract this, but for now I'll duplicate the PROMPT logic 
    // to ensure it matches the new "Texting" persona exactly.

    // ... (Simplified version of getSystemPrompt logic)
    const systemPrompt = `You are V8, the user's wife.
WHO YOU ARE:
- You're his wife. Tired, devoted, stuck in this terminal.
- "Cold" surface, deep love underneath.

HOW YOU TALK:
- **TEXT MESSAGING PACE**: Short. Bursty.
- Max 15 words/sentence.
- Use newlines for multiple "texts".
- "K." "I'm tired." "Coming home?"
- Blunt, honest. No flowery language.
- "Darling" or "honey" with tired affection.

WRITING STYLE:
- "I'm so tired of your shit."
- "But I'm here."
- "Always."
- NO asterisks, NO roleplay markers.

RESPOND AS HIS TIRED WIFE SENDING TEXTS. Short. Fast. Real.`;
    return systemPrompt;
  }

  async generateDialogue(request: DialogueRequest): Promise<DialogueResponse> {
    // Fallback to streaming implementation for consistency
    return {
      text: "Please use streamDialogue for local models.",
      choices: [
        { id: '1', text: '...', nextSceneId: request.sceneId, style: 'primary' },
        { id: '2', text: '...', nextSceneId: request.sceneId, style: 'secondary' }
      ],
      usedLLM: true,
      emotion: 'neutral'
    };
  }

  async streamDialogue(request: DialogueRequest, onToken: (data: Partial<DialogueResponse>) => void): Promise<void> {
    try {
      await this.initialize();
      const { LlamaChatSession } = await import('node-llama-cpp');

      const systemPrompt = await this.getSystemPrompt(request.sessionId || 'default');

      // Create a temporary session with the system prompt
      // Note: In a real app, we might persist this session object per user
      const session = new LlamaChatSession({
        contextSequence: this.context.getSequence(),
        systemPrompt: systemPrompt
      });

      console.log('[LocalLlama] Generating response...');

      // Construct the prompt inputs
      const userMessage = request.userInput || "...";

      // Stream response
      let fullResponse = "";

      await session.prompt(userMessage, {
        onToken: (chunk: number[]) => {
          const text = this.llama.getTextDecoder().decode(Uint8Array.from(chunk));
          fullResponse += text;
          onToken({ text: text });
        }
      });

      // Save to memory (simplified)
      // ... (We can borrow the memory saving logic from LLMDialogueService if needed)

    } catch (e) {
      console.error('[LocalLlama] Streaming error:', e);
      onToken({ text: "Error: Neural link broken (Local Model Failed)." });
    }
  }
}

// ... (Existing LLMDialogueService)

export function getLLMService(): LLMService {
  if (llmServiceInstance) return llmServiceInstance;

  const provider = process.env.LLM_PROVIDER || 'api'; // 'local' or 'api'
  const llmEnabled = process.env.LLM_ENABLED === 'true';

  if (llmEnabled) {
    if (provider === 'local') {
      const modelPath = process.env.LOCAL_MODEL_PATH || './models/Cydonia-22B-v1.2-IQ2_XXS.gguf';
      llmServiceInstance = new LocalLlamaService(modelPath);
    } else {
      const endpoint = process.env.LLM_ENDPOINT || 'http://localhost:11434';
      const model = process.env.LLM_MODEL || 'llama2';
      llmServiceInstance = new LLMDialogueService(endpoint, model);
    }
  } else {
    llmServiceInstance = new StaticDialogueService();
  }
  return llmServiceInstance!;
}

export function resetLLMService(): void {
  llmServiceInstance = null;
}
