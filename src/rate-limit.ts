export type RateDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: {
  limit: number;
  windowMs: number;
  now?: () => number;
}) {
  const state = new Map<string, { count: number; resetAt: number }>();

  return (key: string): RateDecision => {
    const time = now();

    state.forEach((item, itemKey) => {
      if (item.resetAt <= time) {
        state.delete(itemKey);
      }
    });

    const item = state.get(key);
    if (!item) {
      state.set(key, { count: 1, resetAt: time + windowMs });
      return { allowed: true };
    }
    const { count, resetAt } = item;
    if (count >= limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - time) / 1000)),
      };
    }
    state.set(key, { count: count + 1, resetAt });
    return { allowed: true };
  };
}
