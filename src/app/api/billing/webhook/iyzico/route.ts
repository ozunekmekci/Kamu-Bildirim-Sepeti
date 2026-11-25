import { NextResponse } from 'next/server';
import {
  applyWebhookSubscriptionUpdate,
  verifyIyzicoWebhookSignature,
} from '@/modules/billing';
import { getDb } from '@/modules/db';

export const dynamic = 'force-dynamic';

function extractUserId(payload: Record<string, unknown>): string {
  if (typeof payload.userId === 'string' && payload.userId.trim()) {
    return payload.userId.trim();
  }
  if (typeof payload.basketId === 'string' && payload.basketId.trim()) {
    return payload.basketId.trim();
  }
  if (typeof payload.paymentConversationId === 'string' && payload.paymentConversationId.trim()) {
    const [prefix] = payload.paymentConversationId.trim().split(':');
    return prefix;
  }
  return '';
}

export async function POST(request: Request) {
  const secretKey = process.env.IYZICO_SECRET_KEY?.trim();
  if (!secretKey) {
    return NextResponse.json(
      {
        error: 'iyzico gizli anahtarı (IYZICO_SECRET_KEY) yapılandırılmamış.',
        code: 'IYZICO_SECRET_KEY_MISSING',
      },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get('x-iyz-signature-v3');
  const isValid = await verifyIyzicoWebhookSignature(rawBody, signatureHeader, secretKey);
  if (!isValid) {
    return NextResponse.json(
      { error: 'Geçersiz iyzico webhook imzası.', code: 'INVALID_IYZICO_SIGNATURE' },
      { status: 401 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Geçersiz iyzico webhook JSON yükü.', code: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  const userId = extractUserId(payload);
  const statusUpper = typeof payload.status === 'string' ? payload.status.toUpperCase() : '';
  const eventTypeUpper =
    typeof payload.iyziEventType === 'string' ? payload.iyziEventType.toUpperCase() : '';

  let updated = false;
  if (userId) {
    const db = await getDb();
    const externalSubId =
      typeof payload.iyziPaymentId === 'string'
        ? payload.iyziPaymentId
        : typeof payload.paymentId === 'string'
          ? payload.paymentId
          : typeof payload.token === 'string'
            ? payload.token
            : null;

    if (statusUpper === 'SUCCESS' && !eventTypeUpper.includes('CANCEL')) {
      await applyWebhookSubscriptionUpdate(db, {
        userId,
        plan: 'premium',
        status: 'active',
        provider: 'iyzico',
        externalSubscriptionId: externalSubId,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      updated = true;
    } else if (eventTypeUpper.includes('CANCEL') || statusUpper === 'FAILURE') {
      await applyWebhookSubscriptionUpdate(db, {
        userId,
        plan: 'free',
        status: 'canceled',
        provider: 'iyzico',
        externalSubscriptionId: externalSubId,
        currentPeriodEnd: null,
      });
      updated = true;
    }
  }

  return NextResponse.json({ received: true, updated }, { status: 200 });
}
