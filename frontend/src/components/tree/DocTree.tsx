import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTreeStore } from '@/store/treeStore'
import { docsApi } from '@/api/docs'
import TreeNode from './TreeNode'
import TreeContextMenu from './TreeContextMenu'
import type { TreeNode as TreeNodeType } from '@/types'

interface DocTreeProps {
  kbId: string
  readOnly?: boolean
}

interface ContextMenuState {
  nodeId: string
  x: number
  y: number
}

// Convert store TreeNodes to the flat shape TreeContextMenu expects
function flattenForMenu(nodes: TreeNodeType[]): Array<{ id: string; title: string; type: 'folder' | 'doc'; children?: Array<any>; parentId?: string | null }> {
  return nodes.map((n) => ({
    id: n.id,
    title: n.title,
    type: n.type === 'section' ? 'folder' : 'doc',
    parentId: n.parent_id,
    children: n.children ? flattenForMenu(n.children) : [],
  }))
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
    updateSection,
    removeSection,
    removeDoc,
  } = useTreeStore()

  const navigate = useNavigate()
  const [isCreating, setIsCreating] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const handleCreateDoc = async () => {
    if (isCreating) return
    setIsCreating(true)
    try {
      const doc = await docsApi.createDoc(kbId, { title: '无标题文档', content_md: '' })
      await fetchTree(kbId)
      // Navigate to doc page and auto-enter edit mode
      navigate(`/kb/${kbId}/docs/${doc.id}`, { state: { startEditing: true } })
    } finally {
      setIsCreating(false)
    }
  }

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

  const handleContextMenu = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (readOnly) return
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ nodeId, x: e.clientX, y: e.clientY })
  }, [readOnly])

  // Context menu operations
  const handleCreateDocInSection = async (parentId: string | null) => {
    const sectionId = parentId?.startsWith('section-') ? parentId.slice(8) : null
    try {
      const doc = await docsApi.createDoc(kbId, {
        title: '无标题文档',
        content_md: '',
        section_id: sectionId,
      })
      await fetchTree(kbId)
      navigate(`/kb/${kbId}/docs/${doc.id}`, { state: { startEditing: true } })
    } catch {
      // ignore
    }
  }

  const handleCreateSection = async (parentId: string | null) => {
    const sectionParentId = parentId?.startsWith('section-') ? parentId.slice(8) : null
    try {
      const section = await docsApi.createSection(kbId, {
        title: '新目录',
        parent_id: sectionParentId,
      })
      // Add to tree store
      useTreeStore.getState().addSection(section)
    } catch {
      // ignore
    }
  }

  const handleRename = async (nodeId: string, newTitle: string) => {
    if (nodeId.startsWith('section-')) {
      const sectionId = nodeId.slice(8)
      try {
        await docsApi.updateSection(kbId, sectionId, { title: newTitle })
        updateSection(sectionId, { title: newTitle })
      } catch {
        // ignore
      }
    } else if (nodeId.startsWith('doc-')) {
      const docId = nodeId.slice(4)
      try {
        await docsApi.updateDoc(docId, { title: newTitle })
        useTreeStore.getState().updateDoc(docId, { title: newTitle })
      } catch {
        // ignore
      }
    }
  }

  const handleDelete = async (nodeId: string) => {
    if (nodeId.startsWith('section-')) {
      const sectionId = nodeId.slice(8)
      try {
        await docsApi.deleteSection(kbId, sectionId)
        removeSection(sectionId)
      } catch {
        // ignore
      }
    } else if (nodeId.startsWith('doc-')) {
      const docId = nodeId.slice(4)
      try {
        await docsApi.deleteDoc(docId)
        removeDoc(docId)
      } catch {
        // ignore
      }
    }
  }

  const handleMove = async (nodeId: string, targetParentId: string | null) => {
    if (nodeId.startsWith('doc-')) {
      const docId = nodeId.slice(4)
      const sectionId = targetParentId?.startsWith('section-') ? targetParentId.slice(8) : null
      try {
        await docsApi.moveDoc(docId, { section_id: sectionId })
        await fetchTree(kbId)
      } catch {
        // ignore
      }
    } else if (nodeId.startsWith('section-')) {
      const sectionId = nodeId.slice(8)
      const parentId = targetParentId?.startsWith('section-') ? targetParentId.slice(8) : null
      try {
        await docsApi.updateSection(kbId, sectionId, { parent_id: parentId })
        await fetchTree(kbId)
      } catch {
        // ignore
      }
    }
  }

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    document.addEventListener('click', close)
    document.addEventListener('contextmenu', close)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('contextmenu', close)
    }
  }, [contextMenu])

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

  const flatTree = flattenForMenu(treeNodes)

  return (
    <div className="py-2">
      {!readOnly && (
        <div className="flex items-center gap-1 px-3 pb-2">
          <button
            onClick={handleCreateDoc}
            disabled={isCreating}
            className="flex-1 flex items-center gap-1 justify-center py-1.5 text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg transition border border-dashed border-border hover:border-primary/40 disabled:opacity-50"
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
            onContextMenu={handleContextMenu}
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

      {contextMenu && (
        <TreeContextMenu
          nodeId={contextMenu.nodeId}
          x={contextMenu.x}
          y={contextMenu.y}
          kbId={kbId}
          tree={flatTree}
          onClose={() => setContextMenu(null)}
          onCreateDoc={handleCreateDocInSection}
          onCreateFolder={handleCreateSection}
          onRename={handleRename}
          onDelete={handleDelete}
          onMove={handleMove}
        />
      )}
    </div>
  )
}

export default DocTree
