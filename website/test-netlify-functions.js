/**
 * Verifies Netlify Serverless Function Handlers
 */

const assert = require('assert');
const extractHandler = require('./netlify/functions/extract.js').handler;
const proxyHandler = require('./netlify/functions/proxy-image.js').handler;

async function testFunctions() {
  console.log('--- Testing Netlify Serverless Functions ---');

  // 1. extract options
  const optRes = await extractHandler({ httpMethod: 'OPTIONS' });
  assert.strictEqual(optRes.statusCode, 204);
  console.log('✓ extractHandler OPTIONS returns 204');

  // 2. extract missing url
  const noUrlRes = await extractHandler({ httpMethod: 'GET', queryStringParameters: {} });
  assert.strictEqual(noUrlRes.statusCode, 400);
  const json1 = JSON.parse(noUrlRes.body);
  assert.strictEqual(json1.success, false);
  console.log('✓ extractHandler missing url returns 400');

  // 3. extract invalid url
  const badUrlRes = await extractHandler({ httpMethod: 'GET', queryStringParameters: { url: 'https://example.com' } });
  assert.strictEqual(badUrlRes.statusCode, 400);
  const json2 = JSON.parse(badUrlRes.body);
  assert.strictEqual(json2.success, false);
  console.log('✓ extractHandler invalid url returns 400');

  // 4. proxy missing url
  const noProxyRes = await proxyHandler({ httpMethod: 'GET', queryStringParameters: {} });
  assert.strictEqual(noProxyRes.statusCode, 400);
  console.log('✓ proxyHandler missing url returns 400');

  console.log('All Netlify function tests passed!\n');
}

testFunctions().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
