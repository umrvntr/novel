# UI Testing Guide - Chatbot Integration

## Prerequisites

1. **Ollama running** with a model loaded:
```bash
ollama serve
ollama pull llama2  # or mistral, mixtral, llama3
```

2. **Backend .env configured**:
```bash
cd backend
# Ensure .env has:
LLM_ENABLED=true
LLM_ENDPOINT=http://localhost:11434
LLM_MODEL=llama2
```

## Start the Application

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

Wait for the Vite dev server URL (usually `http://localhost:5173`)

## Testing the UI

### 1. Open Browser
Navigate to the frontend URL (e.g., `http://localhost:5173`)

### 2. Observe Initial Load
You should see:
- `> NEURAL_LINK v2.0 INITIALIZING...`
- `> TRACE COMPLETE: [Your City], [Your Country]`
- `> CONNECTION ESTABLISHED`
- An initial greeting from V8

### 3. Test Chat Functionality

Type these messages in the chat input and press Enter:

**Test 1: Basic Greeting**
```
hello
```
Expected: V8 responds with a greeting (should be different from any previous response)

**Test 2: Follow-up**
```
how are you?
```
Expected: V8 responds relevantly (not the same as the first response)

**Test 3: Name Sharing**
```
my name is Alex
```
Expected: V8 acknowledges your name

**Test 4: Memory Check**
```
do you remember my name?
```
Expected: V8 should reference "Alex" from the previous message

**Test 5: Different Topic**
```
tell me about the year 2042
```
Expected: V8 responds about the setting (should be contextually different)

### 4. Verify Success Criteria

✅ **PASS Criteria:**
- Each response is different from the previous ones
- Responses relate to what you just said
- V8 remembers your name after you share it
- No repeated generic responses
- No errors or blank messages

❌ **FAIL Criteria:**
- Same response repeated multiple times
- V8 gives unrelated responses
- Blank/empty messages appear
- Browser console shows errors
- Backend crashes or returns 500 errors

## Visual Indicators

### Left Panel (Visual Feed)
- Should show V8's portrait
- Emotion should change (neutral, thinking, etc.)
- Status shows "CONNECTED" when idle, "GENERATING" when thinking

### Right Panel (Chat Log)
- User messages appear with `[USER]` tag
- V8 responses appear with `[GUIDE]` tag
- System messages appear with `[SYSTEM]` tag
- Text appears with typewriter effect (streaming)

## Common Issues & Solutions

### Issue: "Connection Established" but no initial message
**Cause**: LLM might be slow or unavailable
**Solution**:
- Check backend terminal for errors
- Verify Ollama is running: `curl http://localhost:11434/api/tags`
- Check backend can reach Ollama

### Issue: All responses are "Got it. What would you like to try next?"
**Cause**: Fallback mode activated (LLM error or duplicate detection)
**Solution**:
- This is expected behavior when LLM fails
- Check backend logs for errors
- Try a different/stronger model: `ollama pull mistral`
- Update .env: `LLM_MODEL=mistral`

### Issue: Responses are very generic
**Cause**: Weak model (llama2 is simple)
**Solution**:
- Upgrade to better model:
```bash
ollama pull mixtral
# or
ollama pull llama3
```
- Update backend/.env: `LLM_MODEL=mixtral`
- Restart backend

### Issue: Long delay before response
**Cause**: Model is slow or system is under load
**Solution**:
- Normal for first request (model loading)
- Subsequent requests should be faster
- Use smaller/faster model if needed
- Check system resources (CPU/RAM)

### Issue: Responses repeat after 2-3 messages
**Cause**: Deduplication working correctly, but model is stuck
**Solution**:
- Increase temperature (edit llm.ts line 268, 344)
- Use a better model
- This indicates model quality issue, not code issue

## Expected Conversation Flow

### Good Example (PASS)
```
[USER] hello
[GUIDE] Hello. Connection established.

[USER] testing
[GUIDE] Test received. Systems nominal.

[USER] my name is Sam
[GUIDE] Noted, Sam. Welcome to the network.

[USER] what's my name?
[GUIDE] Sam. Memory intact.

[USER] goodbye
[GUIDE] Disconnecting. Stay safe.
```
✅ Different responses, contextually aware, remembers name

### Bad Example (FAIL - Before Fix)
```
[USER] hello
[GUIDE] Welcome. I'm your guide through this experience.

[USER] testing
[GUIDE] Welcome. I'm your guide through this experience.

[USER] what's my name?
[GUIDE] Welcome. I'm your guide through this experience.
```
❌ Identical responses, no context awareness

## Browser Console Debugging

Open Developer Tools (F12) and check Console tab:

**Good Signs:**
- No red error messages
- Successful fetch requests to `/api/dialogue/stream`
- SSE events arriving with `data:` prefix

**Bad Signs:**
- CORS errors (backend not running or wrong URL)
- 500 Internal Server Error (check backend logs)
- Network timeouts (Ollama not responding)

## Backend Console Debugging

Watch the backend terminal for:

**Good Signs:**
```
[LLMService] streamDialogue initiated for scene: chat
[LLMService] Sending streaming request to: http://localhost:11434/api/generate
[SessionMemory] Saved session test-session-...
```

**Warning Signs:**
```
[LLM] Duplicate response detected, regenerating...
⚠️  Fallback triggered
```
This is OK occasionally but should not happen every time.

**Bad Signs:**
```
LLM API error: ECONNREFUSED
Error: Failed to generate LLM response
[LLMService] Streaming failed: ...
```
These indicate Ollama connectivity issues.

## Performance Expectations

### Response Times
- **First message**: 2-10 seconds (model loading)
- **Subsequent messages**: 1-3 seconds
- **Streaming**: Should see text appear word-by-word

### Memory Usage
- Frontend: ~50-100 MB
- Backend: ~100-200 MB
- Ollama: 2-8 GB (depends on model)

## Success Checklist

After testing, verify:

- [ ] UI loads without errors
- [ ] Initial greeting appears
- [ ] Can send 5+ messages successfully
- [ ] Each response is unique
- [ ] Responses relate to user input
- [ ] Name memory works (if tested)
- [ ] No console errors
- [ ] Streaming works smoothly
- [ ] Visual feed updates (emotion/status)
- [ ] No backend crashes

## Next Steps

If all tests pass:
- ✅ Chatbot is working correctly in the UI
- ✅ Short-term memory is functional
- ✅ Deduplication is active
- ✅ Safe fallbacks are in place

If tests fail:
1. Check backend logs for errors
2. Verify Ollama connectivity
3. Try with a different model
4. Check CORS settings
5. Review browser console errors
6. Consult CHATBOT_FIXES.md for technical details
