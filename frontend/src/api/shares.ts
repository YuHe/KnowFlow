import apiClient from './client'
import type { ApiResponse, DocumentShare, ShareCreate, ShareUpdate } from '@/types'

export const sharesApi = {
  getShares: async (docId: string): Promise<DocumentShare[]> => {
    const response = await apiClient.get<ApiResponse<DocumentShare[]>>(`/docs/${docId}/shares`)
    return response.data.data
  },

  createShare: async (docId: string, data: ShareCreate): Promise<DocumentShare> => {
    const response = await apiClient.post<ApiResponse<DocumentShare>>(`/docs/${docId}/shares`, data)
    return response.data.data
  },

  updateShare: async (docId: string, shareId: string, data: ShareUpdate): Promise<DocumentShare> => {
    const response = await apiClient.put<ApiResponse<DocumentShare>>(
      `/docs/${docId}/shares/${shareId}`,
      data,
    )
    return response.data.data
  },

  deleteShare: async (docId: string, shareId: string): Promise<void> => {
    await apiClient.delete(`/docs/${docId}/shares/${shareId}`)
  },
}
