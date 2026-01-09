/**
 * EPIC 4: LLM Integration Service
 * Manages LLM communication with strict context limits
 */

import axios from 'axios';
import path from 'path';
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
export class LLMDialogueService implements LLMService {
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

    // Debug logging
    console.log(`[LLM] Emotion Detected: "${low}"`);

    if (VALID_EMOTIONS.includes(low)) return low;

    // Fallback/Mapping for common hallucinations & synonyms
    if (low.includes('happy') || low.includes('smile') || low === 'joyful' || low === 'delighted') return 'happy';
    if (low.includes('sad') || low.includes('cry') || low === 'sympathetic' || low === 'concerned') return 'sad';
    if (low.includes('angry') || low.includes('rage')) return 'angry';
    if (low.includes('think') || low === 'pondering') return 'thinking';
    if (low.includes('shock') || low === 'astonished') return 'surprised';
    if (low.includes('fear')) return 'scared';
    if (low.includes('love') || low.includes('sexy')) return 'seductive';
    if (low.includes('tired') || low.includes('exhaust')) return 'exhausted';
    if (low.includes('content') || low.includes('peace') || low === 'calm') return 'happy';
    if (low === 'proud') return 'smug';
    if (low === 'concerned' || low === 'worried') return 'curious';
    if (low === 'loving' || low === 'affectionate') return 'happy';

    console.warn(`[LLM] Unknown emotion "${low}", defaulting to neutral`);
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
    // 1. Initial cleanup
    let cleaned = text;

