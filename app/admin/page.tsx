'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

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

const ADMIN_PASSWORD = 'expense2024'

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
  receipt_url: string | null
  submitter_id: string
  hours: number | null
  leave_type: string | null
}

type User = {
  id: string
  name: string
  email: string
  role: string
  line_user_id: string
  is_active: boolean
}

type AdminTab = 'expenses' | 'attendance' | 'users'

export default function AdminPage() {
  const [authed, setAuthed] = useState(false)
  const [inputPw, setInputPw] = useState('')
  const [pwError, setPwError] = useState(false)
  const [adminTab, setAdminTab] = useState<AdminTab>('expenses')

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [erpRef, setErpRef] = useState<Record<string, string>>({})

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editSummary, setEditSummary] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editPayerName, setEditPayerName] = useState('')
  const [editHours, setEditHours] = useState('')
  const [editLeaveType, setEditLeaveType] = useState('')

  const [users, setUsers] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [filterUserId, setFilterUserId] = useState<string>('all')

  const handleLogin = () => {
    if (inputPw === ADMIN_PASSWORD) { setAuthed(true); setPwError(false) }
    else setPwError(true)
  }

  const fetchExpenses = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .order('submitted_at', { ascending: false })
    setExpenses(data || [])
    setLoading(false)
  }

  const fetchUsers = async () => {
    setUsersLoading(true)
    const { data } = await supabase.from('users').select('*').order('created_at', { ascending: false })
    setUsers(data || [])
    setUsersLoading(false)
  }

  useEffect(() => { if (authed) { fetchExpenses(); fetchUsers() } }, [authed])

  const markAccounted = async (id: string) => {
    const ref = erpRef[id] || ''
    const { error } = await supabase.from('expenses')
      .update({ status: 'accounted', erp_ref_no: ref, accounted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) alert('更新失敗：' + error.message)
    else fetchExpenses()
  }

  const markReturned = async (id: string) => {
    const { error } = await supabase.from('expenses')
      .update({ status: 'accounted', returned_at: new Date().toISOString() })
      .eq('id', id)
    if (error) alert('更新失敗：' + error.message)
    else fetchExpenses()
  }

  const markConfirmed = async (id: string) => {
    const { error } = await supabase.from('expenses')
      .update({ status: 'accounted', accounted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) alert('更新失敗：' + error.message)
    else fetchExpenses()
  }

  const deleteExpense = async (id: string) => {
    if (!confirm('確定要刪除這筆記錄嗎？')) return
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) alert('刪除失敗：' + error.message)
    else fetchExpenses()
  }

  const startEdit = (e: Expense) => {
    setEditingId(e.id)
    setEditAmount(String(e.amount))
    setEditDate(e.expense_date)
    setEditSummary(e.summary)
    setEditCategory(e.category)
    setEditPayerName(e.payer_name || '')
    setEditHours(e.hours ? String(e.hours) : '')
    setEditLeaveType(e.leave_type || 'annual')
  }

  const saveEdit = async (e: Expense) => {
    const isAttendance = e.type === 'overtime' || e.type === 'leave'
    const payload: Record<string, unknown> = {
      expense_date: editDate,
      summary: editSummary,
    }
    if (isAttendance) {
      payload.hours = parseFloat(editHours)
      if (e.type === 'leave') payload.leave_type = editLeaveType
    } else {
      payload.amount = parseFloat(editAmount)
      if (e.type === 'expense') payload.category = editCategory
      if (e.type === 'collection') payload.payer_name = editPayerName
    }
    const { error } = await supabase.from('expenses').update(payload).eq('id', e.id)
    if (error) alert('儲存失敗：' + error.message)
    else { setEditingId(null); fetchExpenses() }
  }

  const toggleUserActive = async (user: User) => {
    const next = !user.is_active
    if (!confirm(`確定要${next ? '恢復' : '停用'}「${user.name}」的帳號嗎？`)) return
    const { error } = await supabase.from('users').update({ is_active: next }).eq('id', user.id)
    if (error) alert('操作失敗：' + error.message)
    else fetchUsers()
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-md w-full max-w-sm p-6">
          <h1 className="text-xl font-bold text-gray-800 mb-1">記帳人員後台</h1>
          <p className="text-sm text-gray-400 mb-6">請輸入管理密碼</p>
          <input
            type="password" value={inputPw}
            onChange={e => setInputPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="輸入密碼"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          {pwError && <p className="text-red-500 text-xs mb-3">密碼錯誤，請再試一次</p>}
          <button onClick={handleLogin}
            className="w-full bg-blue-500 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-600 transition">
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
  const attendanceAll = expenses.filter(e => e.type === 'overtime' || e.type === 'leave')
  const attendanceFiltered = filterUserId === 'all'
    ? attendanceAll
    : attendanceAll.filter(e => e.submitter_id === filterUserId)

  // 統計每人時數
  const userHourStats = users.map(u => {
    const records = attendanceAll.filter(e => e.submitter_id === u.id)
    const overtimeHours = records.filter(e => e.type === 'overtime').reduce((s, e) => s + (e.hours || 0), 0)
    const leaveHours = records.filter(e => e.type === 'leave').reduce((s, e) => s + (e.hours || 0), 0)
    return { ...u, overtimeHours, leaveHours }
  }).filter(u => u.overtimeHours > 0 || u.leaveHours > 0)

  const EditCard = ({ e }: { e: Expense }) => {
    const isAttendance = e.type === 'overtime' || e.type === 'leave'
    return (
      <div className="bg-white rounded-xl border border-blue-200 p-4 space-y-3">
        <p className="text-xs font-semibold text-blue-500">✏️ 編輯中</p>
        {e.type === 'collection' && (
          <div>
            <label className="text-xs text-gray-500">付款人</label>
            <input value={editPayerName} onChange={ev => setEditPayerName(ev.target.value)}
              className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
        )}
        {e.type === 'expense' && (
          <div>
            <label className="text-xs text-gray-500">類別</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {Object.entries(categoryMap).map(([v, l]) => (
                <button key={v} onClick={() => setEditCategory(v)}
                  className={`px-2.5 py-0.5 rounded-full text-xs border transition ${
                    editCategory === v ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-200'
                  }`}>{l}</button>
              ))}
            </div>
          </div>
        )}
        {e.type === 'leave' && (
          <div>
            <label className="text-xs text-gray-500">假別</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {Object.entries(leaveTypeMap).map(([v, l]) => (
                <button key={v} onClick={() => setEditLeaveType(v)}
                  className={`px-2.5 py-0.5 rounded-full text-xs border transition ${
                    editLeaveType === v ? 'bg-teal-500 text-white border-teal-500' : 'bg-white text-gray-500 border-gray-200'
                  }`}>{l}</button>
              ))}
            </div>
          </div>
        )}
        {isAttendance ? (
          <div>
            <label className="text-xs text-gray-500">時數</label>
            <input type="number" step="0.5" value={editHours} onChange={ev => setEditHours(ev.target.value)}
              className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" />
          </div>
        ) : (
          <div>
            <label className="text-xs text-gray-500">金額</label>
            <input type="number" value={editAmount} onChange={ev => setEditAmount(ev.target.value)}
              className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
        )}
        <div>
          <label className="text-xs text-gray-500">日期</label>
          <input type="date" value={editDate} onChange={ev => setEditDate(ev.target.value)}
            className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
        <div>
          <label className="text-xs text-gray-500">說明</label>
          <textarea value={editSummary} onChange={ev => setEditSummary(ev.target.value)} rows={2}
            className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => saveEdit(e)}
            className="flex-1 bg-blue-500 text-white rounded-lg py-1.5 text-sm font-medium hover:bg-blue-600 transition">
            💾 儲存
          </button>
          <button onClick={() => setEditingId(null)}
            className="flex-1 bg-gray-100 text-gray-600 rounded-lg py-1.5 text-sm font-medium hover:bg-gray-200 transition">
            取消
          </button>
        </div>
      </div>
    )
  }

  const ExpenseCard = ({ e, showActions }: { e: Expense; showActions: boolean }) => {
    if (editingId === e.id) return <EditCard e={e} />
    const isCollection = e.type === 'collection'
    const isAttendance = e.type === 'overtime' || e.type === 'leave'
    const borderColor = showActions
      ? isCollection ? 'border-yellow-100' : isAttendance ? 'border-purple-100' : 'border-orange-100'
      : 'border-gray-100'
    const userName = users.find(u => u.id === e.submitter_id)?.name || '未知'

    return (
      <div className={`bg-white rounded-xl border ${borderColor} p-4 ${!showActions ? 'opacity-60' : ''}`}>
        <div className="flex justify-between items-start mb-1">
          <div>
            <span className="text-xs text-gray-400 mr-1">
              {e.type === 'overtime' ? '⏰' : e.type === 'leave' ? '🏖️' : e.type === 'collection' ? '💰' : '💸'}
            </span>
            <span className="text-sm font-medium text-gray-800">
              {e.type === 'collection' ? `代收・${e.payer_name}`
                : e.type === 'overtime' ? '加班'
                : e.type === 'leave' ? `請假・${leaveTypeMap[e.leave_type || ''] || ''}`
                : categoryMap[e.category] || e.category}
            </span>
            <span className="text-xs text-gray-400 ml-2">{e.expense_date}</span>
          </div>
          <span className={`text-sm font-bold ${
            isAttendance ? 'text-purple-600' : isCollection ? 'text-yellow-600' : 'text-orange-500'
          }`}>
            {isAttendance ? `${e.hours}h` : `NT$${Number(e.amount).toLocaleString()}`}
          </span>
        </div>
        <p className="text-xs text-blue-400 mb-1">👤 {userName}</p>
        <p className="text-sm text-gray-500 mb-2">{e.summary}</p>
        {e.receipt_url && (
          <a href={e.receipt_url} target="_blank" rel="noreferrer"
            className="mb-2 block text-xs text-blue-400 hover:underline">
            📎 查看收據
          </a>
        )}
        {e.erp_ref_no && <p className="text-xs text-green-500 mb-2">#{e.erp_ref_no}</p>}
        {showActions && (
          <div className="space-y-2">
            {e.type === 'expense' && (
              <div className="flex gap-2">
                <input type="text" placeholder="ERP 傳票編號（選填）"
                  value={erpRef[e.id] || ''}
                  onChange={ev => setErpRef(prev => ({ ...prev, [e.id]: ev.target.value }))}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                <button onClick={() => markAccounted(e.id)}
                  className="bg-green-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-green-600 transition">
                  ✓ 已入帳
                </button>
              </div>
            )}
            {e.type === 'collection' && (
              <button onClick={() => markReturned(e.id)}
                className="w-full bg-yellow-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-yellow-600 transition">
                ✓ 已繳回
              </button>
            )}
            {isAttendance && (
              <button onClick={() => markConfirmed(e.id)}
                className="w-full bg-purple-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-purple-600 transition">
                ✓ 確認
              </button>
            )}
            <div className="flex gap-2">
              <button onClick={() => startEdit(e)}
                className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-1.5 text-sm hover:bg-gray-50 transition">
                ✏️ 編輯
              </button>
              <button onClick={() => deleteExpense(e.id)}
                className="flex-1 border border-red-200 text-red-400 rounded-lg py-1.5 text-sm hover:bg-red-50 transition">
                🗑 刪除
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">管理後台</h1>
        <p className="text-sm text-gray-400 mb-5">費用申請・差勤管理</p>

        {/* 後台頁籤 */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          <button onClick={() => setAdminTab('expenses')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              adminTab === 'expenses' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'
            }`}>
            💸 費用管理
          </button>
          <button onClick={() => setAdminTab('attendance')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              adminTab === 'attendance' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'
            }`}>
            ⏰ 差勤管理
          </button>
          <button onClick={() => setAdminTab('users')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              adminTab === 'users' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'
            }`}>
            👥 員工帳號
          </button>
        </div>

        {/* ── 費用管理 ── */}
        {adminTab === 'expenses' && (
          <>
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

            <h2 className="text-sm font-semibold text-gray-500 mb-3">💸 費用申請 — 待入帳</h2>
            <div className="space-y-3 mb-8">
              {loading && <p className="text-sm text-gray-400">載入中...</p>}
              {!loading && pending.length === 0 && <p className="text-sm text-gray-400">目前沒有待入帳項目 🎉</p>}
              {pending.map(e => <ExpenseCard key={e.id} e={e} showActions={true} />)}
            </div>

            <h2 className="text-sm font-semibold text-gray-500 mb-3">💰 代收款項 — 待繳回</h2>
            <div className="space-y-3 mb-8">
              {!loading && pendingCollection.length === 0 && <p className="text-sm text-gray-400">目前沒有待繳回項目 🎉</p>}
              {pendingCollection.map(e => <ExpenseCard key={e.id} e={e} showActions={true} />)}
            </div>

            <h2 className="text-sm font-semibold text-gray-500 mb-3">已完成</h2>
            <div className="space-y-2">
              {[...accounted, ...returnedCollection].map(e => <ExpenseCard key={e.id} e={e} showActions={false} />)}
            </div>
          </>
        )}

        {/* ── 差勤管理 ── */}
        {adminTab === 'attendance' && (
          <>
            {/* 統計卡片 */}
            {userHourStats.length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-gray-500 mb-3">📊 各員工時數統計</h2>
                <div className="grid grid-cols-2 gap-3">
                  {userHourStats.map(u => (
                    <div key={u.id} className="bg-white rounded-xl border border-purple-100 p-3">
                      <p className="text-sm font-medium text-gray-800 mb-1">{u.name}</p>
                      <p className="text-xs text-purple-600">加班：{u.overtimeHours}h</p>
                      <p className="text-xs text-teal-600">請假：{u.leaveHours}h</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 篩選員工 */}
            <div className="mb-4">
              <select
                value={filterUserId}
                onChange={e => setFilterUserId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              >
                <option value="all">全部員工</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            {/* 待確認 */}
            <h2 className="text-sm font-semibold text-gray-500 mb-3">⏳ 待確認</h2>
            <div className="space-y-3 mb-8">
              {attendanceFiltered.filter(e => e.status === 'submitted').length === 0 && (
                <p className="text-sm text-gray-400">目前沒有待確認記錄 🎉</p>
              )}
              {attendanceFiltered.filter(e => e.status === 'submitted').map(e => (
                <ExpenseCard key={e.id} e={e} showActions={true} />
              ))}
            </div>

            {/* 已確認 */}
            <h2 className="text-sm font-semibold text-gray-500 mb-3">✅ 已確認</h2>
            <div className="space-y-2">
              {attendanceFiltered.filter(e => e.status === 'accounted').map(e => (
                <ExpenseCard key={e.id} e={e} showActions={false} />
              ))}
            </div>
          </>
        )}

        {/* ── 員工帳號 ── */}
        {adminTab === 'users' && (
          <div>
            {usersLoading && <p className="text-sm text-gray-400">載入中...</p>}
            {!usersLoading && users.length === 0 && <p className="text-sm text-gray-400">目前沒有員工帳號</p>}
            <div className="space-y-3">
              {users.map(u => (
                <div key={u.id} className={`bg-white rounded-xl border p-4 ${!u.is_active ? 'opacity-50' : ''}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{u.name}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        角色：{u.role} ·
                        <span className={`ml-1 font-medium ${u.is_active ? 'text-green-500' : 'text-red-400'}`}>
                          {u.is_active ? '啟用中' : '已停用'}
                        </span>
                      </p>
                    </div>
                    <button onClick={() => toggleUserActive(u)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        u.is_active
                          ? 'bg-red-50 text-red-500 hover:bg-red-100'
                          : 'bg-green-50 text-green-600 hover:bg-green-100'
                      }`}>
                      {u.is_active ? '停用' : '恢復'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </main>
  )
}