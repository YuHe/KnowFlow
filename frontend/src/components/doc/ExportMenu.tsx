import { useState, useRef, useEffect } from 'react'
import { Download, FileText, FileType, File } from 'lucide-react'
import { docsApi } from '@/api/docs'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/use-toast'

interface ExportMenuProps {
  docId: string
  kbId: string
  docTitle: string
}

type ExportFormat = 'md' | 'docx' | 'pdf'

interface ExportOption {
  format: ExportFormat
  label: string
  ext: string
  icon: React.ReactNode
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    format: 'md',
    label: '导出为 Markdown (.md)',
    ext: 'md',
    icon: <FileText className="h-4 w-4 text-gray-500" />,
  },
  {
    format: 'docx',
    label: '导出为 Word (.docx)',
    ext: 'docx',
    icon: <FileType className="h-4 w-4 text-blue-500" />,
  },
  {
    format: 'pdf',
    label: '导出为 PDF (.pdf)',
    ext: 'pdf',
    icon: <File className="h-4 w-4 text-red-500" />,
  },
]

export default function ExportMenu({ docId, docTitle }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleExport = async (option: ExportOption) => {
    setOpen(false)
    setExportingFormat(option.format)
    try {
      const blob = await docsApi.exportDoc(docId, option.format)

      // If blob is actually a JSON error (from server error), decode and show it
      if (blob.type === 'application/json' || blob.type.includes('json')) {
        const text = await blob.text()
        try {
          const json = JSON.parse(text)
          toast({ title: json?.error?.message || `导出 ${option.ext.toUpperCase()} 失败`, variant: 'destructive' })
        } catch {
          toast({ title: `导出 ${option.ext.toUpperCase()} 失败`, variant: 'destructive' })
        }
        return
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${docTitle || 'document'}.${option.ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast({ title: `已导出为 ${option.ext.toUpperCase()}` })
    } catch (err: any) {
      // Try to extract error message from blob error response
      let msg = `导出 ${option.ext.toUpperCase()} 失败`
      if (err?.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text()
          const json = JSON.parse(text)
          msg = json?.detail || json?.error?.message || msg
        } catch {
          // keep default msg
        }
      }
      toast({ title: msg, variant: 'destructive' })
    } finally {
      setExportingFormat(null)
    }
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!!exportingFormat}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md border transition-colors ${
          open
            ? 'bg-gray-100 border-gray-300 text-gray-700'
            : 'border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title="导出文档"
      >
        {exportingFormat ? (
          <Spinner size="sm" className="h-4 w-4" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        <span>导出</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
          <div className="px-3 py-1.5 text-xs font-medium text-gray-400 border-b border-gray-100">
            选择导出格式
          </div>
          {EXPORT_OPTIONS.map((option) => (
            <button
              key={option.format}
              onClick={() => handleExport(option)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {option.icon}
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
