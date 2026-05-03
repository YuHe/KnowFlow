import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import logoUrl from '/logo.png?url'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/ui/use-toast'
import { getErrorMessage } from '@/utils'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isLoading } = useAuthStore()
  const { toast } = useToast()
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({ account: '', password: '' })

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.account.trim() || !form.password.trim()) {
      toast({ title: '请填写账号和密码', variant: 'destructive' })
      return
    }
    try {
      await login({ account: form.account, password: form.password })
      navigate(from, { replace: true })
    } catch (err) {
      toast({ title: '登录失败', description: getErrorMessage(err), variant: 'destructive' })
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <img src={logoUrl} alt="KnowFlow" className="h-12 w-12 object-contain" style={{ border: 'none', background: 'transparent' }} />
            <span className="text-2xl font-bold">KnowFlow</span>
          </div>
          <p className="text-muted-foreground">登录到你的知识库</p>
        </div>

        <div className="rounded-xl border bg-background p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">账号</label>
              <Input
                type="text"
                placeholder="用户名或邮箱"
                value={form.account}
                onChange={(e) => setForm({ ...form, account: e.target.value })}
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">密码</label>
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="请输入密码"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="current-password"
                required
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="cursor-pointer hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? '登录中...' : '登录'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            还没有账号？{' '}
            <Link
              to="/register"
              className="font-medium text-primary hover:underline underline-offset-4"
            >
              立即注册
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
