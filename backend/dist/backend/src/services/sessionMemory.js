/**
 * SESSION MEMORY SERVICE - Local File-Based Memory
 * Sprint 4: Stores user history by sessionId in local files
 * Replaces external n8n memory with local folder storage
 */
import * as fs from 'fs';
import * as path from 'path';
const MEMORY_DIR = path.join(process.cwd(), 'data', 'sessions');
class SessionMemoryService {
    constructor() {
        this.ensureMemoryDir();
    }
    /**
     * Ensure memory directory exists
     */
    ensureMemoryDir() {
        if (!fs.existsSync(MEMORY_DIR)) {
            fs.mkdirSync(MEMORY_DIR, { recursive: true });
            console.log(`[SessionMemory] Created memory directory: ${MEMORY_DIR}`);
        }
    }
    /**
     * Get file path for a session
     */
    getFilePath(sessionId) {
        return path.join(MEMORY_DIR, `${sessionId}.json`);
    }
    /**
     * Load session memory
     */
    async getMemory(sessionId) {
        const filePath = this.getFilePath(sessionId);
        try {
            if (!fs.existsSync(filePath)) {
                return null;
            }
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        }
        catch (error) {
            console.error(`[SessionMemory] Failed to load session ${sessionId}:`, error);
            return null;
        }
    }
    /**
     * Save session memory
     */
    async saveMemory(sessionId, memory) {
        const filePath = this.getFilePath(sessionId);
        try {
            memory.lastUpdated = Date.now();
            fs.writeFileSync(filePath, JSON.stringify(memory, null, 2));
            console.log(`[SessionMemory] Saved session ${sessionId}`);
        }
        catch (error) {
            console.error(`[SessionMemory] Failed to save session ${sessionId}:`, error);
        }
    }
    /**
     * Add entry to session memory
     */
    async addEntry(sessionId, entry) {
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
        // Keep last 100 entries
        if (memory.entries.length > 100) {
            memory.entries = memory.entries.slice(-100);
        }
        await this.saveMemory(sessionId, memory);
    }
    /**
     * Get recent conversation context for LLM
     */
    async getConversationContext(sessionId, limit = 10) {
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
     * Generate summary of session (for long-term memory)
     */
    async generateSummary(sessionId) {
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
