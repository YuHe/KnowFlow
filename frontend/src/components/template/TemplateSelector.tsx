import React, { useEffect, useState } from 'react';
import { templatesApi } from '../../api/templates';

interface Template {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  content: string;
  isDefault?: boolean;
}

interface TemplateSelectorProps {
  onSelect: (template: Template | null) => void;
  onClose: () => void;
}

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 'blank',
    name: '空白文档',
    description: '从空白开始',
    icon: '📄',
    category: '基础',
    content: '',
    isDefault: true,
  },
  {
    id: 'meeting',
    name: '会议记录',
    description: '记录会议要点和决议',
    icon: '📋',
    category: '工作',
    content: '<h1>会议记录</h1><p><strong>时间：</strong></p><p><strong>地点：</strong></p><p><strong>参与人员：</strong></p><h2>议题</h2><ol><li></li></ol><h2>讨论内容</h2><p></p><h2>决议事项</h2><ul><li></li></ul><h2>待办事项</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"></li></ul>',
  },
  {
    id: 'weekly',
    name: '周报',
    description: '每周工作总结',
    icon: '📅',
    category: '工作',
    content: '<h1>周报</h1><p><strong>时间：</strong>XXXX年XX月XX日 - XX月XX日</p><h2>本周完成</h2><ul><li></li></ul><h2>下周计划</h2><ul><li></li></ul><h2>问题与风险</h2><p></p>',
  },
  {
    id: 'product-spec',
    name: '需求文档',
    description: '产品需求和功能描述',
    icon: '🎯',
    category: '产品',
    content: '<h1>需求文档</h1><h2>背景</h2><p></p><h2>目标用户</h2><p></p><h2>需求描述</h2><h3>功能需求</h3><p></p><h3>非功能需求</h3><p></p><h2>UI原型</h2><p></p><h2>验收标准</h2><ul><li></li></ul>',
  },
  {
    id: 'tech-spec',
    name: '技术方案',
    description: '技术设计与实现方案',
    icon: '🔧',
    category: '技术',
    content: '<h1>技术方案</h1><h2>背景与目标</h2><p></p><h2>方案设计</h2><h3>架构图</h3><p></p><h3>核心流程</h3><p></p><h3>数据库设计</h3><p></p><h2>接口设计</h2><p></p><h2>风险与注意事项</h2><p></p>',
  },
  {
    id: 'qa-spec',
    name: '测试用例',
    description: '功能测试用例文档',
    icon: '✅',
    category: '技术',
    content: '<h1>测试用例</h1><h2>测试范围</h2><p></p><h2>测试用例</h2><table><tbody><tr><th>用例ID</th><th>测试步骤</th><th>预期结果</th><th>实际结果</th><th>状态</th></tr><tr><td>TC-001</td><td></td><td></td><td></td><td></td></tr></tbody></table>',
  },
];

const CATEGORIES = ['全部', '基础', '工作', '产品', '技术'];

const TemplateSelector: React.FC<TemplateSelectorProps> = ({ onSelect, onClose }) => {
  const [templates, setTemplates] = useState<Template[]>(DEFAULT_TEMPLATES);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    templatesApi.getTemplates()
      .then((data) => {
        if (data && data.length > 0) {
          const mapped: Template[] = data.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description || undefined,
            category: t.category || undefined,
            content: t.content_html || t.content_md || '',
            isDefault: t.is_builtin,
          }));
          setTemplates([...DEFAULT_TEMPLATES, ...mapped]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    activeCategory === '全部'
      ? templates
      : templates.filter((t) => t.category === activeCategory);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">选择模板</h2>
            <p className="text-xs text-gray-400 mt-0.5">从模板快速创建文档</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-1 px-6 pt-3 pb-0 border-b border-gray-100">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition ${
                activeCategory === cat
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Templates Grid */}
        <div className="p-5 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              加载模板...
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {filtered.map((template) => (
                <button
                  key={template.id}
                  onClick={() => onSelect(template)}
                  onMouseEnter={() => setHovered(template.id)}
                  onMouseLeave={() => setHovered(null)}
                  className={`
                    flex flex-col items-start p-4 border rounded-xl text-left transition
                    ${hovered === template.id
                      ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                      : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'
                    }
                  `}
                >
                  <span className="text-2xl mb-2">{template.icon || '📄'}</span>
                  <p className="text-sm font-semibold text-gray-800">{template.name}</p>
                  {template.description && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{template.description}</p>
                  )}
                  {template.isDefault && (
                    <span className="mt-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">默认</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
          <button
            onClick={() => onSelect(null)}
            className="text-sm text-gray-500 hover:text-gray-700 transition"
          >
            跳过，使用空白文档
          </button>
        </div>
      </div>
    </div>
  );
};

export default TemplateSelector;
