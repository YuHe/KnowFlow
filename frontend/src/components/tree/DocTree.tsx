import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTreeStore } from '@/store/treeStore'
import TreeNode from './TreeNode'

interface DocTreeProps {
  kbId: string
  readOnly?: boolean
}

const DocTree: React.FC<DocTreeProps> = ({ kbId, readOnly = false }) => {
  const {
    treeNodes,
    fetchTree,
    selectedNodeId,
    selectNode,
    expandedIds,
    toggleExpand,
    isLoading,
  } = useTreeStore()

  const navigate = useNavigate()

  useEffect(() => {
    fetchTree(kbId)
  }, [kbId])

  const handleSelectNode = (id: string) => {
    selectNode(id)
    if (id.startsWith('doc-')) {
      const docId = id.slice(4)
      navigate(`/kb/${kbId}/docs/${docId}`)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        加载目录...
      </div>
    )
  }

  return (
    <div className="py-2">
      {!readOnly && (
        <div className="flex items-center gap-1 px-3 pb-2">
          <button
            onClick={() => navigate(`/kb/${kbId}/docs/new`)}
            className="flex-1 flex items-center gap-1 justify-center py-1.5 text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg transition border border-dashed border-border hover:border-primary/40"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新建文档
          </button>
        </div>
      )}

      {treeNodes.length > 0 ? (
        treeNodes.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            kbId={kbId}
            readOnly={readOnly}
            selectedNodeId={selectedNodeId}
            expandedIds={expandedIds}
            onSelect={handleSelectNode}
            onToggleExpand={toggleExpand}
          />
        ))
      ) : (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          <svg className="w-8 h-8 text-muted mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          暂无文档
        </div>
      )}
    </div>
  )
}

export default DocTree
