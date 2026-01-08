import axios from 'axios';
class N8NMemoryService {
    constructor() {
        this.webhookUrl = process.env.MEMORY_WEBHOOK;
    }
    async getMemory(sessionId) {
        if (!this.webhookUrl)
            return null;
        try {
            const response = await axios.get(`${this.webhookUrl}?sessionId=${sessionId}`);
            return response.data;
        }
        catch (error) {
            console.warn(`[N8NMemory] Failed to fetch memory for session ${sessionId}:`, error);
            return null;
        }
    }
    async saveMemory(memory) {
        if (!this.webhookUrl)
            return;
        try {
            await axios.post(this.webhookUrl, memory);
        }
        catch (error) {
            console.warn(`[N8NMemory] Failed to save memory for session ${memory.sessionId}:`, error);
        }
    }
}
export const n8nMemory = new N8NMemoryService();
