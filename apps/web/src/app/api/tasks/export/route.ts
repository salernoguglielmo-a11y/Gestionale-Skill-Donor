import { applyTaskFilter, tasksToCsv } from '@sdoh/core';
import { getDb, listTasks, recordAudit } from '@sdoh/db';
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { parseTaskFilter } from '@/lib/task-query';

/** Esportazione CSV delle attività filtrate. L'esportazione è tracciata nell'audit log. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const filter = parseTaskFilter(request.nextUrl.searchParams);
  const db = await getDb();
  const tasks = applyTaskFilter(await listTasks(db), filter);

  await recordAudit(db, {
    actorType: 'umano',
    actorLabel: user.name,
    userId: user.id,
    action: 'task.export_csv',
    entityType: 'task',
    newValue: { righe: tasks.length, filtro: request.nextUrl.search || '(nessun filtro)' },
    source: 'web:export',
    sessionRef: user.sessionRef,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(tasksToCsv(tasks), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="attivita-skill-donor-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
