/**
 * EPIC 0 + EPIC 3: Scene Definitions
 * Deterministic funnel logic with flag-based transitions
 */

import type { Scene } from '@shared/types';

/**
 * All scenes in the visual novel
 * EPIC 3: nextSceneId and flagModifiers control the funnel flow
 */
export const scenes: Record<string, Scene> = {
  // ========================================================================
  // INTRO FLOW (EPIC 0)
  // ========================================================================
  scene_01: {
    id: 'scene_01',
    background: 'intro',
    sprite: {
      emotion: 'neutral',
      visible: true
    },
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
    metadata: {
      epic: 0,
      usesLLM: false
    }
  },

  // ========================================================================
  // CURIOUS PATH (EPIC 3)
  // ========================================================================
  scene_02_curious: {
    id: 'scene_02_curious',
    background: 'intro',
    sprite: {
      emotion: 'encouraging',
      visible: true
    },
    text: 'Exploration is good. It means you\'re open to discovery.\n\nLet me show you something interesting. But first - are you the type who likes to understand how things work?',
    choices: [
      {
        id: 'understand',
        text: 'Yes, I want to know the details',
        nextSceneId: 'scene_03_detailed',
        flagModifiers: { cautious: 1, curious: 1 },
        style: 'primary'
      },
      {
        id: 'just_show',
        text: 'Just show me, I learn by doing',
        nextSceneId: 'scene_03_demo',
        flagModifiers: { goal_oriented: 1, curious: 1 },
        style: 'secondary'
      }
    ],
    metadata: {
      epic: 3,
      usesLLM: false
    }
  },

  // ========================================================================
  // GOAL-ORIENTED PATH (EPIC 3)
  // ========================================================================
  scene_02_goal: {
    id: 'scene_02_goal',
    background: 'studio',
    sprite: {
      emotion: 'neutral',
      visible: true
    },
    text: 'Direct. I appreciate that.\n\nThis tool helps you create consistent visual outputs. Think character design, style iteration, or rapid prototyping.\n\nDoes that align with what you need?',
    choices: [
      {
        id: 'yes_aligned',
        text: 'Yes, that\'s exactly what I need',
        nextSceneId: 'scene_03_demo',
        flagModifiers: { goal_oriented: 2 },
        style: 'primary'
      },
      {
        id: 'not_sure',
        text: 'I\'m not sure yet, tell me more',
        nextSceneId: 'scene_03_detailed',
        flagModifiers: { cautious: 2 },
        style: 'secondary'
      }
    ],
    metadata: {
      epic: 3,
      usesLLM: false
    }
  },

  // ========================================================================
  // DETAILED EXPLANATION PATH (EPIC 3)
  // ========================================================================
  scene_03_detailed: {
    id: 'scene_03_detailed',
    background: 'studio',
    sprite: {
      emotion: 'neutral',
      visible: true
    },
    text: 'Here\'s the core concept:\n\nMost generators give you random results. You can\'t iterate on a specific look.\n\nThis tool locks a "seed" - meaning you can refine the SAME foundation repeatedly until it\'s perfect.\n\nWant to see it in action?',
    choices: [
      {
        id: 'show_demo',
        text: 'Show me the demo',
        nextSceneId: 'scene_04_generator_tease',
        flagModifiers: { curious: 1 },
        style: 'primary'
      },
      {
        id: 'still_skeptical',
        text: 'This sounds like every other tool',
        nextSceneId: 'scene_03b_skeptical',
        flagModifiers: { cautious: 2 },
        style: 'secondary'
      }
    ],
    metadata: {
      epic: 3,
      usesLLM: false
    }
  },

  // ========================================================================
  // SKEPTICAL BRANCH (EPIC 3: Soft CTA)
  // ========================================================================
  scene_03b_skeptical: {
    id: 'scene_03b_skeptical',
    background: 'studio',
    sprite: {
      emotion: 'skeptical',
      visible: true
    },
    text: 'Fair enough. Most tools promise the same things.\n\nThe difference? You can try this right now. Free. No signup.\n\nThen decide if it\'s different.',
    choices: [
      {
        id: 'try_now',
        text: 'Alright, let me try it',
        nextSceneId: 'scene_04_generator_tease',
        flagModifiers: { goal_oriented: 1, cautious: -1 },
        style: 'primary'
      },
      {
        id: 'more_info',
        text: 'Tell me about the PRO version first',
        nextSceneId: 'scene_05_pro_intro',
        flagModifiers: { cautious: 1, goal_oriented: 1 },
        style: 'secondary'
      }
    ],
    metadata: {
      epic: 3,
      isCTA: true,
      usesLLM: false
    }
  },

  // ========================================================================
  // QUICK DEMO PATH (EPIC 3)
  // ========================================================================
  scene_03_demo: {
    id: 'scene_03_demo',
    background: 'demo',
    sprite: {
      emotion: 'encouraging',
      visible: true
    },
    text: 'Perfect. Let\'s jump straight into a demo.\n\nYou\'ll see how the iteration loop works - seed, modify, refine, lock.',
    choices: [
      {
        id: 'start_demo',
        text: 'Start the demo',
        nextSceneId: 'scene_04_generator_tease',
        flagModifiers: { curious: 1 },
        style: 'primary'
      },
      {
        id: 'wait_explain',
        text: 'Wait - explain the seed concept first',
        nextSceneId: 'scene_03_detailed',
        flagModifiers: { cautious: 1 },
        style: 'secondary'
      }
    ],
    metadata: {
      epic: 3,
      usesLLM: false
    }
  },

  // ========================================================================
  // GENERATOR TEASE (EPIC 6)
  // ========================================================================
  scene_04_generator_tease: {
    id: 'scene_04_generator_tease',
    background: 'generator',
    sprite: {
      emotion: 'encouraging',
      visible: true
    },
    text: 'Here\'s a limited preview of the generator.\n\nIn the free version, you can:\n• Generate up to 10 images per day\n• Use basic style controls\n• Save your favorites\n\nReady to try?',
    choices: [
      {
        id: 'open_generator',
        text: 'Open the generator',
        nextSceneId: 'scene_06_after_trial',
        style: 'primary'
      },
      {
        id: 'see_pro',
        text: 'What does PRO unlock?',
        nextSceneId: 'scene_05_pro_intro',
        flagModifiers: { goal_oriented: 1 },
        style: 'secondary'
      }
    ],
    metadata: {
      epic: 6,
      isCTA: true,
      usesLLM: false
    }
  },

  // ========================================================================
  // PRO INTRODUCTION (EPIC 7)
  // ========================================================================
  scene_05_pro_intro: {
    id: 'scene_05_pro_intro',
    background: 'pro_showcase',
    sprite: {
      emotion: 'neutral',
      visible: true
    },
    text: 'PRO removes the limits.\n\nFree vs PRO:\n• 10/day → Unlimited generations\n• Basic controls → Advanced fine-tuning\n• Standard quality → High-resolution output\n• Web only → API access\n\nPRO is for serious creators.',
    choices: [
      {
        id: 'get_pro',
        text: 'Get PRO access',
        nextSceneId: 'scene_07_pro_cta',
        flagModifiers: { goal_oriented: 2 },
        style: 'primary'
      },
      {
        id: 'start_free',
        text: 'I\'ll start with free',
        nextSceneId: 'scene_04_generator_tease',
        style: 'secondary'
      }
    ],
    metadata: {
      epic: 7,
      isPRO: true,
      usesLLM: false
    }
  },

  // ========================================================================
  // AFTER TRIAL (EPIC 6 + EPIC 7)
  // ========================================================================
  scene_06_after_trial: {
    id: 'scene_06_after_trial',
    background: 'demo',
    sprite: {
      emotion: 'encouraging',
      visible: true
    },
    text: 'You\'ve seen the basics.\n\nIf you want to go further - unlock iterations, higher quality, and more control - PRO is the next step.\n\nOr keep using free. Your choice.',
    choices: [
      {
        id: 'upgrade_now',
        text: 'Upgrade to PRO',
        nextSceneId: 'scene_07_pro_cta',
        flagModifiers: { goal_oriented: 1 },
        style: 'primary'
      },
      {
        id: 'continue_free',
        text: 'Continue with free',
        nextSceneId: 'scene_08_end_free',
        style: 'secondary'
      }
    ],
    metadata: {
      epic: 6,
      isCTA: true,
      usesLLM: false
    }
  },

  // ========================================================================
  // PRO CTA (EPIC 7)
  // ========================================================================
  scene_07_pro_cta: {
    id: 'scene_07_pro_cta',
    background: 'pro_showcase',
    sprite: {
      emotion: 'neutral',
      visible: true
    },
    text: 'Ready to unlock everything.\n\nClick below to see pricing and get instant access.',
    choices: [
      {
        id: 'view_pricing',
        text: 'View pricing & upgrade',
        nextSceneId: 'scene_08_end_pro',
        style: 'primary'
      },
      {
        id: 'maybe_later',
        text: 'Maybe later',
        nextSceneId: 'scene_08_end_free',
        flagModifiers: { cautious: 1 },
        style: 'secondary'
      }
    ],
    metadata: {
      epic: 7,
      isPRO: true,
      isCTA: true,
      usesLLM: false
    }
  },

  // ========================================================================
  // ENDINGS (EPIC 0)
  // ========================================================================
  scene_08_end_free: {
    id: 'scene_08_end_free',
    background: 'studio',
    sprite: {
      emotion: 'neutral',
      visible: true
    },
    text: 'Perfect. You can start creating right now.\n\nIf you ever need more power, PRO will be here.\n\nGood luck!',
    choices: [
      {
        id: 'open_app',
        text: 'Open generator',
        nextSceneId: 'scene_08_end_free',
        style: 'primary'
      },
      {
        id: 'restart',
        text: 'Restart this guide',
        nextSceneId: 'scene_01',
        style: 'secondary'
      }
    ],
    metadata: {
      epic: 0,
      isCTA: true,
      usesLLM: false
    }
  },

  scene_08_end_pro: {
    id: 'scene_08_end_pro',
    background: 'pro_showcase',
    sprite: {
      emotion: 'encouraging',
      visible: true
    },
    text: 'Excellent choice.\n\nYou now have full access to everything.\n\nLet\'s create something amazing.',
    choices: [
      {
        id: 'open_pro',
        text: 'Open PRO generator',
        nextSceneId: 'scene_08_end_pro',
        style: 'primary'
      },
      {
        id: 'restart',
        text: 'Restart this guide',
        nextSceneId: 'scene_01',
        style: 'secondary'
      }
    ],
    metadata: {
      epic: 7,
      isPRO: true,
      isCTA: true,
      usesLLM: false
    }
  }
};

/**
 * Get scene by ID with fallback
 */
export function getScene(sceneId: string): Scene {
  const scene = scenes[sceneId];
  if (!scene) {
    console.error(`Scene not found: ${sceneId}, falling back to scene_01`);
    return scenes.scene_01;
  }
  return scene;
}

/**
 * Get all scene IDs
 */
export function getAllSceneIds(): string[] {
  return Object.keys(scenes);
}
