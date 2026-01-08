
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { LLMDialogueService } from '../services/llm';

async function runSanityTest() {
    console.log('--- LLM Sanity Test ---');
    console.log('Model:', process.env.LLM_MODEL);
    console.log('Provider:', process.env.LLM_PROVIDER);
    console.log('-----------------------\n');

    const endpoint = process.env.LLM_ENDPOINT || 'http://localhost:11434';
    const model = process.env.LLM_MODEL || 'mistral';
    const llm = new LLMDialogueService(endpoint, model);

    const testInputs = [
        "Hello",
        "I'm tired",
        "What's for dinner?"
    ];

    for (const input of testInputs) {
        console.log(`\nUser: ${input}`);
        process.stdout.write('V8: ');

        let fullResponse = '';

        await llm.streamDialogue({
            sceneId: 'test_scene',
            userInput: input,
            sessionId: 'test_session_123',
            flags: { curious: 0, cautious: 0, goal_oriented: 0 },
            history: []
        }, (token: any) => {
            if (token.text) {
                process.stdout.write(token.text);
                fullResponse += token.text;
            }
            if (token.emotion) {
                process.stdout.write(` [EMOTION: ${token.emotion}] `);
            }
        });

        console.log('\n\n--- Stats ---');
        console.log('Length:', fullResponse.trim().split(/\s+/).length, 'words');
        console.log('Mood Tag Detected:', fullResponse.match(/^\s*\(\w+\)/) ? 'Yes (Raw)' : 'No (Cleaned)');
    }
}

runSanityTest().catch(console.error);
