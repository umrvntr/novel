import { SessionMemory } from './sessionMemory.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Story 1.1: Backend Session Manager
 * Manages in-memory session state for fast access
 */
class SessionManager {
    private sessions: Map<string, SessionMemory> = new Map();

    /**
     * Get an existing session or create a new one
     */
    async getSession(sessionId?: string): Promise<SessionMemory> {
        if (sessionId && this.sessions.has(sessionId)) {
            return this.sessions.get(sessionId)!;
        }

        // Generate new session if not provided or doesn't exist in memory
        const id = sessionId || uuidv4();
        const newSession: SessionMemory = {
            sessionId: id,
            createdAt: Date.now(),
            lastUpdated: Date.now(),
            entries: []
        };

        this.sessions.set(id, newSession);
        return newSession;
    }

    /**
     * Update session state in memory
     */
    async updateSession(sessionId: string, sessionData: Partial<SessionMemory>): Promise<SessionMemory> {
        const session = await this.getSession(sessionId);

        const updatedSession = {
            ...session,
            ...sessionData,
            lastUpdated: Date.now()
        };

        this.sessions.set(sessionId, updatedSession);
        return updatedSession;
    }

    /**
     * Delete session from memory
     */
    async deleteSession(sessionId: string): Promise<void> {
        this.sessions.delete(sessionId);
    }

    /**
     * Get all active session IDs (for cleanup)
     */
    getActiveSessionIds(): string[] {
        return Array.from(this.sessions.keys());
    }

    /**
     * Periodically clean up inactive sessions
     */
    cleanup(maxAgeMs: number = 30 * 60 * 1000): void {
        const now = Date.now();
        for (const [id, session] of this.sessions.entries()) {
            if (now - session.lastUpdated > maxAgeMs) {
                this.sessions.delete(id);
                console.log(`[SessionManager] Cleaned up inactive session: ${id}`);
            }
        }
    }
}

export const sessionManager = new SessionManager();
