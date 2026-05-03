import apiClient from './client'
import type {
  ApiResponse,
  Document,
  DocumentListItem,
  Section,
  DocCreate,
  DocUpdate,
  SectionCreate,
  SectionUpdate,
  SectionReorderItem,
  PaginatedData,
} from '@/types'

export interface KbTreeResponse {
  sections: Section[]
  docs: DocumentListItem[]
}

export const docsApi = {
  // ── Documents ──────────────────────────────────────────────────────────
  getDocs: async (
    kbId: string,
    params?: { section_id?: string | null; page?: number; page_size?: number },
  ): Promise<PaginatedData<DocumentListItem>> => {
    const response = await apiClient.get<ApiResponse<PaginatedData<DocumentListItem>>>(
      `/kb/${kbId}/docs`,
      { params },
    )
    return response.data.data
  },

  createDoc: async (kbId: string, data: DocCreate): Promise<Document> => {
    const response = await apiClient.post<ApiResponse<Document>>(`/kb/${kbId}/docs`, data)
    return response.data.data
  },

  getDoc: async (docId: string): Promise<Document> => {
    const response = await apiClient.get<ApiResponse<Document>>(`/docs/${docId}`)
    return response.data.data
  },

  updateDoc: async (docId: string, data: DocUpdate): Promise<Document> => {
    const response = await apiClient.put<ApiResponse<Document>>(`/docs/${docId}`, data)
    return response.data.data
  },

  deleteDoc: async (docId: string): Promise<void> => {
    await apiClient.delete(`/docs/${docId}`)
  },

  moveDoc: async (docId: string, data: { section_id: string | null; parent_id?: string | null; sort_order?: number }): Promise<Document> => {
    const response = await apiClient.post<ApiResponse<Document>>(`/docs/${docId}/move`, data)
    return response.data.data
  },

  duplicateDoc: async (docId: string): Promise<Document> => {
    const response = await apiClient.post<ApiResponse<Document>>(`/docs/${docId}/duplicate`)
    return response.data.data
  },

  exportDoc: async (docId: string, format: 'md' | 'docx' | 'pdf'): Promise<Blob> => {
    const response = await apiClient.get(`/docs/${docId}/export`, {
      params: { format },
      responseType: 'blob',
    })
    return response.data
  },

  // ── Sections ───────────────────────────────────────────────────────────
  getSections: async (kbId: string): Promise<Section[]> => {
    const response = await apiClient.get<ApiResponse<Section[]>>(`/kb/${kbId}/sections`)
    return response.data.data
  },

  createSection: async (kbId: string, data: SectionCreate): Promise<Section> => {
    const response = await apiClient.post<ApiResponse<Section>>(`/kb/${kbId}/sections`, data)
    return response.data.data
  },

  updateSection: async (kbId: string, sectionId: string, data: SectionUpdate): Promise<Section> => {
    const response = await apiClient.put<ApiResponse<Section>>(
      `/kb/${kbId}/sections/${sectionId}`,
      data,
    )
    return response.data.data
  },

  deleteSection: async (kbId: string, sectionId: string): Promise<void> => {
    await apiClient.delete(`/kb/${kbId}/sections/${sectionId}`)
  },

  reorderSections: async (kbId: string, items: SectionReorderItem[]): Promise<void> => {
    await apiClient.post(`/kb/${kbId}/sections/reorder`, { items })
  },

  // ── KB Tree (sections + docs combined) ─────────────────────────────────
  getTree: async (kbId: string): Promise<KbTreeResponse> => {
    const [sectionsRes, docsRes] = await Promise.all([
      apiClient.get<ApiResponse<Section[]>>(`/kb/${kbId}/sections`),
      apiClient.get<ApiResponse<PaginatedData<DocumentListItem>>>(`/kb/${kbId}/docs`, {
        params: { page: 1, page_size: 500 },
      }),
    ])
    return {
      sections: sectionsRes.data.data,
      docs: docsRes.data.data.items,
    }
  },
}
