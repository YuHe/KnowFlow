import apiClient from './client'
import type {
  ApiResponse,
  KnowledgeBase,
  KnowledgeBaseMember,
  KbCreate,
  KbUpdate,
  KbRole,
  PaginatedData,
} from '@/types'

export const kbApi = {
  getKbList: async (params?: { page?: number; page_size?: number }): Promise<KnowledgeBase[]> => {
    const response = await apiClient.get<ApiResponse<KnowledgeBase[] | PaginatedData<KnowledgeBase>>>('/kb', { params })
    const data = response.data.data
    // Handle both array and paginated response shapes
    if (Array.isArray(data)) return data
    return (data as PaginatedData<KnowledgeBase>).items ?? []
  },

  getKbBySlug: async (slug: string): Promise<KnowledgeBase> => {
    const response = await apiClient.get<ApiResponse<KnowledgeBase>>(`/kb/slug/${slug}`)
    return response.data.data
  },

  createKb: async (data: KbCreate): Promise<KnowledgeBase> => {
    const response = await apiClient.post<ApiResponse<KnowledgeBase>>('/kb', data)
    return response.data.data
  },

  getKbDetail: async (kbId: string): Promise<KnowledgeBase> => {
    const response = await apiClient.get<ApiResponse<KnowledgeBase>>(`/kb/${kbId}`)
    return response.data.data
  },

  updateKb: async (kbId: string, data: KbUpdate): Promise<KnowledgeBase> => {
    const response = await apiClient.put<ApiResponse<KnowledgeBase>>(`/kb/${kbId}`, data)
    return response.data.data
  },

  deleteKb: async (kbId: string): Promise<void> => {
    await apiClient.delete(`/kb/${kbId}`)
  },

  transferOwnership: async (kbId: string, newOwnerId: string): Promise<KnowledgeBase> => {
    const response = await apiClient.post<ApiResponse<KnowledgeBase>>(`/kb/${kbId}/transfer`, {
      new_owner_id: newOwnerId,
    })
    return response.data.data
  },

  getMembers: async (kbId: string): Promise<KnowledgeBaseMember[]> => {
    const response = await apiClient.get<ApiResponse<KnowledgeBaseMember[]>>(`/kb/${kbId}/members`)
    return response.data.data
  },

  addMember: async (kbId: string, data: { user_id?: string; email?: string; role: KbRole }): Promise<KnowledgeBaseMember> => {
    const response = await apiClient.post<ApiResponse<KnowledgeBaseMember>>(`/kb/${kbId}/members`, data)
    return response.data.data
  },

  updateMemberRole: async (kbId: string, userId: string, role: KbRole): Promise<KnowledgeBaseMember> => {
    const response = await apiClient.put<ApiResponse<KnowledgeBaseMember>>(
      `/kb/${kbId}/members/${userId}`,
      { role },
    )
    return response.data.data
  },

  removeMember: async (kbId: string, userId: string): Promise<void> => {
    await apiClient.delete(`/kb/${kbId}/members/${userId}`)
  },
}
