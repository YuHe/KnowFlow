import React from 'react'

interface KbIconProps {
  icon: string
  iconUrl?: string | null
  className?: string
  /** Tailwind text-size class for emoji fallback, e.g. "text-6xl" */
  emojiClass?: string
}

/**
 * Normalize an asset URL so it always works regardless of PUBLIC_BASE_URL.
 * Absolute URLs like "http://localhost:8192/uploads/..." are converted to
 * relative paths "/uploads/..." so nginx handles them correctly in any deployment.
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.pathname + parsed.search
  } catch {
    return url
  }
}

/**
 * Renders a KB avatar: shows icon_url image when available, otherwise the emoji icon.
 * className controls size (e.g. "w-6 h-6"). The img uses inline-block to respect
 * explicit width/height regardless of parent layout.
 */
const KbIcon: React.FC<KbIconProps> = ({ icon, iconUrl, className = '', emojiClass = '' }) => {
  if (iconUrl) {
    const src = normalizeUrl(iconUrl)
    return (
      <img
        src={src}
        alt={icon}
        className={`inline-block object-cover rounded-full ${className}`}
        style={{ verticalAlign: 'middle' }}
      />
    )
  }
  return <span className={`${emojiClass} ${className}`}>{icon || '📚'}</span>
}

export default KbIcon
