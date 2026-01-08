# Testing Instructions - Chatbot Stabilization

## Prerequisites

1. Ollama must be running with a model loaded
2. Backend environment configured (`.env` file with `LLM_ENABLED=true`)

## Testing Steps

### Step 1: Start the Backend

```bash
cd backend
npm run dev
```

Wait for the message: `Server running on http://127.0.0.1:5174`

### Step 2: Run the Test Script (New Terminal)

```bash
cd backend
node test-chat.js
```

### Step 3: Review Test Results

The test will send 5 messages and display:
- Each user message
- Each assistant response
- Pass/fail status for each exchange

## Expected Results

### ✅ PASS Criteria
- Each response is different from the previous one
- Assistant acknowledges/responds to the specific user message
- No empty responses
- Response varies across the 5 messages

### ❌ FAIL Criteria
- Same response repeated multiple times
- Generic responses that don't relate to user input
- Empty or malformed responses
- Errors or timeouts

### Example PASS Output

```
=== CHATBOT STABILIZATION TEST ===

Session ID: test-session-1234567890

✓ Session initialized

--- Test 1/5 ---
USER: hello
ASSISTANT: Hello. How can I assist you?
✓ PASS: Valid response received

--- Test 2/5 ---
USER: testing
ASSISTANT: Testing received. What would you like to test?
✓ PASS: Valid response received

--- Test 3/5 ---
USER: what is your name
ASSISTANT: I'm V8, a neural interface AI.
✓ PASS: Valid response received

--- Test 4/5 ---
USER: can you remember what I said
ASSISTANT: You mentioned testing earlier.
✓ PASS: Valid response received

--- Test 5/5 ---
USER: goodbye
ASSISTANT: Goodbye. Session ending.
✓ PASS: Valid response received

=== TEST COMPLETE ===
```

### Example FAIL Output (Before Fix)

```
--- Test 1/5 ---
USER: hello
ASSISTANT: Welcome. I'm your guide through this experience.
✓ PASS: Valid response received

--- Test 2/5 ---
USER: testing
ASSISTANT: Welcome. I'm your guide through this experience.
❌ FAIL: Same response as before (should be different)

--- Test 3/5 ---
USER: what is your name
ASSISTANT: Welcome. I'm your guide through this experience.
❌ FAIL: Not responding to question
```

## Fallback Response

If you see this response:
```
ASSISTANT: Got it. What would you like to try next?
⚠️  FALLBACK: Safe fallback response triggered
```

This means:
- The LLM returned an empty or duplicate response
- The system is working correctly by providing a safe fallback
- Consider using a stronger model (mixtral, llama3) if this happens frequently

## Manual Testing (via Frontend)

1. Start both backend and frontend:
```bash
# Terminal 1
cd backend
npm run dev

# Terminal 2
cd frontend
npm run dev
```

2. Open browser to frontend URL
3. Send these test messages:
   - "hello"
   - "what's your name?"
   - "can you remember what I just said?"
   - "testing 123"
   - "goodbye"

4. Verify:
   - Each response is unique
   - Responses relate to your input
   - Bot remembers previous messages in the conversation

## Troubleshooting

### "Connection refused" or "ECONNREFUSED"
- Ensure Ollama is running: `ollama serve`
- Check LLM_ENDPOINT in .env matches Ollama port (default: 11434)

### "Model not found"
- Pull a model: `ollama pull llama2`
- Or use a model you have: update LLM_MODEL in .env

### All responses are fallback
- Check Ollama is responding: `curl http://localhost:11434/api/tags`
- Increase timeout in llm.ts if model is slow
- Try a smaller/faster model

### Responses are generic but different
- This is expected with weak models (llama2)
- Upgrade to stronger model: `ollama pull mixtral`
- Update .env: `LLM_MODEL=mixtral`

## Success Criteria

The chatbot is considered **stable** if:
1. ✅ Responds to 5 sequential messages with different outputs
2. ✅ At least 3/5 responses acknowledge the specific user input
3. ✅ No identical repeated responses
4. ✅ Fallback is used only on errors, not normal flow
5. ✅ Session memory persists across messages

## Next Steps After Testing

If tests pass:
- The chatbot is now **minimally functional and stable**
- Response quality depends on the LLM model used
- Frontend integration should work without changes

If tests fail:
- Check console logs for errors
- Verify session memory files are being created in `backend/data/sessions/`
- Check LLM API is accessible
- Review CHATBOT_FIXES.md for implementation details
