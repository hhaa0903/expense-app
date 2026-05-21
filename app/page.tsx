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

const leaveTypeMap: Record<string, string> = {
  annual: '年假',
  sick: '病假',
  personal: '事假',
  other: '其他假別',
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
  hours: number | null
  leave_type: string | null
}

type TabType = 'form' | 'history'
type FormType = 'expense' | 'collection' | 'overtime' | 'leave'

export default function Home() {
  const { data: session, status } = useSession()

  const [tab, setTab] = useState<TabType>('form')
  const [formType, setFormType] = useState<FormType>('expense')

  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [category, setCategory] = useState('transport')
  const [summary, setSummary] = useState('')
  const [payerName, setPayerName] = useState('')
  const [hours, setHours] = useState('')
  const [leaveType, setLeaveType] = useState('annual')

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

  const resetForm = () => {
    setAmount('')
    setDate('')
    setSummary('')
    setPayerName('')
    setHours('')
    setLeaveType('annual')
    setReceiptFile(null)
    setReceiptPreview(null)
  }

  const handleSubmit = async () => {
    const isAttendance = formType === 'overtime' || formType === 'leave'

    if (!date || !summary) {
      alert('請填寫所有欄位')
      return
    }
    if ((formType === 'expense' || formType === 'collection') && !amount) {
      alert('請填寫金額')
      return
    }
    if (isAttendance && !hours) {
      alert('請填寫時數')
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
      expense_date: date,
      summary,
      status: 'submitted',
      type: formType,
      category: 'other',
    }

    if (formType === 'expense') {
      insertPayload.amount = parseFloat(amount)
      insertPayload.category = category
    } else if (formType === 'collection') {
      insertPayload.amount = parseFloat(amount)
      insertPayload.payer_name = payerName
    } else if (formType === 'overtime') {
      insertPayload.amount = 0
      insertPayload.hours = parseFloat(hours)
    } else if (formType === 'leave') {
      insertPayload.amount = 0
      insertPayload.hours = parseFloat(hours)
      insertPayload.leave_type = leaveType
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

    const labelMap: Record<FormType, string> = {
      expense: '費用申請',
      collection: '代收款項',
      overtime: '加班申請',
      leave: '請假申請',
    }
    const extraInfo = formType === 'expense'
      ? `類別：${categoryMap[category]}\n`
      : formType === 'collection'
      ? `付款人：${payerName}\n`
      : formType === 'leave'
      ? `假別：${leaveTypeMap[leaveType]}\n時數：${hours}h\n`
      : `時數：${hours}h\n`

    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `📋 新${labelMap[formType]}\n申請人：${session!.user?.name}\n${extraInfo}日期：${date}\n說明：${summary}\n\n請至後台確認：https://expense-app-iota-gilt.vercel.app/admin`,
      }),
    })

    setSuccess(true)
    resetForm()
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
          <h1 className="text-xl font-bold text-gray-800 mb-2">員工回報系統</h1>
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
    if (type === 'overtime' || type === 'leave') {
      return s === 'submitted'
        ? { text: '待確認', color: 'text-purple-600 bg-purple-50' }
        : { text: '已確認', color: 'text-green-600 bg-green-50' }
    }
    if (s === 'submitted') return type === 'collection'
      ? { text: '待繳回', color: 'text-yellow-600 bg-yellow-50' }
      : { text: '待入帳', color: 'text-orange-500 bg-orange-50' }
    return { text: '已完成', color: 'text-green-600 bg-green-50' }
  }

  const typeIcon: Record<string, string> = {
    expense: '💸',
    collection: '💰',
    overtime: '⏰',
    leave: '🏖️',
  }

  const typeLabel: Record<string, string> = {
    expense: '費用申請',
    collection: '代收款項',
    overtime: '加班申請',
    leave: '請假申請',
  }

  const isAttendanceForm = formType === 'overtime' || formType === 'leave'

  const dateInputClass = "mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300"

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        <div className="flex items-center justify-between mb-4 pt-2">
          <div>
            <h1 className="text-xl font-bold text-gray-800">員工回報系統</h1>
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

            {/* 申請類型：2x2 */}
            <div className="grid grid-cols-2 gap-2 mb-5">
              {([
                { value: 'expense', label: '💸 費用申請', active: 'text-blue-600' },
                { value: 'collection', label: '💰 代收款項', active: 'text-yellow-600' },
                { value: 'overtime', label: '⏰ 加班申請', active: 'text-purple-600' },
                { value: 'leave', label: '🏖️ 請假申請', active: 'text-teal-600' },
              ] as const).map(t => (
                <button
                  key={t.value}
                  onClick={() => setFormType(t.value)}
                  className={`py-2.5 rounded-xl text-sm font-medium border transition ${
                    formType === t.value
                      ? `bg-white ${t.active} border-current shadow-sm`
                      : 'bg-gray-50 text-gray-400 border-transparent'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {success && (
              <div className="bg-green-50 text-green-700 rounded-lg p-3 mb-4 text-sm">
                ✅ 申請已送出！
              </div>
            )}

            <div className="space-y-4">

              {/* 代收：付款人 */}
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

              {/* 請假：假別 */}
              {formType === 'leave' && (
                <div>
                  <label className="text-sm text-gray-600 font-medium">假別</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {Object.entries(leaveTypeMap).map(([v, l]) => (
                      <button
                        key={v}
                        onClick={() => setLeaveType(v)}
                        className={`px-3 py-1 rounded-full text-sm border transition ${
                          leaveType === v
                            ? 'bg-teal-500 text-white border-teal-500'
                            : 'bg-white text-gray-500 border-gray-200'
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 金額（費用/代收） */}
              {!isAttendanceForm && (
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
              )}

              {/* 時數（加班/請假） */}
              {isAttendanceForm && (
                <div>
                  <label className="text-sm text-gray-600 font-medium">
                    {formType === 'overtime' ? '加班時數（小時）' : '請假時數（小時）'}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={hours}
                    onChange={e => setHours(e.target.value)}
                    placeholder="例：2 或 2.5"
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                  />
                </div>
              )}

              {/* 日期 — 修正手機相容性 */}
              <div>
                <label className="text-sm text-gray-600 font-medium">
                  {formType === 'expense' ? '費用日期'
                    : formType === 'collection' ? '收款日期'
                    : formType === 'overtime' ? '加班日期'
                    : '請假日期'}
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  min="2020-01-01"
                  max="2099-12-31"
                  className={dateInputClass}
                />
              </div>

              {/* 費用類別 */}
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

              {/* 摘要 */}
              <div>
                <label className="text-sm text-gray-600 font-medium">
                  {isAttendanceForm ? '事由說明' : '摘要說明'}
                </label>
                <textarea
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                  placeholder={
                    formType === 'expense' ? '請簡述費用用途'
                      : formType === 'collection' ? '請簡述代收原因'
                      : formType === 'overtime' ? '請簡述加班事由'
                      : '請簡述請假事由'
                  }
                  rows={3}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>

              {/* 收據照片 */}
              {!isAttendanceForm && (
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
              )}

              <button
                onClick={handleSubmit}
                disabled={loading}
                className={`w-full text-white rounded-lg py-3 text-sm font-medium transition disabled:opacity-50 ${
                  formType === 'expense' ? 'bg-blue-500 hover:bg-blue-600'
                    : formType === 'collection' ? 'bg-yellow-500 hover:bg-yellow-600'
                    : formType === 'overtime' ? 'bg-purple-500 hover:bg-purple-600'
                    : 'bg-teal-500 hover:bg-teal-600'
                }`}
              >
                {loading ? '送出中...' : `送出${
                  formType === 'expense' ? '費用申請'
                    : formType === 'collection' ? '代收款項'
                    : formType === 'overtime' ? '加班申請'
                    : '請假申請'
                }`}
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
                const isAttendance = e.type === 'overtime' || e.type === 'leave'
                return (
                  <div key={e.id} className="bg-white rounded-xl shadow-sm p-4">
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{typeIcon[e.type] || '📄'}</span>
                        <span className="text-sm font-medium text-gray-800">
                          {typeLabel[e.type] || e.type}
                          {e.type === 'collection' && ` ・${e.payer_name}`}
                          {e.type === 'expense' && ` ・${categoryMap[e.category] || e.category}`}
                          {e.type === 'leave' && e.leave_type && ` ・${leaveTypeMap[e.leave_type]}`}
                        </span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sl.color}`}>
                        {sl.text}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mb-1">{e.expense_date}</p>
                    <p className="text-sm text-gray-500 mb-2">{e.summary}</p>
                    <div className="flex justify-between items-center">
                      {isAttendance ? (
                        <span className="text-base font-bold text-gray-700">{e.hours} 小時</span>
                      ) : (
                        <span className="text-base font-bold text-gray-700">
                          NT${Number(e.amount).toLocaleString()}
                        </span>
                      )}
                      {e.erp_ref_no && (
                        <span className="text-xs text-green-500">#{e.erp_ref_no}</span>
                      )}
                    </div>
                    {e.receipt_url && (
                      
                        <a href={e.receipt_url}
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