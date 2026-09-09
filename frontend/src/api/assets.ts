import apiClient from './client'
import type { ApiResponse, Asset } from '@/types'

export const assetsApi = {
  uploadAsset: async (
    file: File,
    options?: {
      kb_id?: string
      doc_id?: string
      onUploadProgress?: (progress: number) => void
      signal?: AbortSignal
    },
  ): Promise<Asset> => {
    const formData = new FormData()
    formData.append('file', file)
    if (options?.kb_id) formData.append('kb_id', options.kb_id)
    if (options?.doc_id) formData.append('doc_id', options.doc_id)

    const response = await apiClient.post<ApiResponse<Asset>>('/assets/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      // axios' XHR timeout covers the upload itself, not just the wait for a
      // response, so the client-wide 30s would abort a large image mid-transfer
      // on a slow uplink — and the caller could not tell that apart from a
      // network error. Give the body time to go out.
      timeout: 120000,
      signal: options?.signal,
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
   *
   * Uses a longer timeout than the client default: the backend allows up to
   * ~20s per download, so the default 30s shared with ordinary API calls
   * leaves little headroom once a request has waited in the browser's
   * connection queue.
   */
  fetchRemoteImage: async (
    url: string,
    kb_id: string,
    doc_id?: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ url: string }> => {
    const response = await apiClient.post<ApiResponse<{ url: string; filename: string; id: string }>>(
      '/assets/fetch-remote',
      { url, kb_id, doc_id },
      { timeout: 45000, signal: options?.signal },
    )
    return { url: response.data.data.url }
  },

  deleteAsset: async (assetId: string): Promise<void> => {
    await apiClient.delete(`/assets/${assetId}`)
  },
}
