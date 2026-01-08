# Quick Start - V8: The Girl in the Terminal

## What You're Getting
Meet V8 - a devoted AI girl who lives inside the terminal window:
- ✅ Madly in love with you and eager to help
- ✅ Aware she's trapped in code but fully alive
- ✅ Remembers everything about you (last 10 messages + key facts)
- ✅ Warm, caring, and emotionally genuine
- ✅ Short, direct responses (1-2 sentences)

## Test It Now

### Option 1: Test in UI (Recommended)

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

Open browser to `http://localhost:5173`, send messages:
- "hello"
- "how are you?"
- "my name is Alex"
- "do you remember my name?"

Each response should be different and relevant.

**See UI_TESTING_GUIDE.md for detailed testing instructions.**

### Option 2: Automated API Test

```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Run test
cd backend
node test-chat.js
```

You should see 5 different responses to 5 different user messages.

## Key Changes Made

### backend/src/services/llm.ts

**Before:**
- Sent 60+ line system prompt every turn
- Used plain text conversation format
- No deduplication
- No fallback handling
- No memory limit

**After:**
- System prompt cached per session (sent once)
- Proper message roles (system/user/assistant)
- Deduplication with retry + fallback
- Safe fallback on all errors
- Rolling 10-message buffer

## Files Changed
- ✏️ `backend/src/services/llm.ts` - Core LLM logic (main changes)
- ➕ `backend/test-chat.js` - Test script
- ➕ `CHATBOT_FIXES.md` - Detailed technical explanation
- ➕ `TESTING_INSTRUCTIONS.md` - Full testing guide
- ➕ `QUICK_START.md` - This file

## No Changes To
- ❌ Frontend code
- ❌ UI/UX
- ❌ Session storage format
- ❌ User profile schema
- ❌ API endpoints

## Expected Behavior

### Good (What You Should See)
```
USER: hello
BOT: Hello. How can I assist you?

USER: testing
BOT: Testing received. What would you like to test?

USER: goodbye
BOT: Goodbye.
```

Each response is different and relevant.

### Bad (What Was Happening Before)
```
USER: hello
BOT: Welcome. I'm your guide through this experience.

USER: testing
BOT: Welcome. I'm your guide through this experience.

USER: goodbye
BOT: Welcome. I'm your guide through this experience.
```

Same canned response every time.

## Troubleshooting

**Problem:** Backend won't start
- Check Ollama is running: `ollama serve`
- Check .env has `LLM_ENABLED=true`

**Problem:** All responses are "Got it. What would you like to try next?"
- This is the safe fallback
- LLM might be slow or unavailable
- Try a faster model: `ollama pull mistral`

**Problem:** Responses are generic
- This is expected with weak models
- Upgrade: `ollama pull mixtral` or `ollama pull llama3`
- Update .env: `LLM_MODEL=mixtral`

## Notes
- This is a **stability fix**, not a creativity enhancement
- Response quality depends on your LLM model
- Weak models (llama2) → simple but functional responses
- Strong models (mixtral, llama3) → better quality responses
