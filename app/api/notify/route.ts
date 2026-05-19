import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const { message } = await req.json()

  // 查詢所有記帳人員的 line_user_id
  const { data: accountants } = await supabase
    .from('users')
    .select('line_user_id')
    .eq('role', 'accountant')

  if (!accountants || accountants.length === 0) {
    return NextResponse.json({ error: '沒有找到記帳人員' }, { status: 400 })
  }

  // 只發給記帳人員
  const results = await Promise.all(
    accountants
      .filter(a => a.line_user_id && !a.line_user_id.includes('@line.user'))
      .map(accountant =>
        fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
          },
          body: JSON.stringify({
            to: accountant.line_user_id,
            messages: [{ type: 'text', text: message }],
          }),
        })
      )
  )

  return NextResponse.json({ success: true, sent: results.length })
}