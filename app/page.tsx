'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { supabase } from '../lib/supabase'

const categoryMap: Record<string, string> = {
  transport: '交通',
  meal: '餐費',
  accommodation: '住宿',
  supplies: '文具',
  utilities: '水電材料',
  hardware: '五金',
  other: '其他',
}

type Expense = {
  id: string
  amount: number
  expense_date: string
  category: string
  summary: string
  status: string
  submitted_at: string
  type: string
  payer_name: string | null
  receipt_url: string | null
  erp_ref_no: string | null
}

type TabType = 'form' | 'history'
type FormType = 'expense' | 'collection'

export default function Home() {
  const { data: session, status } = useSession()

  const [tab, setTab] = useState<TabType>('form')
  const [formType, setFormType] = useState<FormType>('expense')

  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [category, setCategory] = useState('transport')
  const [summary, setSummary] = useState('')
  const [payerName, setPayerName] = useState('')

  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const [history, setHistory] = useState<Expense[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const getUserId = async () => {
    const lineUserId = (session!.user as any).id
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('line_user_id', lineUserId)
      .single()
    if (existingUser) return existingUser.id

    const { data: newUser } = await supabase
      .from('users')
      .insert({
        name: session!.user?.name || '未知用戶',
        email: session!.user?.email || `${lineUserId}@line.user`,
        role: 'submitter',
        line_user_id: lineUserId,
      })
      .select('id')
      .single()
    return newUser?.id
  }

  const fetchHistory = async () => {
    setHistoryLoading(true)
    const userId = await getUserId()
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('submitter_id', userId)
      .order('submitted_at', { ascending: false })
    setHistory(data || [])
    setHistoryLoading(false)
  }

  useEffect(() => {
    if (tab === 'history' && session) fetchHistory()
  }, [tab, session])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setReceiptFile(file)
    setReceiptPreview(URL.createObjectURL(file))
  }

  const uploadReceipt = async (file: File, expenseId: string): Promise<string | null> => {
    const ext = file.name.split('.').pop()
    const path = `${expenseId}.${ext}`
    const { error } = await supabase.storage.from('receipts').upload(path, file, { upsert: true })
    if (error) return null
    const { data } = supabase.storage.from('receipts').getPublicUrl(path)
    return data.publicUrl
  }

  const handleSubmit = async () => {
    if (!amount || !date || !summary) {
      alert('請填寫所有欄位')
      return
    }
    if (formType === 'collection' && !payerName) {
      alert('請填寫付款人姓名')
      return
    }
    setLoading(true)

    const userId = await getUserId()

    const insertPayload: Record<string, unknown> = {
      submitter_id: userId,
      amount: parseFloat(amount),
      expense_date: date,
      summary,
      status: 'submitted',
      type: formType,
      category: formType === 'expense' ? category : 'other',
    }
    if (formType === 'collection') {
      insertPayload.payer_name = payerName
    }

    const { data: inserted, error } = await supabase
      .from('expenses')
      .insert(insertPayload)
      .select('id')
      .single()

    if (error || !inserted) {
      alert('送出失敗：' + error?.message)
      setLoading(false)
      return
    }

    if (receiptFile) {
      const url = await uploadReceipt(receiptFile, inserted.id)
      if (url) {
        await supabase.from('expenses').update({ receipt_url: url }).eq('id', inserted.id)
      }
    }

    const typeLabel = formType === 'expense' ? '費用申請' : '代收款項'
    const extraInfo = formType === 'expense'
      ? `類別：${categoryMap[category]}\n`
      : `付款人：${payerName}\n`
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `📋 新${typeLabel}\n申請人：${session!.user?.name}\n${extraInfo}金額：NT$${amount}\n日期：${date}\n摘要：${summary}\n\n請至後台確認：https://expense-app-iota-gilt.vercel.app/admin`,
      }),
    })

    setSuccess(true)
    setAmount('')
    setDate('')
    setSummary('')
    setPayerName('')
    setReceiptFile(null)
    setReceiptPreview(null)
    setLoading(false)
    setTimeout(() => setSuccess(false), 3000)
  }

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

  const statusLabel = (s: string, type: string) => {
    if (s === 'submitted') return type === 'collection'
      ? { text: '待繳回', color: 'text-yellow-600 bg-yellow-50' }
      : { text: '待入帳', color: 'text-orange-500 bg-orange-50' }
    return { text: '已完成', color: 'text-green-600 bg-green-50' }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        <div className="flex items-center justify-between mb-4 pt-2">
          <div>
            <h1 className="text-xl font-bold text-gray-800">費用申請系統</h1>
            <p className="text-xs text-gray-400">{session.user?.name}</p>
          </div>
        </div>

        {/* 頁籤 */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
          <button
            onClick={() => setTab('form')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              tab === 'form' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'
            }`}
          >
            📝 新增申請
          </button>
          <button
            onClick={() => setTab('history')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              tab === 'history' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'
            }`}
          >
            📋 我的記錄
          </button>
        </div>

        {/* ── 填單 ── */}
        {tab === 'form' && (
          <div className="bg-white rounded-2xl shadow-sm p-5">

            <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
              <button
                onClick={() => setFormType('expense')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                  formType === 'expense' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'
                }`}
              >
                💸 費用申請
              </button>
              <button
                onClick={() => setFormType('collection')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                  formType === 'collection' ? 'bg-white text-yellow-600 shadow-sm' : 'text-gray-400'
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

              {formType === 'collection' && (
                <div>
                  <label className="text-sm text-gray-600 font-medium">付款人姓名</label>
                  <input
                    type="text"
                    value={payerName}
                    onChange={e => setPayerName(e.target.value)}
                    placeholder="請輸入付款人姓名"
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
                  />
                </div>
              )}

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
                <label className="text-sm text-gray-600 font-medium">
                  {formType === 'expense' ? '費用日期' : '收款日期'}
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>

              {formType === 'expense' && (
                <div>
                  <label className="text-sm text-gray-600 font-medium">費用類別</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {[
                      { value: 'transport', label: '交通' },
                      { value: 'meal', label: '餐費' },
                      { value: 'accommodation', label: '住宿' },
                      { value: 'supplies', label: '文具' },
                      { value: 'utilities', label: '水電材料' },
                      { value: 'hardware', label: '五金' },
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
                  placeholder={formType === 'expense' ? '請簡述費用用途' : '請簡述代收原因'}
                  rows={3}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600 font-medium">收據照片（選填）</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-1 border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-blue-300 transition"
                >
                  {receiptPreview ? (
                    <img
                      src={receiptPreview}
                      alt="收據預覽"
                      className="max-h-40 mx-auto rounded-lg object-contain"
                    />
                  ) : (
                    <p className="text-sm text-gray-400">📷 點此上傳收據照片</p>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {receiptFile && (
                  <button
                    onClick={() => { setReceiptFile(null); setReceiptPreview(null) }}
                    className="mt-1 text-xs text-red-400 hover:text-red-600"
                  >
                    ✕ 移除照片
                  </button>
                )}
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading}
                className={`w-full text-white rounded-lg py-3 text-sm font-medium transition disabled:opacity-50 ${
                  formType === 'expense'
                    ? 'bg-blue-500 hover:bg-blue-600'
                    : 'bg-yellow-500 hover:bg-yellow-600'
                }`}
              >
                {loading ? '送出中...' : formType === 'expense' ? '送出費用申請' : '送出代收款項'}
              </button>
            </div>
          </div>
        )}

        {/* ── 我的記錄 ── */}
        {tab === 'history' && (
          <div>
            {historyLoading && (
              <p className="text-sm text-gray-400 text-center py-8">載入中...</p>
            )}
            {!historyLoading && history.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">目前還沒有申請記錄</p>
            )}
            <div className="space-y-3">
              {history.map(e => {
                const sl = statusLabel(e.status, e.type)
                return (
                  <div key={e.id} className="bg-white rounded-xl shadow-sm p-4">
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{e.type === 'collection' ? '💰' : '💸'}</span>
                        <span className="text-sm font-medium text-gray-800">
                          {e.type === 'collection'
                            ? `代收・${e.payer_name}`
                            : categoryMap[e.category] || e.category}
                        </span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sl.color}`}>
                        {sl.text}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mb-1">{e.expense_date}</p>
                    <p className="text-sm text-gray-500 mb-2">{e.summary}</p>
                    <div className="flex justify-between items-center">
                      <span className="text-base font-bold text-gray-700">
                        NT${Number(e.amount).toLocaleString()}
                      </span>
                      {e.erp_ref_no && (
                        <span className="text-xs text-green-500">#{e.erp_ref_no}</span>
                      )}
                    </div>
                    {e.receipt_url && (
                      
                        href={e.receipt_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block text-xs text-blue-400 hover:underline"
                      >
                        📎 查看收據
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </main>
  )
}