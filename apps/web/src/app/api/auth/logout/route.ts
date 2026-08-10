import { getDb, recordAudit } from '@sdoh/db';
import { NextResponse, type NextRequest } from 'next/server';
import { absoluteUrl } from '@/lib/absolute-url';
import { getCurrentUser } from '@/lib/auth';
import { destroySession } from '@/lib/session';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (user) {
    const db = await getDb();
    await recordAudit(db, {
      actorType: 'umano',
      actorLabel: user.name,
      userId: user.id,
      action: 'auth.logout',
      entityType: 'user',
      entityId: user.id,
      source: 'web:header',
      sessionRef: user.sessionRef,
    });
  }
  await destroySession();
  return NextResponse.redirect(absoluteUrl(request, '/accedi'), { status: 303 });
}
