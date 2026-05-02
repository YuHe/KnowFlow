import apiClient from './client'
import type { ApiResponse, DocumentTemplate, TemplateCreate } from '@/types'

export const templatesApi = {
  getTemplates: async (params?: { category?: string }): Promise<DocumentTemplate[]> => {
    const response = await apiClient.get<ApiResponse<DocumentTemplate[]>>('/templates', { params })
    return response.data.data
  },

  getTemplate: async (templateId: string): Promise<DocumentTemplate> => {
    const response = await apiClient.get<ApiResponse<DocumentTemplate>>(`/templates/${templateId}`)
    return response.data.data
  },

  createTemplate: async (data: TemplateCreate): Promise<DocumentTemplate> => {
    const response = await apiClient.post<ApiResponse<DocumentTemplate>>('/templates', data)
    return response.data.data
  },

  updateTemplate: async (
    templateId: string,
    data: Partial<TemplateCreate>,
  ): Promise<DocumentTemplate> => {
    const response = await apiClient.put<ApiResponse<DocumentTemplate>>(
      `/templates/${templateId}`,
      data,
    )
    return response.data.data
  },

  deleteTemplate: async (templateId: string): Promise<void> => {
    await apiClient.delete(`/templates/${templateId}`)
  },
}
