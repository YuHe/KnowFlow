import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Toaster } from '@/components/ui/toaster'

export function AppLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Header />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
      <Toaster />
    </div>
  )
}
