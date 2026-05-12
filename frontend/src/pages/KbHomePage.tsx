import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useKbStore } from '@/store/kbStore';
import { useDocStore } from '@/store/docStore';
import { useTreeStore } from '@/store/treeStore';
import { docsApi } from '@/api/docs';
import { ROLE_LEVELS } from '@/types';
import type { DocumentListItem } from '@/types';
import KbIconEditor from '@/components/kb/KbIconEditor';
import KbIcon from '@/components/kb/KbIcon';
import DatePicker from '@/components/ui/DatePicker';

// ── Helpers ─────────────────────────────────────────────────────────────────

type DatePreset = 'today' | '3d' | '7d' | '30d' | 'custom'

function getDateRange(preset: DatePreset, customDate?: string | null): { updated_after: string; updated_before: string } {
  const now = new Date()
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  const before = endOfToday.toISOString()

  if (preset === 'custom' && customDate) {
    return { updated_after: `${customDate}T00:00:00`, updated_before: `${customDate}T23:59:59` }
  }

  const daysMap: Record<string, number> = { today: 0, '3d': 2, '7d': 6, '30d': 29 }
  const daysBack = daysMap[preset] ?? 6
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack, 0, 0, 0)
  return { updated_after: start.toISOString(), updated_before: before }
}

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function groupDocsByDate(docs: DocumentListItem[]): { label: string; docs: DocumentListItem[] }[] {
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const groups: Map<string, { label: string; docs: DocumentListItem[] }> = new Map()

  for (const doc of docs) {
    const d = new Date(doc.updated_at)
    const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (!groups.has(dateKey)) {
      let label: string
      if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()) {
        label = '今天'
      } else if (d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate()) {
        label = '昨天'
      } else {
        label = `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY_NAMES[d.getDay()]}`
      }
      groups.set(dateKey, { label, docs: [] })
    }
    groups.get(dateKey)!.docs.push(doc)
  }
  return Array.from(groups.values())
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── Component ───────────────────────────────────────────────────────────────

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: '3d', label: '近3天' },
  { key: '7d', label: '近7天' },
  { key: '30d', label: '近30天' },
]

