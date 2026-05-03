import { useNavigate, Link, useLocation } from 'react-router-dom'
import { Search, Bell, ChevronDown, LogOut, User, Settings, Star } from 'lucide-react'
import { useState, useEffect } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UserAvatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/utils'

interface HeaderProps {
  className?: string
}

export function Header({ className }: HeaderProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const [searchQuery, setSearchQuery] = useState('')

  // Sync search input with URL ?q= param when on the search page
  useEffect(() => {
    if (location.pathname === '/search') {
      const params = new URLSearchParams(location.search)
      setSearchQuery(params.get('q') || '')
    }
  }, [location.pathname, location.search])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const isSuperAdmin = user?.role === 'super_admin'

  return (
    <header
      className={cn(
        'flex h-14 items-center justify-between border-b bg-background px-4 gap-4',
        className,
      )}
    >
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2 shrink-0">
        <img src="/logo.png" alt="KnowFlow" className="h-9 w-9 object-contain" style={{ border: 'none', background: 'transparent' }} />
        <span className="font-bold text-lg tracking-tight">KnowFlow</span>
      </Link>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex-1 max-w-md">
        <Input
          type="search"
          placeholder="搜索文档..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />}
          rightIcon={
            <button
              type="submit"
              className="flex items-center justify-center w-6 h-6 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              aria-label="搜索"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          }
          className="h-9"
        />
      </form>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent transition-colors"
          aria-label="通知"
        >
          <Bell className="h-4 w-4" />
        </button>

        <Link
          to="/profile"
          state={{ defaultTab: 'favorites' }}
          className="relative flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent transition-colors"
          aria-label="我的收藏"
          title="我的收藏"
        >
          <Star className="h-4 w-4" />
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent transition-colors">
              <UserAvatar
                src={user?.avatar_url}
                name={user?.display_name ?? user?.username}
                size="sm"
              />
              <span className="text-sm font-medium hidden sm:inline-block max-w-[120px] truncate">
                {user?.display_name ?? user?.username}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{user?.display_name ?? user?.username}</span>
                <span className="text-xs text-muted-foreground truncate">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/profile')}>
              <User className="mr-2 h-4 w-4" />
              个人中心
            </DropdownMenuItem>
            {isSuperAdmin && (
              <DropdownMenuItem onClick={() => navigate('/admin')}>
                <Settings className="mr-2 h-4 w-4" />
                系统管理
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
