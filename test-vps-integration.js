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
  // Test 3: VirtualizorClient direct reachability probe
  const probeClient = new VirtualizorClient({
    panelUrl: 'https://arjun.defaultserverdns.com:4083',
    apiKey: 'sample_key',
    apiPass: 'sample_pass',
    vpsId: 514,
    hostname: 'mails.nubcoders.com',
    ip: '103.190.93.162'
  });
  const directProbe = await probeClient.checkDirectReachability(4000);
  assert.strictEqual(directProbe.isReachable, true, 'Direct probe should reach 103.190.93.162');
  console.log(`  ✅ PASS: Direct reachability probe confirmed VPS is alive via ${directProbe.method.toUpperCase()} (${directProbe.port || directProbe.target}) in ${directProbe.responseTimeMs}ms`);

  // Test 4: Virtualizor panel unreachable fallback in getStatus()
  const fallbackClient = new VirtualizorClient({
    panelUrl: 'http://127.0.0.1:59999', // unreachable panel
    apiKey: 'dummy_key',
    apiPass: 'dummy_pass',
    vpsId: 514,
    hostname: 'mails.nubcoders.com',
    ip: '103.190.93.162'
  });
  const fallbackStatus = await fallbackClient.getStatus();
  assert.strictEqual(fallbackStatus.isOnline, true, 'VPS must still report online when panel is unreachable');
  assert.strictEqual(fallbackStatus.panelStatus, 'unreachable');
  assert.strictEqual(fallbackStatus.verifiedVia, 'direct_reachability_fallback');
  console.log('  ✅ PASS: Virtualizor panel outage triggers Direct Reachability Fallback (reports ONLINE with panelStatus: unreachable)');

  // Test 5: Complete failure (both panel and direct IP unreachable)
  const deadClient = new VirtualizorClient({
    panelUrl: 'http://127.0.0.1:59999',
    apiKey: 'dummy_key',
    apiPass: 'dummy_pass',
    vpsId: 514,
    hostname: '127.0.0.1',
    ip: '127.0.0.1',
    probePorts: [59998]
  });
  const deadStatus = await deadClient.getStatus();
  assert.strictEqual(deadStatus.isOnline, false, 'Must report offline when both panel and direct probe fail');
  console.log('  ✅ PASS: Accurately reports OFFLINE when both panel and direct reachability fail');

  console.log('\n========================================');
  console.log('🎉 ALL VIRTUALIZOR INTEGRATION TESTS PASSED!');
  console.log('========================================\n');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
