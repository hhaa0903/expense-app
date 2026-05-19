'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Expense = {
  id: string
  amount: number
  expense_date: string
  category: string
  summary: string
  status: string
  submitted_at: string
  erp_ref_no: string | null
  type: string
  payer_name: string | null
}

const categoryMap: Record<string, string> = {
  transport: '交通',
  meal: '餐費',
  accommodation: '住宿',
  supplies: '文具',
  other: '其他',
}

const ADMIN_PASSWORD = 'expense2024'

export default function AdminPage() {
  const [authed, setAuthed] = useState(false)
  const [inputPw, setInputPw] = useState('')
  const [pwError, setPwError] = useState(false)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [erpRef, setErpRef] = useState<Record<string, string>>({})

  const handleLogin = () => {
    if (inputPw === ADMIN_PASSWORD) {
      setAuthed(true)
      setPwError(false)
    } else {
      setPwError(true)
    }
  }

  const fetchExpenses = async () => {
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .order('submitted_at', { ascending: false })
    setExpenses(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (authed) fetchExpenses()
  }, [authed])

  const markAccounted = async (id: string) => {
    const ref = erpRef[id] || ''
    const { error } = await supabase
      .from('expenses')
      .update({
        status: 'accounted',
        erp_ref_no: ref,
        accounted_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) {
      alert('更新失敗：' + error.message)
    } else {
      fetchExpenses()
    }
  }

  const markReturned = async (id: string) => {
    const { error } = await supabase
      .from('expenses')
      .update({
        status: 'accounted',
        returned_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) {
      alert('更新失敗：' + error.message)
    } else {
      fetchExpenses()
    }
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-md w-full max-w-sm p-6">
          <h1 className="text-xl font-bold text-gray-800 mb-1">記帳人員後台</h1>
          <p className="text-sm text-gray-400 mb-6">請輸入管理密碼</p>
          <input
            type="password"
            value={inputPw}
            onChange={e => setInputPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="輸入密碼"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          {pwError && <p className="text-red-500 text-xs mb-3">密碼錯誤，請再試一次</p>}
          <button
            onClick={handleLogin}
            className="w-full bg-blue-500 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-600 transition"
          >
            登入
          </button>
        </div>
      </main>
    )
  }

  const pending = expenses.filter(e => e.status === 'submitted' && e.type === 'expense')
  const accounted = expenses.filter(e => e.status === 'accounted' && e.type === 'expense')
  const pendingCollection = expenses.filter(e => e.status === 'submitted' && e.type === 'collection')
  const returnedCollection = expenses.filter(e => e.status === 'accounted' && e.type === 'collection')

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">記帳人員後台</h1>
        <p className="text-sm text-gray-400 mb-6">管理所有費用申請</p>

        <div className="grid grid-cols-4 gap-3 mb-8">
          <div className="bg-orange-50 rounded-xl p-4">
            <p className="text-xs text-orange-500 font-medium">待入帳</p>
            <p className="text-3xl font-bold text-orange-500">{pending.length}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-4">
            <p className="text-xs text-green-500 font-medium">已入帳</p>
            <p className="text-3xl font-bold text-green-500">{accounted.length}</p>
          </div>
          <div className="bg-yellow-50 rounded-xl p-4">
            <p className="text-xs text-yellow-600 font-medium">待繳回</p>
            <p className="text-3xl font-bold text-yellow-600">{pendingCollection.length}</p>
          </div>
          <div className="bg-gray-100 rounded-xl p-4">
            <p className="text-xs text-gray-500 font-medium">未入帳金額</p>
            <p className="text-lg font-bold text-gray-700">
              NT${pending.reduce((s, e) => s + Number(e.amount), 0).toLocaleString()}
            </p>
          </div>
        </div>

        {/* 費用申請 待入帳 */}
        <h2 className="text-sm font-semibold text-gray-500 mb-3">💸 費用申請 — 待入帳</h2>
        <div className="space-y-3 mb-8">
          {loading && <p className="text-sm text-gray-400">載入中...</p>}
          {!loading && pending.length === 0 && (
            <p className="text-sm text-gray-400">目前沒有待入帳項目 🎉</p>
          )}
          {pending.map(e => (
            <div key={e.id} className="bg-white rounded-xl border border-orange-100 p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="text-sm font-medium text-gray-800">{categoryMap[e.category]}</span>
                  <span className="text-xs text-gray-400 ml-2">{e.expense_date}</span>
                </div>
                <span className="text-lg font-bold text-orange-500">NT${Number(e.amount).toLocaleString()}</span>
              </div>
              <p className="text-sm text-gray-500 mb-3">{e.summary}</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="ERP 傳票編號（選填）"
                  value={erpRef[e.id] || ''}
                  onChange={ev => setErpRef(prev => ({ ...prev, [e.id]: ev.target.value }))}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                />
                <button
                  onClick={() => markAccounted(e.id)}
                  className="bg-green-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-green-600 transition"
                >
                  ✓ 已入帳
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* 代收款項 待繳回 */}
        <h2 className="text-sm font-semibold text-gray-500 mb-3">💰 代收款項 — 待繳回</h2>
        <div className="space-y-3 mb-8">
          {!loading && pendingCollection.length === 0 && (
            <p className="text-sm text-gray-400">目前沒有待繳回項目 🎉</p>
          )}
          {pendingCollection.map(e => (
            <div key={e.id} className="bg-white rounded-xl border border-yellow-100 p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="text-sm font-medium text-gray-800">付款人：{e.payer_name}</span>
                  <span className="text-xs text-gray-400 ml-2">{e.expense_date}</span>
                </div>
                <span className="text-lg font-bold text-yellow-600">NT${Number(e.amount).toLocaleString()}</span>
              </div>
              <p className="text-sm text-gray-500 mb-3">{e.summary}</p>
              <button
                onClick={() => markReturned(e.id)}
                className="bg-yellow-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-yellow-600 transition"
              >
                ✓ 已繳回
              </button>
            </div>
          ))}
        </div>

        {/* 已入帳 */}
        <h2 className="text-sm font-semibold text-gray-500 mb-3">已完成</h2>
        <div className="space-y-2">
          {[...accounted, ...returnedCollection].map(e => (
            <div key={e.id} className="bg-white rounded-xl border border-gray-100 p-4 opacity-60">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-xs text-gray-400 mr-2">
                    {e.type === 'collection' ? '💰 代收' : '💸 費用'}
                  </span>
                  <span className="text-sm font-medium text-gray-700">
                    {e.type === 'collection' ? e.payer_name : categoryMap[e.category]}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">{e.expense_date}</span>
                  <span className="text-xs text-gray-400 ml-2">{e.summary}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-600">NT${Number(e.amount).toLocaleString()}</p>
                  {e.erp_ref_no && <p className="text-xs text-green-500">#{e.erp_ref_no}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}