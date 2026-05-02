import apiClient from './client'
import type { ApiResponse, Asset } from '@/types'

export const assetsApi = {
  uploadAsset: async (
    file: File,
    options?: {
      kb_id?: string
      doc_id?: string
      onUploadProgress?: (progress: number) => void
    },
  ): Promise<Asset> => {
    const formData = new FormData()
    formData.append('file', file)
    if (options?.kb_id) formData.append('kb_id', options.kb_id)
    if (options?.doc_id) formData.append('doc_id', options.doc_id)

    const response = await apiClient.post<ApiResponse<Asset>>('/assets/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (options?.onUploadProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          options.onUploadProgress(progress)
        }
      },
    })
    return response.data.data
  },

  deleteAsset: async (assetId: string): Promise<void> => {
    await apiClient.delete(`/assets/${assetId}`)
  },
}
