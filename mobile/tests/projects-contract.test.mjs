import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeProjectRecords, decodeProjects } from '../src/scm/projects-contract.ts';

const item = (id) => ({ id, name: 'Project', customer: '', function: '', responsibility: '', suite: '', tool: '', reference: '', favorite: false });

test('project pages require a descending, unique list with a consistent cursor', () => {
  const items = Array.from({ length: 30 }, (_, index) => item(100 - index));
  assert.deepEqual(decodeProjects({ kind: 'projects', items, next: 71 }), { items, next: 71 });
  assert.equal(decodeProjects({ kind: 'projects', items, next: 70 }), null);
  assert.equal(decodeProjects({ kind: 'projects', items: [item(2), item(2)], next: null }), null);
  assert.equal(decodeProjects({ kind: 'projects', items: [item(1), item(2)], next: null }), null);
});

test('a linked project record has one bounded group per document or meeting category', () => {
  const empty = { items: [], hasMore: false };
  const record = { id: 61, reference: 'RD-61', date: '2026-11-12', status: 'Approved', format: '' };
  const body = { kind: 'project-records', projectId: 44, requirements: { items: [record], hasMore: false }, understanding: empty, kickoff: empty };
  assert.equal(decodeProjectRecords(body).requirements.items[0].reference, 'RD-61');
  assert.equal(decodeProjectRecords({ ...body, projectId: '44' }), null);
  assert.equal(decodeProjectRecords({ ...body, kickoff: { ...empty, hasMore: true } }), null);
});
