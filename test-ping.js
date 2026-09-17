/**
 * test-ping.js
 * 
 * Helper simulation script to test Bot A's /ping endpoint and validation logic.
 * Run with: node test-ping.js
 */

require('dotenv').config();
const http = require('http');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const SECRET_TOKEN = process.env.SECRET_TOKEN || 'test-secret-token';

function sendRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            data: JSON.parse(responseData)
          });
        } catch {
          resolve({
            statusCode: res.statusCode,
            data: responseData
          });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log(`\n🧪 Testing Bot A endpoints at http://${HOST}:${PORT}...\n`);

  // Test 1: Valid ping from Bot B
  try {
    console.log('Test 1: Sending valid ping for "Bot B"...');
    const res1 = await sendRequest('/ping', 'POST', {
      bot_name: 'Bot B',
      secret_token: SECRET_TOKEN
    });
    console.log(`-> Response [${res1.statusCode}]:`, res1.data);
  } catch (err) {
    console.error('-> Test 1 Failed:', err.message);
  }

  // Test 2: Invalid secret token
  try {
    console.log('\nTest 2: Sending ping with invalid secret token (expected 403)...');
    const res2 = await sendRequest('/ping', 'POST', {
      bot_name: 'Bot C',
      secret_token: 'wrong-token-value'
    });
    console.log(`-> Response [${res2.statusCode}]:`, res2.data);
  } catch (err) {
    console.error('-> Test 2 Failed:', err.message);
  }

  // Test 3: Missing bot name
  try {
    console.log('\nTest 3: Sending ping without bot_name (expected 400)...');
    const res3 = await sendRequest('/ping', 'POST', {
      secret_token: SECRET_TOKEN
    });
    console.log(`-> Response [${res3.statusCode}]:`, res3.data);
  } catch (err) {
    console.error('-> Test 3 Failed:', err.message);
  }

  // Test 4: Check /status endpoint
  try {
    console.log('\nTest 4: Checking GET /status...');
    const res4 = await sendRequest('/status', 'GET', {});
    console.log(`-> Response [${res4.statusCode}]:`, JSON.stringify(res4.data, null, 2));
  } catch (err) {
    console.error('-> Test 4 Failed:', err.message);
  }

  console.log('\n✅ Tests complete!\n');
}

runTests();
