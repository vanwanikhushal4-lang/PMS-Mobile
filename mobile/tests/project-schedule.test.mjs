import assert from 'node:assert/strict';
import { test } from 'node:test';
import { taskSchedule } from '../src/scm/project-schedule.ts';

test('the timeline sorts legacy and ISO dates while keeping partial ranges visible', () => {
  const tasks = [
    { id: 3, start: '', due: '2026-11-21' },
    { id: 2, start: '16.11.2026', due: '20-11-2026' },
    { id: 1, start: '13/11/2026', due: '' },
  ];
  const schedule = taskSchedule(tasks);
  assert.deepEqual(schedule.rows.map(({ task }) => task.id), [1, 2, 3]);
  assert.equal(schedule.last - schedule.first, 8);
  assert.deepEqual(schedule.rows.map(({ last, first }) => last - first), [0, 4, 0]);
  assert.deepEqual(schedule.unscheduled, []);
});

test('impossible dates and reversed ranges do not render misleading timeline bars', () => {
  const tasks = [
    { id: 2, start: '29.02.2025', due: '31.11.2026' },
    { id: 1, start: '16.11.2026', due: '13.11.2026' },
  ];
  const schedule = taskSchedule(tasks);
  assert.deepEqual(schedule.rows, []);
  assert.deepEqual(schedule.unscheduled, tasks);
});
