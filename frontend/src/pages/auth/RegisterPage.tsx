import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/authStore'
import logoUrl from '@/assets/logo.png'
import { useToast } from '@/components/ui/use-toast'
import { getErrorMessage } from '@/utils'
import { authApi } from '@/api/auth'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { initAuth } = useAuthStore()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [form, setForm] = useState({
    username: '',
    display_name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password !== form.confirmPassword) {
      toast({ title: '两次输入的密码不一致', variant: 'destructive' })
      return
    }
    if (form.password.length < 6) {
      toast({ title: '密码长度至少6位', variant: 'destructive' })
      return
    }

    setIsLoading(true)
    try {
      await authApi.register({
        username: form.username,
        display_name: form.display_name || form.username,
        email: form.email,
        password: form.password,
      })
      await initAuth()
      navigate('/', { replace: true })
    } catch (err) {
      toast({ title: '注册失败', description: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  const updateField = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <img src={logoUrl} alt="KnowFlow" className="h-12 w-12 object-contain" style={{ border: 'none', background: 'transparent' }} />
            <span className="text-2xl font-bold">KnowFlow</span>
          </div>
          <p className="text-muted-foreground">创建你的账号</p>
        </div>

        <div className="rounded-xl border bg-background p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">用户名 *</label>
              <Input
                type="text"
                placeholder="字母、数字、下划线"
                value={form.username}
                onChange={(e) => updateField('username', e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">昵称</label>
              <Input
                type="text"
                placeholder="你的显示名称"
                value={form.display_name}
                onChange={(e) => updateField('display_name', e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">邮箱 *</label>
              <Input
                type="email"
                placeholder="your@email.com"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">密码 *</label>
              <Input
                type="password"
                placeholder="至少6位"
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">确认密码 *</label>
              <Input
                type="password"
                placeholder="再次输入密码"
                value={form.confirmPassword}
                onChange={(e) => updateField('confirmPassword', e.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? '注册中...' : '注册'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            已有账号？{' '}
            <Link
              to="/login"
              className="font-medium text-primary hover:underline underline-offset-4"
            >
              立即登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
