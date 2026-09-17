/**
 * Automated test suite for Bot A monitoring server logic.
 * Verifies:
 * - Constant-time secret token validation
 * - POST /ping endpoint (valid, invalid token 403, missing name 400)
 * - GET /status endpoint
 * - Outage detection logic (>10 mins inactivity triggers alert flag)
 * - Single-alert guard (prevents repeated spamming during continuous outage)
 * - Recovery detection upon next successful ping
 */

const assert = require('assert');
const http = require('http');

// Set dummy env variables before requiring index.js
process.env.PORT = '3005';
process.env.HOST = '127.0.0.1';
process.env.SECRET_TOKEN = 'super-secret-passphrase-123';
process.env.CHECK_INTERVAL_MS = '60000';
process.env.TIMEOUT_THRESHOLD_MS = '600000'; // 10 minutes
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.MY_CHAT_ID = '';

const { app, botRegistry, checkBotsHealth, isValidSecretToken } = require('./index');

function makeRequest(options, postBody) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (postBody) {
      req.write(JSON.stringify(postBody));
    }
    req.end();
  });
}

async function runVerification() {
  console.log('--- Starting Bot A Automated Verification ---');

  // 1. Test token comparison helper
  console.log('Checking token verification logic...');
  assert.strictEqual(isValidSecretToken('abc', 'abc'), true, 'Identical tokens must match');
  assert.strictEqual(isValidSecretToken('abc', 'abcd'), false, 'Different lengths must fail');
  assert.strictEqual(isValidSecretToken('abc', 'xyz'), false, 'Different tokens must fail');
  assert.strictEqual(isValidSecretToken(null, 'xyz'), false, 'Null token must fail');
  console.log('✔ Token verification tests passed.');

  // 2. Start temporary HTTP test server
  const testPort = 3005;
  const testServer = http.createServer(app);

  await new Promise((resolve) => testServer.listen(testPort, '127.0.0.1', resolve));
  console.log(`✔ Test server listening on 127.0.0.1:${testPort}`);

  try {
    // 3. Test POST /ping with valid token
    console.log('Testing POST /ping (Valid)...');
    const validRes = await makeRequest({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/ping',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      bot_name: 'Bot B',
      secret_token: 'super-secret-passphrase-123'
    });

    assert.strictEqual(validRes.status, 200, 'Expected 200 for valid ping');
    assert.strictEqual(validRes.body.status, 'success');
    console.log('✔ Valid /ping returned 200 OK');

    // 4. Test POST /ping with invalid token (403)
    console.log('Testing POST /ping (Invalid Token)...');
    const invalidTokenRes = await makeRequest({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/ping',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      bot_name: 'Bot B',
      secret_token: 'wrong-token'
    });

    assert.strictEqual(invalidTokenRes.status, 403, 'Expected 403 for invalid token');
    console.log('✔ Invalid token correctly rejected with 403 Forbidden');

    // 5. Test POST /ping with missing bot_name (400)
    console.log('Testing POST /ping (Missing bot_name)...');
    const missingNameRes = await makeRequest({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/ping',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      secret_token: 'super-secret-passphrase-123'
    });

    assert.strictEqual(missingNameRes.status, 400, 'Expected 400 for missing bot_name');
    console.log('✔ Missing bot_name correctly rejected with 400 Bad Request');

    // 6. Test GET /status
    console.log('Testing GET /status...');
    const statusRes = await makeRequest({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/status',
      method: 'GET'
    });

    assert.strictEqual(statusRes.status, 200, 'Expected 200 for GET /status');
    assert(Array.isArray(statusRes.body.bots), 'Expected bots array in status response');
    const botB = statusRes.body.bots.find(b => b.bot_name === 'Bot B');
    assert(botB, 'Bot B should exist in registry');
    assert.strictEqual(botB.status, 'healthy');
    console.log('✔ GET /status returned accurate bot list and health states');

    // 7. Test Outage & Alert Logic
    console.log('Testing Outage Detection (> 10 mins without ping)...');
    const targetBot = botRegistry.get('Bot C');
    assert(targetBot, 'Bot C must be in registry');

    // Artificially simulate last ping 12 minutes ago (exceeding 10m threshold)
    targetBot.lastPing = Date.now() - (12 * 60 * 1000);
    targetBot.alertSent = false;
    targetBot.status = 'healthy';

    // Trigger health check loop manually
    checkBotsHealth();

    assert.strictEqual(targetBot.status, 'down', 'Bot C should be marked as down');
    assert.strictEqual(targetBot.alertSent, true, 'alertSent flag should be set to true');
    console.log('✔ Outage detected and alertSent flag set.');

    // Trigger second health check loop immediately; alertSent must stay true and not re-alert
    console.log('Testing Single-Alert Guard (no re-alerting while still down)...');
    checkBotsHealth();
    assert.strictEqual(targetBot.alertSent, true, 'alertSent flag should remain true');
    console.log('✔ Single-alert guard verified.');

    // 8. Test Recovery when bot pings again
    console.log('Testing Bot Recovery upon check-in...');
    const recoveryRes = await makeRequest({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/ping',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      bot_name: 'Bot C',
      secret_token: 'super-secret-passphrase-123'
    });

    assert.strictEqual(recoveryRes.status, 200);
    assert.strictEqual(targetBot.status, 'healthy', 'Status should return to healthy');
    assert.strictEqual(targetBot.alertSent, false, 'alertSent should reset to false');
    console.log('✔ Recovery check-in resets outage status and alert flag.');

    // 9. Test Custom Domain Auto-Detection
    console.log('Testing Custom Domain Auto-Detection via incoming request headers...');
    const { getPublicUrl } = require('./index');
    await makeRequest({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/status',
      method: 'GET',
      headers: {
        'x-forwarded-host': 'bots.nubcoders.com',
        'x-forwarded-proto': 'https'
      }
    });
    assert.strictEqual(getPublicUrl(), 'https://bots.nubcoders.com', 'Public URL should auto-update to custom domain');
    console.log('✔ Custom domain successfully auto-detected:', getPublicUrl());

    console.log('\n🎉 ALL BOT A VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉\n');
  } finally {
    testServer.close();
  }
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
