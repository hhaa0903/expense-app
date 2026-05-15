'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabase'

const categoryMap: Record<string, string> = {
  transport: '交通',
  meal: '餐費',
  accommodation: '住宿',
  supplies: '文具',
  other: '其他',
}

export default function Home() {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [category, setCategory] = useState('transport')
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async () => {
    if (!amount || !date || !summary) {
      alert('請填寫所有欄位')
      return
    }
    setLoading(true)
    const { error } = await supabase.from('expenses').insert({
      submitter_id: '00000000-0000-0000-0000-000000000001',
      amount: parseFloat(amount),
      expense_date: date,
      category,
      summary,
      status: 'submitted',
    })

    if (error) {
      alert('送出失敗：' + error.message)
    } else {
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `📋 新費用申請\n類別：${categoryMap[category]}\n金額：NT$${amount}\n日期：${date}\n摘要：${summary}\n\n請至後台確認：https://expense-app-iota-gilt.vercel.app/admin`,
        }),
      })
      setSuccess(true)
      setAmount('')
      setDate('')
      setSummary('')
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-md w-full max-w-md p-6">
        <h1 className="text-xl font-bold text-gray-800 mb-1">費用申請</h1>
        <p className="text-sm text-gray-400 mb-6">填寫完畢後點選送出</p>

        {success && (
          <div className="bg-green-50 text-green-700 rounded-lg p-3 mb-4 text-sm">
            ✅ 申請已送出！
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-600 font-medium">金額（NT$）</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="請輸入金額"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          <div>
            <label className="text-sm text-gray-600 font-medium">費用日期</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

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

          <div>
            <label className="text-sm text-gray-600 font-medium">摘要說明</label>
            <textarea
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder="請簡述費用用途"
              rows={3}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-blue-500 text-white rounded-lg py-3 text-sm font-medium hover:bg-blue-600 transition disabled:opacity-50"
          >
            {loading ? '送出中...' : '送出申請'}
          </button>
        </div>
      </div>
    </main>
  )
}