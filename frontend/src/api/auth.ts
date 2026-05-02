import apiClient, { tokenStorage } from './client'
import type { ApiResponse, LoginRequest, RegisterRequest, TokenResponse, User } from '@/types'

export const authApi = {
  register: async (credentials: RegisterRequest): Promise<TokenResponse> => {
    const response = await apiClient.post<ApiResponse<TokenResponse>>('/auth/register', credentials)
    const data = response.data.data
    tokenStorage.setAccessToken(data.access_token)
    return data
  },

  login: async (credentials: LoginRequest): Promise<TokenResponse> => {
    const response = await apiClient.post<ApiResponse<TokenResponse>>('/auth/login', credentials)
    const data = response.data.data
    tokenStorage.setAccessToken(data.access_token)
    return data
  },

  logout: async (): Promise<void> => {
    try {
      await apiClient.post('/auth/logout')
    } finally {
      tokenStorage.clearTokens()
    }
  },

  refreshToken: async (): Promise<{ access_token: string; token_type: string }> => {
    // refresh token is sent via HttpOnly cookie, no body needed
    const response = await apiClient.post<ApiResponse<{ access_token: string; token_type: string }>>('/auth/refresh')
    const data = response.data.data
    tokenStorage.setAccessToken(data.access_token)
    return data
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get<ApiResponse<User>>('/auth/me')
    return response.data.data
  },
}
