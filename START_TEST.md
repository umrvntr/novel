# Quick Start - Test the Fixed Chatbot

## One-Time Setup

Make sure Ollama is running:
```bash
ollama serve
```

## Start Application

### Terminal 1: Backend
```bash
cd backend
npm run dev
```
Wait for: `Server running on http://127.0.0.1:5174`

### Terminal 2: Frontend
```bash
cd frontend
npm run dev
```
Wait for the Vite URL, then open in browser.

## Test Messages

Type these in the chat:

1. **hello** - Should get a greeting
2. **how are you?** - Should get a different response
3. **my name is Alex** - Should acknowledge name
4. **do you remember my name?** - Should say "Alex"
5. **tell me about 2042** - Should talk about the setting

## Success = All Different Responses

✅ Each response is unique and relevant
❌ Same response repeated = something's wrong

## If All Fallback Responses

Seeing "Got it. What would you like to try next?" every time?

Try stronger model:
```bash
ollama pull mixtral
```

Update `backend/.env`:
```
LLM_MODEL=mixtral
```

Restart backend (Ctrl+C then `npm run dev`)

---

**Full Guide**: See UI_TESTING_GUIDE.md
