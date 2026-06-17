import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal, RefreshCw, Download, Trash2, Search, X, Loader2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { cn } from '~/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog'

interface LogViewerProps {
  open: boolean
  onClose: () => void
}

export function LogViewer({ open, onClose }: LogViewerProps) {
  const [logs, setLogs] = useState('')
  const [filter, setFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState<string>('')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [loading, setLoading] = useState(false)
  const [logSize, setLogSize] = useState(0)
  const [showClearDialog, setShowClearDialog] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '1000' })
      if (filter) params.set('keyword', filter)
      if (levelFilter) params.set('level', levelFilter)

      const resp = await fetch(`/cgi-bin/luci/admin/services/daed/get_log?${params}`)
      if (resp.ok) {
        const text = await resp.text()
        setLogs(text)
      }
    } catch {
      setLogs('')
    } finally {
      setLoading(false)
    }
  }, [filter, levelFilter])

  const fetchLogSize = useCallback(async () => {
    try {
      const resp = await fetch('/cgi-bin/luci/admin/services/daed/get_log_file_size')
      if (resp.ok) {
        const data = await resp.json()
        setLogSize(data.size || 0)
      }
    } catch {}
  }, [])

  const clearLogs = useCallback(async () => {
    await fetch('/cgi-bin/luci/admin/services/daed/clear_log')
    setLogs('')
    setLogSize(0)
    setShowClearDialog(false)
  }, [])

  const downloadLogs = useCallback(() => {
    const blob = new Blob([logs], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `daed-log-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [logs])

  useEffect(() => {
    if (open) {
      fetchLogs()
      fetchLogSize()
    }
  }, [open, fetchLogs, fetchLogSize])

  useEffect(() => {
    if (autoRefresh && open) {
      intervalRef.current = setInterval(() => {
        fetchLogs()
        fetchLogSize()
      }, 3000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [autoRefresh, open, fetchLogs, fetchLogSize])

  useEffect(() => {
    if (scrollRef.current && autoRefresh) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs, autoRefresh])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) {
      document.addEventListener('keydown', handleEsc)
      return () => document.removeEventListener('keydown', handleEsc)
    }
  }, [open, onClose])

  const formatSize = (bytes: number) => {
    if (bytes > 1048576) return (bytes / 1048576).toFixed(2) + ' MB'
    if (bytes > 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return bytes + ' B'
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-4xl mx-4 h-[85vh] flex flex-col overflow-hidden border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <Terminal className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">日志</h2>
            <span className="text-xs text-muted-foreground">{formatSize(logSize)}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-5 py-2 border-b bg-muted/20">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索日志..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchLogs()}
              className="pl-8 h-8 text-xs"
            />
          </div>

          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="h-8 px-2 text-xs border rounded-md bg-background"
          >
            <option value="">全部级别</option>
            <option value="ERROR">ERROR</option>
            <option value="WARN">WARN</option>
            <option value="INFO">INFO</option>
            <option value="DEBUG">DEBUG</option>
          </select>

          <div className="h-5 w-px bg-border mx-1" />

          <Button variant="ghost" size="icon" onClick={fetchLogs} className="h-8 w-8" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>

          <Button
            variant={autoRefresh ? 'default' : 'ghost'}
            size="icon"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="h-8 w-8"
          >
            <RefreshCw className={cn('h-4 w-4', autoRefresh && 'animate-spin')} />
          </Button>

          <Button variant="ghost" size="icon" onClick={downloadLogs} className="h-8 w-8">
            <Download className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="icon" onClick={() => setShowClearDialog(true)} className="h-8 w-8 text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Log Content */}
        <div ref={scrollRef} className="flex-1 overflow-auto bg-gray-950">
          <pre className="p-4 text-[13px] font-mono leading-5 text-gray-200 whitespace-pre-wrap break-words">
            {logs || <span className="text-gray-500">暂无日志</span>}
          </pre>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-2 border-t text-xs text-muted-foreground bg-muted/20">
          <span className="flex items-center gap-1.5">
            {autoRefresh && <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
            {autoRefresh ? '自动刷新中...' : '手动模式'}
          </span>
          <span>{logs.split('\n').filter(Boolean).length} 行</span>
        </div>
      </div>

      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清空日志</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将清空所有日志记录，无法恢复。确定要继续吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={clearLogs} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              确认清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
