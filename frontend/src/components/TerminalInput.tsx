import React, { useState, useEffect, useRef } from 'react';
import styles from './TerminalInput.module.css';

interface TerminalInputProps {
    onSendMessage: (message: string) => void;
    disabled?: boolean;
    placeholder?: string;
}

export function TerminalInput({ onSendMessage, disabled, placeholder = 'Type your response...' }: TerminalInputProps) {
    const [input, setInput] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-focus on mount and when re-enabled
    useEffect(() => {
        if (!disabled && inputRef.current) {
            inputRef.current.focus();
        }
    }, [disabled]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() && !disabled) {
            onSendMessage(input.trim());
            setInput('');
        }
    };

    return (
        <form className={styles.terminalContainer} onSubmit={handleSubmit}>
            <div className={styles.prompt}>
                <span className={styles.symbol}>&gt;</span>
                <input
                    ref={inputRef}
                    type="text"
                    className={styles.input}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={disabled}
                    placeholder={disabled ? 'Waiting for transmission...' : placeholder}
                    autoComplete="off"
                    spellCheck="false"
                />
                {!disabled && <span className={styles.cursor}>_</span>}
            </div>
        </form>
    );
}
