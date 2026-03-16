import { NextRequest, NextResponse } from 'next/server'

import { clearTestOutbox, getTestOutbox } from '@/lib/email'

function isTestOutboxEnabled(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'
}

function guardTestOnlyRoute() {
  if (!isTestOutboxEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return null
}

export async function GET(request: NextRequest) {
  const guard = guardTestOnlyRoute()
  if (guard) {
    return guard
  }

  const { searchParams } = new URL(request.url)
  const recipient = searchParams.get('recipient')?.trim().toLowerCase()

  const emails = getTestOutbox()
    .filter((email) => !recipient || email.to.toLowerCase() === recipient)
    .map((email) => ({
      to: email.to,
      from: email.from,
      subject: email.subject,
      html: email.html,
      text: email.text ?? null,
      sentAt: email.sentAt.toISOString(),
    }))

  return NextResponse.json({ emails })
}

export async function DELETE() {
  const guard = guardTestOnlyRoute()
  if (guard) {
    return guard
  }

  clearTestOutbox()
  return NextResponse.json({ success: true })
}
