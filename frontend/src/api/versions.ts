import apiClient from './client'
import type { ApiResponse, DocumentVersion, DocumentVersionDetail } from '@/types'

export interface VersionCompare {
  version_a: DocumentVersionDetail
  version_b: DocumentVersionDetail
}

export const versionsApi = {
  getVersions: async (docId: string): Promise<DocumentVersion[]> => {
    const response = await apiClient.get<ApiResponse<DocumentVersion[]>>(
      `/docs/${docId}/versions`,
    )
    return response.data.data
  },

  getVersion: async (docId: string, versionId: string): Promise<DocumentVersionDetail> => {
    const response = await apiClient.get<ApiResponse<DocumentVersionDetail>>(
      `/docs/${docId}/versions/${versionId}`,
    )
    return response.data.data
  },

  restoreVersion: async (docId: string, versionId: string): Promise<DocumentVersion> => {
    const response = await apiClient.post<ApiResponse<DocumentVersion>>(
      `/docs/${docId}/versions/${versionId}/restore`,
    )
    return response.data.data
  },

  compareVersions: async (
    docId: string,
    v1: string,
    v2: string,
  ): Promise<VersionCompare> => {
    const response = await apiClient.get<ApiResponse<VersionCompare>>(
      `/docs/${docId}/versions/compare`,
      { params: { v1, v2 } },
    )
    return response.data.data
  },
}