const KbHomePage: React.FC = () => {
  const { kbId } = useParams<{ kbId: string }>();
  const navigate = useNavigate();
  const { currentKb, fetchKbById, isLoadingKbs: kbLoading } = useKbStore();
  const { recentDocs, fetchRecentKbDocs } = useDocStore();
  const { fetchTree } = useTreeStore();
  const [isCreating, setIsCreating] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>('7d');
  const [customDate, setCustomDate] = useState<string | null>(null);
  const [recentLoading, setRecentLoading] = useState(false);

  const { updated_after, updated_before } = useMemo(
    () => getDateRange(datePreset, customDate),
    [datePreset, customDate]
  );

  const groupedDocs = useMemo(() => groupDocsByDate(recentDocs), [recentDocs]);

  const handleCreateDoc = async () => {
    if (!kbId || isCreating) return;
    setIsCreating(true);
    try {
      const doc = await docsApi.createDoc(kbId, { title: '无标题文档', content_md: '' });
      await fetchTree(kbId);
      await fetchRecentKbDocs(kbId, { updated_after, updated_before });
      navigate(`/kb/${kbId}/docs/${doc.id}`, { state: { startEditing: true } });
    } finally {
      setIsCreating(false);
    }
  };

  useEffect(() => {
    if (kbId) {
      fetchKbById(kbId);
      fetchTree(kbId);
    }
  }, [kbId]);

  useEffect(() => {
    if (kbId) {
      setRecentLoading(true);
      fetchRecentKbDocs(kbId, { updated_after, updated_before }).finally(() => setRecentLoading(false));
    }
  }, [kbId, updated_after, updated_before]);

  if (kbLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-12">
          <div className="text-center mb-12">
            <div className="flex justify-center mb-4">
              {kbId && currentKb && (ROLE_LEVELS[currentKb.my_role ?? 'viewer'] ?? 0) >= ROLE_LEVELS['admin'] ? (
                <KbIconEditor
                  kbId={kbId}
                  icon={currentKb.icon}
                  iconUrl={currentKb.icon_url}
                  sizeClass="w-20 h-20"
                  emojiClass="text-6xl"
                />
              ) : (
                <KbIcon
                  icon={currentKb?.icon || '📚'}
                  iconUrl={currentKb?.icon_url}
                  className="w-20 h-20"
                  emojiClass="text-6xl"
                />
              )}
            </div>
            <h1 className="text-3xl font-bold mb-3">{currentKb?.name}</h1>
            {currentKb?.description && (
              <p className="text-muted-foreground text-base leading-relaxed max-w-lg mx-auto">
                {currentKb.description}
              </p>
            )}
            <div className="flex items-center justify-center gap-4 mt-4 text-sm text-muted-foreground">
              <span>{currentKb?.doc_count || 0} 篇文档</span>
              <span>·</span>
              <span>{currentKb?.member_count || 1} 位成员</span>
              <span>·</span>
              <span>{currentKb?.visibility === 'public' ? '公开' : '私有'}</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 mb-10">
            <button
              onClick={handleCreateDoc}
              disabled={isCreating}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-lg transition disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新建文档
            </button>
          </div>

          {/* ── Recently Updated Section ─────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">最近更新</h2>
              <div className="flex items-center gap-1.5 flex-wrap">
                {PRESETS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => { setDatePreset(key); setCustomDate(null); }}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition
                      ${datePreset === key && !customDate
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                  >
                    {label}
                  </button>
                ))}
                {customDate && (
                  <span className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-primary/10 text-primary font-medium">
                    {customDate}
                    <button
                      onClick={() => { setCustomDate(null); setDatePreset('7d'); }}
                      className="ml-0.5 hover:text-primary/70"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                )}
                <DatePicker
                  value={customDate}
                  onSelect={(d) => { setCustomDate(d); setDatePreset('custom'); }}
                />
              </div>
            </div>

            {/* Loading */}
            {recentLoading && (
              <div className="flex items-center justify-center py-10">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}

            {/* Empty */}
            {!recentLoading && recentDocs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm">该时段内暂无文档更新</p>
              </div>
            )}

            {/* Grouped List */}
            {!recentLoading && groupedDocs.map((group) => (
              <div key={group.label} className="mb-5">
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <span className="text-xs font-medium text-muted-foreground">{group.label}</span>
                  <span className="text-xs text-muted-foreground/50">{group.docs.length}篇</span>
                </div>
                <div className="space-y-0.5">
                  {group.docs.map((doc) => (
                    <Link
                      key={doc.id}
                      to={`/kb/${kbId}/docs/${doc.id}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition group"
                    >
                      {/* Icon */}
                      <svg className="w-4 h-4 text-primary/40 flex-shrink-0 group-hover:text-primary/60 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {/* Title */}
                      <span className="flex-1 min-w-0 text-sm text-gray-800 truncate group-hover:text-gray-900 transition">
                        {doc.title || '无标题'}
                      </span>
                      {/* Modifier + Time */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {doc.updated_by_user && (
                          <span className="flex items-center gap-1">
                            <span className="inline-flex w-5 h-5 rounded-full bg-green-50 items-center justify-center text-green-600 text-[10px] font-medium">
                              {(doc.updated_by_user.display_name || doc.updated_by_user.username)?.[0]?.toUpperCase()}
                            </span>
                            <span className="text-xs text-muted-foreground hidden sm:inline">
                              {doc.updated_by_user.display_name || doc.updated_by_user.username}
                            </span>
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground/70 tabular-nums w-10 text-right">
                          {formatTime(doc.updated_at)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </div>
    </div>
  );
};

export default KbHomePage;
