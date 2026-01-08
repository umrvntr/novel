/**
 * VIKAYLA PORTRAIT - Stop-Motion Animation Engine
 * V8 Sprint 2: 6 FPS (166ms per frame) portrait cycling
 */

import React, { useState, useEffect, useRef } from 'react';

export type V8State = 'neutral' | 'thinking' | 'scanning' | 'talking';

interface VikaylaPortraitProps {
    state: V8State;
    frameCount?: number; // Number of frames per state (default: 12)
    className?: string;
}

// Frame paths by state
const getFramePath = (state: V8State, frameIndex: number): string => {
    const paddedIndex = String(frameIndex + 1).padStart(3, '0');
    return `/assets/portraits/v8/${state}/frame_${paddedIndex}.jpg`;
};

// Fallback placeholder when frames don't exist
const getPlaceholderUrl = (state: V8State): string => {
    const colors: Record<V8State, string> = {
        neutral: '0a0a0a/00ff41',
        thinking: '0a0a0a/00aaff',
        scanning: '0a0a0a/ff4444',
        talking: '0a0a0a/ffaa00'
    };
    return `https://placehold.co/512x512/${colors[state]}?text=V8%20${state.toUpperCase()}`;
};

export const VikaylaPortrait: React.FC<VikaylaPortraitProps> = ({
    state = 'neutral',
    frameCount = 12,
    className = ''
}) => {
    const [currentFrame, setCurrentFrame] = useState(0);
    const [usesFallback, setUsesFallback] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // 6 FPS = 166.67ms per frame
    const FRAME_INTERVAL = 166;

    useEffect(() => {
        // Reset frame on state change
        setCurrentFrame(0);
        setUsesFallback(false);

        // Start animation loop
        intervalRef.current = setInterval(() => {
            setCurrentFrame(prev => (prev + 1) % frameCount);
        }, FRAME_INTERVAL);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [state, frameCount]);

    const handleImageError = () => {
        // If frame fails to load, switch to placeholder
        if (!usesFallback) {
            console.warn(`[VikaylaPortrait] Frame not found for state: ${state}, using placeholder`);
            setUsesFallback(true);
        }
    };

    const imageSrc = usesFallback
        ? getPlaceholderUrl(state)
        : getFramePath(state, currentFrame);

    return (
        <div className={`vikayla-portrait ${className}`}>
            <img
                src={imageSrc}
                alt={`V8 - ${state}`}
                onError={handleImageError}
                className="portrait-frame"
            />
            <div className="portrait-overlay">
                <span className="state-indicator">{state.toUpperCase()}</span>
                {!usesFallback && (
                    <span className="frame-counter">{currentFrame + 1}/{frameCount}</span>
                )}
            </div>
        </div>
    );
};
