import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useParams } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { AppLayout } from '@/components/layout/AppLayout'
import { KbLayout } from '@/components/layout/KbLayout'
import { PageLoader } from '@/components/ui/spinner'

// ── Eagerly loaded pages ──────────────────────────────────────────────────────
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import HomePage from '@/pages/HomePage'
import KbHomePage from '@/pages/KbHomePage'
import DocReadPage from '@/pages/DocReadPage'

/** Redirect /docs/:docId/edit → /docs/:docId with startEditing state */
function EditRedirect() {
  const { kbId, docId } = useParams<{ kbId: string; docId: string }>()
  return <Navigate to={`/kb/${kbId}/docs/${docId}`} state={{ startEditing: true }} replace />
}

// ── Lazily loaded pages ───────────────────────────────────────────────────────
const KbSettingsPage = lazy(() => import('@/pages/KbSettingsPage'))
const TrashPage = lazy(() => import('@/pages/TrashPage'))
const SearchResultPage = lazy(() => import('@/pages/SearchResultPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const PublicKbPage = lazy(() => import('@/pages/PublicKbPage'))
const SharedDocPage = lazy(() => import('@/pages/SharedDocPage'))
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'))
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'))
const AdminUsers = lazy(() => import('@/pages/admin/AdminUsers'))
const AdminKb = lazy(() => import('@/pages/admin/AdminKb'))
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'))

// ── Route guards ──────────────────────────────────────────────────────────────

function PrivateRoute() {
  const { isAuthenticated, isLoading } = useAuthStore()
  const location = useLocation()

  if (isLoading) return <PageLoader />

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}

function AdminRoute() {
  const { isAuthenticated, user, isLoading } = useAuthStore()
  const location = useLocation()

  if (isLoading) return <PageLoader />

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (user?.role !== 'super_admin') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

function PublicOnlyRoute() {
  const { isAuthenticated } = useAuthStore()
  if (isAuthenticated) return <Navigate to="/" replace />
  return <Outlet />
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  useEffect(() => {
    useAuthStore.getState().initAuth()
  }, [])

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public-only routes (redirect if already logged in) */}
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          {/* Public access routes (no auth required) */}
          <Route path="/public/kb/:kbSlug" element={<PublicKbPage />} />
          <Route path="/public/kb/:kbSlug/docs/:docId" element={<PublicKbPage />} />
          <Route path="/s/:shareCode" element={<SharedDocPage />} />

          {/* Authenticated routes with AppLayout */}
          <Route element={<PrivateRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/search" element={<SearchResultPage />} />
              <Route path="/profile" element={<ProfilePage />} />

              {/* KB routes with KbLayout (three-column) */}
              <Route path="/kb/:kbId" element={<KbLayout />}>
                <Route index element={<KbHomePage />} />
                <Route path="docs/:docId" element={<DocReadPage />} />
                <Route path="docs/:docId/edit" element={<EditRedirect />} />
                <Route path="settings" element={<KbSettingsPage />} />
                <Route path="trash" element={<TrashPage />} />
              </Route>
            </Route>
          </Route>

          {/* SuperAdmin routes */}
          <Route path="/admin" element={<AdminRoute />}>
            <Route element={<AppLayout />}>
              <Route element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="kb" element={<AdminKb />} />
                <Route path="settings" element={<AdminSettings />} />
              </Route>
            </Route>
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
