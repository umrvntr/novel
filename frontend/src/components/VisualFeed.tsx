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
}

export const VisualFeed: React.FC<VisualFeedProps> = ({
    backgroundUrl,
    emotion = 'neutral',
    status = 'CONNECTED',
    geoCity,
    sessionId
}) => {
    const [isLoading, setIsLoading] = useState(true);
    const [showNeuralNoise, setShowNeuralNoise] = useState(true);

    // Clear neural noise effect when background loads
    useEffect(() => {
        if (backgroundUrl) {
            // Simulate loading delay for transition effect
            const timer = setTimeout(() => {
                setIsLoading(false);
                setShowNeuralNoise(false);
            }, 1500);
            return () => clearTimeout(timer);
        } else {
            setIsLoading(true);
            setShowNeuralNoise(true);
        }
    }, [backgroundUrl]);

    return (
        <div className="visual-feed-container">
            {/* Header */}
            <div className="feed-header">
                <span className="live-indicator">● LIVE FEED</span>
                <span className="feed-status">[{status}]</span>
            </div>

            {/* Viewport with Layers */}
            <div className="feed-viewport">
                {/* Layer 0: Background City (umrgen output) */}
                <div className="layer-background">
                    {backgroundUrl ? (
                        <img
                            src={backgroundUrl}
                            alt="City Background"
                            className={`bg-image ${isLoading ? 'loading' : 'loaded'}`}
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

                {/* Target indicator */}
                <div className="overlay-text">TARGET: V8</div>
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
