import { useState } from 'react';
import styles from './RewardModule.module.css';

interface RewardModuleProps {
    code: string;
}

export function RewardModule({ code }: RewardModuleProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={styles.container}>
            <div className={styles.glitchBox}>
                <div className={styles.header}>
                    <span className={styles.pulse}>●</span>
                    <span>REWARD_DECRYPTED</span>
                </div>
                <div className={styles.body}>
                    <p className={styles.info}>PRIZE: 50 PRO IMAGE GENERATIONS</p>
                    <div className={styles.codeRow}>
                        <span className={styles.label}>PASS_CODE:</span>
                        <span className={styles.code}>{code}</span>
                        <button
                            className={copied ? styles.copyBtnSuccess : styles.copyBtn}
                            onClick={handleCopy}
                        >
                            {copied ? 'COPIED' : 'COPY'}
                        </button>
                    </div>
                </div>
                <div className={styles.footer}>
                    &gt; USE THIS AT THE CHECKOUT CORE TO ACTIVATE
                </div>
            </div>
        </div>
    );
}
