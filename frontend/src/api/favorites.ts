import apiClient from './client'
import type { ApiResponse, DocumentFavorite, PaginatedData } from '@/types'

export const favoritesApi = {
  getFavorites: async (params?: { page?: number; page_size?: number }): Promise<PaginatedData<DocumentFavorite>> => {
    const response = await apiClient.get<ApiResponse<PaginatedData<DocumentFavorite>>>('/favorites', { params })
    return response.data.data
  },

  addFavorite: async (docId: string): Promise<DocumentFavorite> => {
    const response = await apiClient.post<ApiResponse<DocumentFavorite>>('/favorites', {
      doc_id: docId,
    })
    return response.data.data
  },

  removeFavorite: async (docId: string): Promise<void> => {
    await apiClient.delete(`/favorites/${docId}`)
  },
}
