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

  /**
   * Download a remote image via the backend (browsers can't fetch cross-origin
   * image bytes due to CORS) and return its now-local URL. SSRF-guarded server-side.
   */
  fetchRemoteImage: async (
    url: string,
    kb_id: string,
    doc_id?: string,
  ): Promise<{ url: string }> => {
    const response = await apiClient.post<ApiResponse<{ url: string; filename: string; id: string }>>(
      '/assets/fetch-remote',
      { url, kb_id, doc_id },
    )
    return { url: response.data.data.url }
  },

  deleteAsset: async (assetId: string): Promise<void> => {
    await apiClient.delete(`/assets/${assetId}`)
  },
}
