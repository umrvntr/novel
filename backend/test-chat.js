/**
 * Manual test script for chatbot stabilization
 * Tests 5 sequential messages to verify:
 * - Responses vary each time
 * - Assistant responds to latest user message
 * - Memory is maintained within session
 */

import axios from 'axios';

const API_URL = 'http://localhost:5174';
let sessionId = 'test-session-' + Date.now();

async function testChat() {
  console.log('=== CHATBOT STABILIZATION TEST ===\n');
  console.log(`Session ID: ${sessionId}\n`);

  // Initialize session
  try {
    const initRes = await axios.post(`${API_URL}/api/init-session`, {
      ip: '127.0.0.1'
    });
    console.log('✓ Session initialized\n');
  } catch (e) {
    console.log('Note: Session init failed (may not be required)\n');
  }

  // Test messages
  const testMessages = [
    'hello',
    'testing',
    'what is your name',
    'can you remember what I said',
    'goodbye'
  ];

  for (let i = 0; i < testMessages.length; i++) {
    const userInput = testMessages[i];
    console.log(`\n--- Test ${i + 1}/5 ---`);
    console.log(`USER: ${userInput}`);

    try {
      const response = await axios.post(`${API_URL}/api/dialogue`, {
        sceneId: 'test_scene',
        sessionId: sessionId,
        userInput: userInput,
        flags: { curious: 0, cautious: 0, goal_oriented: 0 },
        history: []
      });

      const assistantText = response.data.text;
      console.log(`ASSISTANT: ${assistantText}`);

      // Validate response
      if (!assistantText || assistantText.length === 0) {
        console.log('❌ FAIL: Empty response');
      } else if (assistantText === 'Got it. What would you like to try next?') {
        console.log('⚠️  FALLBACK: Safe fallback response triggered');
      } else {
        console.log('✓ PASS: Valid response received');
      }

      // Wait between messages
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Data: ${JSON.stringify(error.response.data)}`);
      }
    }
  }

  console.log('\n=== TEST COMPLETE ===\n');
}

// Run test
testChat().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
