import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { message } = await req.json()

  const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messages: [
        {
          type: 'text',
          text: message,
        },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    return NextResponse.json({ error }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}