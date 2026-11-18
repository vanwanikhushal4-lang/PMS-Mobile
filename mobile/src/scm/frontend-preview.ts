import type { AttachmentKind, AttachmentTarget } from './attachments-contract.ts';
import type { KickoffDraft } from './kickoff-contract.ts';
import type { Project, ProjectRecord, ProjectRecordScope } from './projects-contract.ts';
import type { AssignedTask, TaskContext, TaskDates } from './tasks-contract.ts';

// A client-only design preview. No requests leave this transport and all changes reset on reload.
type PreviewFile = { name: string; uri: string; mimeType?: string };
const token = 'frontend_preview_session_000000000000000';
const revision = 'p'.repeat(43);
const context: TaskContext = { customer: 'Riverside Works', suite: 'Service Operations', tool: 'VPN Access' };
const identity = { username: 'preview', displayName: 'Aditi Shah', companyCode: 'PREVIEW', companyName: 'Velox preview',
  role: 'MD', designation: 'Project director', capabilities: ['projects.read', 'projects.create', 'projects.publish',
    'projects.requirement-review', 'projects.understanding-review', 'projects.kickoff-schedule', 'tasks.assigned-by-me', 'tasks.create-standalone'] };
const participants = { heads: [{ id: 11, name: 'Aditi Shah' }], sales: [{ id: 12, name: 'Rohan Mehta' }],
  managers: [{ id: 13, name: 'Noor Paul' }, { id: 14, name: 'Dev Singh' }] };
const rooms = ['SecureIT - 901', 'ScanPlus - 906', 'AssetGrid - 908', 'Conference - 1st Floor'];

