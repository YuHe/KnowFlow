import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useKbStore } from '../store/kbStore';
import { searchApi } from '../api/search';
import type { SearchResultItem } from '../types';

const SearchResultPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { kbs } = useKbStore();

  const queryParam = searchParams.get('q') || '';
  const kbParam = searchParams.get('kb') || '';
  const pageParam = parseInt(searchParams.get('page') || '1', 10);

  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const doSearch = useCallback(
    async (q: string, kb: string, page: number) => {
      if (!q.trim()) return;
      setIsLoading(true);
      setError('');
      try {
        const res = await searchApi.search({ q, kb_id: kb || undefined, page, page_size: 10 });
        setResults(res.items || []);
        setTotal(res.total || 0);
        setTotalPages(res.total_pages || 0);
      } catch {
        setError('搜索失败，请重试');
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    doSearch(queryParam, kbParam, pageParam);
  }, [queryParam, kbParam, pageParam, doSearch]);

  const updateFilter = (key: string, value: string) => {
    const p: Record<string, string> = { q: queryParam };
    if (key === 'kb') { if (value) p.kb = value; }
    else if (kbParam) p.kb = kbParam;
    setSearchParams(p);
  };

  const PAGE_RANGE = 5;
  const startPage = Math.max(1, pageParam - Math.floor(PAGE_RANGE / 2));
  const endPage = Math.min(totalPages, startPage + PAGE_RANGE - 1);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回
        </button>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <span className="text-sm text-gray-500">筛选：</span>

          {/* KB filter */}
          <select
            value={kbParam}
            onChange={(e) => updateFilter('kb', e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">全部知识库</option>
            {kbs.map((kb) => (
              <option key={kb.id} value={kb.id}>{kb.name}</option>
            ))}
          </select>

          {kbParam && (
            <button
              onClick={() => setSearchParams({ q: queryParam })}
              className="text-xs text-indigo-600 hover:underline"
            >
              清除筛选
            </button>
          )}
        </div>

        {/* Result count */}
        {!isLoading && queryParam && (
          <p className="text-sm text-gray-500 mb-4">
            找到 <span className="font-medium text-gray-900">{total}</span> 个结果
            {queryParam && (
              <> 关于 "<span className="font-medium text-gray-900">{queryParam}</span>"</>
            )}
          </p>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            搜索中...
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">{error}</div>
        )}

        {/* Results */}
        {!isLoading && !error && results.length > 0 && (
          <div className="space-y-3">
            {results.map((result) => (
              <Link
                key={result.doc_id}
                to={`/kb/${result.kb_id}/docs/${result.doc_id}`}
                className="block bg-white border border-gray-200 rounded-xl px-5 py-4 hover:border-indigo-300 hover:shadow-sm transition"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-medium text-gray-900 mb-1 truncate">
                      {result.title || '无标题'}
                    </h3>
                    <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">
                      {result.snippet}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                  <span className="inline-flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded text-gray-600">
                    📚 {result.kb_name}
                  </span>
                  {result.updated_by && (
                    <span>{result.updated_by.display_name || result.updated_by.username}</span>
                  )}
                  {result.updated_at && (
                    <span>{new Date(result.updated_at).toLocaleDateString()}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* No results */}
        {!isLoading && !error && queryParam && results.length === 0 && (
          <div className="text-center py-16">
            <svg className="w-12 h-12 text-gray-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-gray-500 mb-2">没有找到相关内容</p>
            <p className="text-sm text-gray-400">尝试更换关键词或调整筛选条件</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1 mt-8">
            <button
              onClick={() => setSearchParams({ q: queryParam, ...(kbParam && { kb: kbParam }), page: String(pageParam - 1) })}
              disabled={pageParam <= 1}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition"
            >
              上一页
            </button>
            {Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map((p) => (
              <button
                key={p}
                onClick={() => {
                  const params: Record<string, string> = { q: queryParam };
                  if (kbParam) params.kb = kbParam;
                  params.page = String(p);
                  setSearchParams(params);
                }}
                className={`w-9 h-9 text-sm border rounded-lg transition ${
                  p === pageParam
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => {
                const params: Record<string, string> = { q: queryParam };
                if (kbParam) params.kb = kbParam;
                params.page = String(pageParam + 1);
                setSearchParams(params);
              }}
              disabled={pageParam >= totalPages}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition"
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchResultPage;
