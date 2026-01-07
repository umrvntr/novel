/**
 * EPIC 1: Main App Component
 * Orchestrates game flow and state management
 */

import { useState, useEffect } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { gameState } from './engine/GameStateManager';
import { getScene } from './data/scenes';
import type { GameState } from '@shared/types';
import './App.css';

export function App() {
  const [state, setState] = useState<GameState>(gameState.getState());
  const [currentScene, setCurrentScene] = useState(getScene(state.sceneId));

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = gameState.subscribe((newState) => {
      setState(newState);
      setCurrentScene(getScene(newState.sceneId));
    });

    return unsubscribe;
  }, []);

  // Handle user choice (EPIC 1 + EPIC 3)
  const handleChoice = (choiceId: string) => {
    const choice = currentScene.choices.find(c => c.id === choiceId);
    if (!choice) return;

    // Add to history
    gameState.addHistory({
      sceneId: currentScene.id,
      choiceId: choice.id,
      choiceText: choice.text
    });

    // Update flags (EPIC 3)
    if (choice.flagModifiers) {
      gameState.updateFlags(choice.flagModifiers);
    }

    // Navigate to next scene
    gameState.setSceneId(choice.nextSceneId);
  };

  // Reset game
  const handleReset = () => {
    if (confirm('Are you sure you want to restart? Your progress will be lost.')) {
      gameState.reset();
    }
  };

  return (
    <div className="app">
      {/* Debug HUD (EPIC 3: shows flags) */}
      <div className="debug-hud">
        <div className="debug-hud-content">
          <span className="debug-scene">Scene: {state.sceneId}</span>
          <button onClick={handleReset} className="debug-reset">
            Reset
          </button>
        </div>
        <div className="debug-flags">
          {gameState.getFlagSummary().map(flag => (
            <div key={flag.name} className="debug-flag">
              <span className="debug-flag-name">{flag.name}:</span>
              <span className="debug-flag-value">{flag.value}/10</span>
              <div className="debug-flag-bar">
                <div
                  className="debug-flag-fill"
                  style={{ width: `${flag.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main game canvas (EPIC 1) */}
      <GameCanvas scene={currentScene} onChoice={handleChoice} />
    </div>
  );
}
