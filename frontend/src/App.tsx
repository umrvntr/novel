/**
 * TERMINAL CHAT GAME - Main App Component
 * Clean, focused terminal experience with speaker portraits
 */

import { useState, useEffect, useRef } from 'react';
import { TerminalInput } from './components/TerminalInput';
import { VisualFeed } from './components/VisualFeed';
import { RewardModule } from './components/RewardModule';
import { TypewriterText } from './components/TypewriterText';
import { gameState } from './engine/GameStateManager';
import { Choice } from '@shared/gameScript';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5174';

// Chat message type
interface ChatMessage {
  id: string;
  speaker: 'SYSTEM' | 'GUIDE' | 'USER';
  text: string;
  portraitUrl?: string;
  emotion?: string;
  timestamp: number;
}

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeChoices, setActiveChoices] = useState<Choice[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeReward, setActiveReward] = useState<string | null>(null);
  const [currentPortrait, setCurrentPortrait] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  // Initialize game
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    startGame();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startGame = async () => {
    // Add system intro
    addMessage({
      speaker: 'SYSTEM',
      text: '> NEURAL_LINK v2.0 INITIALIZING...'
    });

    await delay(800);

    addMessage({
      speaker: 'SYSTEM',
      text: '> CONNECTION ESTABLISHED'
    });

    await delay(500);

    // Get initial dialogue from backend
    await fetchDialogue();
  };

  const addMessage = (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setMessages(prev => [...prev, {
      ...msg,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    }]);
  };

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const fetchDialogue = async (userInput?: string) => {
    setIsLoading(true);

    const sessionId = localStorage.getItem('splicer_session_id') || `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    if (!localStorage.getItem('splicer_session_id')) {
      localStorage.setItem('splicer_session_id', sessionId);
    }

    try {
      const response = await fetch(`${API_URL}/api/dialogue/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneId: gameState.getState().sceneId,
          flags: gameState.getState().flags,
          history: gameState.getState().history,
          userInput,
          sessionId
        })
      });

      if (!response.ok) throw new Error('API error');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      const currentMsgId = `msg_${Date.now()}`;
      let textContent = '';
      let hasAddedMessage = false;

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              // Parallel Metadata Processing
              if (data.portraitUrl) setCurrentPortrait(data.portraitUrl);
              if (data.rewardCode) setActiveReward(data.rewardCode);
              if (data.choices) setActiveChoices(data.choices);

              if (data.detectedIntent) {
                const flagMap: Record<string, any> = {
                  curious: { curious: 1 },
                  cautious: { cautious: 1 },
                  goal_oriented: { goal_oriented: 1 }
                };
                if (flagMap[data.detectedIntent]) {
                  gameState.updateFlags(flagMap[data.detectedIntent]);
                }
              }

              if (data.suggestedNextSceneId) {
                gameState.setSceneId(data.suggestedNextSceneId);
              }

              // Text Streaming
              if (data.text) {
                textContent += data.text;

                if (!hasAddedMessage) {
                  setMessages(prev => [...prev, {
                    id: currentMsgId,
                    speaker: 'GUIDE',
                    text: textContent,
                    timestamp: Date.now(),
                    emotion: data.emotion || 'neutral'
                  }]);
                  hasAddedMessage = true;
                } else {
                  setMessages(prev => prev.map(m =>
                    m.id === currentMsgId ? { ...m, text: textContent } : m
                  ));
                }
              }
            } catch (e) {
              // Ignore partial JSON
            }
          }
        }
      }
    } catch (error) {
      console.error('Dialogue fetch failed:', error);
      addMessage({
        speaker: 'SYSTEM',
        text: '> ERROR: Neural link unstable. Retrying...'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChoice = async (choice: Choice) => {
    if (isLoading) return;

    setActiveChoices(null);

    // Add choice to chat history
    addMessage({
      speaker: 'USER',
      text: choice.text
    });

    // Update game state
    gameState.addHistory({
      sceneId: gameState.getState().sceneId,
      choiceId: choice.id,
      choiceText: choice.text
    });

    gameState.setSceneId(choice.nextStepId);

    // Fetch next step results
    await fetchDialogue();
  };

  const handleSendMessage = async (message: string) => {
    if (isLoading || !message.trim()) return;

    setActiveChoices(null);

    // Add user message to chat
    addMessage({
      speaker: 'USER',
      text: message
    });

    // Track in game state
    gameState.addHistory({
      sceneId: gameState.getState().sceneId,
      choiceText: message,
      isUserTyped: true
    });

    // Get response
    await fetchDialogue(message);
  };

  const handleReset = () => {
    if (confirm('Reset the Neural Link? All progress will be lost.')) {
      gameState.reset();
      setMessages([]);
      setActiveReward(null);
      setCurrentPortrait(null);
      startGame();
    }
  };

  return (
    <div className="terminal-game">
      {/* Header */}
      <header className="terminal-header">
        <div className="header-title">
          <span className="pulse">●</span>
          <span>NEURAL_LINK</span>
        </div>
        <button className="reset-btn" onClick={handleReset}>
          [RESET]
        </button>
      </header>

      {/* Main Split Layout */}
      <div className="terminal-main-layout">

        {/* Left Panel: Visual Feed */}
        <div className="left-panel">
          <VisualFeed
            portraitUrl={currentPortrait}
            status={isLoading ? 'GENERATING' : currentPortrait ? 'CONNECTED' : 'IDLE'}
          />
        </div>

        {/* Right Panel: Chat Interface */}
        <div className="right-panel">
          <div className="terminal-content">
            {/* Chat log */}
            <div className="chat-log">
              {messages.map((msg, idx) => (
                <div key={msg.id} className={`chat-message ${msg.speaker.toLowerCase()}`}>
                  <span className="speaker-tag">[{msg.speaker}]</span>
                  <span className="message-text">
                    {msg.speaker === 'USER' || idx < messages.length - 1 ? (
                      msg.text
                    ) : (
                      <TypewriterText text={msg.text} speed={5} />
                    )}
                  </span>
                </div>
              ))}

              {isLoading && (
                <div className="chat-message system">
                  <span className="speaker-tag">[SYSTEM]</span>
                  <span className="message-text typing">Processing...</span>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Dynamic Choices */}
            {activeChoices && (
              <div className="choice-container">
                {activeChoices.map(choice => (
                  <button
                    key={choice.id}
                    className="choice-btn"
                    onClick={() => handleChoice(choice)}
                  >
                    &gt; {choice.text}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reward display */}
          {activeReward && (
            <div className="reward-container">
              <RewardModule code={activeReward} />
            </div>
          )}

          {/* Input */}
          <div className="terminal-input-area">
            <TerminalInput
              onSendMessage={handleSendMessage}
              disabled={isLoading}
              placeholder="Enter your response..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
