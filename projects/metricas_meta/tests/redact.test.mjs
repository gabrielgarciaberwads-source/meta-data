import test from 'node:test';
import assert from 'node:assert/strict';
import { redact, redactText } from '../src/redact.mjs';
import { createPresentonClient } from '../src/presenton-client.mjs';
import { sanitize } from '../scripts/instagram-present.mjs';

const secretValues = ['token-value', 'access-value', 'auth-value', 'authorization-value', 'api-value', 'secret-value', 'metric-value'];

test('redacts sensitive keys and values recursively', () => {
  const output = JSON.stringify(redact({
    token: secretValues[0],
    access_token: secretValues[1],
    auth_token: secretValues[2],
    authorization: secretValues[3],
    api_key: secretValues[4],
    secret: secretValues[5],
    values: secretValues[6],
    safe: 'retained',
  }));

  assert.match(output, /retained/);
  for (const secret of secretValues) assert.doesNotMatch(output, new RegExp(secret));
});

test('redacts sensitive text in CLI and Presenton-style errors', () => {
  const input = 'token=token-value access_token:access-value auth_token=auth-value authorization="authorization-value" api_key=api-value secret=secret-value values=["metric-value"] Bearer bearer-value';
  for (const output of [redactText(input), sanitize(input)]) {
    assert.match(output, /REDACTED/);
    for (const secret of [...secretValues, 'bearer-value']) assert.doesNotMatch(output, new RegExp(secret));
  }
});

test('does not expose credential-shaped fields in Presenton HTTP errors', async () => {
  const client = createPresentonClient({
    baseUrl: 'http://localhost:5000',
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({
        token: secretValues[0],
        access_token: secretValues[1],
        auth_token: secretValues[2],
        authorization: secretValues[3],
        api_key: secretValues[4],
        secret: secretValues[5],
        values: secretValues[6],
      }),
    }),
  });

  await assert.rejects(() => client.generate({}), (error) => {
    for (const secret of secretValues) assert.doesNotMatch(error.message, new RegExp(secret));
    return true;
  });
});
