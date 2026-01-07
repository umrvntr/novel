/**
 * EPIC 0 + EPIC 8: Game State Management with Session Persistence
 * Handles all game state operations and localStorage persistence
 */

import type { GameState, UserFlags, HistoryEntry } from '@shared/types';
import { createInitialState } from '@shared/types';

const STORAGE_KEY = 'visual_novel_state_v1';

export class GameStateManager {
  private state: GameState;
  private listeners: Set<(state: GameState) => void> = new Set();

  constructor() {
    this.state = this.loadState();
  }

  /**
   * Get current game state
   */
  getState(): GameState {
    return { ...this.state };
  }

  /**
   * Update scene ID and persist
   */
  setSceneId(sceneId: string): void {
    this.state.sceneId = sceneId;
    this.state.lastUpdated = Date.now();
    this.persist();
    this.notify();
  }

  /**
   * Update user flags (EPIC 3)
   */
  updateFlags(flagModifiers: Partial<UserFlags>): void {
    this.state.flags = {
      ...this.state.flags,
      curious: this.clamp((this.state.flags.curious || 0) + (flagModifiers.curious || 0), 0, 10),
      cautious: this.clamp((this.state.flags.cautious || 0) + (flagModifiers.cautious || 0), 0, 10),
      goal_oriented: this.clamp((this.state.flags.goal_oriented || 0) + (flagModifiers.goal_oriented || 0), 0, 10)
    };
    this.state.lastUpdated = Date.now();
    this.persist();
    this.notify();
  }

  /**
   * Add entry to history
   */
  addHistory(entry: Omit<HistoryEntry, 'timestamp'>): void {
    this.state.history.push({
      ...entry,
      timestamp: Date.now()
    });
    // Keep last 50 entries
    if (this.state.history.length > 50) {
      this.state.history = this.state.history.slice(-50);
    }
    this.persist();
  }

  /**
   * Reset state to initial
   */
  reset(): void {
    this.state = createInitialState();
    this.persist();
    this.notify();
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener);
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Load state from localStorage (EPIC 8)
   */
  private loadState(): GameState {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return createInitialState();
      }

      const parsed = JSON.parse(stored) as GameState;

      // Validate structure
      if (!parsed.sceneId || !parsed.flags || !parsed.history) {
        console.warn('Invalid stored state, resetting');
        return createInitialState();
      }

      return parsed;
    } catch (error) {
      console.error('Failed to load state:', error);
      return createInitialState();
    }
  }

  /**
   * Persist state to localStorage (EPIC 8)
   */
  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.error('Failed to persist state:', error);
    }
  }

  /**
   * Notify all listeners of state change
   */
  private notify(): void {
    this.listeners.forEach(listener => {
      listener(this.getState());
    });
  }

  /**
   * Clamp value between min and max
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Get flag summary for display (EPIC 3)
   */
  getFlagSummary(): { name: string; value: number; percentage: number }[] {
    return [
      {
        name: 'Curious',
        value: this.state.flags.curious,
        percentage: (this.state.flags.curious / 10) * 100
      },
      {
        name: 'Cautious',
        value: this.state.flags.cautious,
        percentage: (this.state.flags.cautious / 10) * 100
      },
      {
        name: 'Goal-Oriented',
        value: this.state.flags.goal_oriented,
        percentage: (this.state.flags.goal_oriented / 10) * 100
      }
    ];
  }

  /**
   * Get dominant trait (highest flag value)
   */
  getDominantTrait(): 'curious' | 'cautious' | 'goal_oriented' | 'balanced' {
    const { curious, cautious, goal_oriented } = this.state.flags;
    const max = Math.max(curious, cautious, goal_oriented);

    if (max === 0) return 'balanced';

    if (curious === max) return 'curious';
    if (cautious === max) return 'cautious';
    if (goal_oriented === max) return 'goal_oriented';

    return 'balanced';
  }
}

// Singleton instance
export const gameState = new GameStateManager();
