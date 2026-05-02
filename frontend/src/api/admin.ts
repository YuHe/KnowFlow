import apiClient from './client'
import type { ApiResponse, AdminStats, SystemSettings, User, KnowledgeBase, PaginatedData } from '@/types'

export const adminApi = {
  getStats: async (): Promise<AdminStats> => {
    const response = await apiClient.get<ApiResponse<AdminStats>>('/admin/stats')
    return response.data.data
  },

  getUsers: async (params?: {
    q?: string
    role?: string
    is_active?: boolean
    page?: number
    page_size?: number
  }): Promise<PaginatedData<User>> => {
    const response = await apiClient.get<ApiResponse<PaginatedData<User>>>('/admin/users', { params })
    return response.data.data
  },

  updateUserRole: async (userId: string, role: 'user' | 'super_admin'): Promise<User> => {
    const response = await apiClient.put<ApiResponse<User>>(`/admin/users/${userId}/role`, { role })
    return response.data.data
  },

  updateUserStatus: async (userId: string, isActive: boolean): Promise<User> => {
    const response = await apiClient.put<ApiResponse<User>>(`/admin/users/${userId}/status`, {
      is_active: isActive,
    })
    return response.data.data
  },

  resetPassword: async (userId: string): Promise<{ temp_password: string }> => {
    const response = await apiClient.post<ApiResponse<{ temp_password: string }>>(
      `/admin/users/${userId}/reset-password`,
    )
    return response.data.data
  },

  getAdminKbs: async (params?: {
    q?: string
    visibility?: 'private' | 'public'
    page?: number
    page_size?: number
  }): Promise<PaginatedData<KnowledgeBase>> => {
    const response = await apiClient.get<ApiResponse<PaginatedData<KnowledgeBase>>>('/admin/kb', { params })
    return response.data.data
  },

  getAdminKb: async (kbId: string): Promise<KnowledgeBase> => {
    const response = await apiClient.get<ApiResponse<KnowledgeBase>>(`/admin/kb/${kbId}`)
    return response.data.data
  },

  deleteAdminKb: async (kbId: string): Promise<void> => {
    await apiClient.delete(`/admin/kb/${kbId}`)
  },

  transferAdminKb: async (kbId: string, newOwnerId: string): Promise<KnowledgeBase> => {
    const response = await apiClient.post<ApiResponse<KnowledgeBase>>(`/admin/kb/${kbId}/transfer`, {
      new_owner_id: newOwnerId,
    })
    return response.data.data
  },

  getSettings: async (): Promise<SystemSettings> => {
    const response = await apiClient.get<ApiResponse<SystemSettings>>('/admin/settings')
    return response.data.data
  },

  updateSettings: async (data: Partial<SystemSettings>): Promise<SystemSettings> => {
    const response = await apiClient.put<ApiResponse<SystemSettings>>('/admin/settings', data)
    return response.data.data
  },
}
