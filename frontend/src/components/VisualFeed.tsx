import React from 'react';

interface VisualFeedProps {
    portraitUrl: string | null;
    status?: 'IDLE' | 'GENERATING' | 'CONNECTED';
}

export const VisualFeed: React.FC<VisualFeedProps> = ({ portraitUrl, status = 'CONNECTED' }) => {
    return (
        <div className="visual-feed-container">
            <div className="feed-header">
                <span className="live-indicator">● LIVE FEED</span>
                <span className="feed-status">[{status}]</span>
            </div>

            <div className="feed-viewport">
                {portraitUrl ? (
                    <div className="active-portrait">
                        <img src={portraitUrl} alt="Visual Feed" />
                        <div className="scan-line"></div>
                        <div className="overlay-text">TARGET: CIPHER</div>
                    </div>
                ) : (
                    <div className="feed-placeholder">
                        <div className="loader-grid"></div>
                        <span>AWAITING VISUAL DATA...</span>
                    </div>
                )}
            </div>

            <div className="feed-footer">
                <div className="data-row">
                    <span>PORT: 8188</span>
                    <span>SIGNAL: STRONG</span>
                </div>
            </div>
        </div>
    );
};
