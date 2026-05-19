'use client'

import { useState } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { supabase } from '../lib/supabase'

const categoryMap: Record<string, string> = {
  transport: '交通',
  meal: '餐費',
  accommodation: '住宿',
  supplies: '文具',
  other: '其他',
}

export default function Home() {
  const { data: session, status } = useSession()
  const [type, setType] = useState<'expense' | 'collection'>('expense')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [category, setCategory] = useState('transport')
  const [summary, setSummary] = useState('')
  const [payerName, setPayerName] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  if (status === 'loading') {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">載入中...</p>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-md w-full max-w-sm p-6 text-center">
          <h1 className="text-xl font-bold text-gray-800 mb-2">費用申請系統</h1>
          <p className="text-sm text-gray-400 mb-6">請先用 LINE 登入</p>
          <button
            onClick={() => signIn('line')}
            className="w-full bg-green-500 text-white rounded-lg py-3 text-sm font-medium hover:bg-green-600 transition"
          >
            使用 LINE 登入
          </button>
        </div>
      </main>
    )
  }

  const handleSubmit = async () => {
    if (!amount || !date || !summary) {
      alert('請填寫所有欄位')
      return
    }
    if (type === 'collection' && !payerName) {
      alert('請填寫付款人姓名')
      return
    }
    setLoading(true)

    const lineUserId = (session.user as any).id
    let userId = null
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('line_user_id', lineUserId)
      .single()

    if (existingUser) {
      userId = existingUser.id
    } else {
      const { data: newUser } = await supabase
        .from('users')
        .insert({
          name: session.user?.name || '未知用戶',
          email: session.user?.email || `${lineUserId}@line.user`,
          role: 'submitter',
          line_user_id: lineUserId,
        })
        .select('id')
        .single()
      userId = newUser?.id
    }

    const { error } = await supabase.from('expenses').insert({
      submitter_id: userId,
      amount: parseFloat(amount),
      expense_date: date,
      category: type === 'collection' ? 'other' : category,
      summary,
      status: 'submitted',
      type,
      payer_name: type === 'collection' ? payerName : null,
    })

    if (error) {
      alert('送出失敗：' + error.message)
    } else {
      const typeLabel = type === 'expense' ? '費用申請' : '代收款項'
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `📋 新${typeLabel}\n申請人：${session.user?.name}\n${type === 'collection' ? `付款人：${payerName}\n` : `類別：${categoryMap[category]}\n`}金額：NT$${amount}\n日期：${date}\n摘要：${summary}\n\n請至後台確認：https://expense-app-iota-gilt.vercel.app/admin`,
        }),
      })
      setSuccess(true)
      setAmount('')
      setDate('')
      setSummary('')
      setPayerName('')
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-md w-full max-w-md p-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-800">費用回報</h1>
          <p className="text-xs text-gray-400">{session.user?.name}</p>
        </div>

        {/* 類型切換 */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setType('expense')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${
              type === 'expense'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            💸 費用申請
          </button>
          <button
            onClick={() => setType('collection')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${
              type === 'collection'
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            💰 代收款項
          </button>
        </div>

        {success && (
          <div className="bg-green-50 text-green-700 rounded-lg p-3 mb-4 text-sm">
            ✅ 申請已送出！
          </div>
        )}

        <div className="space-y-4">
          {type === 'collection' && (
            <div>
              <label className="text-sm text-gray-600 font-medium">付款人姓名</label>
              <input
                type="text"
                value={payerName}
                onChange={e => setPayerName(e.target.value)}
                placeholder="請輸入付款人姓名"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
              />
            </div>
          )}

          <div>
            <label className="text-sm text-gray-600 font-medium">
              {type === 'expense' ? '金額（NT$）' : '代收金額（NT$）'}
            </label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="請輸入金額"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          <div>
            <label className="text-sm text-gray-600 font-medium">日期</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          {type === 'expense' && (
            <div>
              <label className="text-sm text-gray-600 font-medium">費用類別</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {[
                  { value: 'transport', label: '交通' },
                  { value: 'meal', label: '餐費' },
                  { value: 'accommodation', label: '住宿' },
                  { value: 'supplies', label: '文具' },
                  { value: 'other', label: '其他' },
                ].map(c => (
                  <button
                    key={c.value}
                    onClick={() => setCategory(c.value)}
                    className={`px-3 py-1 rounded-full text-sm border transition ${
                      category === c.value
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white text-gray-500 border-gray-200'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-sm text-gray-600 font-medium">摘要說明</label>
            <textarea
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder={type === 'expense' ? '請簡述費用用途' : '請簡述代收原因'}
              rows={3}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className={`w-full text-white rounded-lg py-3 text-sm font-medium transition disabled:opacity-50 ${
              type === 'expense'
                ? 'bg-blue-500 hover:bg-blue-600'
                : 'bg-green-500 hover:bg-green-600'
            }`}
          >
            {loading ? '送出中...' : '送出申請'}
          </button>
        </div>
      </div>
    </main>
  )
}