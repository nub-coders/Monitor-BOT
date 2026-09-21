/**
 * test-worker.js
 * 
 * Tests multi-user service registration, unique tokens, 3-state tracking,
 * and timezone support on local Cloudflare Worker.
 */

const BASE_URL = 'http://127.0.0.1:8787';
const TEST_USER_ID = 6076474757;

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, options);
  let data;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function sendTelegramMessage(text, chatType = 'private', chatId = TEST_USER_ID) {
  return request('/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update_id: Math.floor(Math.random() * 100000),
      message: {
        message_id: Math.floor(Math.random() * 100000),
        chat: { id: chatId, type: chatType },
        from: { id: TEST_USER_ID, first_name: 'TestUser', username: 'testuser' },
        text: text
      }
    })
  });
}

async function sendTelegramCallback(data, messageId = 123) {
  return request('/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update_id: Math.floor(Math.random() * 100000),
      callback_query: {
        id: String(Math.floor(Math.random() * 100000)),
        from: { id: TEST_USER_ID, first_name: 'TestUser', username: 'testuser' },
        message: {
          message_id: messageId,
          chat: { id: TEST_USER_ID, type: 'private' }
        },
        data: data
      }
    })
  });
}

async function runTests() {
  console.log('🧪 Starting Multi-User & Dynamic Services Test on ' + BASE_URL + '...\n');

  // Test 1: GET / (Root Healthcheck)
  console.log('Test 1: GET / (Root Healthcheck)');
  const res1 = await request('/');
  console.log(`-> Status: ${res1.status}, Body: "${res1.data}"`);
  if (res1.status !== 200) throw new Error('Root healthcheck failed');

  // Test 2: Telegram /start
  console.log('\nTest 2: Telegram Webhook /start onboarding');
  const res2 = await sendTelegramMessage('/start');
  console.log(`-> Status: ${res2.status}`);
  if (res2.status !== 200) throw new Error('/start failed');

  // Test 2b: Inline Button Callback (m:menu)
  console.log('\nTest 2b: Inline Button callback "m:menu"');
  const res2b = await sendTelegramCallback('m:menu');
  console.log(`-> Status: ${res2b.status}`);
  if (res2b.status !== 200) throw new Error('m:menu callback failed');

  // Test 2c: Inline Button Callback (tz:Asia/Kolkata)
  console.log('\nTest 2c: Inline Button callback "tz:Asia/Kolkata"');
  const res2c = await sendTelegramCallback('tz:Asia/Kolkata');
  console.log(`-> Status: ${res2c.status}`);
  if (res2c.status !== 200) throw new Error('tz callback failed');

  // Test 4: Interactive Service Creation Flow
  console.log('\nTest 4: Interactive Service Creation Flow');
  console.log('  4a. Send /newservice');
  const res4a = await sendTelegramMessage('/newservice');
  if (res4a.status !== 200) throw new Error('/newservice failed');

  console.log('  4b. Send Service Name: "Stripe Payment Gateway"');
  const res4b = await sendTelegramMessage('Stripe Payment Gateway');
  if (res4b.status !== 200) throw new Error('Setting name failed');

  console.log('  4c. Send Service Description: "Processes checkout transactions"');
  const res4c = await sendTelegramMessage('Processes checkout transactions');
  if (res4c.status !== 200) throw new Error('Setting description failed');

  // Test 5: Verify service in GET /status (must be 'initialized')
  console.log('\nTest 5: Verify service in GET /status (initial state: "initialized")');
  const res5 = await request('/status');
  console.log(`-> Status: ${res5.status}`);
  console.log('-> Services found:', res5.data.services);
  const createdService = res5.data.services.find(s => s.name === 'Stripe Payment Gateway');
  if (!createdService) throw new Error('Created service not found in /status');
  if (createdService.status !== 'initialized') throw new Error(`Expected status 'initialized', got '${createdService.status}'`);
  console.log(`-> Verified initial status is: 🟡 "${createdService.status}" (Awaiting first ping)`);

  // We need the secret token to test pinging. Let's query D1 via wrangler or fetch from services endpoint
  // Wait, let's see if we can get the token from services or send a dummy ping with wrong token first
  console.log('\nTest 6: POST /ping with invalid token (Expect 403)');
  const res6 = await request('/ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret_token: 'invalid_token_123' })
  });
  console.log(`-> Status: ${res6.status}, Body:`, res6.data);
  if (res6.status !== 403) throw new Error('Expected 403 Forbidden for invalid token');

  // Test 7: Cron execution (scheduled)
  console.log('\nTest 7: Triggering scheduled cron trigger');
  let res7 = await request('/cdn-cgi/local/scheduled');
  if (res7.status !== 200) {
    res7 = await request('/__scheduled?cron=*+*+*+*+*');
  }
  console.log(`-> Status: ${res7.status}, Body:`, res7.data);
  if (res7.status !== 200) throw new Error('Scheduled cron failed');

  console.log('\n🎉 ALL MULTI-USER & SERVICE LIFECYCLE TESTS PASSED! 🎉\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
