import { useEffect, useState, type ReactNode } from 'react'
import { DiffEditor, loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker'
import { isDark } from '../store'

// Bundle Monaco locally (no CDN); language services run in their own workers.
self.MonacoEnvironment = {
  getWorker: (_id, label) => {
    if (label === 'typescript' || label === 'javascript') return new TsWorker()
    if (label === 'json') return new JsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
    return new EditorWorker()
  }
}
loader.config({ monaco })

const LANGS: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', md: 'markdown', css: 'css', scss: 'scss', less: 'less', html: 'html', vue: 'html',
  py: 'python', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin', cs: 'csharp', cpp: 'cpp', c: 'c', h: 'cpp',
  rb: 'ruby', php: 'php', swift: 'swift', sql: 'sql', yml: 'yaml', yaml: 'yaml', toml: 'ini', xml: 'xml',
  sh: 'shell', ps1: 'powershell', dockerfile: 'dockerfile'
}

export function languageOf(path: string): string {
  const base = path.split(/[\\/]/).pop()!.toLowerCase()
  if (base === 'dockerfile') return 'dockerfile'
  return LANGS[base.split('.').pop() ?? ''] ?? 'plaintext'
}

export function DiffView({ original, modified, path }: { original: string; modified: string; path: string }): ReactNode {
  const [dark, setDark] = useState(isDark())
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(isDark()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onMq = (): void => setDark(isDark())
    mq.addEventListener('change', onMq)
    return () => {
      mo.disconnect()
      mq.removeEventListener('change', onMq)
    }
  }, [])
  return (
    <DiffEditor
      height="100%"
      theme={dark ? 'vs-dark' : 'vs'}
      language={languageOf(path)}
      original={original}
      modified={modified}
      // Monaco throws if models are disposed before the widget on unmount; the models are tiny.
      keepCurrentOriginalModel
      keepCurrentModifiedModel
      options={{
        readOnly: true,
        originalEditable: false,
        renderSideBySide: true,
        useInlineViewWhenSpaceIsLimited: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontFamily: 'JetBrains Mono, Consolas, monospace',
        fontSize: 12.5,
        automaticLayout: true
      }}
    />
  )
}
