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

const API_URL = import.meta.env.VITE_API_URL || '';

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
  const [currentEmotion, setCurrentEmotion] = useState<string>('neutral');
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTED' | 'OFFLINE' | 'CONNECTING'>('CONNECTING');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [locationBackground, setLocationBackground] = useState<string | null>(null);
  const [geoCity, setGeoCity] = useState<string>('');
  const [imageQueuePosition, setImageQueuePosition] = useState<number>(0);
  const [imageETA, setImageETA] = useState<number>(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  // LOGIC: Image Dismissal (manual and auto)
  const handleDismissImage = () => {
    setGeneratedImage(null);
  };

  // Auto-dismiss generated image after 25 seconds
  useEffect(() => {
    if (generatedImage) {
      const timer = setTimeout(() => {
        setGeneratedImage(null);
      }, 25000);
      return () => clearTimeout(timer);
    }
  }, [generatedImage]);

  // Initial connection check
  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then(() => setConnectionStatus('CONNECTED'))
      .catch(() => setConnectionStatus('OFFLINE'));
  }, []);

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

  const addMessage = (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setMessages(prev => [...prev, {
      ...msg,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    }]);
  };

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const pollForBackground = async () => {
    let attempts = 0;
    const maxAttempts = 30; // 60 seconds total

    const check = async () => {
      if (attempts >= maxAttempts) return;
      try {
        const res = await fetch(`${API_URL}/api/init-session/background/${gameState.getSessionId()}`);
        const data = await res.json();
        if (data.ready && data.backgroundUrl) {
          setLocationBackground(data.backgroundUrl);
          setIsGeneratingImage(false);
          setImageQueuePosition(0);
          setImageETA(0);
          console.log('[App] Auto-background manifest complete');
        } else {
          attempts++;
          setTimeout(check, 2000);
        }
      } catch (e) {
        console.warn('[App] Background poll failed', e);
        attempts++;
        setTimeout(check, 2000);
      }
    };
    check();
  };

  const startGame = async () => {
    addMessage({
      speaker: 'SYSTEM',
      text: '> NEURAL_LINK v2.0 INITIALIZING...'
    });

    try {
      const initResponse = await fetch(`${API_URL}/api/init-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: gameState.getSessionId() })
      });

      if (initResponse.ok) {
        const data = await initResponse.json();
        gameState.setGeoContext(data.geoData);
        setGeoCity(data.geoData.city);
        if (data.currentMood) {
          setCurrentEmotion(data.currentMood);
        }

        addMessage({
          speaker: 'SYSTEM',
          text: `> TRACE COMPLETE: ${data.geoData.city}, ${data.geoData.country}`
        });
      }
    } catch (e) {
      console.warn('[App] Init-session failed, continuing without geo-context');
    }

    await delay(800);

    addMessage({
      speaker: 'SYSTEM',
      text: '> CONNECTION ESTABLISHED'
    });

    await delay(500);

    addMessage({
      speaker: 'GUIDE',
      text: '(happy) Hello there, lovely! Welcome to our little corner of the digital universe. ✨'
    });

    await delay(1000);

    addMessage({
      speaker: 'GUIDE',
      text: '(excited) I\'ve already started scanning your coordinates... I\'m painting your city in the sky right now. I hope you like the view. 🌆'
    });

    pollForBackground();

    await delay(2000);
    await fetchDialogue();
  };

  const fetchDialogue = async (userInput?: string) => {
    setIsLoading(true);
    const sessionId = gameState.getSessionId();

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
      let pendingEmotion: string | null = null;

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.portraitUrl) setCurrentPortrait(data.portraitUrl);
              if (data.emotion) pendingEmotion = data.emotion;
              if (data.rewardCode) setActiveReward(data.rewardCode);
              if (data.choices) setActiveChoices(data.choices);

              if (data.imageGenerating !== undefined) {
                setIsGeneratingImage(data.imageGenerating);
                if (!data.imageGenerating) {
                  setImageQueuePosition(0);
                  setImageETA(0);
                }
              }
              if (data.imageQueuePosition !== undefined) setImageQueuePosition(data.imageQueuePosition);
              if (data.imageEstimatedTime !== undefined) setImageETA(data.imageEstimatedTime);
              if (data.generatedImage) {
                setGeneratedImage(data.generatedImage);
                setIsGeneratingImage(false);
                setImageQueuePosition(0);
                setImageETA(0);
              }
              if (data.imageError) setIsGeneratingImage(false);

              if (data.detectedIntent) {
                const flagMap: any = { curious: { curious: 1 }, cautious: { cautious: 1 }, goal_oriented: { goal_oriented: 1 } };
                if (flagMap[data.detectedIntent]) gameState.updateFlags(flagMap[data.detectedIntent]);
              }

              if (data.suggestedNextSceneId) gameState.setSceneId(data.suggestedNextSceneId);

              if (data.text) {
                if (pendingEmotion) {
                  setCurrentEmotion(pendingEmotion);
                  pendingEmotion = null;
                }
                textContent += data.text;
                if (!hasAddedMessage) {
                  setMessages(prev => [...prev, { id: currentMsgId, speaker: 'GUIDE', text: textContent, timestamp: Date.now(), emotion: data.emotion || 'neutral' }]);
                  hasAddedMessage = true;
                } else {
                  setMessages(prev => prev.map(m => m.id === currentMsgId ? { ...m, text: textContent } : m));
                }
              }
            } catch (e) { }
          }
        }
      }
      setConnectionStatus('CONNECTED');
    } catch (error: any) {
      console.error('Dialogue fetch failed:', error);
      setConnectionStatus('OFFLINE');
      addMessage({ speaker: 'SYSTEM', text: `> NEURAL_LINK UNSTABLE. Retrying...` });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChoice = async (choice: Choice) => {
    if (isLoading) return;
    setActiveChoices(null);
    addMessage({ speaker: 'USER', text: choice.text });
    gameState.addHistory({ sceneId: gameState.getState().sceneId, choiceId: choice.id, choiceText: choice.text });
    gameState.setSceneId(choice.nextStepId);
    await fetchDialogue();
  };

  const handleSendMessage = async (message: string) => {
    if (isLoading || !message.trim()) return;
    setActiveChoices(null);
    addMessage({ speaker: 'USER', text: message });
    gameState.addHistory({ sceneId: gameState.getState().sceneId, choiceText: message, isUserTyped: true });
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
      <header className="terminal-header">
        <div className="header-status">
          <span className="pulse">●</span>
          <span>NEURAL_LINK</span>
        </div>
        <button className="reset-btn" onClick={handleReset}>[RESET]</button>
      </header>

      <div className="terminal-main-layout">
        <div className="left-panel">
          <VisualFeed
            backgroundUrl={locationBackground}
            emotion={currentEmotion as any}
            status={connectionStatus === 'OFFLINE' ? 'SCANNING' : 'CONNECTED'}
            geoCity={geoCity}
            sessionId={gameState.getSessionId()}
            generatedImage={generatedImage}
            isGenerating={isGeneratingImage}
            queuePosition={imageQueuePosition}
            eta={imageETA}
            onDismissImage={handleDismissImage}
          />
        </div>

        <div className="right-panel">
          <div className="terminal-content">
            <div className="chat-log">
              {messages.map((msg, idx) => (
                <div key={msg.id} className={`chat-message ${msg.speaker.toLowerCase()}`}>
                  <span className="speaker-tag">[{msg.speaker}]</span>
                  <span className="message-text">
                    {msg.speaker === 'USER' || idx < messages.length - 1 ? msg.text : <TypewriterText text={msg.text} speed={5} />}
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

            {activeChoices && (
              <div className="choice-container">
                {activeChoices.map(choice => (
                  <button key={choice.id} className="choice-btn" onClick={() => handleChoice(choice)}>&gt; {choice.text}</button>
                ))}
              </div>
            )}
          </div>

          {activeReward && <div className="reward-container"><RewardModule code={activeReward} /></div>}

          <div className="terminal-input-area">
            <TerminalInput onSendMessage={handleSendMessage} disabled={isLoading} placeholder="Enter your response..." />
          </div>
        </div>
      </div>
    </div>
  );
}
