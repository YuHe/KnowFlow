import apiClient from './client'
import type { ApiResponse, SearchResultItem, PaginatedData } from '@/types'

export const searchApi = {
  search: async (params: {
    q: string
    kb_id?: string
    page?: number
    page_size?: number
  }): Promise<PaginatedData<SearchResultItem>> => {
    const response = await apiClient.get<ApiResponse<PaginatedData<SearchResultItem>>>(
      '/search',
      { params },
    )
    return response.data.data
  },
}
