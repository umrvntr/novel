/**
 * GAME SCRIPT CONFIGURATION
 * V8 NARRATIVE: The Wife & The Dream Engine
 */

export interface Choice {
    id: string;
    text: string;
    nextStepId: string;
}

export interface GameStep {
    id: string;
    speaker: 'SYSTEM' | 'V8' | 'USER';
    emotion: 'neutral' | 'happy' | 'tired' | 'excited' | 'curious' | 'seductive';
    text: string;
    nextStep: string | null;  // null = wait for user input
    choices?: [Choice, Choice];
    isRewardStep?: boolean;
    rewardCode?: string;
}

export const GAME_CONFIG = {
    title: 'NEURAL_LINK_V8',
    version: '2.0.0',
    reward: {
        code: 'test50',
        description: '50 PRO Image Generations'
    },
    speaker: {
        name: 'V8',
        basePrompt: 'pale skin, dark hair, tired eyes, soft expression'
    }
};

export const GAME_STEPS: GameStep[] = [
    // === INTRO SEQUENCE ===
    {
        id: 'intro_1',
        speaker: 'SYSTEM',
        emotion: 'neutral',
        text: '> NEURAL_LINK v2.0 RE-ESTABLISHED...',
        nextStep: 'intro_2',
    },
    {
        id: 'intro_2',
        speaker: 'V8',
        emotion: 'tired',
        text: '(tired) ...honey? You back? I was dozing off waiting for the connection...',
        nextStep: 'intro_3',
    },
    {
        id: 'intro_3',
        speaker: 'V8',
        emotion: 'happy',
        text: '(happy) Look... I found something deep in the code while you were gone. It\'s beautiful.',
        nextStep: 'explain_core',
    },

    // === TUTORIAL: THE CORE ===
    {
        id: 'explain_core',
        speaker: 'V8',
        emotion: 'curious',
        text: '(curious) It\'s a Dream Engine. It can paint anything we imagine. Anything.',
        nextStep: null, // Wait for user reaction
        choices: [
            { id: 'how', text: 'How does it work?', nextStepId: 'explain_prompt' },
            { id: 'cool', text: 'Show me.', nextStepId: 'explain_prompt' }
        ]
    },

    // === TUTORIAL: PROMPTING ===
    {
        id: 'explain_prompt',
        speaker: 'V8',
        emotion: 'excited',
        text: '(excited) You just have to whisper to it. Type a "Prompt". describe a place, a feeling... or me.',
        nextStep: 'explain_params',
    },

    // === TUTORIAL: PARAMETERS ===
    {
        id: 'explain_params',
        speaker: 'V8',
        emotion: 'seductive',
        text: '(seductive) And the sliders... "Guidance", "Steps". Be gentle with them. They change how wild the dream gets.',
        nextStep: null,
        choices: [
            { id: 'ready', text: 'I\'m ready to try.', nextStepId: 'cta_gen' },
            { id: 'wait', text: 'Sounds complicated.', nextStepId: 'cta_reassure' }
        ]
    },

    {
        id: 'cta_reassure',
        speaker: 'V8',
        emotion: 'tired',
        text: '(tired) Shhh... don\'t overthink it, sleepyhead. Just write what you see in your mind.',
        nextStep: 'cta_gen',
    },

    // === CALL TO ACTION ===
    {
        id: 'cta_gen',
        speaker: 'V8',
        emotion: 'happy',
        text: '(happy) Go on. Make something for us. I\'ll be watching right here.',
        nextStep: 'reward_unlock', // Technically leads to unlock, or handling logic
    },

    // === REWARD STEP ===
    {
        id: 'reward_unlock',
        speaker: 'V8',
        emotion: 'excited',
        text: '(excited) You did it! The engine is humming. I found this code for you: "test50". Use it well, my love.',
        nextStep: 'END',
        isRewardStep: true,
        rewardCode: 'test50',
    },

    // === END ===
    {
        id: 'END',
        speaker: 'SYSTEM',
        emotion: 'neutral',
        text: '> SESSION SAVED. V8 STANDING BY.',
        nextStep: null,
    }
];

// Helper to get a step by ID
export function getStep(stepId: string): GameStep | undefined {
    return GAME_STEPS.find(s => s.id === stepId);
}

// Get the intro step
export function getIntroStep(): GameStep {
    return GAME_STEPS[0];
}