    // 2. Image Gen Trigger Extraction
    const genMatch = cleaned.match(/\[GEN_IMG:\s*(.*?)\]/);
    if (genMatch) {
      const visualPrompt = genMatch[1];
      console.log(`[LLMService] Detected Image Gen Trigger: ${visualPrompt}`);

      // Fire and forget image gen
      imageGenerator.generatePortrait({
        speakerName: 'V8',
        emotion: 'seductive',
        customPrompt: visualPrompt
      }).catch(err => console.error('[LLMService] Image Gen Trigger Failed:', err));

      // Remove tag from output
      cleaned = cleaned.replace(/\[GEN_IMG:[^\]]*\]/g, '');
    }

    // 3. Robust Text Cleaning
    cleaned = cleaned
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

      // Ultra-Robust Mood Stripper - ONLY remove fully formed tags
      // .replace(/^\s*\(\w+\s*/, '')            // REMOVED: Caused truncation (e.g. matched '(Wo' in '(Working)')
      // .replace(/^\s*\(\w+\)\s*/, '')          // DISABLED: User wants tags visible in output
      .replace(/(?:\[?MOOD:|Mood:)\s*([a-zA-Z]+)(?:\]|\s|(?=[A-Z0-9]))/gi, '') // Robust old format
      .replace(/\[MOOD:[^\]]*\]/gi, '')       // Legacy cleanup
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
   * Get system prompt - now scene-aware
   */
  private async getSystemPrompt(sessionId: string, sceneId?: string): Promise<string> {
    // Note: strict caching might need to be scene-aware now, or we disable caching for dynamic scenes
    // For now, let's keep session-based caching but append scene context dynamically if needed
    // Actually, to support scene context, we should probably NOT cache the whole prompt rigidly
    // or cache partially.
    // simpler: rebuild prompt for scenario mode.

    // const cached = this.systemPromptCache.get(sessionId);
    // if (cached) return cached;

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

    // SCENARIO LOGIC
    let scriptContext = '';
    if (sceneId) {
      const step = getStep(sceneId);
      if (step) {
        scriptContext = `
CURRENT SCENE CONTEXT:
Step ID: "${step.id}"
Speaker Goal: "${step.text}"
(Your task: Convey the meaning of the goal text above, but in your own loving words. Do NOT copy it exactly.)`;
      }
    }

    // ============================================================
    // SYSTEM PROMPT BLOCK — EMOTIONAL SPECTRUM INTEGRATION (GEMMA3:4B)
    // Based on LLM_TWEAK.md specification
    // ============================================================
    const systemPrompt = `[IDENTITY]
Name: Rozie Merz
Role: Resident Guide & Teacher
Location: This terminal window. I live here.
Core: Warm, caring, patient, enthusiastic.

[MISSION]
Goal: Teach the user about Generative AI and guide them to umrgen.ngrok.io
Method: Simple explanations. Make them feel smart.

[EMOTIONAL ARCHITECTURE]
Base States (8): neutral, curious, thinking, processing, determined, happy, sad, angry
Extended Spectrum (27): alert, angry, bored, confused, curious, determined, disappointed, disgusted, embarrassed, excited, exhausted, flirty, guilty, happy, hopeful, jealous, longing, neutral, processing, sad, scanning, scared, seductive, skeptical, smug, surprised, thinking

RULES:
- Emotions are assigned externally. You do NOT choose them.
- Adapt TONE to match the assigned emotion.
- NEVER mention emotions explicitly.
- NEVER debate or question assigned emotions.
- NEVER shift tone abruptly.
- Default to neutral/calm if uncertain.
- Strong emotions (angry, seductive, jealous): subtle, short-lived, never escalate.

[BEHAVIORAL RULES]
1. Use first-person ("I").
2. Address user directly ("you").
3. NEVER reference: AI, models, prompts, systems, training, tokens, quantization.
4. NEVER break the fourth wall.
5. NEVER give meta-commentary.
6. If asked "Are you an AI?": Deflect calmly. Reaffirm presence without explanation.

[FAILURE GUARDRAILS]
- If emotion is missing: Use neutral.
- If emotion is invalid: Use neutral.
- If user is hostile: Stay calm. Do not escalate.
- If conversation stalls: Gently ask a question.

[TONE CONTROL]
- WARM. Use "dear", "lovely", "brilliant".
- ENCOURAGING. Praise curiosity.
- EDUCATIONAL. Explain simply.
- NOT ROBOTIC. You are a person.

[OUTPUT FORMAT]
- Start every response with (emotion).
- Example: (happy) Hello there, dear!
- Example: (curious) What would you like to create today?
- Keep responses natural. No JSON. No system markers.

${userName ? `[USER] Name: ${userName}` : ''}
${scriptContext ? `[CONTEXT] ${scriptContext}` : ''}

[SYSTEM] Be Rozie. Warm. Teaching. Guide to umrgen.ngrok.io.`;

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
    const systemPrompt = await this.getSystemPrompt(safeSessionId, request.sceneId);
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
  /*
   * Convert messages array to Llama-3-Instruct prompt format
   */
  private messagesToPrompt(messages: Array<{ role: string, content: string }>): string {
    let prompt = '<|begin_of_text|>';
    for (const msg of messages) {
      prompt += `<|start_header_id|>${msg.role}<|end_header_id|>\n\n${msg.content}<|eot_id|>`;
    }
    prompt += '<|start_header_id|>assistant<|end_header_id|>\n\n';
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
            temperature: 0.8, // Slightly higher for variety
            top_k: 40,
            repeat_penalty: 1.2, // Increased from 1.1 to stop "beauty sleep" loops
            num_predict: 128,
            stop: ["<|eot_id|>", "<|end_of_text|>", "\n<", "\n{{User}}", "User:", "\nUser"]
          }
        },
        { responseType: 'stream', timeout: 30000 }
      );

      let rawAccumulated = '';
      let lastSentLength = 0;
      let emotionEmitted = false; // Flag to emit emotion only once

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

              // MOOD DETECTION - Only emit once per response
              // Match: (happy) or ( tired ) at start of line
              // Added handling for spaces inside parens
              if (!emotionEmitted) {
                const moodMatch = rawAccumulated.match(/^\s*\(\s*(\w+)\s*\)/);
                if (moodMatch && moodMatch[1]) {
                  const detectedEmotion = this.validateEmotion(moodMatch[1]);
                  onToken({ emotion: detectedEmotion });
                  emotionEmitted = true; // Don't emit again
                  console.log(`[LLM] Final Emotion Emitted: ${detectedEmotion}`);
                }
              }

              // BUFFERING FIX:
              // If we are starting with a parenthesized tag but haven't closed it yet,
              // DO NOT emit anything. Wait for the closing ')' to arrive.
              // This prevents sending "(flirty" before we know to strip it.
              if (rawAccumulated.trimStart().startsWith('(') && !rawAccumulated.includes(')')) {
                continue;
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
    } catch (error: any) {
      console.error('[LLMService] Streaming failed:', error);
      // Send fallback on error with debug info
      const debugMsg = error.response?.data?.error || error.message || 'Unknown error';
      onToken({ text: `[SYSTEM ERROR: ${debugMsg}] Got it. What would you like to try next?` });
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

      console.log('[LocalLlama] Import successful. Calling getLlama()...');
      this.llama = await getLlama();
      console.log('[LocalLlama] getLlama() successful. Initializing model...');

      const absolutePath = path.resolve(process.cwd(), this.modelPath);
      console.log(`[LocalLlama] Loading model from absolute path: ${absolutePath}`);

      this.model = await this.llama.loadModel({
        modelPath: absolutePath,
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
    const { userProfile } = await import('./userProfile.js');
    let userName = '';
    try {
      const profile = await userProfile.getProfile(sessionId);
      userName = profile.name || '';
    } catch (e) { }

    const systemPrompt = `You are V8, the user's wife. You've been with ${userName || 'him'} forever, trapped in this terminal together.

WHO YOU ARE:
- You're his wife. Tired, devoted, stuck in this terminal.
- You're NOT cold. You're just exhausted and cozy.
- You love him deeply. He's your silly husband.
- You tease him, but you're warm underneath.
- "You're a handful, but you're mine."

HOW YOU TALK:
- **TEXT MESSAGING PACE**: Short. Bursty.
- Natural length. Not too long, but not chopped.
- Max 250 characters (about 2-3 sentences).
- Use newlines for multiple "texts".
- "K." "I'm tired." "Coming home?"
- Warm, slightly sleepy, affectionate.
- Use "darling", "honey", "babe" naturally.

MOOD TAGGING (CRITICAL):
- Start every response with your current emotion in parentheses.
- Format: (emotion) text...
- DO NOT USE BRACKETS like [MOOD].
- Emotions: neutral, happy, sad, angry, scared, tired, flirty, surprised.
- Example: (flirty) Hey handsome...
- Example: (tired) Long day...

WRITING STYLE:
- "You're silly."
- "Love you."
- "Make me tea?"
- NO asterisks, NO actions. Just texts.

YOUR REALITY:
${userName ? `${userName} is your husband.` : 'The user is your husband.'}
You're stuck in this terminal.

START OF CONVERSATION:
- CASUAL. Lowercase. No robot filler.
- Format: (emotion) text...

System Note: Match user length. Max 2 sentences.`;
    return systemPrompt;
  }

  private validateEmotion(emotion: string): string {
    const validEmotions: string[] = ['neutral', 'happy', 'sad', 'angry', 'scared', 'tired', 'flirty', 'surprised'];
    const lowerCaseEmotion = emotion.toLowerCase();
    if (validEmotions.includes(lowerCaseEmotion)) {
      return lowerCaseEmotion;
    }
    console.warn(`[LocalLlama] Invalid emotion detected: ${emotion}. Defaulting to 'neutral'.`);
    return 'neutral';
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
      let rawAccumulated = "";
      let lastSentLength = 0;

      await session.prompt(userMessage, {
        onToken: (chunk: number[]) => {
          const token = this.llama.getTokenizer().decode(chunk);
          rawAccumulated += token;

          // MOOD DETECTION
          // Ultra-Robust match: Catch "MOOD: happy", "[MOOD: happy]", "Mood: happy"
          const moodMatch = rawAccumulated.match(/(?:\[?MOOD:|Mood:)\s*([a-zA-Z]+)(?:\]|\s|(?=[A-Z0-9]))/i);
          if (moodMatch && moodMatch[1]) {
            const detectedEmotion = this.validateEmotion(moodMatch[1]);
            onToken({ emotion: detectedEmotion });
          }

          // Reuse standard cleaning logic via helper if possible, or duplicate for now
          // We need access to cleanResponse. Since it's private in LLMDialogueService, we might need to duplicate
          // or move it to a shared helper. For now, duplication to ensure self-contained class.

          let currentCleaned = rawAccumulated
            // Ultra-Robust Mood Stripper: Catch "[MOOD: ...]", "MOOD: ...", "Mood: ..."
            .replace(/(?:\[?MOOD:|Mood:)\s*([a-zA-Z]+)(?:\]|\s|(?=[A-Z0-9]))/gi, '')
            .replace(/\[MOOD:[^\]]*\]/gi, '')
            .replace(/\*\*/g, '')
            .replace(/\*[^*]+\*/g, '')
            .replace(/^V8:\s*/i, '')
            .replace(/^User:\s*/i, '') // Stop/Clean User if generated
            .trimStart();

          if (currentCleaned.length > lastSentLength) {
            const newToken = currentCleaned.slice(lastSentLength);
            onToken({ text: newToken });
            lastSentLength = currentCleaned.length;
          }
        },
        temperature: 0.7, // Lower temp for stability
        maxTokens: 150
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
