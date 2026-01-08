/**
 * SESSION MEMORY SERVICE - Local File-Based Memory
 * Sprint 4: Stores user history by sessionId in local files
 * Replaces external n8n memory with local folder storage
 */

import * as fs from 'fs';
import * as path from 'path';

const MEMORY_DIR = path.join(process.cwd(), 'data', 'sessions');

export interface MemoryEntry {
    timestamp: number;
    type: 'user_input' | 'system_response' | 'choice' | 'event';
    content: string;
    metadata?: Record<string, any>;
}

export interface SessionMemory {
    sessionId: string;
    createdAt: number;
    lastUpdated: number;
    entries: MemoryEntry[];
    summary?: string;
    sceneCache?: Record<string, string>; // Sprint 2.2: Added cache
}

class SessionMemoryService {
    constructor() {
        this.ensureMemoryDir();
    }

    /**
     * Ensure memory directory exists
     */
    private ensureMemoryDir(): void {
        if (!fs.existsSync(MEMORY_DIR)) {
            fs.mkdirSync(MEMORY_DIR, { recursive: true });
            console.log(`[SessionMemory] Created memory directory: ${MEMORY_DIR}`);
        }
    }

    /**
     * Get file path for a session
     */
    private getFilePath(sessionId: string): string {
        return path.join(MEMORY_DIR, `${sessionId}.json`);
    }

    /**
     * Load session memory
     */
    async getMemory(sessionId: string): Promise<SessionMemory | null> {
        const filePath = this.getFilePath(sessionId);

        try {
            if (!fs.existsSync(filePath)) {
                return null;
            }

            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data) as SessionMemory;
        } catch (error) {
            console.error(`[SessionMemory] Failed to load session ${sessionId}:`, error);
            return null;
        }
    }

    /**
     * Save session memory
     */
    async saveMemory(sessionId: string, memory: SessionMemory): Promise<void> {
        const filePath = this.getFilePath(sessionId);

        try {
            memory.lastUpdated = Date.now();
            fs.writeFileSync(filePath, JSON.stringify(memory, null, 2));
            console.log(`[SessionMemory] Saved session ${sessionId}`);
        } catch (error) {
            console.error(`[SessionMemory] Failed to save session ${sessionId}:`, error);
        }
    }

    /**
     * Add entry to session memory
     */
    async addEntry(sessionId: string, entry: MemoryEntry): Promise<void> {
        let memory = await this.getMemory(sessionId);

        if (!memory) {
            memory = {
                sessionId,
                createdAt: Date.now(),
                lastUpdated: Date.now(),
                entries: []
            };
        }

        memory.entries.push({
            ...entry,
            timestamp: entry.timestamp || Date.now()
        });

        // Auto-summary if history gets long
        if (memory.entries.length > 50 && (!memory.lastUpdated || Date.now() - memory.lastUpdated > 1000 * 60 * 60)) {
            memory.summary = await this.generateSummary(sessionId);
        }

        // Keep last 100 entries
        if (memory.entries.length > 100) {
            memory.entries = memory.entries.slice(-100);
        }

        await this.saveMemory(sessionId, memory);
    }

    /**
     * Get recent conversation context for LLM
     */
    async getConversationContext(sessionId: string, limit: number = 10): Promise<string> {
        const memory = await this.getMemory(sessionId);

        if (!memory || memory.entries.length === 0) {
            return 'No prior conversation history.';
        }

        const recent = memory.entries.slice(-limit);
        return recent
            .map(e => `[${e.type}] ${e.content}`)
            .join('\n');
    }

    /**
     * Update scene cache for session
     */
    async updateCache(sessionId: string, sceneId: string, responseText: string): Promise<void> {
        let memory = await this.getMemory(sessionId);

        if (!memory) {
            memory = {
                sessionId,
                createdAt: Date.now(),
                lastUpdated: Date.now(),
                entries: [],
                sceneCache: {}
            };
        }

        if (!memory.sceneCache) memory.sceneCache = {};
        memory.sceneCache[sceneId] = responseText;

        await this.saveMemory(sessionId, memory);
    }

    /**
     * Generate summary of session (for long-term memory)
     */
    async generateSummary(sessionId: string): Promise<string> {
        const memory = await this.getMemory(sessionId);

        if (!memory || memory.entries.length === 0) {
            return 'New user, no history.';
        }

        const entryCount = memory.entries.length;
        const firstEntry = new Date(memory.createdAt).toISOString();
        const lastEntry = new Date(memory.lastUpdated).toISOString();

        return `Session started: ${firstEntry}. Total interactions: ${entryCount}. Last activity: ${lastEntry}.`;
    }
}

export const sessionMemory = new SessionMemoryService();
