import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRateLimiter } from '../../src/rate-limit.ts';

const clock = (start = 0) => {
  let at = start;
  return { now: () => at, advance: (ms: number) => (at += ms) };
};

void test('allows up to the limit, then reports whole seconds until the window ends', () => {
  const c = clock();
  const hit = createRateLimiter({ limit: 2, windowMs: 60_000, now: c.now });
  assert.deepEqual(hit('a'), { allowed: true });
  assert.deepEqual(hit('a'), { allowed: true });
  c.advance(500);
  assert.deepEqual(hit('a'), { allowed: false, retryAfterSeconds: 60 });
  c.advance(59_000);
  assert.deepEqual(hit('a'), { allowed: false, retryAfterSeconds: 1 });
});

void test('retry-after is never below one second', () => {
  const c = clock();
  const hit = createRateLimiter({ limit: 1, windowMs: 1000, now: c.now });
  hit('a');
  c.advance(999);
  assert.deepEqual(hit('a'), { allowed: false, retryAfterSeconds: 1 });
});

void test('keys are counted separately', () => {
  const hit = createRateLimiter({ limit: 1, windowMs: 1000, now: clock().now });
  assert.deepEqual(hit('a'), { allowed: true });
  assert.deepEqual(hit('b'), { allowed: true });
  assert.equal(hit('a').allowed, false);
});

void test('a new window opens exactly when the old one ends', () => {
  const c = clock();
  const hit = createRateLimiter({ limit: 1, windowMs: 1000, now: c.now });
  hit('a');
  c.advance(1000);
  assert.deepEqual(hit('a'), { allowed: true });
  c.advance(999);
  assert.equal(hit('a').allowed, false);
});

void test('an allowed request does not extend the window', () => {
  const c = clock();
  const hit = createRateLimiter({ limit: 2, windowMs: 1000, now: c.now });
  hit('a');
  c.advance(900);
  hit('a');
  c.advance(100);
  assert.deepEqual(hit('a'), { allowed: true });
});
