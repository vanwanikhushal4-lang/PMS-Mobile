import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeWorkspace } from '../src/scm/workspace-contract.ts';

const status = { status: 'Assigned', count: 2 };
const update = { incidentId: 'INC-381', status: 'Assigned', date: '2026-11-03T09:18:00', message: null };
const response = (statuses = [status], activity = [update]) => ({ kind: 'workspace', statuses, activity });

test('workspace totals are derived from the counts, including an unknown status', () => {
  const statuses = [status, { status: null, count: 1 }];
  assert.deepEqual(decodeWorkspace(response(statuses)), { total: 3, statuses, activity: [update] });
  assert.deepEqual(decodeWorkspace(response([], [])), { total: 0, statuses: [], activity: [] });
});

test('workspace rejects duplicate incident IDs or statuses, unsafe counts and invalid dates', () => {
  assert.equal(decodeWorkspace(response([status, status])), null);
  assert.equal(decodeWorkspace(response([status, { status: 'Other', count: Number.MAX_SAFE_INTEGER }])), null);
  assert.equal(decodeWorkspace(response([status], [update, update])), null);
  assert.equal(decodeWorkspace(response([status], [{ ...update, date: '2026-02-31T09:18:00' }])), null);
  assert.equal(decodeWorkspace(response([status], [{ ...update, date: '2026-11-03T09:18:00Z' }])), null);
  assert.equal(decodeWorkspace(response([status], [{ ...update, date: null }])).activity[0].date, null);
});
