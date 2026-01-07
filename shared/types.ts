/**
 * EPIC 0 - FOUNDATION
 * Core type definitions for the visual novel system
 */

// ============================================================================
// GAME STATE
// ============================================================================

/**
 * User flags that influence the funnel flow
 * EPIC 3: These are modified by user choices
 */
export interface UserFlags {
  curious: number;        // 0-10: Interest in creative/aesthetic aspects
  cautious: number;       // 0-10: Skepticism, need for proof
  goal_oriented: number;  // 0-10: Focus on practical results
}

/**
 * Complete game state persisted between sessions
 * EPIC 0 + EPIC 8: Session persistence
 */
export interface GameState {
  version: string;
  sceneId: string;
  flags: UserFlags;
  history: HistoryEntry[];
  sessionStarted: number;
  lastUpdated: number;
}

/**
 * History entry for tracking user journey
 */
export interface HistoryEntry {
  timestamp: number;
  sceneId: string;
  choiceId: string;
  choiceText: string;
}

// ============================================================================
// SCENE STRUCTURE
// ============================================================================

/**
 * Fixed scene format (EPIC 0)
 * - background: scene background identifier
 * - sprite: character sprite state
 * - text: dialogue text (can be LLM-generated in EPIC 4)
 * - choices: exactly 2 choices
 */
export interface Scene {
  id: string;
  background: BackgroundId;
  sprite: SpriteState;
  text: string;
  choices: [Choice, Choice]; // Exactly 2 choices
  metadata?: SceneMetadata;
}

/**
 * Scene metadata for internal tracking
 */
export interface SceneMetadata {
  epic: number;           // Which EPIC introduced this scene
  isCTA?: boolean;        // Is this a call-to-action scene?
  isPRO?: boolean;        // Is this related to PRO upgrade?
  usesLLM?: boolean;      // Does this scene use LLM for text generation?
}

// ============================================================================
// CHARACTER GUIDE (EPIC 0 + EPIC 5)
// ============================================================================

/**
 * Character sprite emotional states (EPIC 5)
 * Fixed character guide - no alternatives or customization
 */
export type EmotionalState = 'neutral' | 'encouraging' | 'skeptical';

/**
 * Sprite state combining emotion and position
 */
export interface SpriteState {
  emotion: EmotionalState;
  visible: boolean;
}

// ============================================================================
// BACKGROUNDS (EPIC 5)
// ============================================================================

/**
 * Available background scenes
 */
export type BackgroundId =
  | 'intro'           // Opening scene
  | 'studio'          // Creative workspace
  | 'demo'            // Demo/preview area
  | 'generator'       // Generator interface tease
  | 'pro_showcase';   // PRO features showcase

// ============================================================================
// CHOICES (EPIC 1 + EPIC 3)
// ============================================================================

/**
 * User choice with funnel logic
 * EPIC 3: Choices modify flags and determine next scene
 */
export interface Choice {
  id: string;
  text: string;
  nextSceneId: string;
  flagModifiers?: Partial<UserFlags>; // How this choice affects flags
  style?: 'primary' | 'secondary';     // Visual styling
}

// ============================================================================
// DIALOGUE ENGINE (EPIC 2 + EPIC 4)
// ============================================================================

/**
 * Request to dialogue endpoint (EPIC 2)
 */
export interface DialogueRequest {
  sceneId: string;
  flags: UserFlags;
  history: HistoryEntry[];
}

/**
 * Response from dialogue endpoint (EPIC 2 + EPIC 4)
 * Fixed JSON format with text and 2 choices
 */
export interface DialogueResponse {
  text: string;
  choices: [Choice, Choice];
  usedLLM: boolean; // Did the backend use LLM for this response?
}

// ============================================================================
// GENERATOR TEASE (EPIC 6)
// ============================================================================

/**
 * Generator demo result
 */
export interface GeneratorResult {
  imageUrl: string;
  prompt: string;
  isFreeVersion: boolean;
  limitations?: string[]; // What's restricted in free version
}

// ============================================================================
// MONETIZATION (EPIC 7)
// ============================================================================

/**
 * PRO feature comparison
 */
export interface ProFeature {
  name: string;
  freeVersion: string;  // What's available in free
  proVersion: string;   // What's available in PRO
}

export interface PROComparisonData {
  features: ProFeature[];
  price: string;
  ctaUrl: string;
}

// ============================================================================
// INITIAL STATE FACTORY
// ============================================================================

/**
 * Create initial game state
 */
export function createInitialState(): GameState {
  return {
    version: '0.1.0',
    sceneId: 'scene_01',
    flags: {
      curious: 0,
      cautious: 0,
      goal_oriented: 0
    },
    history: [],
    sessionStarted: Date.now(),
    lastUpdated: Date.now()
  };
}

/**
 * Default sprite state
 */
export function createDefaultSprite(): SpriteState {
  return {
    emotion: 'neutral',
    visible: true
  };
}
