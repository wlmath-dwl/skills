#!/usr/bin/env node
/* eslint-disable no-console */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { loadAgentConfig } = require('./i18n_config')

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    base: null,
    includeWorkingTree: false,
    output: '/tmp/i18n-diff-source.json',
    metaOutput: '/tmp/i18n-diff-source-meta.json',
    skippedOutput: '/tmp/i18n-diff-skipped.json',
    flat: false,
    // 默认：找不到 ns 锚点的 key 不翻译，进 skipped 列表。
    // 如果显式传 --unknown-ns（如 __unknown__），则走兼容老行为：所有未知 key 归该桶，由 apply 端兜到 fallbackNs。
    unknownNs: null,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--base') args.base = argv[++i]
    else if (token === '--include-working-tree') args.includeWorkingTree = true
    else if (token === '--output') args.output = argv[++i]
    else if (token === '--meta-output') args.metaOutput = argv[++i]
    else if (token === '--skipped-output') args.skippedOutput = argv[++i]
    else if (token === '--flat') args.flat = true
    else if (token === '--unknown-ns') args.unknownNs = argv[++i]
    else if (token === '--help' || token === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown arg: ${token}`)
    }
  }

  return args
}

function printHelp() {
  console.log(`extract_diff_i18n.js

Extract i18n Chinese copy from git diff patches, grouped by namespace.

Default output (nested):
  { "<ns>": { "<key>": "<中文>" } }

With --flat:
  { "<key>": "<中文>" }   (legacy single-namespace mode)

Namespace behavior:
  For code files, the script reads only the current changed file and uses the
  first useTranslation('ns') namespace it finds. If the file has no explicit
  useTranslation namespace, it uses defaultNamespace from agent.md.

Usage:
  node scripts/extract_diff_i18n.js \\
    [--base origin/master] \\
    [--include-working-tree] \\
    [--output /tmp/i18n-diff-source.json] \\
    [--meta-output /tmp/i18n-diff-source-meta.json] \\
    [--skipped-output /tmp/i18n-diff-skipped.json] \\
    [--unknown-ns __unknown__] \\
    [--flat]
`)
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function runGit(args) {
  return execFileSync('git', args, { encoding: 'utf-8' })
}

function refExists(ref) {
  try {
    runGit(['show-ref', '--verify', '--quiet', `refs/remotes/${ref}`])
    return true
  } catch {
    return false
  }
}

function detectBase(userBase) {
  if (userBase) return userBase
  if (refExists('origin/master')) return 'origin/master'
  throw new Error("Unable to detect BASE (tried origin/master). Use --base.")
}

function diffNameStatus(base, includeWorkingTree) {
  const lines = []
  const committed = runGit(['diff', '--name-status', `${base}...HEAD`]).trim()
  if (committed) lines.push(...committed.split('\n'))
  if (includeWorkingTree) {
    const wt = runGit(['diff', '--name-status']).trim()
    if (wt) lines.push(...wt.split('\n'))
  }
  return lines
}

function parseChangedPaths(nameStatusLines) {
  const paths = []
  for (const line of nameStatusLines) {
    if (!line) continue
    const parts = line.split('\t')
    const status = parts[0]
    if (!status) continue

    if (status.startsWith('R') || status.startsWith('C')) {
      const newPath = parts[2]
      if (newPath) paths.push(newPath)
      continue
    }

    const filePath = parts[1]
    if (filePath) paths.push(filePath)
  }
  return Array.from(new Set(paths))
}

function gitDiffForPath(base, filePath, includeWorkingTree) {
  const chunks = []
  try {
    const committed = runGit(['diff', `${base}...HEAD`, '--', filePath])
    if (committed) chunks.push(committed)
  } catch {
    /* ignore */
  }

  if (includeWorkingTree) {
    try {
      const wt = runGit(['diff', '--', filePath])
      if (wt) chunks.push(wt)
    } catch {
      /* ignore */
    }
  }

  return chunks.join('\n')
}

// ---------------------------------------------------------------------------
// Diff parsing
// ---------------------------------------------------------------------------

function hasChinese(text) {
  return /[\u3400-\u9FFF]/.test(text)
}

function decodeJsonStringLiteral(raw) {
  return JSON.parse(`"${raw}"`)
}

function parseAddedJsonKV(line) {
  const match = line.match(/^\+\s*"((?:\\.|[^"\\])*)"\s*:\s*"((?:\\.|[^"\\])*)"\s*,?\s*$/)
  if (!match) return null
  try {
    const key = decodeJsonStringLiteral(match[1])
    const value = decodeJsonStringLiteral(match[2])
    if (typeof key !== 'string' || typeof value !== 'string') return null
    return { key, value }
  } catch {
    return null
  }
}

// 递归 flatten 深层嵌套对象为 { "a.b.c": "value" } 形式
function flattenObject(obj, prefix) {
  const result = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') {
      result[key] = v
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(result, flattenObject(v, key))
    }
  }
  return result
}

function extractFromAddedCodeLine(line) {
  // 仅识别字面量 string key（不识别 t(`...`) 模板字面量）。
  // 支持:
  //   t('key')
  //   t('key', { name })
  //   t('key', 'ns')
  //   t('key', 'ns', { name })
  //   t('key', { ns: 'ns', name })
  const results = []
  const pattern = /\b(t|__|translate)\(\s*(['"])((?:\\.|(?!\2).)*)\2/g
  let match
  while ((match = pattern.exec(line))) {
    try {
      const decoded = JSON.parse(`"${match[3].replace(/"/g, '\\"')}"`)
      if (typeof decoded !== 'string') continue
      const restStart = pattern.lastIndex
      const callRest = readCallRest(line, restStart)
      const parsed = parseCallRest(callRest)
      results.push({ key: decoded, nsOverride: parsed.nsOverride, params: parsed.params })
    } catch {
      /* ignore invalid */
    }
  }
  return results
}

