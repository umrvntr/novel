/**
 * GAME SCRIPT CONFIGURATION
 * Easy to edit steps for the terminal chat game
 *
 * Each step defines:
 * - id: unique identifier
 * - speaker: who is talking
 * - emotion: used to generate speaker portrait via ComfyUI
 * - text: the dialogue
 * - nextStep: where to go next (or null for LLM response)
 * - isRewardStep: if true, reveals the prize
 */
export const GAME_CONFIG = {
    title: 'NEURAL_LINK_QUEST',
    version: '1.0.0',
    reward: {
        code: 'test50',
        description: '50 PRO Image Generations'
    },
    speaker: {
        name: 'CIPHER',
        basePrompt: 'cyberpunk female AI guide, holographic, neon blue glow, dark background'
    }
};
export const GAME_STEPS = [
    // === INTRO SEQUENCE ===
    {
        id: 'intro_1',
        speaker: 'SYSTEM',
        emotion: 'neutral',
        text: '> NEURAL_LINK v2.0 INITIALIZING...',
        nextStep: 'intro_2',
    },
    {
        id: 'intro_2',
        speaker: 'SYSTEM',
        emotion: 'neutral',
        text: '> CONNECTION ESTABLISHED',
        nextStep: 'intro_3',
    },
    {
        id: 'intro_3',
        speaker: 'GUIDE',
        emotion: 'mysterious',
        text: 'Welcome, Splicer. I am CIPHER, your guide through the Neural Link.',
        nextStep: 'intro_4',
        portraitPrompt: 'mysterious cyberpunk AI, hooded, glowing eyes, dark atmosphere'
    },
    {
        id: 'intro_4',
        speaker: 'GUIDE',
        emotion: 'curious',
        text: 'You seek access to the Core, don\'t you? The image generation engine that others can only dream of.',
        nextStep: null, // Wait for user input
        portraitPrompt: 'curious cyberpunk AI guide, tilted head, questioning expression',
        choices: [
            { id: 'yes', text: 'I want the power', nextStepId: 'quest_curious' },
            { id: 'maybe', text: 'Convince me', nextStepId: 'quest_skeptical' }
        ]
    },
    // === QUEST STEPS (to be expanded) ===
    {
        id: 'quest_curious',
        speaker: 'GUIDE',
        emotion: 'excited',
        text: 'Ah, curiosity! The mark of a true Splicer. Let me show you what the Core can do...',
        nextStep: null,
        portraitPrompt: 'excited cyberpunk AI, glowing brighter, enthusiastic expression'
    },
    {
        id: 'quest_skeptical',
        speaker: 'GUIDE',
        emotion: 'skeptical',
        text: 'Skepticism is wise in the Neural Link. But I have proof. Let me demonstrate.',
        nextStep: null,
        portraitPrompt: 'serious cyberpunk AI, arms crossed, confident expression'
    },
    // === REWARD STEP ===
    {
        id: 'reward_unlock',
        speaker: 'GUIDE',
        emotion: 'excited',
        text: 'You have proven yourself, Splicer. The Core recognizes your skill. Here is your SPLICER_PASS.',
        nextStep: 'END',
        isRewardStep: true,
        rewardCode: 'test50',
        portraitPrompt: 'triumphant cyberpunk AI, arms raised, celebration, golden glow'
    },
    // === END ===
    {
        id: 'END',
        speaker: 'SYSTEM',
        emotion: 'neutral',
        text: '> SESSION COMPLETE. NEURAL_LINK DISCONNECTED.',
        nextStep: null,
    }
];
// Helper to get a step by ID
export function getStep(stepId) {
    return GAME_STEPS.find(s => s.id === stepId);
}
// Get the intro step
export function getIntroStep() {
    return GAME_STEPS[0];
}
