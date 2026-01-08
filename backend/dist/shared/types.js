/**
 * EPIC 0 - FOUNDATION
 * Core type definitions for the visual novel system
 */
// ============================================================================
// INITIAL STATE FACTORY
// ============================================================================
/**
 * Create initial game state
 */
export function createInitialState() {
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
export function createDefaultSprite() {
    return {
        emotion: 'neutral',
        visible: true
    };
}
