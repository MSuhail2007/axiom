// Optional smoke test against the already running app; Photon is disabled to avoid cache writes.
import assert from 'node:assert/strict';
import {resolvePlaces} from '../client.mjs';
const results = await resolvePlaces('Madras, Bombay', 'names', false, AbortSignal.timeout(15000));
assert.equal(results.length, 2);
assert.equal(results[0].selected?.name, 'Chennai');
assert.equal(results[1].selected?.name, 'Mumbai');
console.log('Existing local API verified: Madras → Chennai; Bombay → Mumbai.');
