import type { NodeLatencyProbeResult } from '~/apis'
import { ArrowRight, Globe, Link, Plus, Search, Trash2, Zap, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGroupsQuery, useSubscriptionsQuery } from '~/apis'
import { Section } from '~/components/Section'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { SimpleTooltip } from '~/components/ui/tooltip'
import { cn } from '~/lib/utils'
import { hasMeasuredLatency } from '~/utils/latency'

interface ChainNode {
  id: string
  name: string
  groupId: string
  groupName: string
  protocol?: string
  latencyMs?: number | null
}

interface ChainProxyProps {
  nodeLatencies?: Record<string, NodeLatencyProbeResult>
}

export function ChainProxy({ nodeLatencies }: ChainProxyProps) {
  const { t } = useTranslation()
  const { data: groupsQuery } = useGroupsQuery()
  const { data: subscriptionsQuery } = useSubscriptionsQuery()
  const [intermediateNodes, setIntermediateNodes] = useState<ChainNode[]>([])
  const [exitNode, setExitNode] = useState<ChainNode | null>(null)
  const [isAutoSelecting, setIsAutoSelecting] = useState(false)
  const [showNodePicker, setShowNodePicker] = useState<'intermediate' | 'exit' | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all')

  const groups = useMemo(() => groupsQuery?.groups ?? [], [groupsQuery?.groups])
  const subscriptions = useMemo(() => subscriptionsQuery?.subscriptions ?? [], [subscriptionsQuery?.subscriptions])

  const allNodes = useMemo(() => {
    const nodeMap = new Map<string, { id: string; name: string; protocol?: string; groupId: string; groupName: string }>()

    for (const group of groups) {
      for (const node of group.nodes) {
        if (!nodeMap.has(node.id)) {
          nodeMap.set(node.id, {
            id: node.id,
            name: node.tag || node.name || node.address,
            protocol: node.protocol,
            groupId: group.id,
            groupName: group.name,
          })
        }
      }
    }

    for (const sub of subscriptions) {
      for (const node of sub.nodes.edges) {
        if (!nodeMap.has(node.id)) {
          nodeMap.set(node.id, {
            id: node.id,
            name: node.name || node.id,
            protocol: node.protocol,
            groupId: '',
            groupName: sub.tag || 'Subscription',
          })
        }
      }
    }

    return Array.from(nodeMap.values())
  }, [groups, subscriptions])

  const addIntermediateNode = useCallback((node: ChainNode) => {
    setIntermediateNodes((prev) => {
      if (prev.some((n) => n.id === node.id)) return prev
      return [...prev, node]
    })
    setShowNodePicker(null)
    setSearchQuery('')
  }, [])

  const setAsExitNode = useCallback((node: ChainNode) => {
    setExitNode(node)
    setShowNodePicker(null)
    setSearchQuery('')
  }, [])

  const removeIntermediateNode = useCallback((nodeId: string) => {
    setIntermediateNodes((prev) => prev.filter((n) => n.id !== nodeId))
  }, [])

  const removeExitNode = useCallback(() => {
    setExitNode(null)
  }, [])

  const clearChain = useCallback(() => {
    setIntermediateNodes([])
    setExitNode(null)
  }, [])

  const moveNodeUp = useCallback((index: number) => {
    if (index === 0) return
    setIntermediateNodes((prev) => {
      const newChain = [...prev]
      const temp = newChain[index - 1]
      newChain[index - 1] = newChain[index]
      newChain[index] = temp
      return newChain
    })
  }, [])

  const moveNodeDown = useCallback((index: number) => {
    setIntermediateNodes((prev) => {
      if (index >= prev.length - 1) return prev
      const newChain = [...prev]
      const temp = newChain[index]
      newChain[index] = newChain[index + 1]
      newChain[index + 1] = temp
      return newChain
    })
  }, [])

  const autoSelectBestNodes = useCallback(async () => {
    setIsAutoSelecting(true)
    try {
      const availableNodes = allNodes.filter((node) => {
        const latency = nodeLatencies?.[node.id]
        return latency && hasMeasuredLatency(latency) && latency.alive
      })

      if (availableNodes.length === 0) return

      const sortedNodes = availableNodes
        .map((node) => ({
          ...node,
          latencyMs: nodeLatencies?.[node.id]?.latencyMs ?? Infinity,
        }))
        .sort((a, b) => (a.latencyMs as number) - (b.latencyMs as number))

      // 最优节点作为落地节点
      if (sortedNodes.length > 0) {
        setExitNode(sortedNodes[0])
      }

      // 其他节点作为中间节点（最多3个）
      if (sortedNodes.length > 1) {
        setIntermediateNodes(sortedNodes.slice(1, 4))
      }
    } finally {
      setIsAutoSelecting(false)
    }
  }, [allNodes, nodeLatencies])

  const selectOptimalExitNode = useCallback(() => {
    setIsAutoSelecting(true)
    try {
      const availableNodes = allNodes.filter((node) => {
        const latency = nodeLatencies?.[node.id]
        return latency && hasMeasuredLatency(latency) && latency.alive
      })

      if (availableNodes.length === 0) return

      // min_moving_avg 逻辑：选择延迟最小的节点作为最优机场节点
      const sortedNodes = availableNodes
        .map((node) => ({
          ...node,
          latencyMs: nodeLatencies?.[node.id]?.latencyMs ?? Infinity,
        }))
        .sort((a, b) => (a.latencyMs as number) - (b.latencyMs as number))

      setExitNode(sortedNodes[0])
    } finally {
      setIsAutoSelecting(false)
    }
  }, [allNodes, nodeLatencies])

  const totalLatency = useMemo(() => {
    const intermediate = intermediateNodes.reduce((sum, node) => sum + (node.latencyMs || 0), 0)
    const exit = exitNode?.latencyMs || 0
    return intermediate + exit
  }, [intermediateNodes, exitNode])

  const availableNodesForPicker = useMemo(() => {
    const usedIds = new Set([...intermediateNodes.map((n) => n.id), exitNode?.id].filter(Boolean))

    return allNodes
      .filter((node) => {
        if (usedIds.has(node.id)) return false
        if (selectedGroupId !== 'all' && node.groupId !== selectedGroupId) return false
        if (searchQuery) {
          const query = searchQuery.toLowerCase()
          return (
            node.name.toLowerCase().includes(query) ||
            node.protocol?.toLowerCase().includes(query) ||
            node.groupName.toLowerCase().includes(query)
          )
        }
        return true
      })
      .map((node) => ({
        ...node,
        latencyMs: nodeLatencies?.[node.id]?.latencyMs,
      }))
      .sort((a, b) => (a.latencyMs || Infinity) - (b.latencyMs || Infinity))
  }, [allNodes, intermediateNodes, exitNode, nodeLatencies, searchQuery, selectedGroupId])

  const hasChain = intermediateNodes.length > 0 || exitNode !== null

  return (
    <Section
      title={t('chainProxy.title', 'Chain Proxy')}
      icon={<Link className="h-5 w-5" />}
      bordered
      onCreate={() => {}}
      actions={
        <div className="flex items-center gap-1">
          <SimpleTooltip label={t('chainProxy.autoSelect', 'Auto-select best nodes')}>
            <Button
              variant="ghost"
              size="icon"
              onClick={autoSelectBestNodes}
              loading={isAutoSelecting}
              disabled={isAutoSelecting}
            >
              <Zap className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
          {hasChain && (
            <SimpleTooltip label={t('chainProxy.clear', 'Clear all')}>
              <Button
                variant="ghost"
                size="icon"
                onClick={clearChain}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </SimpleTooltip>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* 流程图示意 */}
        {hasChain && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-2">
            <span className="px-2 py-1 rounded bg-secondary">客户端</span>
            <ArrowRight className="h-3 w-3" />
            {exitNode && (
              <span className="px-2 py-1 rounded bg-green-100 text-green-700 font-medium">
                <Globe className="h-3 w-3 inline mr-1" />
                {exitNode.name}
              </span>
            )}
            {exitNode && intermediateNodes.length > 0 && <ArrowRight className="h-3 w-3" />}
            {intermediateNodes.map((node, i) => (
              <span key={node.id} className="flex items-center gap-1">
                {i > 0 && <ArrowRight className="h-3 w-3" />}
                <span className="px-2 py-1 rounded bg-blue-100 text-blue-700">{node.name}</span>
              </span>
            ))}
            <ArrowRight className="h-3 w-3" />
            <span className="px-2 py-1 rounded bg-secondary">互联网</span>
          </div>
        )}

        {/* 统计信息 */}
        {hasChain && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {exitNode && `${t('chainProxy.airportNode', '机场: {{name}}', { name: exitNode.name })}`}
              {intermediateNodes.length > 0 && ` | ${t('chainProxy.homeBroadbandCount', '家宽: {{count}}个', { count: intermediateNodes.length })}`}
            </span>
            <span>{t('chainProxy.totalLatency', 'Total: {{latency}}ms', { latency: totalLatency.toFixed(0) })}</span>
          </div>
        )}

        {/* 机场节点区域（入口） */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-muted-foreground">
              {t('chainProxy.airportNodeTitle', '机场节点（入口）')}
            </h4>
            <Button
              variant="outline"
              size="sm"
              onClick={selectOptimalExitNode}
              loading={isAutoSelecting}
              disabled={isAutoSelecting}
            >
              <Zap className="h-3 w-3 mr-1" />
              {t('chainProxy.optimalAirportNode', '机场最优节点')}
            </Button>
          </div>

          {!exitNode ? (
            <div
              className="border-2 border-dashed border-green-300 rounded-lg p-4 text-center text-muted-foreground text-sm cursor-pointer hover:bg-green-50 dark:hover:bg-green-950"
              onClick={selectOptimalExitNode}
            >
              {t('chainProxy.selectExit', '点击选择最优机场节点')}
            </div>
          ) : (
            <div className="flex items-center gap-2 p-2 rounded-lg border-2 border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
              <Globe className="h-4 w-4 text-green-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{exitNode.name}</div>
                {exitNode.latencyMs != null && (
                  <span className={cn(
                    'text-xs',
                    exitNode.latencyMs < 100 ? 'text-green-600' : exitNode.latencyMs < 300 ? 'text-yellow-600' : 'text-red-600',
                  )}>
                    {exitNode.latencyMs.toFixed(0)}ms
                  </span>
                )}
              </div>
              <Button variant="ghost" size="xs" onClick={removeExitNode} className="h-6 w-6 p-0 text-destructive">
                ×
              </Button>
            </div>
          )}
        </div>

        {/* 家宽节点区域（出口） */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-muted-foreground">
              {t('chainProxy.homeBroadbandTitle', '家宽节点（出口）')}
            </h4>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNodePicker('intermediate')}
            >
              <Plus className="h-3 w-3 mr-1" />
              {t('chainProxy.addHomeBroadbandNode', '添加家宽节点')}
            </Button>
          </div>

          {intermediateNodes.length === 0 ? (
            <div
              className="border-2 border-dashed rounded-lg p-4 text-center text-muted-foreground text-sm cursor-pointer hover:bg-accent"
              onClick={() => setShowNodePicker('intermediate')}
            >
              {t('chainProxy.clickToAdd', '点击添加家宽节点（可选）')}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {intermediateNodes.map((node, index) => (
                <div key={node.id} className="flex items-center gap-2">
                  <div className="flex-shrink-0 w-5 h-5 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-xs">
                    {index + 1}
                  </div>
                  <div className="flex-1 flex items-center gap-2 p-1.5 rounded border bg-card text-sm">
                    <span className="truncate">{node.name}</span>
                    {node.protocol && (
                      <span className="text-xs px-1 py-0.5 rounded bg-secondary flex-shrink-0">{node.protocol}</span>
                    )}
                    {node.latencyMs != null && (
                      <span
                        className={cn(
                          'text-xs px-1.5 py-0.5 rounded flex-shrink-0',
                          node.latencyMs < 100 ? 'bg-green-100 text-green-700' : node.latencyMs < 300 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700',
                        )}
                      >
                        {node.latencyMs.toFixed(0)}ms
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <Button variant="ghost" size="xs" onClick={() => moveNodeUp(index)} disabled={index === 0} className="h-5 w-5 p-0 text-xs">
                      ↑
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => moveNodeDown(index)} disabled={index === intermediateNodes.length - 1} className="h-5 w-5 p-0 text-xs">
                      ↓
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => removeIntermediateNode(node.id)} className="h-5 w-5 p-0 text-destructive">
                      ×
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 节点选择弹窗 */}
      {showNodePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-lg shadow-lg w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h4 className="text-sm font-medium">
                {showNodePicker === 'exit'
                  ? t('chainProxy.selectExitNode', '选择机场节点')
                  : t('chainProxy.addIntermediate', '添加家宽节点')}
              </h4>
              <Button variant="ghost" size="icon" onClick={() => { setShowNodePicker(null); setSearchQuery('') }} className="h-6 w-6 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('chainProxy.searchNodes', 'Search nodes...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setSelectedGroupId('all')}
                  className={cn(
                    'px-3 py-1 text-xs rounded-full border transition-colors',
                    selectedGroupId === 'all' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent',
                  )}
                >
                  {t('chainProxy.allGroups', 'All')}
                </button>
                {groups.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => setSelectedGroupId(group.id)}
                    className={cn(
                      'px-3 py-1 text-xs rounded-full border transition-colors',
                      selectedGroupId === group.id ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent',
                    )}
                  >
                    {group.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <div className="space-y-1">
                {availableNodesForPicker.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {t('chainProxy.noNodes', 'No nodes available')}
                  </div>
                ) : (
                  availableNodesForPicker.map((node) => (
                    <div
                      key={node.id}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-accent cursor-pointer transition-colors"
                      onClick={() => showNodePicker === 'exit' ? setAsExitNode(node) : addIntermediateNode(node)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {showNodePicker === 'exit' && <Globe className="h-4 w-4 text-green-600 flex-shrink-0" />}
                        <span className="text-sm truncate">{node.name}</span>
                        {node.protocol && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-secondary flex-shrink-0">{node.protocol}</span>
                        )}
                        {node.latencyMs != null && (
                          <span
                            className={cn(
                              'text-xs px-2 py-0.5 rounded-full flex-shrink-0',
                              node.latencyMs < 100 ? 'bg-green-100 text-green-700' : node.latencyMs < 300 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700',
                            )}
                          >
                            {node.latencyMs.toFixed(0)}ms
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">{node.groupName}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Section>
  )
}
