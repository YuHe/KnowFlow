import React from 'react'

interface KbIconProps {
  icon: string
  iconUrl?: string | null
  className?: string
  /** Tailwind text-size class for emoji fallback, e.g. "text-6xl" */
  emojiClass?: string
}

/**
 * Renders a KB avatar: shows icon_url image when available, otherwise the emoji icon.
 */
const KbIcon: React.FC<KbIconProps> = ({ icon, iconUrl, className = '', emojiClass = '' }) => {
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt={icon}
        className={`object-cover rounded-full ${className}`}
      />
    )
  }
  return <span className={`${emojiClass} ${className}`}>{icon || '📚'}</span>
}

export default KbIcon
