import type { AssignedTask } from './tasks-contract';

const dayMs = 86_400_000;
const dateLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fullDateLabel = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

function taskDay(value: string) {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  const legacy = /^(\d{1,2})([./-])(\d{1,2})\2(\d{4})$/.exec(value.trim());
  if (!iso && !legacy) return null;
  const year = Number(iso?.[1] ?? legacy?.[4]);
  const month = Number(iso?.[2] ?? legacy?.[3]);
  const day = Number(iso?.[3] ?? legacy?.[1]);
  if (year < 1000 || year > 9999) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.valueOf() / dayMs;
}

export function taskSchedule(tasks: readonly AssignedTask[]) {
  const rows = [];
  const unscheduled = [];
  for (const task of tasks) {
    const start = taskDay(task.start);
    const due = taskDay(task.due);
    const first = start ?? due;
    const last = due ?? start;
    if (first === null || last === null || last < first) unscheduled.push(task);
    else rows.push({ task, first, last, start, due });
  }
  rows.sort((a, b) => a.first - b.first || a.last - b.last || b.task.id - a.task.id);
  return {
    rows, unscheduled,
    first: rows[0]?.first ?? 0,
    last: rows.reduce((last, row) => Math.max(last, row.last), rows[0]?.first ?? 0),
  };
}

export function scheduleLabel(day: number, includeYear = false) {
  return (includeYear ? fullDateLabel : dateLabel).format(day * dayMs);
}
