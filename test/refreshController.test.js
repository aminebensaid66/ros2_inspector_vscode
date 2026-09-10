'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const { RefreshCoordinator } = require('../src/refreshController');
test('refresh generations monotonically increase and supersede previous run', () => { const c = new RefreshCoordinator(); const a = c.begin(); const b = c.begin(); assert.equal(a.signal.aborted, true); assert.equal(b.generation, a.generation + 1); assert.equal(c.isCurrent(a.generation), false); assert.equal(c.isCurrent(b.generation), true); });
test('disposing coordinator cancels active process', () => { const c = new RefreshCoordinator(); const run = c.begin(); c.dispose(); assert.equal(run.signal.aborted, true); });
