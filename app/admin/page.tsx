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
}

const categoryMap: Record<string, string> = {
  transport: '交通',
  meal: '餐費',
  accommodation: '住宿',
  supplies: '文具',
  other: '其他',
}

export default function AdminPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [erpRef, setErpRef] = useState<Record<string, string>>({})

  const fetchExpenses = async () => {
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .order('submitted_at', { ascending: false })
    setExpenses(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchExpenses()
  }, [])

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

  const pending = expenses.filter(e => e.status === 'submitted')
  const accounted = expenses.filter(e => e.status === 'accounted')

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">記帳人員後台</h1>
        <p className="text-sm text-gray-400 mb-6">管理所有費用申請</p>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-orange-50 rounded-xl p-4">
            <p className="text-xs text-orange-500 font-medium">待入帳</p>
            <p className="text-3xl font-bold text-orange-500">{pending.length}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-4">
            <p className="text-xs text-green-500 font-medium">已入帳</p>
            <p className="text-3xl font-bold text-green-500">{accounted.length}</p>
          </div>
          <div className="bg-gray-100 rounded-xl p-4">
            <p className="text-xs text-gray-500 font-medium">未入帳金額</p>
            <p className="text-xl font-bold text-gray-700">
              NT${pending.reduce((s, e) => s + Number(e.amount), 0).toLocaleString()}
            </p>
          </div>
        </div>

        <h2 className="text-sm font-semibold text-gray-500 mb-3">待入帳</h2>
        <div className="space-y-3 mb-8">
          {loading && <p className="text-sm text-gray-400">載入中...</p>}
          {!loading && pending.length === 0 && (
            <p className="text-sm text-gray-400">目前沒有待入帳項目 🎉</p>
          )}
          {pending.map(e => (
            <div key={e.id} className="bg-white rounded-xl border border-orange-100 p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="text-sm font-medium text-gray-800">
                    {categoryMap[e.category]}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">{e.expense_date}</span>
                </div>
                <span className="text-lg font-bold text-orange-500">
                  NT${Number(e.amount).toLocaleString()}
                </span>
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

        <h2 className="text-sm font-semibold text-gray-500 mb-3">已入帳</h2>
        <div className="space-y-2">
          {accounted.map(e => (
            <div key={e.id} className="bg-white rounded-xl border border-gray-100 p-4 opacity-60">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm font-medium text-gray-700">
                    {categoryMap[e.category]}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">{e.expense_date}</span>
                  <span className="text-xs text-gray-400 ml-2">{e.summary}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-600">
                    NT${Number(e.amount).toLocaleString()}
                  </p>
                  {e.erp_ref_no && (
                    <p className="text-xs text-green-500">#{e.erp_ref_no}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}