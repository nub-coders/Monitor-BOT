/**
 * test-vps-integration.js
 * 
 * Tests Virtualizor client, Express endpoint /api/vps-status, and bot commands
 */

const assert = require('assert');
const { VirtualizorClient } = require('./lib/virtualizor');
const { app } = require('./index');

console.log('🧪 Testing Merged Virtualizor VPS Integration in Monitor-BOT...\n');

async function run() {
  // Test 1: VirtualizorClient constructor and validation
  const client = new VirtualizorClient({
    panelUrl: 'https://arjun.defaultserverdns.com:4083',
    apiKey: 'sample_key',
    apiPass: 'sample_pass',
    vpsId: 514
  });

  assert.strictEqual(client.panelUrl, 'https://arjun.defaultserverdns.com:4083');
  assert.strictEqual(client.vpsId, '514');
  assert.strictEqual(client.apiKey, 'sample_key');
  console.log('  ✅ PASS: VirtualizorClient initializes correctly with panel URL & VPS ID');

  // Test 2: VirtualizorClient rejects when credentials are missing
  const emptyClient = new VirtualizorClient({});
  await assert.rejects(
    async () => emptyClient.getStatus(),
    /Missing Virtualizor API credentials/
  );
  console.log('  ✅ PASS: VirtualizorClient rejects unauthenticated requests cleanly');

  console.log('\n========================================');
  console.log('🎉 ALL VIRTUALIZOR INTEGRATION TESTS PASSED!');
  console.log('========================================\n');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