function readCallRest(line, startIndex) {
  let depth = 0
  let quote = null
  let escaped = false
  let result = ''
  for (let i = startIndex; i < line.length; i += 1) {
    const ch = line[i]
    result += ch
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === quote) {
        quote = null
      }
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '(' || ch === '{' || ch === '[') depth += 1
    else if (ch === ')' || ch === '}' || ch === ']') {
      if (depth === 0 || ch === ')') break
      depth -= 1
    }
  }
  return result
}

function parseCallRest(rest) {
  const parsed = { nsOverride: null, params: [] }
  const args = splitTopLevelArgs(rest.replace(/^\s*,/, '').replace(/\)\s*$/, ''))
  if (args.length === 0) return parsed

  const first = args[0] ? args[0].trim() : ''
  const second = args[1] ? args[1].trim() : ''
  const nsLiteral = first.match(/^['"]([^'"]+)['"]$/)
  if (nsLiteral) {
    parsed.nsOverride = nsLiteral[1]
    if (second) parsed.params = extractParamNames(second)
    return parsed
  }

  const objectNs = first.match(/(?:^|[,{]\s*)ns\s*:\s*['"]([^'"]+)['"]/)
  if (objectNs) parsed.nsOverride = objectNs[1]
  parsed.params = extractParamNames(first)
  return parsed
}

