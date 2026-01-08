import type { GeneratorResult } from '@shared/types';
import styles from './ImagePreview.module.css';

interface ImagePreviewProps {
    result: GeneratorResult;
}

export function ImagePreview({ result }: ImagePreviewProps) {
    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <span className={styles.title}>SYSTEM_OUTPUT: GENERATED_IMAGE</span>
                <span className={styles.status}>[COMPLETE]</span>
            </div>
            <div className={styles.content}>
                <img src={result.imageUrl} alt={result.prompt} className={styles.image} />
                <div className={styles.meta}>
                    <div className={styles.promptLine}>
                        <span className={styles.label}>PROMPT:</span>
                        <span className={styles.value}>{result.prompt}</span>
                    </div>
                    {result.limitations && (
                        <div className={styles.limitations}>
                            <span className={styles.label}>RESTRICTIONS:</span>
                            <ul>
                                {result.limitations.map((lim, i) => (
                                    <li key={i}>{lim}</li>
                                ))}
                            </ul>
                            <div className={styles.upgradeNotice}>
                                &gt; UPGRADE TO PRO TO REMOVE LIMITS
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
