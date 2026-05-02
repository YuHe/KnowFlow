import { assetsApi } from './assets'

/**
 * Upload an image file and return the public URL.
 * Used by the TipTap editor for image paste/drop handling.
 */
export async function uploadImage(kbId: string, file: File): Promise<string> {
  const asset = await assetsApi.uploadAsset(file, { kb_id: kbId })
  return asset.url
}
