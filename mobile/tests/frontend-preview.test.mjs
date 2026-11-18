import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthClient } from '../src/scm/auth-api.ts';
import { createFrontendPreview } from '../src/scm/frontend-preview.ts';
import { validKickoffTime } from '../src/scm/kickoff-contract.ts';

async function setup() {
  const preview = createFrontendPreview();
  const client = createAuthClient({ url: new URL('https://frontend-preview.invalid/mobile/v1/auth/'), fixture: true }, preview.request);
  const auth = await client.signIn({ companyCode: 'PREVIEW', username: 'preview', password: 'preview' });
  assert.equal(auth.kind, 'authenticated');
  return { preview, client, grant: auth.grant };
}

test('the offline preview supports browsing, search, bookmarks, and project creation through the real client decoders', async () => {
  const { client, grant } = await setup();
  const page = await client.projects(grant, {});
  assert.equal(page.items.length, 2);
  assert.equal((await client.projects(grant, { query: 'Harbor' })).items.length, 1);
  await client.setProjectFavorite(grant, 43, true);
  assert.equal((await client.projects(grant, { saved: true })).items.length, 2);
  const options = await client.projectCreateOptions(grant, {});
  const project = await client.createProject(grant, { name: 'Pilot rollout', context: options.contexts[0], function: options.functions[0],
    responsibility: options.responsibilities[0], requestKey: 'project-test-request-001' });
  assert.equal((await client.project(grant, project.id)).name, 'Pilot rollout');
  assert.equal((await client.projectRecords(grant, project.id)).understanding.items.length, 0);
  assert.equal((await client.profile(grant)).department, 'Projects');
  assert.equal((await client.workspace(grant)).total, 9);
});

test('review decisions persist into document detail and the correct queue in frontend preview', async () => {
  const { client, grant } = await setup();
  const queue = await client.documentReviewQueue(grant, 'understanding');
  const target = { id: 44, scope: 'understanding', recordId: queue.items[0].id };
  const before = await client.projectRecordDetail(grant, target);
  await client.reviewProjectRecord(grant, target, { decision: 'reject', revision: before.review.revision, reason: 'Clarify the pilot scope' });
  const after = await client.projectRecordDetail(grant, target);
  assert.equal(after.fields.rejectionReason, 'Clarify the pilot scope');
  assert.equal(after.review, null);
  assert.equal((await client.documentReviewQueue(grant, 'understanding')).items.length, 0);
  assert.equal((await client.documentReviewQueue(grant, 'understanding', undefined, undefined, 'rejected')).items.length, 1);
});

test('a preview kickoff can be opened from Records with its participant names and selected agenda, and retries reuse the meeting', async () => {
  const { client, preview, grant } = await setup();
  const signal = new AbortController().signal;
  const target = { id: 44, recordId: 71 };
  const options = await client.kickoffOptions(grant, target, undefined, signal);
  assert.equal(options.timeZone, 'Asia/Kolkata');
  const draft = { ...target, requestKey: 'meeting-test-request-001', mode: 'Virtual Mode', provider: 'teams', connection: 'https://teams.example.com/pilot',
    time: '2026-11-25T10:30', heads: [11], sales: [12], managers: [13] };
  const agenda = { name: 'Pilot agenda.pdf', uri: 'file:///preview/agenda.pdf', mimeType: 'application/pdf' };
  const meetingId = preview.schedule(draft, agenda, null);
  assert.equal(preview.schedule(draft, agenda, null), meetingId);
  const meetingTarget = { id: 44, scope: 'kickoff', recordId: meetingId };
  const meeting = await client.projectRecordDetail(grant, meetingTarget);
  assert.equal(meeting.fields.projectHead, 'Aditi Shah');
  assert.equal(meeting.fields.meetingLink, draft.connection);
  assert.equal((await client.projectRecords(grant, 44)).kickoff.items.length, 1);
  const attachments = await client.projectAttachments(grant, meetingTarget);
  assert.equal(attachments[0].name, agenda.name);
  assert.equal(preview.attachment(meetingTarget, attachments[0].kind).uri, agenda.uri);
  assert.equal((await client.kickoffOptions(grant, target)).kickoffStatus, 'Meeting Scheduled');
});

test('work logs, completion, publishing, and logout use the same frontend transport without a server', async () => {
  const { client, grant } = await setup();
  assert.equal((await client.myTasks(grant)).items.length, 2);
  await client.logProgress(grant, 206, 'Pilot users verified');
  assert.equal((await client.workLog(grant, 206)).items[0].note, 'Pilot users verified');
  await client.completeTask(grant, 206);
  assert.equal((await client.completedTasks(grant)).items.length, 2);
  const tasks = await client.projectTasks(grant, 44, {});
  assert.equal(tasks.items[0].status, 'Completed');
  assert.equal((await client.taskDates(grant, 205)).requestMode, 'schedule');
  assert.equal((await client.publishTree(grant, {})).items[0].label, 'Development');
  assert.equal((await client.publishOrder(grant, 910)).item.projectId, 44);
  await client.signOut(grant);
  await assert.rejects(client.session(grant), { code: 'expired' });
});

test('kickoff times reject impossible calendar dates and invalid clocks', () => {
  assert.equal(validKickoffTime('2028-02-29T14:30'), true);
  for (const value of ['2026-02-29T14:30', '2026-11-31T10:00', '2026-11-25T24:00', '2026-11-25T10:60', '25/11/2026 10:00']) {
    assert.equal(validKickoffTime(value), false, value);
  }
});

test('the frontend preview carries date proposals through approval and reflects bulk reassignment in task rows', async () => {
  const { client, grant } = await setup();
  const proposals = await Promise.all([206, 205].map(async (id) => ({ id, revision: (await client.taskDates(grant, id)).scheduleRevision,
    start: '2026-11-19', due: '2026-11-27', reason: 'Pilot window moved' })));
  await client.requestTaskDatesBatch(grant, proposals);
  const pending = await client.dateQueue(grant, 'review');
  assert.equal(pending.items.length, 2);
  await client.approveTaskDatesBatch(grant, pending.items.map((item) => ({ id: item.id, revision: item.dateReview.revision })));
  assert.equal((await client.dateQueue(grant, 'review')).items.length, 0);
  const approved = await client.taskDates(grant, 206);
  assert.equal(approved.due, '2026-11-27');
  assert.equal(approved.history[0].reason, 'Pilot window moved');
  const assignees = await client.assignees(grant, 206, false);
  await client.reassignTasks(grant, [206, 205].map((id) => ({ id, revision: assignees.revision, candidate: assignees.items[1].key })));
  assert.equal((await client.assignedTasks(grant)).items[0].developer, 'Dev Singh');
});
