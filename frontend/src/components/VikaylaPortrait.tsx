/**
 * VIKAYLA PORTRAIT - Stop-Motion Animation Engine
 * V8: Full emotion spectrum with 27 emotions, 3 frames each
 */

import React, { useState, useEffect } from 'react';

// Full emotion spectrum (27 emotions)
export type V8Emotion =
    // Core emotions
    | 'neutral' | 'happy' | 'sad' | 'angry' | 'scared' | 'surprised' | 'disgusted'
    // Complex emotions
    | 'excited' | 'curious' | 'skeptical' | 'thinking' | 'confused' | 'embarrassed' | 'guilty' | 'hopeful' | 'disappointed'
    // Intense emotions
    | 'seductive' | 'flirty' | 'longing' | 'jealous' | 'smug' | 'determined' | 'exhausted' | 'bored'
    // Technical emotions
    | 'scanning' | 'processing' | 'alert';

// Placeholder colors per emotion category
const EMOTION_COLORS: Record<V8Emotion, string> = {
    // Core
    neutral: '0a0a0a/00ff41',
    happy: '0a0a0a/ffff00',
    sad: '0a0a0a/4444ff',
    angry: '0a0a0a/ff4444',
    scared: '0a0a0a/8844ff',
    surprised: '0a0a0a/ff8800',
    disgusted: '0a0a0a/44aa44',
    // Complex
    excited: '0a0a0a/ff00ff',
    curious: '0a0a0a/00aaff',
    skeptical: '0a0a0a/aaaaaa',
    thinking: '0a0a0a/00aaff',
    confused: '0a0a0a/aa8800',
    embarrassed: '0a0a0a/ff88aa',
    guilty: '0a0a0a/666666',
    hopeful: '0a0a0a/ffdd00',
    disappointed: '0a0a0a/555555',
    // Intense
    seductive: '0a0a0a/aa0066',
    flirty: '0a0a0a/ff66aa',
    longing: '0a0a0a/884466',
    jealous: '0a0a0a/00aa44',
    smug: '0a0a0a/cc8800',
    determined: '0a0a0a/ff6600',
    exhausted: '0a0a0a/444466',
    bored: '0a0a0a/666666',
    // Technical
    scanning: '0a0a0a/00ffff',
    processing: '0a0a0a/0088ff',
    alert: '0a0a0a/ff0000'
};

interface VikaylaPortraitProps {
    emotion?: V8Emotion;
    sessionId?: string;
    className?: string;
}

/**
 * Deterministically pick a frame index (0, 1, or 2) based on sessionId
 */
const getSessionFrameIndex = (sessionId?: string): number => {
    if (!sessionId) return 0;
    let hash = 0;
    for (let i = 0; i < sessionId.length; i++) {
        hash = sessionId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % 3;
};

// Frame paths by emotion
const getFramePath = (emotion: V8Emotion, frameIndex: number): string => {
    const paddedIndex = String(frameIndex + 1).padStart(2, '0');
    return `/assets/portraits/v8/${emotion}/${paddedIndex}.png`;
};

// Fallback placeholder when frames don't exist
const getPlaceholderUrl = (emotion: V8Emotion): string => {
    const color = EMOTION_COLORS[emotion] || '0a0a0a/00ff41';
    return `https://placehold.co/512x512/${color}?text=V8%20${emotion.toUpperCase()}`;
};

export const VikaylaPortrait: React.FC<VikaylaPortraitProps> = ({
    emotion = 'neutral',
    sessionId,
    className = ''
}) => {
    const frameIndex = getSessionFrameIndex(sessionId);
    const [usesFallback, setUsesFallback] = useState(false);

    // Reset fallback state when emotion changes
    useEffect(() => {
        setUsesFallback(false);
    }, [emotion]);

    const handleImageError = () => {
        if (!usesFallback) {
            console.warn(`[VikaylaPortrait] Frame not found for emotion: ${emotion}, using placeholder`);
            setUsesFallback(true);
        }
    };

    const imageSrc = usesFallback
        ? getPlaceholderUrl(emotion)
        : getFramePath(emotion, frameIndex);

    return (
        <div className={`vikayla-portrait ${className}`}>
            <img
                key={`${emotion}-${frameIndex}`} // Force re-render on emotion/frame change
                src={imageSrc}
                alt={`V8 - ${emotion}`}
                onError={handleImageError}
                className="portrait-frame"
            />
            <div className="portrait-overlay">
                <span className="state-indicator">{emotion.toUpperCase()}</span>
                {!usesFallback && (
                    <span className="frame-counter">SEED: {frameIndex + 1}</span>
                )}
            </div>
        </div>
    );
};

// Export for use in other components
export const ALL_EMOTIONS: V8Emotion[] = [
    'neutral', 'happy', 'sad', 'angry', 'scared', 'surprised', 'disgusted',
    'excited', 'curious', 'skeptical', 'thinking', 'confused', 'embarrassed', 'guilty', 'hopeful', 'disappointed',
    'seductive', 'flirty', 'longing', 'jealous', 'smug', 'determined', 'exhausted', 'bored',
    'scanning', 'processing', 'alert'
];
