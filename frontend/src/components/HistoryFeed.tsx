import React, { useEffect, useRef } from 'react';

export interface HistoryEntry {
    timestamp: number;
    type: 'user_input' | 'system_response' | 'choice' | 'event';
    content: string;
    metadata?: {
        imageUrl?: string;
        prompt?: string;
    };
}

interface HistoryFeedProps {
    entries: HistoryEntry[];
    isOpen: boolean;
    onClose: () => void;
}

const HistoryFeed: React.FC<HistoryFeedProps> = ({ entries, isOpen, onClose }) => {
    const feedRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (feedRef.current) {
            feedRef.current.scrollTop = feedRef.current.scrollHeight;
        }
    }, [entries, isOpen]);

    if (!isOpen) return null;

    return (
        <div className="history-drawer-overlay">
            <div className="history-drawer">
                <div className="history-header">
                    <div className="history-title">
                        <span className="pulse">●</span> SESSION_LOGS
                    </div>
                    <button className="history-close" onClick={onClose}>[ CLOSE ]</button>
                </div>

                <div className="history-content" ref={feedRef}>
                    {entries.length === 0 ? (
                        <div className="history-empty">NO_HISTORY_FOUND</div>
                    ) : (
                        entries.map((entry, idx) => (
                            <div key={idx} className={`history-item ${entry.type}`}>
                                <div className="item-meta">
                                    <span className="item-time">
                                        {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </span>
                                    <span className="item-type">{entry.type === 'event' ? 'MANIFEST' : entry.type.toUpperCase()}</span>
                                </div>

                                <div className="item-body">
                                    {entry.type === 'event' && entry.metadata?.imageUrl ? (
                                        <div className="history-manifest">
                                            <div className="manifest-prompt">{'>'} {entry.metadata.prompt}</div>
                                            <img
                                                src={entry.metadata.imageUrl}
                                                alt="Manifestation"
                                                className="history-img"
                                                onClick={() => window.open(entry.metadata?.imageUrl, '_blank')}
                                            />
                                        </div>
                                    ) : (
                                        <div className="item-text">{entry.content}</div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="history-footer">
                    END_OF_LOGS_{entries.length}_ENTRIES
                </div>
            </div>
        </div>
    );
};

export default HistoryFeed;
