import type { NodeLatencyProbeResult } from '~/apis'
import { Zap, CheckCircle, AlertTriangle, Clock, BarChart3 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNodesQuery } from '~/apis'
import { Section } from '~/components/Section'
import { Button } from '~/components/ui/button'
import { SimpleTooltip } from '~/components/ui/tooltip'
import { cn } from '~/lib/utils'
import { hasMeasuredLatency } from '~/utils/latency'

interface NodeSpeedTestProps {
  nodeLatencies?: Record<string, NodeLatencyProbeResult>
  onTestAllNodeLatencies: () => Promise<void>
  testingLatencies?: boolean
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
  onTestAllNodeLatencies,
  testingLatencies,
  lastLatencyProbeAt,
}: NodeSpeedTestProps) {
  const { t } = useTranslation()
  const { data: nodesQuery } = useNodesQuery()
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [bestNode, setBestNode] = useState<NodeStats | null>(null)
  const [stats, setStats] = useState<{
    total: number
    alive: number
    fast: number
    medium: number
    slow: number
    dead: number
  } | null>(null)

  const nodes = useMemo(() => nodesQuery?.nodes.edges ?? [], [nodesQuery?.nodes.edges])

  const getNodeStats = useCallback((nodeId: string): NodeStats => {
    const node = nodes.find(n => n.id === nodeId)
    const latency = nodeLatencies?.[nodeId]
    
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
      id: nodeId,
      name: node?.tag || node?.name || node?.address || nodeId,
      latencyMs: latency?.latencyMs ?? null,
      alive: latency?.alive ?? false,
      status,
    }
  }, [nodes, nodeLatencies])

  const analyzeNodes = useCallback(async () => {
    setIsAnalyzing(true)
    try {
      const nodeStats = nodes.map(node => getNodeStats(node.id))
      
      const aliveNodes = nodeStats.filter(n => n.alive && n.latencyMs != null)
      const fastNodes = aliveNodes.filter(n => n.status === 'fast')
      const mediumNodes = aliveNodes.filter(n => n.status === 'medium')
      const slowNodes = aliveNodes.filter(n => n.status === 'slow')
      const deadNodes = nodeStats.filter(n => n.status === 'dead')

      setStats({
        total: nodeStats.length,
        alive: aliveNodes.length,
        fast: fastNodes.length,
        medium: mediumNodes.length,
        slow: slowNodes.length,
        dead: deadNodes.length,
      })

      // Find the best node (lowest latency among alive nodes)
      const bestCandidate = aliveNodes
        .sort((a, b) => (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity))[0]

      setBestNode(bestCandidate || null)
    } finally {
      setIsAnalyzing(false)
    }
  }, [nodes, getNodeStats])

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
      onCreate={() => {}}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {t('speedTest.description', 'Analyze node performance and find the best node')}
          </div>
          <div className="flex items-center gap-2">
            <SimpleTooltip label={t('speedTest.testAll', 'Test all node latencies')}>
              <Button
                variant="outline"
                size="sm"
                onClick={onTestAllNodeLatencies}
                loading={testingLatencies}
                disabled={testingLatencies}
              >
                <Zap className="h-4 w-4 mr-2" />
                {t('speedTest.testNow', 'Test Now')}
              </Button>
            </SimpleTooltip>
            <SimpleTooltip label={t('speedTest.analyze', 'Analyze node performance')}>
              <Button
                variant="default"
                size="sm"
                onClick={analyzeNodes}
                loading={isAnalyzing}
                disabled={isAnalyzing || !lastLatencyProbeAt}
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                {t('speedTest.analyze', 'Analyze')}
              </Button>
            </SimpleTooltip>
          </div>
        </div>

        {!lastLatencyProbeAt ? (
          <div className="text-center py-6 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('speedTest.noTestData', 'No test data available. Click "Test Now" to start.')}</p>
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
