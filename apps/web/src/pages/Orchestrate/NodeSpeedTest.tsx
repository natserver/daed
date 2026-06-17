import type { NodeLatencyProbeResult } from '~/apis'
import { CheckCircle, AlertTriangle, Clock, BarChart3 } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNodesQuery } from '~/apis'
import { Section } from '~/components/Section'
import { cn } from '~/lib/utils'
import { hasMeasuredLatency } from '~/utils/latency'

interface NodeSpeedTestProps {
  nodeLatencies?: Record<string, NodeLatencyProbeResult>
  lastLatencyProbeAt?: string | null
}

interface NodeStats {
  id: string
  name: string
  latencyMs: number | null
  alive: boolean
  status: 'fast' | 'medium' | 'slow' | 'dead' | 'unknown'
}

export function NodeSpeedTest({
  nodeLatencies,
  lastLatencyProbeAt,
}: NodeSpeedTestProps) {
  const { t } = useTranslation()
  const { data: nodesQuery } = useNodesQuery()

  const nodes = useMemo(() => nodesQuery?.nodes.edges ?? [], [nodesQuery?.nodes.edges])

  const sortedNodeStats = useMemo(() => {
    const nodeStats: NodeStats[] = nodes.map(node => {
      const latency = nodeLatencies?.[node.id]
      let status: NodeStats['status'] = 'unknown'
      if (!latency || !hasMeasuredLatency(latency)) {
        status = 'unknown'
      } else if (!latency.alive) {
        status = 'dead'
      } else if (latency.latencyMs != null) {
        if (latency.latencyMs < 100) status = 'fast'
        else if (latency.latencyMs < 300) status = 'medium'
        else status = 'slow'
      }
      return {
        id: node.id,
        name: node.tag || node.name || node.address || node.id,
        latencyMs: latency?.latencyMs ?? null,
        alive: latency?.alive ?? false,
        status,
      }
    })

    const statusOrder: Record<NodeStats['status'], number> = { fast: 0, medium: 1, slow: 2, dead: 3, unknown: 4 }
    return nodeStats.sort((a, b) => {
      const sa = statusOrder[a.status]
      const sb = statusOrder[b.status]
      if (sa !== sb) return sa - sb
      return (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity)
    })
  }, [nodes, nodeLatencies])

  const stats = useMemo(() => {
    if (sortedNodeStats.length === 0) return null
    const alive = sortedNodeStats.filter(n => n.alive && n.latencyMs != null)
    return {
      total: sortedNodeStats.length,
      alive: alive.length,
      fast: alive.filter(n => n.status === 'fast').length,
      medium: alive.filter(n => n.status === 'medium').length,
      slow: alive.filter(n => n.status === 'slow').length,
      dead: sortedNodeStats.filter(n => n.status === 'dead').length,
    }
  }, [sortedNodeStats])

  const bestNode = useMemo(() => {
    return sortedNodeStats.find(n => n.alive && n.latencyMs != null) || null
  }, [sortedNodeStats])

  const getStatusColor = (status: NodeStats['status']) => {
    switch (status) {
      case 'fast': return 'text-green-600 bg-green-50'
      case 'medium': return 'text-yellow-600 bg-yellow-50'
      case 'slow': return 'text-red-600 bg-red-50'
      case 'dead': return 'text-gray-400 bg-gray-50'
      default: return 'text-gray-400 bg-gray-50'
    }
  }

  const getStatusLabel = (status: NodeStats['status']) => {
    switch (status) {
      case 'fast': return t('speedTest.fast', 'Fast')
      case 'medium': return t('speedTest.medium', 'Medium')
      case 'slow': return t('speedTest.slow', 'Slow')
      case 'dead': return t('speedTest.dead', 'Dead')
      default: return t('speedTest.unknown', 'Unknown')
    }
  }

  return (
    <Section
      title={t('speedTest.title', 'Node Speed Test')}
      icon={<BarChart3 className="h-5 w-5" />}
      bordered
    >
      <div className="space-y-4">
        {!lastLatencyProbeAt ? (
          <div className="text-center py-6 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('speedTest.noTestData', 'No test data available.')}</p>
          </div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground">
              {t('speedTest.lastTest', 'Last test: {{time}}', {
                time: new Date(lastLatencyProbeAt).toLocaleString()
              })}
            </div>

            {stats && (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border bg-card">
                  <div className="text-2xl font-bold">{stats.alive}/{stats.total}</div>
                  <div className="text-xs text-muted-foreground">{t('speedTest.aliveNodes', 'Alive Nodes')}</div>
                </div>
                <div className="p-3 rounded-lg border bg-card">
                  <div className="text-2xl font-bold text-green-600">{stats.fast}</div>
                  <div className="text-xs text-muted-foreground">{t('speedTest.fastNodes', 'Fast Nodes (<100ms)')}</div>
                </div>
                <div className="p-3 rounded-lg border bg-card">
                  <div className="text-2xl font-bold text-yellow-600">{stats.medium}</div>
                  <div className="text-xs text-muted-foreground">{t('speedTest.mediumNodes', 'Medium Nodes (100-300ms)')}</div>
                </div>
                <div className="p-3 rounded-lg border bg-card">
                  <div className="text-2xl font-bold text-red-600">{stats.slow + stats.dead}</div>
                  <div className="text-xs text-muted-foreground">{t('speedTest.slowDeadNodes', 'Slow/Dead Nodes')}</div>
                </div>
              </div>
            )}

            {bestNode && (
              <div className="p-4 rounded-lg border-2 border-green-200 bg-green-50">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-800">{t('speedTest.bestNode', 'Best Node')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{bestNode.name}</div>
                    <div className="text-sm text-green-700">
                      {bestNode.latencyMs?.toFixed(0)}ms
                    </div>
                  </div>
                  <span className={cn("px-3 py-1 rounded-full text-sm font-medium", getStatusColor(bestNode.status))}>
                    {getStatusLabel(bestNode.status)}
                  </span>
                </div>
              </div>
            )}

            {sortedNodeStats.length > 0 && (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {sortedNodeStats.map((node) => (
                  <div key={node.id} className="flex items-center justify-between px-3 py-1.5 rounded text-sm hover:bg-accent">
                    <span className="truncate flex-1 mr-2">{node.name}</span>
                    <span className={cn("px-2 py-0.5 rounded text-xs font-medium", getStatusColor(node.status))}>
                      {node.latencyMs != null ? `${node.latencyMs.toFixed(0)}ms` : getStatusLabel(node.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {stats && stats.alive === 0 && (
              <div className="p-4 rounded-lg border border-yellow-200 bg-yellow-50">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  <span className="text-yellow-800 text-sm">
                    {t('speedTest.noAliveNodes', 'No alive nodes found. Check your node configuration.')}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Section>
  )
}
