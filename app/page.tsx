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

type JobSite = {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  radius_meters: number
  is_active: boolean
}

type AttendanceLog = {
  id: string
  job_site_id: string
  type: string
  clocked_at: string
  distance_meters: number
}

type TabType = 'form' | 'history' | 'clock'
type FormType = 'expense' | 'collection' | 'overtime' | 'leave'
type HoursUnit = 'hours' | 'days'

const currentYear = new Date().getFullYear()
const years = [currentYear, currentYear + 1]
const months = Array.from({ length: 12 }, (_, i) => i + 1)
const days = Array.from({ length: 31 }, (_, i) => i + 1)

function DatePicker({ year, month, day, onYearChange, onMonthChange, onDayChange }: {
  year: number | null, month: number | null, day: number | null,
  onYearChange: (y: number) => void,
  onMonthChange: (m: number) => void,
  onDayChange: (d: number) => void,
}) {
  const btnBase = "py-1.5 rounded-lg text-sm border transition text-center"
  const active = "bg-blue-500 text-white border-blue-500"
  const inactive = "bg-white text-gray-600 border-gray-200"
  return (
    <div className="space-y-2 mt-1">
      <div className="flex gap-2">
        {years.map(y => (
          <button key={y} type="button" onClick={() => onYearChange(y)}
            className={`${btnBase} flex-1 ${year === y ? active : inactive}`}>
            {y}年
          </button>
        ))}
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {months.map(m => (
          <button key={m} type="button" onClick={() => onMonthChange(m)}
            className={`${btnBase} ${month === m ? active : inactive}`}>
            {m}月
          </button>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map(d => (
          <button key={d} type="button" onClick={() => onDayChange(d)}
            className={`${btnBase} text-xs ${day === d ? active : inactive}`}>
            {d}
          </button>
        ))}
      </div>
      {year && month && day && (
        <p className="text-sm text-blue-600 font-medium">
          ✓ {year} 年 {month} 月 {day} 日
        </p>
      )}
    </div>
  )
}

function getDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function Home() {
  const { data: session, status } = useSession()

  const [tab, setTab] = useState<TabType>('form')
  const [formType, setFormType] = useState<FormType>('expense')

  const [amount, setAmount] = useState('')
  const [dateY, setDateY] = useState<number | null>(null)
  const [dateM, setDateM] = useState<number | null>(null)
  const [dateD, setDateD] = useState<number | null>(null)
  const [category, setCategory] = useState('transport')
  const [summary, setSummary] = useState('')
  const [payerName, setPayerName] = useState('')
  const [hours, setHours] = useState('')
  const [hoursUnit, setHoursUnit] = useState<HoursUnit>('hours')
  const [leaveType, setLeaveType] = useState('annual')

  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const [history, setHistory] = useState<Expense[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const [jobSites, setJobSites] = useState<JobSite[]>([])
  const [selectedSite, setSelectedSite] = useState<JobSite | null>(null)
  const [todayLogs, setTodayLogs] = useState<AttendanceLog[]>([])
  const [locating, setLocating] = useState(false)
  const [clocking, setClocking] = useState(false)
  const [clockMessage, setClockMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)
  const [distance, setDistance] = useState<number | null>(null)

  const getDateString = () => {
    if (!dateY || !dateM || !dateD) return ''
    return `${dateY}-${String(dateM).padStart(2, '0')}-${String(dateD).padStart(2, '0')}`
  }

  const getHoursValue = () => {
    if (!hours) return 0
    return hoursUnit === 'days' ? parseFloat(hours) * 8 : parseFloat(hours)
  }

  const getUserId = async () => {
    const lineUserId = (session!.user as any).id
    const { data: existingUser } = await supabase
      .from('users').select('id').eq('line_user_id', lineUserId).single()
    if (existingUser) return existingUser.id
    const { data: newUser } = await supabase.from('users').insert({
      name: session!.user?.name || '未知用戶',
      email: session!.user?.email || `${lineUserId}@line.user`,
      role: 'submitter',
      line_user_id: lineUserId,
    }).select('id').single()
    return newUser?.id
  }

  const fetchHistory = async () => {
    setHistoryLoading(true)
    const userId = await getUserId()
    const { data } = await supabase.from('expenses').select('*')
      .eq('submitter_id', userId).order('submitted_at', { ascending: false })
    setHistory(data || [])
    setHistoryLoading(false)
  }

  const fetchJobSites = async () => {
    const { data } = await supabase.from('job_sites').select('*').eq('is_active', true).order('name')
    setJobSites(data || [])
    if (data && data.length === 1) setSelectedSite(data[0])
  }

  const fetchTodayLogs = async () => {
    const userId = await getUserId()
    if (!userId) return
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase.from('attendance_logs').select('*')
      .eq('user_id', userId)
      .gte('clocked_at', `${today}T00:00:00`)
      .lte('clocked_at', `${today}T23:59:59`)
      .order('clocked_at', { ascending: true })
    setTodayLogs(data || [])
  }

  useEffect(() => {
    if (tab === 'history' && session) fetchHistory()
    if (tab === 'clock' && session) { fetchJobSites(); fetchTodayLogs() }
  }, [tab, session])

  useEffect(() => {
    if (selectedSite && userLat && userLng) {
      setDistance(Math.round(getDistance(userLat, userLng, selectedSite.lat, selectedSite.lng)))
    } else {
      setDistance(null)
    }
  }, [selectedSite, userLat, userLng])

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
    setAmount(''); setDateY(null); setDateM(null); setDateD(null)
    setSummary(''); setPayerName(''); setHours(''); setHoursUnit('hours')
    setLeaveType('annual'); setReceiptFile(null); setReceiptPreview(null)
  }

  const handleSubmit = async () => {
    const isAttendance = formType === 'overtime' || formType === 'leave'
    const date = getDateString()
    if (!date || !summary) { alert('請填寫所有欄位（包含日期）'); return }
    if (!isAttendance && !amount) { alert('請填寫金額'); return }
    if (isAttendance && !hours) { alert('請填寫時數'); return }
    if (formType === 'collection' && !payerName) { alert('請填寫付款人姓名'); return }

    setLoading(true)
    const userId = await getUserId()

    const insertPayload: Record<string, unknown> = {
      submitter_id: userId, expense_date: date, summary,
      status: 'submitted', type: formType, category: 'other', amount: 0,
    }
    if (formType === 'expense') { insertPayload.amount = parseFloat(amount); insertPayload.category = category }
    else if (formType === 'collection') { insertPayload.amount = parseFloat(amount); insertPayload.payer_name = payerName }
    else if (formType === 'overtime') { insertPayload.hours = getHoursValue() }
    else if (formType === 'leave') { insertPayload.hours = getHoursValue(); insertPayload.leave_type = leaveType }

    const { data: inserted, error } = await supabase.from('expenses').insert(insertPayload).select('id').single()
    if (error || !inserted) { alert('送出失敗：' + error?.message); setLoading(false); return }

    if (receiptFile) {
      const url = await uploadReceipt(receiptFile, inserted.id)
      if (url) await supabase.from('expenses').update({ receipt_url: url }).eq('id', inserted.id)
    }

    const labelMap: Record<FormType, string> = {
      expense: '費用申請', collection: '代收款項', overtime: '加班申請', leave: '請假申請',
    }
    const hoursDisplay = hoursUnit === 'days' ? `${hours}天（${getHoursValue()}小時）` : `${hours}小時`
    const extraInfo = formType === 'expense' ? `類別：${categoryMap[category]}\n`
      : formType === 'collection' ? `付款人：${payerName}\n`
      : formType === 'leave' ? `假別：${leaveTypeMap[leaveType]}\n時數：${hoursDisplay}\n`
      : `時數：${hoursDisplay}\n`

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

  const locateMe = () => {
    setLocating(true)
    setClockMessage({ text: '定位中...', type: 'info' })
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserLat(pos.coords.latitude)
        setUserLng(pos.coords.longitude)
        setLocating(false)
        setClockMessage(null)
      },
      () => {
        setLocating(false)
        setClockMessage({ text: '無法取得位置，請確認已開啟定位權限', type: 'error' })
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const handleClock = async (type: 'clock_in' | 'clock_out') => {
    if (!selectedSite) { setClockMessage({ text: '請先選擇案場', type: 'error' }); return }
    if (!userLat || !userLng) { setClockMessage({ text: '請先取得定位', type: 'error' }); return }
    const dist = getDistance(userLat, userLng, selectedSite.lat, selectedSite.lng)
    if (dist > selectedSite.radius_meters) {
      setClockMessage({ text: `距離案場 ${Math.round(dist)} 公尺，超出範圍（${selectedSite.radius_meters}公尺），無法打卡`, type: 'error' })
      return
    }
    setClocking(true)
    const userId = await getUserId()
    const { error } = await supabase.from('attendance_logs').insert({
      user_id: userId, job_site_id: selectedSite.id, type,
      lat: userLat, lng: userLng,
      distance_meters: Math.round(dist),
      clocked_at: new Date().toISOString(),
    })
    if (error) {
      setClockMessage({ text: '打卡失敗：' + error.message, type: 'error' })
    } else {
      setClockMessage({ text: type === 'clock_in' ? '✅ 上班打卡成功！' : '✅ 下班打卡成功！', type: 'success' })
      fetchTodayLogs()
    }
    setClocking(false)
  }

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })

  const clockedIn = todayLogs.some(l => l.type === 'clock_in')
  const clockedOut = todayLogs.some(l => l.type === 'clock_out')

  const workHours = () => {
    const inLog = todayLogs.find(l => l.type === 'clock_in')
    const outLog = todayLogs.find(l => l.type === 'clock_out')
    if (!inLog || !outLog) return null
    return ((new Date(outLog.clocked_at).getTime() - new Date(inLog.clocked_at).getTime()) / 3600000).toFixed(1)
  }

  const formatHours = (h: number | null) => {
    if (!h) return '0小時'
    if (h % 8 === 0) return `${h / 8}天（${h}小時）`
    return `${h}小時`
  }

  const statusLabel = (s: string, type: string) => {
    if (type === 'overtime' || type === 'leave') return s === 'submitted'
      ? { text: '待確認', color: 'text-purple-600 bg-purple-50' }
      : { text: '已確認', color: 'text-green-600 bg-green-50' }
    if (s === 'submitted') return type === 'collection'
      ? { text: '待繳回', color: 'text-yellow-600 bg-yellow-50' }
      : { text: '待入帳', color: 'text-orange-500 bg-orange-50' }
    return { text: '已完成', color: 'text-green-600 bg-green-50' }
  }

  const typeIcon: Record<string, string> = { expense: '💸', collection: '💰', overtime: '⏰', leave: '🏖️' }
  const typeLabelMap: Record<string, string> = { expense: '費用申請', collection: '代收款項', overtime: '加班申請', leave: '請假申請' }
  const isAttendanceForm = formType === 'overtime' || formType === 'leave'

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
          <button onClick={() => signIn('line')}
            className="w-full bg-green-500 text-white rounded-lg py-3 text-sm font-medium hover:bg-green-600 transition">
            使用 LINE 登入
          </button>
        </div>
      </main>
    )
  }

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
        <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded-xl p-1 mb-5">
          {([
            { key: 'form', label: '📝 新增申請' },
            { key: 'history', label: '📋 我的記錄' },
            { key: 'clock', label: '📍 打卡' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`py-2 rounded-lg text-sm font-medium transition ${tab === t.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── 填單 ── */}
        {tab === 'form' && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="grid grid-cols-2 gap-2 mb-5">
              {([
                { value: 'expense', label: '💸 費用申請', active: 'text-blue-600' },
                { value: 'collection', label: '💰 代收款項', active: 'text-yellow-600' },
                { value: 'overtime', label: '⏰ 加班申請', active: 'text-purple-600' },
                { value: 'leave', label: '🏖️ 請假申請', active: 'text-teal-600' },
              ] as const).map(t => (
                <button key={t.value} onClick={() => setFormType(t.value)}
                  className={`py-2.5 rounded-xl text-sm font-medium border transition ${
                    formType === t.value ? `bg-white ${t.active} border-current shadow-sm` : 'bg-gray-50 text-gray-400 border-transparent'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            {success && (
              <div className="bg-green-50 text-green-700 rounded-lg p-3 mb-4 text-sm">✅ 申請已送出！</div>
            )}

            <div className="space-y-4">
              {formType === 'collection' && (
                <div>
                  <label className="text-sm text-gray-600 font-medium">付款人姓名</label>
                  <input type="text" value={payerName} onChange={e => setPayerName(e.target.value)}
                    placeholder="請輸入付款人姓名"
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
                </div>
              )}

              {formType === 'leave' && (
                <div>
                  <label className="text-sm text-gray-600 font-medium">假別</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {Object.entries(leaveTypeMap).map(([v, l]) => (
                      <button key={v} onClick={() => setLeaveType(v)}
                        className={`px-3 py-1 rounded-full text-sm border transition ${leaveType === v ? 'bg-teal-500 text-white border-teal-500' : 'bg-white text-gray-500 border-gray-200'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!isAttendanceForm && (
                <div>
                  <label className="text-sm text-gray-600 font-medium">金額（NT$）</label>
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                    placeholder="請輸入金額"
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              )}

              {isAttendanceForm && (
                <div>
                  <label className="text-sm text-gray-600 font-medium">
                    {formType === 'overtime' ? '加班時數' : '請假時數'}
                  </label>
                  <div className="flex bg-gray-100 rounded-lg p-1 mt-1 mb-2">
                    <button onClick={() => setHoursUnit('hours')}
                      className={`flex-1 py-1.5 rounded-md text-sm font-medium transition ${hoursUnit === 'hours' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}>
                      以小時計
                    </button>
                    <button onClick={() => setHoursUnit('days')}
                      className={`flex-1 py-1.5 rounded-md text-sm font-medium transition ${hoursUnit === 'days' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}>
                      以天計
                    </button>
                  </div>
                  <input type="number" step="0.5" value={hours} onChange={e => setHours(e.target.value)}
                    placeholder={hoursUnit === 'hours' ? '例：2 或 2.5' : '例：1 或 0.5'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" />
                  {hours && (
                    <p className="text-xs text-purple-500 mt-1">
                      = {hoursUnit === 'days' ? `${parseFloat(hours) * 8}小時` : `${parseFloat(hours) / 8}天`}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="text-sm text-gray-600 font-medium">
                  {formType === 'expense' ? '費用日期' : formType === 'collection' ? '收款日期' : formType === 'overtime' ? '加班日期' : '請假日期'}
                </label>
                <DatePicker year={dateY} month={dateM} day={dateD}
                  onYearChange={setDateY} onMonthChange={setDateM} onDayChange={setDateD} />
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
                      <button key={c.value} onClick={() => setCategory(c.value)}
                        className={`px-3 py-1 rounded-full text-sm border transition ${category === c.value ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-200'}`}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm text-gray-600 font-medium">
                  {isAttendanceForm ? '事由說明' : '摘要說明'}
                </label>
                <textarea value={summary} onChange={e => setSummary(e.target.value)}
                  placeholder={formType === 'expense' ? '請簡述費用用途' : formType === 'collection' ? '請簡述代收原因' : formType === 'overtime' ? '請簡述加班事由' : '請簡述請假事由'}
                  rows={3}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>

              {!isAttendanceForm && (
                <div>
                  <label className="text-sm text-gray-600 font-medium">收據照片（選填）</label>
                  <div onClick={() => fileInputRef.current?.click()}
                    className="mt-1 border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-blue-300 transition">
                    {receiptPreview
                      ? <img src={receiptPreview} alt="收據預覽" className="max-h-40 mx-auto rounded-lg object-contain" />
                      : <p className="text-sm text-gray-400">📷 點此上傳收據照片</p>}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
                    onChange={handleFileChange} className="hidden" />
                  {receiptFile && (
                    <button onClick={() => { setReceiptFile(null); setReceiptPreview(null) }}
                      className="mt-1 text-xs text-red-400 hover:text-red-600">
                      ✕ 移除照片
                    </button>
                  )}
                </div>
              )}

              <button onClick={handleSubmit} disabled={loading}
                className={`w-full text-white rounded-lg py-3 text-sm font-medium transition disabled:opacity-50 ${
                  formType === 'expense' ? 'bg-blue-500 hover:bg-blue-600'
                    : formType === 'collection' ? 'bg-yellow-500 hover:bg-yellow-600'
                    : formType === 'overtime' ? 'bg-purple-500 hover:bg-purple-600'
                    : 'bg-teal-500 hover:bg-teal-600'
                }`}>
                {loading ? '送出中...' : `送出${formType === 'expense' ? '費用申請' : formType === 'collection' ? '代收款項' : formType === 'overtime' ? '加班申請' : '請假申請'}`}
              </button>
            </div>
          </div>
        )}

        {/* ── 我的記錄 ── */}
        {tab === 'history' && (
          <div>
            {historyLoading && <p className="text-sm text-gray-400 text-center py-8">載入中...</p>}
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
                          {typeLabelMap[e.type] || e.type}
                          {e.type === 'collection' && ` ・${e.payer_name}`}
                          {e.type === 'expense' && ` ・${categoryMap[e.category] || e.category}`}
                          {e.type === 'leave' && e.leave_type && ` ・${leaveTypeMap[e.leave_type]}`}
                        </span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sl.color}`}>{sl.text}</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-1">{e.expense_date}</p>
                    <p className="text-sm text-gray-500 mb-2">{e.summary}</p>
                    <div className="flex justify-between items-center">
                      {isAttendance
                        ? <span className="text-base font-bold text-gray-700">{formatHours(e.hours)}</span>
                        : <span className="text-base font-bold text-gray-700">NT${Number(e.amount).toLocaleString()}</span>}
                      {e.erp_ref_no && <span className="text-xs text-green-500">#{e.erp_ref_no}</span>}
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

        {/* ── 打卡 ── */}
        {tab === 'clock' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <p className="text-xs text-gray-400 font-medium mb-3">今日打卡狀態</p>
              <div className="flex gap-3">
                <div className={`flex-1 rounded-xl p-3 text-center ${clockedIn ? 'bg-green-50' : 'bg-gray-50'}`}>
                  <p className="text-xs text-gray-400 mb-1">上班</p>
                  {clockedIn
                    ? <p className="text-sm font-bold text-green-600">{formatTime(todayLogs.find(l => l.type === 'clock_in')!.clocked_at)}</p>
                    : <p className="text-sm text-gray-300">--:--</p>}
                </div>
                <div className={`flex-1 rounded-xl p-3 text-center ${clockedOut ? 'bg-blue-50' : 'bg-gray-50'}`}>
                  <p className="text-xs text-gray-400 mb-1">下班</p>
                  {clockedOut
                    ? <p className="text-sm font-bold text-blue-600">{formatTime(todayLogs.find(l => l.type === 'clock_out')!.clocked_at)}</p>
                    : <p className="text-sm text-gray-300">--:--</p>}
                </div>
                {workHours() && (
                  <div className="flex-1 rounded-xl p-3 text-center bg-purple-50">
                    <p className="text-xs text-gray-400 mb-1">工時</p>
                    <p className="text-sm font-bold text-purple-600">{workHours()}h</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-5">
              <p className="text-sm text-gray-600 font-medium mb-3">選擇案場</p>
              <div className="space-y-2">
                {jobSites.length === 0 && <p className="text-sm text-gray-400">目前沒有啟用中的案場</p>}
                {jobSites.map(site => (
                  <button key={site.id} onClick={() => setSelectedSite(site)}
                    className={`w-full text-left rounded-xl border p-3 transition ${selectedSite?.id === site.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                    <p className={`text-sm font-medium ${selectedSite?.id === site.id ? 'text-blue-600' : 'text-gray-800'}`}>
                      📍 {site.name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{site.address}</p>
                    <p className="text-xs text-gray-400">打卡範圍：{site.radius_meters} 公尺</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-5">
              <p className="text-sm text-gray-600 font-medium mb-3">取得位置並打卡</p>
              <button onClick={locateMe} disabled={locating}
                className="w-full border border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50 mb-3">
                {locating ? '定位中...' : '📡 取得目前位置'}
              </button>

              {userLat && selectedSite && distance !== null && (
                <div className={`rounded-xl p-3 mb-3 text-sm text-center ${distance <= selectedSite.radius_meters ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                  {distance <= selectedSite.radius_meters
                    ? `✅ 距離案場 ${distance} 公尺，可以打卡`
                    : `❌ 距離案場 ${distance} 公尺，超出範圍`}
                </div>
              )}

              {clockMessage && (
                <div className={`rounded-xl p-3 mb-3 text-sm text-center ${
                  clockMessage.type === 'success' ? 'bg-green-50 text-green-600'
                    : clockMessage.type === 'error' ? 'bg-red-50 text-red-500'
                    : 'bg-blue-50 text-blue-500'
                }`}>
                  {clockMessage.text}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => handleClock('clock_in')}
                  disabled={clocking || clockedIn || !userLat}
                  className="flex-1 bg-green-500 text-white rounded-xl py-3 text-sm font-medium hover:bg-green-600 transition disabled:opacity-40">
                  {clockedIn ? '✓ 已上班' : '🟢 上班打卡'}
                </button>
                <button onClick={() => handleClock('clock_out')}
                  disabled={clocking || !clockedIn || clockedOut || !userLat}
                  className="flex-1 bg-blue-500 text-white rounded-xl py-3 text-sm font-medium hover:bg-blue-600 transition disabled:opacity-40">
                  {clockedOut ? '✓ 已下班' : '🔵 下班打卡'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}