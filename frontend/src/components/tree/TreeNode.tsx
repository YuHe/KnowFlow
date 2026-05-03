import React, { useState } from 'react'
import type { TreeNode as TreeNodeType } from '@/types'

interface TreeNodeProps {
  node: TreeNodeType
  depth: number
  kbId: string
  readOnly: boolean
  selectedNodeId: string | null
  expandedIds: Set<string>
  onSelect: (id: string) => void
  onToggleExpand: (id: string) => void
  onContextMenu?: (e: React.MouseEvent, nodeId: string) => void
  onDragStart?: (e: React.DragEvent, nodeId: string) => void
  onDragOver?: (e: React.DragEvent, nodeId: string) => void
  onDrop?: (e: React.DragEvent, targetNodeId: string) => void
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  depth,
  kbId,
  readOnly,
  selectedNodeId,
  expandedIds,
  onSelect,
  onToggleExpand,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  const isSection = node.type === 'section'
  const isDocument = node.type === 'document'
  const hasChildren = node.children && node.children.length > 0
  const isExpandable = isSection || (isDocument && hasChildren)
  const isExpanded = expandedIds.has(node.id)
  const isSelected = selectedNodeId === node.id
  const indent = depth * 14
  const [isDragOver, setIsDragOver] = useState(false)

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isExpandable) {
      onToggleExpand(node.id)
    }
    if (isDocument) {
      onSelect(node.id)
    }
  }

  const handleDragStart = (e: React.DragEvent) => {
    if (readOnly || !onDragStart) return
    e.stopPropagation()
    onDragStart(e, node.id)
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (readOnly || !onDragOver) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
    onDragOver(e, node.id)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    if (readOnly || !onDrop) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    onDrop(e, node.id)
  }

  return (
    <div>
      <div
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={isExpandable ? isExpanded : undefined}
        onClick={handleClick}
        onContextMenu={onContextMenu ? (e) => onContextMenu(e, node.id) : undefined}
        draggable={!readOnly}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`group flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition select-none mx-1 ${
          isSelected
            ? 'bg-primary/10 text-primary'
            : isDragOver
              ? 'bg-blue-50 border border-blue-300 text-blue-700'
              : 'text-muted-foreground hover:bg-muted/60'
        }`}
        style={{ paddingLeft: `${indent + 8}px` }}
      >
        {/* Expand arrow */}
        {isExpandable ? (
          <button
            className="flex-shrink-0 w-4 h-4 flex items-center justify-center"
            onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id) }}
            tabIndex={-1}
          >
            <svg
              className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <span className="flex-shrink-0 w-4" />
        )}

        {/* Icon */}
        {isSection ? (
          <svg className="w-4 h-4 flex-shrink-0 text-amber-500" fill={isExpanded ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 flex-shrink-0 text-muted-foreground/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}

        {/* Title */}
        <span className="text-sm truncate flex-1 min-w-0">{node.title || '无标题'}</span>
      </div>

      {/* Children */}
      {isExpandable && isExpanded && node.children && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              kbId={kbId}
              readOnly={readOnly}
              selectedNodeId={selectedNodeId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              onContextMenu={onContextMenu}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default TreeNode
