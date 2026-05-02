import apiClient from './client'
import type { ApiResponse, DocumentComment, CommentCreate } from '@/types'

export const commentsApi = {
  getComments: async (docId: string): Promise<DocumentComment[]> => {
    const response = await apiClient.get<ApiResponse<DocumentComment[]>>(
      `/docs/${docId}/comments`,
    )
    return response.data.data
  },

  addComment: async (docId: string, data: CommentCreate): Promise<DocumentComment> => {
    const response = await apiClient.post<ApiResponse<DocumentComment>>(
      `/docs/${docId}/comments`,
      data,
    )
    return response.data.data
  },

  deleteComment: async (docId: string, commentId: string): Promise<void> => {
    await apiClient.delete(`/docs/${docId}/comments/${commentId}`)
  },
}
