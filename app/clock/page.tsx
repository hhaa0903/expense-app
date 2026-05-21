'use client'

import { useState, useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { supabase } from '../../lib/supabase'

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
  note: string | null
}

function getDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function ClockPage() {
  const { data: session, status } = useSession()

  const [jobSites, setJobSites] = useState<JobSite[]>([])
  const [selectedSite, setSelectedSite] = useState<JobSite | null>(null)
  const [todayLogs, setTodayLogs] = useState<AttendanceLog[]>([])

  const [locating, setLocating] = useState(false)
  const [clocking, setClocking] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null)

  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)
  const [distance, setDistance] = useState<number | null>(null)

  const getUserId = async () => {
    const lineUserId = (session!.user as any).id
    const { data } = await supabase.from('users').select('id').eq('line_user_id', lineUserId).single()
    return data?.id
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
    const { data } = await supabase
      .from('attendance_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('clocked_at', `${today}T00:00:00`)
      .lte('clocked_at', `${today}T23:59:59`)
      .order('clocked_at', { ascending: true })
    setTodayLogs(data || [])
  }

  useEffect(() => {
    if (session) {
      fetchJobSites()
      fetchTodayLogs()
    }
  }, [session])

  useEffect(() => {
    if (selectedSite && userLat && userLng) {
      const d = getDistance(userLat, userLng, selectedSite.lat, selectedSite.lng)
      setDistance(Math.round(d))
    } else {
      setDistance(null)
    }
  }, [selectedSite, userLat, userLng])

  const locateMe = () => {
    setLocating(true)
    setMessage({ text: '定位中...', type: 'info' })
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserLat(pos.coords.latitude)
        setUserLng(pos.coords.longitude)
        setLocating(false)
        setMessage(null)
      },
      err => {
        setLocating(false)
        setMessage({ text: '無法取得位置，請確認已開啟定位權限', type: 'error' })
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const handleClock = async (type: 'clock_in' | 'clock_out') => {
    if (!selectedSite) {
      setMessage({ text: '請先選擇案場', type: 'error' })
      return
    }
    if (!userLat || !userLng) {
      setMessage({ text: '請先取得定位', type: 'error' })
      return
    }

    const dist = getDistance(userLat, userLng, selectedSite.lat, selectedSite.lng)
    if (dist > selectedSite.radius_meters) {
      setMessage({ text: `距離案場 ${Math.round(dist)} 公尺，超出範圍（${selectedSite.radius_meters}公尺），無法打卡`, type: 'error' })
      return
    }

    setClocking(true)
    const userId = await getUserId()

    const { error } = await supabase.from('attendance_logs').insert({
      user_id: userId,
      job_site_id: selectedSite.id,
      type,
      lat: userLat,
      lng: userLng,
      distance_meters: Math.round(dist),
      clocked_at: new Date().toISOString(),
    })

    if (error) {
      setMessage({ text: '打卡失敗：' + error.message, type: 'error' })
    } else {
      setMessage({ text: type === 'clock_in' ? '✅ 上班打卡成功！' : '✅ 下班打卡成功！', type: 'success' })
      fetchTodayLogs()
    }
    setClocking(false)
  }

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
  }

  const clockedIn = todayLogs.some(l => l.type === 'clock_in')
  const clockedOut = todayLogs.some(l => l.type === 'clock_out')

  const workHours = () => {
    const inLog = todayLogs.find(l => l.type === 'clock_in')
    const outLog = todayLogs.find(l => l.type === 'clock_out')
    if (!inLog || !outLog) return null
    const diff = (new Date(outLog.clocked_at).getTime() - new Date(inLog.clocked_at).getTime()) / 1000 / 60 / 60
    return diff.toFixed(1)
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
          <h1 className="text-xl font-bold text-gray-800 mb-2">案場打卡系統</h1>
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

        <div className="mb-5 pt-2">
          <h1 className="text-xl font-bold text-gray-800">案場打卡</h1>
          <p className="text-xs text-gray-400">{session.user?.name}</p>
        </div>

        {/* 今日狀態 */}
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
          <p className="text-xs text-gray-400 font-medium mb-3">今日打卡狀態</p>
          <div className="flex gap-3">
            <div className={`flex-1 rounded-xl p-3 text-center ${clockedIn ? 'bg-green-50' : 'bg-gray-50'}`}>
              <p className="text-xs text-gray-400 mb-1">上班</p>
              {clockedIn ? (
                <p className="text-sm font-bold text-green-600">
                  {formatTime(todayLogs.find(l => l.type === 'clock_in')!.clocked_at)}
                </p>
              ) : (
                <p className="text-sm text-gray-300">--:--</p>
              )}
            </div>
            <div className={`flex-1 rounded-xl p-3 text-center ${clockedOut ? 'bg-blue-50' : 'bg-gray-50'}`}>
              <p className="text-xs text-gray-400 mb-1">下班</p>
              {clockedOut ? (
                <p className="text-sm font-bold text-blue-600">
                  {formatTime(todayLogs.find(l => l.type === 'clock_out')!.clocked_at)}
                </p>
              ) : (
                <p className="text-sm text-gray-300">--:--</p>
              )}
            </div>
            {workHours() && (
              <div className="flex-1 rounded-xl p-3 text-center bg-purple-50">
                <p className="text-xs text-gray-400 mb-1">工時</p>
                <p className="text-sm font-bold text-purple-600">{workHours()}h</p>
              </div>
            )}
          </div>
        </div>

        {/* 選擇案場 */}
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
          <p className="text-sm text-gray-600 font-medium mb-3">選擇案場</p>
          <div className="space-y-2">
            {jobSites.length === 0 && (
              <p className="text-sm text-gray-400">目前沒有啟用中的案場</p>
            )}
            {jobSites.map(site => (
              <button key={site.id} onClick={() => setSelectedSite(site)}
                className={`w-full text-left rounded-xl border p-3 transition ${
                  selectedSite?.id === site.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white'
                }`}>
                <p className={`text-sm font-medium ${selectedSite?.id === site.id ? 'text-blue-600' : 'text-gray-800'}`}>
                  📍 {site.name}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{site.address}</p>
                <p className="text-xs text-gray-400">打卡範圍：{site.radius_meters} 公尺</p>
              </button>
            ))}
          </div>
        </div>

        {/* 定位 + 打卡 */}
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
          <p className="text-sm text-gray-600 font-medium mb-3">取得位置並打卡</p>

          <button onClick={locateMe} disabled={locating}
            className="w-full border border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50 mb-3">
            {locating ? '定位中...' : '📡 取得目前位置'}
          </button>

          {userLat && selectedSite && distance !== null && (
            <div className={`rounded-xl p-3 mb-3 text-sm text-center ${
              distance <= selectedSite.radius_meters
                ? 'bg-green-50 text-green-600'
                : 'bg-red-50 text-red-500'
            }`}>
              {distance <= selectedSite.radius_meters
                ? `✅ 距離案場 ${distance} 公尺，可以打卡`
                : `❌ 距離案場 ${distance} 公尺，超出範圍`}
            </div>
          )}

          {message && (
            <div className={`rounded-xl p-3 mb-3 text-sm text-center ${
              message.type === 'success' ? 'bg-green-50 text-green-600'
                : message.type === 'error' ? 'bg-red-50 text-red-500'
                : 'bg-blue-50 text-blue-500'
            }`}>
              {message.text}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => handleClock('clock_in')}
              disabled={clocking || clockedIn || !userLat}
              className="flex-1 bg-green-500 text-white rounded-xl py-3 text-sm font-medium hover:bg-green-600 transition disabled:opacity-40"
            >
              {clockedIn ? '✓ 已上班' : '🟢 上班打卡'}
            </button>
            <button
              onClick={() => handleClock('clock_out')}
              disabled={clocking || !clockedIn || clockedOut || !userLat}
              className="flex-1 bg-blue-500 text-white rounded-xl py-3 text-sm font-medium hover:bg-blue-600 transition disabled:opacity-40"
            >
              {clockedOut ? '✓ 已下班' : '🔵 下班打卡'}
            </button>
          </div>
        </div>

      </div>
    </main>
  )
}