import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/admin';
import type { SystemSettings } from '../../types';

const AdminSettings: React.FC = () => {
  const [settings, setSettings] = useState<SystemSettings>({
    allow_registration: true,
    max_upload_size_mb: 10,
    image_max_size_mb: 5,
    max_versions_per_doc: 50,
    site_name: 'KnowFlow',
    site_description: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    adminApi.getSettings()
      .then((data) => { if (data) setSettings(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await adminApi.updateSettings(settings);
      setMsg({ type: 'success', text: '设置已保存' });
    } catch {
      setMsg({ type: 'error', text: '保存失败' });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 3000);
    }
  };

  const updateSetting = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-gray-400">
        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        加载中...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">系统设置</h1>

      {msg && (
        <div className={`mb-5 p-3 rounded-lg text-sm border ${msg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Site Info */}
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">站点信息</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">站点名称</label>
              <input
                type="text"
                value={settings.site_name}
                onChange={(e) => updateSetting('site_name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">站点描述</label>
              <textarea
                value={settings.site_description}
                onChange={(e) => updateSetting('site_description', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
          </div>
        </section>

        {/* User Registration */}
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">注册与认证</h2>
          <div className="space-y-4">
            <label className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">允许注册</p>
                <p className="text-xs text-gray-400 mt-0.5">关闭后新用户无法自行注册</p>
              </div>
              <button
                type="button"
                onClick={() => updateSetting('allow_registration', !settings.allow_registration)}
                className={`relative w-10 h-5 rounded-full transition-colors ${settings.allow_registration ? 'bg-indigo-600' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${settings.allow_registration ? 'translate-x-5' : ''}`} />
              </button>
            </label>
          </div>
        </section>

        {/* Upload & Limits */}
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">上传与限制</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">最大上传大小（MB）</label>
                <input
                  type="number"
                  min={1}
                  max={1024}
                  value={settings.max_upload_size_mb}
                  onChange={(e) => updateSetting('max_upload_size_mb', parseInt(e.target.value) || 10)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">图片最大大小（MB）</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={settings.image_max_size_mb}
                  onChange={(e) => updateSetting('image_max_size_mb', parseInt(e.target.value) || 5)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">每文档最大版本数</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={settings.max_versions_per_doc}
                onChange={(e) => updateSetting('max_versions_per_doc', parseInt(e.target.value) || 50)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </section>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition"
        >
          {saving ? '保存中...' : '保存设置'}
        </button>
      </form>
    </div>
  );
};

export default AdminSettings;
