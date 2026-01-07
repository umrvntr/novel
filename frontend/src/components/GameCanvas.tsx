/**
 * EPIC 1: Canvas-based game renderer
 * Fixed layout: background + sprite + text + choices
 */

import { useEffect, useRef } from 'react';
import type { Scene } from '@shared/types';
import styles from './GameCanvas.module.css';

interface GameCanvasProps {
  scene: Scene;
  onChoice: (choiceId: string) => void;
}

export function GameCanvas({ scene, onChoice }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Render background and sprite on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Draw background (EPIC 5: will be actual images)
    drawBackground(ctx, rect.width, rect.height, scene.background);

    // Draw sprite (EPIC 5: will be actual character sprites)
    if (scene.sprite.visible) {
      drawSprite(ctx, rect.width, rect.height, scene.sprite.emotion);
    }
  }, [scene.background, scene.sprite]);

  return (
    <div className={styles.container}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        aria-label="Visual novel scene"
      />
      <div className={styles.overlay}>
        {/* Text box component */}
        <div className={styles.textBox}>
          <TextBox text={scene.text} />
        </div>

        {/* Choice buttons component */}
        <div className={styles.choicesBox}>
          <ChoiceButtons
            choices={scene.choices}
            onChoice={onChoice}
          />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// TEXTBOX COMPONENT (EPIC 1)
// =============================================================================

interface TextBoxProps {
  text: string;
}

function TextBox({ text }: TextBoxProps) {
  // EPIC 8: Add typewriter effect here
  return (
    <div className={styles.textContent}>
      <div className={styles.speakerName}>Guide</div>
      <div className={styles.dialogueText}>
        {text.split('\n').map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// CHOICE BUTTONS COMPONENT (EPIC 1)
// =============================================================================

interface ChoiceButtonsProps {
  choices: [Scene['choices'][0], Scene['choices'][1]];
  onChoice: (choiceId: string) => void;
}

function ChoiceButtons({ choices, onChoice }: ChoiceButtonsProps) {
  return (
    <div className={styles.choices}>
      {choices.map((choice) => (
        <button
          key={choice.id}
          className={`${styles.choiceButton} ${
            choice.style === 'primary' ? styles.primary : styles.secondary
          }`}
          onClick={() => onChoice(choice.id)}
        >
          {choice.text}
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// CANVAS DRAWING FUNCTIONS (EPIC 5: Placeholder, will use real images)
// =============================================================================

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  backgroundId: Scene['background']
) {
  // Placeholder: gradient background based on scene type
  const gradients: Record<string, [string, string]> = {
    intro: ['#1a1a2e', '#0f0f1e'],
    studio: ['#2a1a3e', '#1a0a2e'],
    demo: ['#1a2a3e', '#0a1a2e'],
    generator: ['#1a3a2e', '#0a2a1e'],
    pro_showcase: ['#3a1a2e', '#2a0a1e']
  };

  const [start, end] = gradients[backgroundId] || gradients.intro;

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, start);
  gradient.addColorStop(1, end);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  emotion: Scene['sprite']['emotion']
) {
  // Placeholder: simple geometric character guide
  const centerX = width * 0.25;
  const centerY = height * 0.6;
  const size = 120;

  // Colors based on emotion
  const colors: Record<typeof emotion, string> = {
    neutral: '#4a9eff',
    encouraging: '#6bff9a',
    skeptical: '#ff9a6b'
  };

  // Draw simple character placeholder (will be PNG sprite in EPIC 5)
  ctx.fillStyle = colors[emotion];
  ctx.beginPath();
  ctx.arc(centerX, centerY, size, 0, Math.PI * 2);
  ctx.fill();

  // Add glow effect
  ctx.shadowBlur = 30;
  ctx.shadowColor = colors[emotion];
  ctx.fill();
  ctx.shadowBlur = 0;

  // Add simple "face" indicators
  ctx.fillStyle = '#ffffff';

  // Eyes based on emotion
  if (emotion === 'encouraging') {
    // Happy eyes (curved)
    ctx.fillRect(centerX - 30, centerY - 20, 15, 8);
    ctx.fillRect(centerX + 15, centerY - 20, 15, 8);
  } else if (emotion === 'skeptical') {
    // Skeptical eyes (one raised)
    ctx.fillRect(centerX - 30, centerY - 25, 15, 8);
    ctx.fillRect(centerX + 15, centerY - 15, 15, 8);
  } else {
    // Neutral eyes
    ctx.fillRect(centerX - 30, centerY - 20, 15, 8);
    ctx.fillRect(centerX + 15, centerY - 20, 15, 8);
  }
}
