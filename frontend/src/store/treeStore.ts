import { create } from 'zustand'
import type { Section, DocumentListItem, TreeNode } from '@/types'
import { docsApi } from '@/api/docs'

interface TreeState {
  sections: Section[]
  docs: DocumentListItem[]
  treeNodes: TreeNode[]
  selectedNodeId: string | null
  selectedDocId: string | null  // alias: the doc ID portion of selectedNodeId
  expandedIds: Set<string>
  isLoading: boolean
  error: string | null

  // Actions
  fetchTree: (kbId: string) => Promise<void>
  toggleExpand: (id: string) => void
  expandNode: (id: string) => void
  collapseNode: (id: string) => void
  expandAll: () => void
  collapseAll: () => void
  selectNode: (id: string | null) => void
  setSelectedDocId: (docId: string | null) => void
  addSection: (section: Section) => void
  updateSection: (sectionId: string, updates: Partial<Section>) => void
  removeSection: (sectionId: string) => void
  addDoc: (doc: DocumentListItem) => void
  updateDoc: (docId: string, updates: Partial<DocumentListItem>) => void
  removeDoc: (docId: string) => void
  clearTree: () => void
}

function buildTreeNodes(
  sections: Section[],
  docs: DocumentListItem[],
  parentSectionId: string | null = null,
  parentDocId: string | null = null,
): TreeNode[] {
  const nodes: TreeNode[] = []

  if (parentDocId === null) {
    // Building section-level children: add child sections
    const childSections = sections
      .filter((s) => s.parent_id === parentSectionId)
      .sort((a, b) => a.sort_order - b.sort_order)

    for (const section of childSections) {
      const sectionNode: TreeNode = {
        id: `section-${section.id}`,
        type: 'section',
        title: section.title,
        sort_order: section.sort_order,
        parent_id: parentSectionId ? `section-${parentSectionId}` : null,
        knowledge_base_id: section.knowledge_base_id,
        data: section,
        children: buildTreeNodes(sections, docs, section.id, null),
      }
      nodes.push(sectionNode)
    }
  }

  // Add docs belonging to this parent (section or doc)
  const sectionDocs = docs
    .filter((d) => {
      if (parentDocId !== null) {
        // Sub-documents: parent_id matches
        return d.parent_id === parentDocId
      }
      // Top-level docs in a section (no doc parent)
      if (parentSectionId === null) return d.section_id === null && d.parent_id === null
      return d.section_id === parentSectionId && d.parent_id === null
    })
    .sort((a, b) => a.sort_order - b.sort_order)

  for (const doc of sectionDocs) {
    const docNode: TreeNode = {
      id: `doc-${doc.id}`,
      type: 'document',
      title: doc.title,
      sort_order: doc.sort_order,
      parent_id: parentDocId
        ? `doc-${parentDocId}`
        : parentSectionId
          ? `section-${parentSectionId}`
          : null,
      knowledge_base_id: doc.knowledge_base_id,
      data: doc,
      children: buildTreeNodes(sections, docs, null, doc.id),
    }
    nodes.push(docNode)
  }

  return nodes
}

export const useTreeStore = create<TreeState>((set, get) => ({
  sections: [],
  docs: [],
  treeNodes: [],
  selectedNodeId: null,
  selectedDocId: null,
  expandedIds: new Set<string>(),
  isLoading: false,
  error: null,

  fetchTree: async (kbId: string) => {
    set({ isLoading: true, error: null })
    try {
      const { sections, docs } = await docsApi.getTree(kbId)
      const treeNodes = buildTreeNodes(sections, docs, null, null)
      set({ sections, docs, treeNodes, isLoading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch tree',
        isLoading: false,
      })
    }
  },

  toggleExpand: (id: string) => {
    const { expandedIds } = get()
    const newIds = new Set(expandedIds)
    if (newIds.has(id)) {
      newIds.delete(id)
    } else {
      newIds.add(id)
    }
    set({ expandedIds: newIds })
  },

  expandNode: (id: string) => {
    const { expandedIds } = get()
    const newIds = new Set(expandedIds)
    newIds.add(id)
    set({ expandedIds: newIds })
  },

  collapseNode: (id: string) => {
    const { expandedIds } = get()
    const newIds = new Set(expandedIds)
    newIds.delete(id)
    set({ expandedIds: newIds })
  },

  expandAll: () => {
    const { sections, docs } = get()
    const sectionIds = sections.map((s) => `section-${s.id}`)
    // Also expand docs that have children
    const docsWithChildren = docs
      .filter((d) => docs.some((child) => child.parent_id === d.id))
      .map((d) => `doc-${d.id}`)
    const ids = new Set([...sectionIds, ...docsWithChildren])
    set({ expandedIds: ids })
  },

  collapseAll: () => {
    set({ expandedIds: new Set<string>() })
  },

  selectNode: (id: string | null) => {
    // If it's a doc node (doc-<uuid>), extract and set selectedDocId
    const docId = id?.startsWith('doc-') ? id.slice(4) : null
    set({ selectedNodeId: id, selectedDocId: docId })
  },

  setSelectedDocId: (docId: string | null) => {
    set({ selectedDocId: docId, selectedNodeId: docId ? `doc-${docId}` : null })
  },

  addSection: (section: Section) => {
    const { sections, docs } = get()
    const newSections = [...sections, section]
    const treeNodes = buildTreeNodes(newSections, docs, null, null)
    set({ sections: newSections, treeNodes })
  },

  updateSection: (sectionId: string, updates: Partial<Section>) => {
    const { sections, docs } = get()
    const newSections = sections.map((s) => (s.id === sectionId ? { ...s, ...updates } : s))
    const treeNodes = buildTreeNodes(newSections, docs, null, null)
    set({ sections: newSections, treeNodes })
  },

  removeSection: (sectionId: string) => {
    const { sections, docs } = get()
    const newSections = sections.filter((s) => s.id !== sectionId)
    const treeNodes = buildTreeNodes(newSections, docs, null, null)
    set({ sections: newSections, treeNodes })
  },

  addDoc: (doc: DocumentListItem) => {
    const { sections, docs } = get()
    const newDocs = [...docs, doc]
    const treeNodes = buildTreeNodes(sections, newDocs, null, null)
    set({ docs: newDocs, treeNodes })
  },

  updateDoc: (docId: string, updates: Partial<DocumentListItem>) => {
    const { sections, docs } = get()
    const newDocs = docs.map((d) => (d.id === docId ? { ...d, ...updates } : d))
    const treeNodes = buildTreeNodes(sections, newDocs, null, null)
    set({ docs: newDocs, treeNodes })
  },

  removeDoc: (docId: string) => {
    const { sections, docs } = get()
    const newDocs = docs.filter((d) => d.id !== docId)
    const treeNodes = buildTreeNodes(sections, newDocs, null, null)
    set({ docs: newDocs, treeNodes })
  },

  clearTree: () => {
    set({
      sections: [],
      docs: [],
      treeNodes: [],
      selectedNodeId: null,
      expandedIds: new Set<string>(),
    })
  },
}))