export function createFrontendPreview() {
  let signedIn = false;
  let sequence = 300;
  const projects: Project[] = [
    { id: 44, name: 'Riverside access rollout', ...context, function: 'Development', responsibility: 'Internal', reference: 'P-44', favorite: true },
    { id: 43, name: 'Harbor device rollout', customer: 'Harbor Clinic', suite: 'Endpoint Management', tool: 'Asset inventory',
      function: 'Implementation', responsibility: 'Internal', reference: 'P-43', favorite: false },
  ];
  const tasks: (AssignedTask & { projectId: number | null })[] = ['Validate access policies', 'Configure VPN profiles', 'Confirm rollout checklist'].map((module, index) => ({
    id: 206 - index, projectId: 44, module, ...context, status: index === 2 ? 'Completed' : 'In Progress',
    description: ['Review role mappings and the access policy before the pilot.', 'Configure the approved profiles for the pilot group.',
      'Record the launch checklist with the project team.'][index],
    lead: 'Aditi Shah', developer: 'Noor Paul', assigner: 'Aditi Shah', start: '2026-11-18', due: '2026-11-25',
    workLog: true, dateAccess: true, dateApproval: '', reassignable: true, reference: `T-${206 - index}`, priority: 'High',
    weight: '25', function: 'Development', responsibility: 'Internal', dateReview: null, assignedAt: '2026-11-18',
  }));
  const records: Record<ProjectRecordScope, ProjectRecord[]> = {
    requirement: [{ id: 61, reference: 'RD-61', date: '2026-11-16', status: 'RD Pending', format: '' }],
    understanding: [{ id: 72, reference: 'UD-72', date: '2026-11-18', status: 'UD Pending', format: '' },
      { id: 71, reference: 'UD-71', date: '2026-11-17', status: 'UD Approved By MD', format: '' }],
    kickoff: [],
  };
  const meetingFields = new Map<number, Record<string, string>>();
  const reviewFields = new Map<number, Record<string, string>>();
  const files = new Map<number, { agenda: PreviewFile; plan: PreviewFile | null }>();
  const receipts = new Map<string, number>();
  const logs = new Map<number, { id: number; date: string; note: string; status: string; author: string }[]>();
  const dates = new Map<number, TaskDates>(tasks.map((task) => [task.id, { taskId: task.id, start: task.start, due: task.due,
    approval: '', requestedStart: '', requestedDue: '', reason: '', revision: null, scheduleRevision: revision,
    requestMode: 'schedule', canApprove: false, history: [], hasMore: false }]));
  function proposeDates(id: number, input: Record<string, unknown>) {
    const task = tasks.find((row) => row.id === id), schedule = dates.get(id);
    if (!task || !schedule) return false;
    const pendingRevision = String(++sequence).padEnd(43, '_');
    Object.assign(schedule, { requestedStart: input.start ?? task.start, requestedDue: input.due, reason: input.reason,
      approval: 'Pending', revision: pendingRevision, scheduleRevision: pendingRevision, requestMode: 'none', canApprove: true });
    task.dateApproval = 'Pending';
    task.dateReview = { revision: pendingRevision, start: schedule.requestedStart, due: schedule.requestedDue, reason: schedule.reason, canApprove: true };
    return true;
  }
  function approveDates(id: number) {
    const task = tasks.find((row) => row.id === id), schedule = dates.get(id);
    if (!task || !schedule?.revision) return false;
    schedule.history.unshift({ id: ++sequence, start: task.start, due: task.due, revisedStart: schedule.requestedStart,
      revisedDue: schedule.requestedDue, reason: schedule.reason, by: identity.displayName, approvedAt: '2026-11-18' });
    task.start = schedule.requestedStart;
    task.due = schedule.requestedDue;
    task.dateApproval = 'Approved';
    task.dateReview = null;
    Object.assign(schedule, { start: task.start, due: task.due, approval: 'Approved', requestedStart: '', requestedDue: '', reason: '',
      revision: null, scheduleRevision: String(sequence).padEnd(43, '_'), requestMode: 'schedule', canApprove: false });
    return true;
  }
  const order = { id: 910, reference: 'PO-910', ...context, number: 'RW/2026/114', date: '2026-11-16', status: 'Approved' };
  const recordDetail = (scope: ProjectRecordScope, record: ProjectRecord) => ({ kind: 'project-record-detail', projectId: 44, scope,
    item: record, fields: scope === 'kickoff' ? meetingFields.get(record.id) ?? {} : {
      purchaseOrder: order.reference, submittedBy: 'Rohan Mehta', designation: 'Sales initiator', productManager: 'Noor Paul',
      function: 'Development', suite: context.suite, tool: context.tool, requirementReference: 'RD-61',
      description: 'Access rollout for the Riverside pilot group.', requirementNote: 'Confirm pilot users before launch.',
      projectDescription: 'Introduce managed VPN access for the Riverside team.', objectives: 'Give the pilot group secure remote access.',
      projectScope: 'Pilot users, managed devices, access policies, and handover.', functional: 'Role-based VPN access with managed profiles.',
      nonfunctional: 'Reliable connection and auditable access.', technical: 'Integrate with the existing directory.',
      start: '2026-11-18', end: '2026-11-25', teamLead: 'Aditi Shah', developers: 'Noor Paul, Dev Singh', ...reviewFields.get(record.id),
    }, ...(record.status.endsWith('Pending') ? { review: { revision, canReject: scope === 'understanding' } } : {}) });

  async function request(url: string, init: RequestInit) {
    if (init.signal?.aborted) throw new Error('Preview request canceled');
    const path = new URL(url).pathname.split('/mobile/v1/auth/')[1];
    const input = typeof init.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {};
    const response = (data: object | null, status = 200) => ({ ok: status >= 200 && status < 300, status, url,
      headers: new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }), json: async () => data });
    const missing = (reason: string) => response({ kind: 'rejected', reason }, 404);
    const session = () => ({ kind: 'authenticated', identity, sessionToken: token, expiresAt: Date.now() + 8 * 60 * 60_000 });
    if (path === 'sign-in') { signedIn = true; return response(session()); }
    if (!signedIn || new Headers(init.headers).get('authorization') !== `Bearer ${token}`) return response({ kind: 'rejected', reason: 'expired' }, 401);
    const id = Number(input.id);
    const project = projects.find((row) => row.id === id);
    const task = tasks.find((row) => row.id === id);
    const scope = input.scope as ProjectRecordScope;
    const record = records[scope]?.find((row) => row.id === input.recordId);
    const match = (text: string) => text.toLowerCase().includes(String(input.query ?? '').toLowerCase());
    const taskPage = (items: AssignedTask[]) => response({ kind: 'assigned-tasks', items: items.filter((item) => !input.before || item.id < Number(input.before)), next: null,
      ...(path === 'projects/tasks' ? { projectId: id } : {}), ...(path === 'projects/publishing/tasks' ? { orderId: id } : {}) });
    switch (path) {
      case 'session': return response(session());
      case 'sign-out': signedIn = false; return response(null, 204);
      case 'profile': return response({ kind: 'profile', email: 'aditi@example.com', phone: '', location: 'Mumbai', site: 'Head office', department: 'Projects', subdepartment: 'Delivery' });
      case 'workspace': return response({ kind: 'workspace', statuses: [{ status: 'Open', count: 4 }, { status: 'In Progress', count: 2 }, { status: 'Resolved', count: 3 }],
        activity: [{ incidentId: 'INC-1042', date: '2026-11-18T09:20:00', status: 'In Progress', message: 'Pilot access request is being reviewed.' }] });
      case 'projects/list': return response({ kind: 'projects', items: projects.filter((row) => (!input.saved || row.favorite)
        && (!input.before || row.id < Number(input.before)) && match([row.name, row.customer, row.reference].join(' '))), next: null });
      case 'projects/detail': return project ? response({ kind: 'project', item: project }) : missing('project-not-found');
      case 'projects/favorite':
        if (!project) return missing('project-not-found');
        project.favorite = input.favorite === true;
        return response({ kind: 'project-favorite', projectId: id, favorite: project.favorite });
      case 'projects/create-options': return response({ kind: 'project-create-options', contexts: [context], functions: ['Development', 'Implementation'],
        responsibilities: ['Internal', 'External'], moreContexts: false, moreFunctions: false });
      case 'projects/create': {
        const item: Project = { id: ++sequence, name: String(input.name).trim(), ...input.context as TaskContext,
          function: String(input.function), responsibility: String(input.responsibility), reference: `P-${sequence}`, favorite: false };
        projects.unshift(item);
        return response({ kind: 'project-created', item });
      }
      case 'projects/records': {
        if (!project) return missing('project-not-found');
        const group = (key: ProjectRecordScope) => ({ items: id === 44 ? records[key] : [], hasMore: false });
        return response({ kind: 'project-records', projectId: id, requirements: group('requirement'), understanding: group('understanding'), kickoff: group('kickoff') });
      }
      case 'projects/records/detail': return id === 44 && record ? response(recordDetail(scope, record)) : missing('project-not-found');
      case 'projects/records/review':
        if (id !== 44 || !record) return missing('project-not-found');
        if (!record.status.endsWith('Pending')) return response({ kind: 'rejected', reason: 'project-review-conflict' }, 409);
        record.status = scope === 'requirement' ? 'RD Approved' : input.decision === 'approve' ? 'UD Approved By MD' : 'UD Rejected By MD';
        if (input.decision === 'reject') reviewFields.set(record.id, { rejectedBy: identity.displayName, rejectedDate: '2026-11-18', rejectionReason: String(input.reason) });
        return response(recordDetail(scope, record));
      case 'projects/records/review-queue': {
        const mode = input.mode ?? 'pending';
        const items = (records[scope] ?? []).filter((row) => mode === 'submitted' || row.status.includes(mode === 'approved' ? 'Approved' : mode === 'rejected' ? 'Rejected' : 'Pending'));
        return response({ kind: 'project-review-queue', scope, mode, next: null, items: items.map((row) => ({ ...row, projectId: 44,
          projectName: projects.find((row) => row.id === 44)!.name, projectReference: 'P-44', decisionDate: mode === 'rejected' ? '2026-11-18' : '' })) });
      }
      case 'projects/kickoff/options': return response({ kind: 'kickoff-options', projectId: id, recordId: input.recordId,
        purchaseOrder: order.reference, understanding: `UD-${input.recordId}`, kickoffStatus: records.kickoff.length ? 'Meeting Scheduled' : '', rooms,
        timeZone: 'Asia/Kolkata', providers: ['zoom', 'teams', 'webex', 'GMeet'], ...Object.fromEntries(Object.entries(participants).map(([key, people]) => [key, people.filter((person) => match(person.name))])),
        headsMore: false, salesMore: false, managersMore: false });
      case 'projects/attachments/list': {
        const saved = scope === 'kickoff' && id === 44 ? files.get(Number(input.recordId)) : undefined;
        const items = saved ? ([['kickoff-agenda', saved.agenda], ['kickoff-plan', saved.plan]] as const)
          .flatMap(([kind, asset]) => asset ? [{ kind, name: asset.name, mimeType: asset.mimeType ?? 'application/octet-stream' }] : []) : [];
        return response({ kind: 'project-attachments', ...input, items });
      }
      case 'projects/tasks': return taskPage(tasks.filter((row) => row.projectId === id && match(row.module + ' ' + row.description)));
      case 'tasks/assigned-by-me': case 'tasks/assigned-to-me': case 'tasks/assignments/list': return taskPage(tasks.filter((row) => row.status !== 'Completed'));
      case 'tasks/completed': return taskPage(tasks.filter((row) => row.status === 'Completed'));
      case 'tasks/work-log': return task ? response({ kind: 'task-work-log', taskId: id, items: logs.get(id) ?? [], hasMore: false,
        date: '18.11.2026', completed: task.status === 'Completed', loggedToday: task.status !== 'Completed' && !!logs.get(id)?.length }) : missing('task-not-found');
      case 'tasks/progress': case 'tasks/complete':
        if (!task) return missing('task-not-found');
        if (path === 'tasks/complete') task.status = 'Completed';
        logs.set(id, [{ id: ++sequence, date: '18.11.2026', note: String(input.note ?? 'Task completed'), status: task.status, author: identity.displayName }, ...(logs.get(id) ?? [])]);
        return response({ kind: path === 'tasks/complete' ? 'task-completed' : 'task-progress-saved', taskId: id });
      case 'tasks/dates/list': return taskPage(tasks.filter((row) => row.status !== 'Completed' && (input.queue !== 'review' || row.dateReview?.canApprove)));
      case 'tasks/dates/detail': return dates.has(id) ? response({ kind: 'task-dates', ...dates.get(id) }) : missing('task-not-found');
      case 'tasks/dates/request': return proposeDates(id, input) ? response({ kind: 'task-dates-requested', taskId: id }) : missing('task-not-found');
      case 'tasks/dates/approve': return approveDates(id) ? response({ kind: 'task-dates-approved', taskId: id }) : missing('task-not-found');
      case 'tasks/dates/request-batch': case 'tasks/dates/approve-batch': {
        const items = input.items as { id: number; [key: string]: unknown }[];
        if (items.some((item) => !dates.has(item.id))) return missing('task-not-found');
        for (const item of items) {
          if (path.endsWith('request-batch')) proposeDates(item.id, item);
          else approveDates(item.id);
        }
        return response({ kind: path.endsWith('request-batch') ? 'task-date-batch-requested' : 'task-date-batch-approved', taskIds: items.map((item) => item.id).sort((a, b) => a - b) });
      }
      case 'tasks/assignments/contexts': return response({ kind: 'task-contexts', items: [context], hasMore: false, functions: ['Development'], responsibilities: ['Internal'] });
      case 'tasks/assignments/options': case 'tasks/assignments/project-options': case 'tasks/assignments/standalone-options': return response({ kind: 'task-assignees',
        id: path.endsWith('standalone-options') ? null : id, revision: path.endsWith('/options') ? revision : null, context: input.context ?? context, hasMore: false,
        items: participants.managers.filter((person) => match(person.name)).map((person) => ({ key: String(person.id).padEnd(43, '_'), name: person.name, role: 'Implementor', lead: 'Aditi Shah', manager: 'Aditi Shah' })) });
      case 'tasks/assignments/create': case 'tasks/assignments/standalone-create': {
        const candidate = participants.managers.find((person) => String(person.id).padEnd(43, '_') === input.candidate);
        const item = { ...tasks[0], ...input.context as TaskContext ?? context, id: ++sequence, projectId: path.endsWith('standalone-create') ? null : id,
          module: String(input.module), description: String(input.description), start: String(input.start), due: String(input.due), status: 'Assigned',
          priority: String(input.priority), weight: String(input.weight), reference: `T-${sequence}`, developer: candidate?.name ?? 'Noor Paul' };
        tasks.unshift(item);
        dates.set(item.id, { taskId: item.id, start: item.start, due: item.due, approval: '', requestedStart: '', requestedDue: '', reason: '',
          revision: null, scheduleRevision: revision, requestMode: 'schedule', canApprove: false, history: [], hasMore: false });
        return response({ kind: 'task-created', projectId: item.projectId, taskId: item.id });
      }
      case 'tasks/assignments/reassign':
        if (!task) return missing('task-not-found');
        task.developer = participants.managers.find((person) => String(person.id).padEnd(43, '_') === input.candidate)?.name ?? task.developer;
        return response({ kind: 'task-reassigned', taskId: id });
      case 'tasks/assignments/reassign-bulk': {
        const items = input.items as { id: number; candidate: string }[];
        if (items.some((item) => !tasks.some((row) => row.id === item.id))) return missing('task-not-found');
        for (const item of items) {
          const task = tasks.find((row) => row.id === item.id)!;
          task.developer = participants.managers.find((person) => String(person.id).padEnd(43, '_') === item.candidate)?.name ?? task.developer;
        }
        return response({ kind: 'tasks-reassigned', taskIds: items.map((item) => item.id).sort((a, b) => a - b) });
      }
      case 'projects/publishing/tree': {
        const label = !input.phase ? 'Development' : !input.suite ? context.suite : !input.tool ? context.tool : context.customer;
        return response({ kind: 'publish-tree', items: match(label) ? [{ label, completedWeight: input.tool ? '25' : null }] : [], next: null });
      }
      case 'projects/publishing/orders': return response({ kind: 'publish-orders', items: [order], next: null });
      case 'projects/publishing/order': return id === order.id ? response({ kind: 'publish-order', item: { ...order, formStatus: 'Approved', paymentTerms: 'As agreed', license: 'Pilot', projectId: 44 }, formC: null }) : missing('publishing-not-found');
      case 'projects/publishing/tasks': return taskPage(tasks.filter((row) => row.projectId === 44));
      default: return response({ kind: 'rejected', reason: 'frontend-preview-unavailable' }, 501);
    }
  }
  function schedule(draft: KickoffDraft, agenda: PreviewFile, plan: PreviewFile | null) {
    const previous = receipts.get(draft.requestKey);
    if (previous) return previous;
    const meetingId = ++sequence;
    records.kickoff.unshift({ id: meetingId, reference: `M-${meetingId}`, date: draft.time, status: 'Meeting Scheduled', format: draft.mode });
    const names = (group: keyof typeof participants) => participants[group].filter((person) => draft[group].includes(person.id)).map((person) => person.name).join(', ');
    meetingFields.set(meetingId, { purchaseOrder: order.reference, understandingReference: `UD-${draft.recordId}`,
      projectHead: names('heads'), salesManager: names('sales'), productManager: names('managers'),
      ...(draft.mode === 'Physical Mode' ? { room: draft.rooms.join(', ') } : { conference: draft.provider, meetingLink: draft.connection }) });
    files.set(meetingId, { agenda, plan });
    receipts.set(draft.requestKey, meetingId);
    return meetingId;
  }
  return { request, schedule, attachment: (target: AttachmentTarget, kind: AttachmentKind) => {
    const saved = target.scope === 'kickoff' && target.id === 44 ? files.get(target.recordId) : undefined;
    return kind === 'kickoff-agenda' ? saved?.agenda : kind === 'kickoff-plan' ? saved?.plan : undefined;
  } };
}

export const preview = createFrontendPreview();