function splitTopLevelArgs(text) {
  const args = []
  let current = ''
  let depth = 0
  let quote = null
  let escaped = false
  for (const ch of text) {
    if (quote) {
      current += ch
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch
      current += ch
      continue
    }
    if (ch === '{' || ch === '[' || ch === '(') {
      depth += 1
      current += ch
      continue
    }
    if (ch === '}' || ch === ']' || ch === ')') {
      if (depth > 0) depth -= 1
      current += ch
      continue
    }
    if (ch === ',' && depth === 0) {
      if (current.trim()) args.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) args.push(current.trim())
  return args
}

function extractParamNames(argText) {
  const text = argText.trim()
  if (!text.startsWith('{')) return []
  const body = text.replace(/^\{/, '').replace(/\}$/, '')
  const ignored = new Set(['ns', 'defaultValue', 'context'])
  const names = []
  for (const part of splitTopLevelArgs(body)) {
    const item = part.trim()
    if (!item || item.startsWith('...')) continue
    const keyValue = item.match(/^([A-Za-z_$][\w$]*)\s*:/)
    if (keyValue) {
      const name = keyValue[1]
      if (!ignored.has(name)) names.push(name)
      continue
    }
    const shorthand = item.match(/^([A-Za-z_$][\w$]*)$/)
    if (shorthand && !ignored.has(shorthand[1])) {
      names.push(shorthand[1])
    }
  }
  return Array.from(new Set(names))
}

// 检测动态 key：t(`...`)、__(`...`)、translate(`...`)
// 返回匹配到的模板字面量原文片段数组（用于 skipped 报告）
function extractDynamicKeysFromLine(line) {
  const results = []
  const patterns = [
    /\bt\(\s*`([^`]*)`\s*[\),]/g,
    /\b__\(\s*`([^`]*)`\s*[\),]/g,
    /\btranslate\(\s*`([^`]*)`\s*[\),]/g,
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(line))) {
      results.push(match[1])
    }
  }
  return results
}

// 解析 unified diff：把每个 hunk 拆成行，记录 added/context 行的"新文件行号"。
function parseHunks(diffText) {
  const hunks = []
  if (!diffText) return hunks

  const rawLines = diffText.split('\n')
  let i = 0
  while (i < rawLines.length) {
    const line = rawLines[i]
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('+++') || line.startsWith('---')) {
      i += 1
      continue
    }
    if (!line.startsWith('@@')) {
      i += 1
      continue
    }

    const m = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/)
    if (!m) {
      i += 1
      continue
    }

    const newStart = parseInt(m[3], 10)
    const hunk = { newStart, lines: [] }
    let newLineNo = newStart
    i += 1

    while (i < rawLines.length) {
      const ln = rawLines[i]
      if (ln.startsWith('@@') || ln.startsWith('diff --git')) break
      if (ln.startsWith('+++') || ln.startsWith('---')) {
        i += 1
        continue
      }
      if (ln.length === 0) {
        // 末尾空行：当作 context（非 + / - 行）
        hunk.lines.push({ kind: ' ', content: '', newLineNo })
        newLineNo += 1
        i += 1
        continue
      }
      const head = ln[0]
      const content = ln.slice(1)
      if (head === '+') {
        hunk.lines.push({ kind: '+', content, newLineNo })
        newLineNo += 1
      } else if (head === '-') {
        hunk.lines.push({ kind: '-', content, newLineNo: null })
      } else if (head === ' ') {
        hunk.lines.push({ kind: ' ', content, newLineNo })
        newLineNo += 1
      } else if (head === '\\') {
        // "\ No newline at end of file"
      } else {
        // 未知前缀，按原样跳过
      }
      i += 1
    }

    hunks.push(hunk)
  }

  return hunks
}

// ---------------------------------------------------------------------------
// Namespace inference
// ---------------------------------------------------------------------------

const USE_TRANSLATION_RE = /\buseTranslation\(\s*['"]([^'"]+)['"]\s*[,)]/g

function findNamespaceInFile(filePath) {
  // 简化规则：只在出现 t('xx') 的当前文件里查找 useTranslation('ns')。
  // 找到就使用第一个显式 namespace；找不到由调用方使用 agent.md 的 defaultNamespace。
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null
  let text = ''
  try {
    text = fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
  USE_TRANSLATION_RE.lastIndex = 0
  const match = USE_TRANSLATION_RE.exec(text)
  return match ? match[1] : null
}

// ---------------------------------------------------------------------------
// Per-file extractors
// ---------------------------------------------------------------------------

function isLocaleJsonFile(filePath) {
  if (!filePath.endsWith('.json')) return false
  const parts = filePath.split('/')
  const localesIdx = parts.lastIndexOf('locales')
  // 形态：.../locales/{locale}/{ns}.json
  return localesIdx >= 0 && localesIdx + 2 === parts.length - 1
}

function nsFromLocaleJsonPath(filePath) {
  const parts = filePath.split('/')
  const localesIdx = parts.lastIndexOf('locales')
  if (localesIdx < 0) return null
  const file = parts[localesIdx + 2]
  if (!file) return null
  return path.basename(file, '.json')
}

function localeFromLocaleJsonPath(filePath) {
  const parts = filePath.split('/')
  const localesIdx = parts.lastIndexOf('locales')
  if (localesIdx < 0) return null
  return parts[localesIdx + 1] || null
}

function detectLocalesRootFromGit() {
  const files = runGit(['ls-files']).split('\n').filter(Boolean)
  const candidates = new Map()
  const patterns = [
    /(^|\/)i18n\/locales\/[^/]+\/[^/]+\.json$/,
    /(^|\/)src\/locales\/[^/]+\/[^/]+\.json$/,
    /(^|\/)locales\/[^/]+\/[^/]+\.json$/,
  ]
  for (const file of files) {
    if (file.includes('node_modules/')) continue
    if (!patterns.some((p) => p.test(file))) continue
    const parts = file.split('/')
    const idx = parts.lastIndexOf('locales')
    if (idx < 0 || idx + 2 >= parts.length) continue
    const root = parts.slice(0, idx + 1).join('/')
    candidates.set(root, (candidates.get(root) || 0) + 1)
  }
  if (candidates.size === 0) return null
  const sorted = Array.from(candidates.entries()).sort((a, b) => b[1] - a[1])
  const best = sorted[0]
  const second = sorted[1]
  if (second && second[1] === best[1]) return null
  return best[0]
}

function loadChineseValue(localesRoot, ns, key, cache) {
  if (!localesRoot || !ns || !key) return null
  const preferredLocales = ['zh-CN', 'zh-Hans', 'zh', 'zh-TW', 'zh-Hant', 'zh-HK']
  for (const locale of preferredLocales) {
    const filePath = path.join(localesRoot, locale, `${ns}.json`)
    if (cache.has(filePath)) {
      const data = cache.get(filePath)
      const value = resolveDeepKey(data, key)
      if (value && hasChinese(value)) return value
      continue
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      cache.set(filePath, null)
      continue
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      const obj = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
      cache.set(filePath, obj)
      const value = resolveDeepKey(obj, key)
      if (value && hasChinese(value)) return value
    } catch {
      cache.set(filePath, null)
    }
  }
  return null
}

// 从对象中按 key 取值：先尝试直接取（扁平 key），再尝试按点分路径递归取（深层嵌套）
function resolveDeepKey(obj, key) {
  if (!obj || typeof obj !== 'object') return null
  // 直接命中（扁平 key 如 "home.title" 作为字面 key）
  if (typeof obj[key] === 'string') return obj[key]
  // 按点分路径递归（深层嵌套如 { home: { title: "首页" } }）
  const parts = key.split('.')
  let current = obj
  for (const part of parts) {
    if (!current || typeof current !== 'object') return null
    current = current[part]
  }
  return typeof current === 'string' ? current : null
}

// 同一个 key 在多个 locale 文件里都有 add 行时（项目自维护多语言基线很常见），
// 优先取简体中文，其次繁体，最后其他。值会随后由 LLM 直译生成所有目标语言。
function localePriority(locale) {
  if (!locale) return 0
  if (locale === 'zh-CN' || locale === 'zh-Hans' || locale === 'zh') return 100
  if (locale === 'zh-TW' || locale === 'zh-Hant' || locale === 'zh-HK') return 50
  return 10
}

function extractFromJsonDiff(filePath, diffText) {
  const ns = nsFromLocaleJsonPath(filePath)
  if (!ns) return []
  const locale = localeFromLocaleJsonPath(filePath)
  const priority = localePriority(locale)
  const items = []

  // 方式一：尝试把所有新增行拼成 JSON 解析，支持深层嵌套
  const addedLines = []
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++')) continue
    if (line.startsWith('+')) addedLines.push(line.slice(1))
  }
  const addedText = addedLines.join('\n')
  let parsed = null
  try {
    parsed = JSON.parse(addedText)
  } catch {
    // 新增行不构成完整 JSON（常见于部分修改），回退到逐行提取
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const flat = flattenObject(parsed, '')
    for (const [key, value] of Object.entries(flat)) {
      if (typeof value === 'string' && hasChinese(value)) {
        items.push({ ns, key, value, priority })
      }
    }
    if (items.length > 0) return items
  }

  // 方式二：逐行匹配 "key": "value"（兼容部分修改场景）
  for (const line of diffText.split('\n')) {
    if (!line.startsWith('+')) continue
    if (line.startsWith('+++')) continue
    const kv = parseAddedJsonKV(line)
    if (kv && hasChinese(kv.value)) {
      items.push({ ns, key: kv.key, value: kv.value, priority })
    }
  }
  return items
}

function extractFromCodeDiff(filePath, diffText, defaultNamespace, unknownNs, localesRoot, localeCache) {
  const hunks = parseHunks(diffText)
  const fileNamespace = findNamespaceInFile(filePath)

  // 代码侧拿到的 key 即"中文 key 即文案"或"待翻译 key"。
  // 非中文 key 会先从中文包回查文案；查不到就以空字符串进入 review 页面。
  // 注意：空文案不是删除信号，后续必须交给用户在本地页面确认。
  const items = []
  const skipped = []
  for (const hunk of hunks) {
    for (const { kind, content, newLineNo } of hunk.lines) {
      if (kind !== '+' || newLineNo == null) continue

      // 检测动态 key（模板字面量），写入 skipped
      const dynamicKeys = extractDynamicKeysFromLine(content)
      for (const raw of dynamicKeys) {
        skipped.push({ file: filePath, line: newLineNo, key: `\`${raw}\``, reason: 'dynamic-key' })
      }

      const keys = extractFromAddedCodeLine(content)
      for (const item of keys) {
        const key = item.key
        const ns = item.nsOverride || fileNamespace || defaultNamespace || unknownNs
        if (!ns) {
          // agent.md 缺少 defaultNamespace 且当前文件没有 useTranslation('ns')。
          skipped.push({ file: filePath, line: newLineNo, key, reason: 'no-ns-anchor' })
          continue
        }

        if (hasChinese(key)) {
          items.push({ ns, key, value: key, priority: 80, params: item.params || [], refs: [{ file: filePath, line: newLineNo }] })
        } else {
          // 非中文 key：尝试从中文包里回查 value，查不到留空给 review 页补齐。
          // 不要因为这里为空而删除源码中的 t('key') 调用。
          const chineseValue = loadChineseValue(localesRoot, ns, key, localeCache)
          items.push({ ns, key, value: chineseValue || '', priority: chineseValue ? 70 : 5, params: item.params || [], refs: [{ file: filePath, line: newLineNo }] })
        }
      }
    }
  }
  return { items, skipped }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function writeJson(outputPath, payload) {
  const dir = path.dirname(outputPath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
}

function flattenNested(nested) {
  const flat = {}
  for (const ns of Object.keys(nested)) {
    for (const [k, v] of Object.entries(nested[ns])) flat[k] = v
  }
  return flat
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2))
  const base = detectBase(args.base)
  const agentConfig = loadAgentConfig(process.cwd())
  const defaultNamespace = agentConfig.defaultNamespace

  const nameStatus = diffNameStatus(base, args.includeWorkingTree)
  const changedPaths = parseChangedPaths(nameStatus)
  const localesRoot = detectLocalesRootFromGit()
  const localeCache = new Map()

  // 中间结构：{ ns: { key: { value, priority, refs } } }，最终序列化时拍成 { ns: { key: value } }
  const grouped = {}
  const allSkipped = [] // [{ file, line, key }]

  for (const filePath of changedPaths) {
    const diff = gitDiffForPath(base, filePath, args.includeWorkingTree)
    if (!diff) continue

    let items = []
    if (isLocaleJsonFile(filePath)) {
      items = extractFromJsonDiff(filePath, diff)
    } else if (/\.(t|j)sx?$/.test(filePath)) {
      const r = extractFromCodeDiff(filePath, diff, defaultNamespace, args.unknownNs, localesRoot, localeCache)
      items = r.items
      if (r.skipped && r.skipped.length) allSkipped.push(...r.skipped)
    }
    if (items.length === 0) continue

    for (const { ns, key, value, priority, params, refs } of items) {
      if (!grouped[ns]) grouped[ns] = {}
      const prev = grouped[ns][key]
      if (!prev || priority > prev.priority) {
        grouped[ns][key] = { value, priority, params: params || [], refs: refs || [] }
      } else if (prev && refs && refs.length) {
        prev.refs = Array.from(new Map([...(prev.refs || []), ...refs].map((ref) => [`${ref.file}:${ref.line}`, ref])).values())
        prev.params = Array.from(new Set([...(prev.params || []), ...(params || [])]))
      }
    }
  }

  // 拍平为最终输出
  const finalGrouped = {}
  for (const ns of Object.keys(grouped)) {
    finalGrouped[ns] = {}
    for (const [k, v] of Object.entries(grouped[ns])) {
      finalGrouped[ns][k] = v.value
    }
  }
  const totalKeys = Object.values(finalGrouped).reduce((acc, m) => acc + Object.keys(m).length, 0)
  const nsCounts = Object.fromEntries(Object.entries(finalGrouped).map(([k, v]) => [k, Object.keys(v).length]))

  const payload = args.flat ? flattenNested(finalGrouped) : finalGrouped
  writeJson(args.output, payload)

  const meta = {}
  for (const ns of Object.keys(grouped)) {
    meta[ns] = {}
    for (const [key, value] of Object.entries(grouped[ns])) {
      meta[ns][key] = { refs: value.refs || [], params: value.params || [] }
    }
  }
  writeJson(args.metaOutput, meta)

  // 给 skipped 项附加 suggestedFix（如果 agent.md 配了默认 namespace）
  const suggestedNs = defaultNamespace
  const skippedWithHint = allSkipped.map((s) => {
    if (!suggestedNs) return s
    return { ...s, suggestedFix: `useTranslation('${suggestedNs}')` }
  })

  // 写 skipped 详情。即便为空也写一份空数组，方便上游脚本统一处理。
  writeJson(args.skippedOutput, skippedWithHint)

  // 按文件聚合一下 skipped，便于人眼快速定位
  const skippedByFile = {}
  const skippedNoNs = allSkipped.filter((s) => s.reason !== 'dynamic-key')
  const skippedDynamic = allSkipped.filter((s) => s.reason === 'dynamic-key')
  for (const s of allSkipped) {
    if (!skippedByFile[s.file]) skippedByFile[s.file] = 0
    skippedByFile[s.file] += 1
  }

  console.log(`BASE=${base}`)
  console.log(`agentConfig=${agentConfig.agentPath || '(missing)'}`)
  console.log(`defaultNamespace=${defaultNamespace || '(missing)'}`)
  if (localesRoot) console.log(`localesRoot=${localesRoot}`)
  console.log(`format=${args.flat ? 'flat' : 'nested'}`)
  console.log(`namespaces=${Object.keys(finalGrouped).length}`)
  console.log(`keys=${totalKeys} (translated)`)
  for (const ns of Object.keys(nsCounts).sort()) {
    console.log(`  ns:${ns}=${nsCounts[ns]}`)
  }
  console.log(`skippedKeys=${skippedNoNs.length} (no namespace anchor; not translated)`)
  if (skippedNoNs.length > 0) {
    const fileList = Object.entries(
      skippedNoNs.reduce((acc, s) => { acc[s.file] = (acc[s.file] || 0) + 1; return acc }, {}),
    ).sort((a, b) => b[1] - a[1])
    console.log(`  by file:`)
    for (const [file, n] of fileList.slice(0, 10)) {
      console.log(`    ${file}: ${n}`)
    }
    if (fileList.length > 10) console.log(`    ... +${fileList.length - 10} more files`)
    console.log(`  top samples:`)
    for (const s of skippedNoNs.slice(0, 5)) {
      console.log(`    ${s.file}:${s.line} → ${JSON.stringify(s.key)}`)
    }
    if (suggestedNs) {
      console.log(`  suggestedFix: 这些 hook 可补 useTranslation('${suggestedNs}')（来自 agent.md）`)
    } else {
      console.log(`  suggestedFix: 请在 agent.md 配置 defaultNamespace，或按项目实际包补齐 useTranslation('xxx')`)
    }
  }
  console.log(`dynamicKeys=${skippedDynamic.length} (template literal; not translated)`)
  if (skippedDynamic.length > 0) {
    console.log(`  top samples:`)
    for (const s of skippedDynamic.slice(0, 10)) {
      console.log(`    ${s.file}:${s.line} → ${s.key}`)
    }
    if (skippedDynamic.length > 10) console.log(`    ... +${skippedDynamic.length - 10} more`)
  }
  console.log(`output=${args.output}`)
  console.log(`meta=${args.metaOutput}`)
  console.log(`skipped=${args.skippedOutput}`)
  if (args.unknownNs) {
    console.log(`note: --unknown-ns="${args.unknownNs}" 已开启，所有未知 ns 的 key 都进了该桶（兼容老行为）`)
  }
}

main()
