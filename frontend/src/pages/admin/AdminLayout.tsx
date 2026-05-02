import { Outlet } from 'react-router-dom'
import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Users, BookOpen, Settings } from 'lucide-react'
import { cn } from '@/utils'

const navItems = [
  { path: '/admin', label: '仪表盘', icon: LayoutDashboard, exact: true },
  { path: '/admin/users', label: '用户管理', icon: Users },
  { path: '/admin/kb', label: '知识库管理', icon: BookOpen },
  { path: '/admin/settings', label: '系统设置', icon: Settings },
]

export default function AdminLayout() {
  const location = useLocation()

  return (
    <div className="flex h-full">
      <aside className="w-56 border-r bg-background shrink-0">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
            系统管理
          </h2>
        </div>
        <nav className="p-2 space-y-1">
          {navItems.map(({ path, label, icon: Icon, exact }) => {
            const isActive = exact
              ? location.pathname === path
              : location.pathname.startsWith(path)
            return (
              <Link
                key={path}
                to={path}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            )
          })}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
