/**
 * VISUAL FEED - Dual-Layer Rendering System
 * V8 Sprint 2: Layer 0 (Background) + Layer 1 (V8 Portrait)
 */

import React, { useState, useEffect } from 'react';
import { VikaylaPortrait, V8Emotion } from './VikaylaPortrait';

interface VisualFeedProps {
    backgroundUrl?: string | null;
    emotion?: V8Emotion;
    status?: 'IDLE' | 'GENERATING' | 'CONNECTED' | 'SCANNING';
    geoCity?: string;
    sessionId?: string;
    generatedImage?: string | null;  // URL or base64 from image gen
    isGenerating?: boolean;          // Loading state for image gen
    queuePosition?: number;
    eta?: number;
    onDismissImage?: () => void;
}

export const VisualFeed: React.FC<VisualFeedProps> = ({
    backgroundUrl,
    emotion = 'neutral',
    status = 'CONNECTED',
    geoCity,
    sessionId,
    generatedImage,
    isGenerating = false,
    queuePosition = 0,
    eta = 0,
    onDismissImage
}) => {
    const [isLoading, setIsLoading] = useState(true);
    const [showNeuralNoise, setShowNeuralNoise] = useState(true);

    // Initial state setup
    useEffect(() => {
        if (!backgroundUrl) {
            setIsLoading(true);
            setShowNeuralNoise(true);
        }
    }, [backgroundUrl]);

    return (
        <div className="visual-feed-container">
            {/* Header */}
            <div className="feed-header">
                <div className="header-left">
                    <span className="live-indicator">● LIVE FEED</span>
                    <span className="feed-status">[{status}]</span>
                </div>
                <div className="header-right">
                    <span className="mood-label">MOOD:</span>
                    <span className={`mood-value ${emotion.toLowerCase()}`}>{emotion.toUpperCase()}</span>
                </div>
            </div>

            {/* Viewport with Layers */}
            <div className="feed-viewport">
                {/* Layer 0: Background City (umrgen output) */}
                <div className="layer-background">
                    {backgroundUrl ? (
                        <img
                            key={backgroundUrl} // Force fresh image element when URL changes
                            src={backgroundUrl}
                            alt="City Background"
                            className={`bg-image ${isLoading ? 'loading' : 'loaded'}`}
                            onLoad={() => {
                                setIsLoading(false);
                                setShowNeuralNoise(false);
                            }}
                        />
                    ) : (
                        <div className="bg-placeholder">
                            <span>{geoCity ? `SCANNING: ${geoCity}` : 'AWAITING LOCATION...'}</span>
                        </div>
                    )}
                </div>

                {/* Layer 1: V8 Portrait (Stop-motion) */}
                <div className="layer-portrait">
                    <VikaylaPortrait
                        emotion={emotion}
                        sessionId={sessionId}
                    />
                </div>

                {/* Neural Link transition effect */}
                {showNeuralNoise && (
                    <div className="neural-noise-overlay">
                        <div className="noise-pattern"></div>
                        <div className="scan-line"></div>
                    </div>
                )}

                {/* Layer 2: Generated Image (Character's creation) */}
                {generatedImage && (
                    <div className="layer-generated-image">
                        <img
                            src={generatedImage}
                            alt="Generated"
                            className="generated-image fade-in"
                        />
                        <button
                            className="dismiss-image-btn"
                            onClick={onDismissImage}
                        >
                            [ DISMISS ]
                        </button>
                    </div>
                )}

                {/* Generating Overlay (Character is creating) */}
                {isGenerating && (
                    <div className="generating-overlay">
                        <div className="generating-pulse"></div>
                        <span className="generating-text">MANIFESTING...</span>
                        {(queuePosition > 0 || eta > 0) && (
                            <div className="queue-status">
                                {queuePosition > 0 && <span>QUEUE: {queuePosition}</span>}
                                {eta > 0 && <span>ETA: {eta}s</span>}
                            </div>
                        )}
                    </div>
                )}

                {/* Target indicator */}
                <div className="overlay-text">TARGET: ROZIE</div>
            </div>

            {/* Footer */}
            <div className="feed-footer">
                <div className="data-row">
                    <span>PORT: 3088</span>
                    <span>SIGNAL: {status === 'CONNECTED' ? 'STRONG' : 'WEAK'}</span>
                </div>
                {geoCity && (
                    <div className="data-row">
                        <span>LOC: {geoCity.toUpperCase()}</span>
                    </div>
                )}
            </div>
        </div>
    );
};
