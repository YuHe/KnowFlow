import React from 'react'
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
}) => {
  const isSection = node.type === 'section'
  const isExpanded = expandedIds.has(node.id)
  const isSelected = selectedNodeId === node.id
  const indent = depth * 14

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isSection) {
      onToggleExpand(node.id)
    } else {
      onSelect(node.id)
    }
  }

  return (
    <div>
      <div
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={isSection ? isExpanded : undefined}
        onClick={handleClick}
        onContextMenu={onContextMenu ? (e) => onContextMenu(e, node.id) : undefined}
        className={`group flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition select-none mx-1 ${
          isSelected
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted/60'
        }`}
        style={{ paddingLeft: `${indent + 8}px` }}
      >
        {/* Expand arrow for sections */}
        {isSection ? (
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

      {/* Children for sections */}
      {isSection && isExpanded && node.children && node.children.length > 0 && (
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
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default TreeNode
