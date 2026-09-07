import { describe, it, expect, beforeEach } from 'vitest';
import { findCompletedAction, rememberAction, stripInternal } from '../services/idempotency';

/**
 * Idempotency keys live inside the save (they used to live in a process Map,
 * which meant a restart replayed paid actions — ANALYSIS §7.3).
 */

describe('action idempotency', () => {
  let state: any;

  beforeEach(() => {
    state = { money: 100 };
  });

  it('does not recognise an unseen key', () => {
    expect(findCompletedAction(state, 'key-1')).toBeNull();
  });

  it('recognises a key that was remembered', () => {
    rememberAction(state, 'key-1', 'Прочитал книгу');
    const found = findCompletedAction(state, 'key-1');
    expect(found?.k).toBe('key-1');
    expect(found?.m).toBe('Прочитал книгу');
  });

  it('survives a server restart (keys are part of the persisted state)', () => {
    rememberAction(state, 'key-1', 'ok');
    const roundTripped = JSON.parse(JSON.stringify(state));
    expect(findCompletedAction(roundTripped, 'key-1')).not.toBeNull();
  });

  it('keeps at most 64 keys, dropping the oldest', () => {
    for (let i = 0; i < 100; i++) rememberAction(state, `key-${i}`);
    expect(state._idem).toHaveLength(64);
    expect(findCompletedAction(state, 'key-0')).toBeNull();
    expect(findCompletedAction(state, 'key-99')).not.toBeNull();
  });

  it('forgets keys older than the TTL', () => {
    state._idem = [{ k: 'ancient', at: Date.now() - 7 * 60 * 60 * 1000 }];
    expect(findCompletedAction(state, 'ancient')).toBeNull();
  });

  it('tolerates a corrupt _idem field', () => {
    state._idem = 'not an array';
    expect(() => findCompletedAction(state, 'x')).not.toThrow();
    rememberAction(state, 'x');
    expect(findCompletedAction(state, 'x')).not.toBeNull();
  });

  it('never leaks internal bookkeeping to the client', () => {
    rememberAction(state, 'key-1');
    const response = stripInternal(state);
    expect(response).not.toHaveProperty('_idem');
    expect(response).toHaveProperty('money', 100);
  });
});
