#!/usr/bin/env node
/* eslint-disable no-console */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { loadAgentConfig } = require('./i18n_config')

function parseArgs(argv) {
  const args = {
    // 允许重复传入 --translations <file>，多个文件按出现顺序深合并（后者覆盖前者）。
    // 典型用法: --translations api.json --translations llm-fallback.json
    translations: [],
    localesRoot: null,
    namespace: null,
    overwrite: false,
    dryRun: false,
    unknownNs: '__unknown__',
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--translations') args.translations.push(argv[++i])
    else if (token === '--locales-root') args.localesRoot = argv[++i]
    else if (token === '--namespace') args.namespace = argv[++i]
    else if (token === '--overwrite') args.overwrite = true
    else if (token === '--dry-run') args.dryRun = true
    else if (token === '--unknown-ns') args.unknownNs = argv[++i]
    else if (token === '--help' || token === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown arg: ${token}`)
    }
  }

  if (args.translations.length === 0) {
    args.translations.push('/tmp/i18n-diff-translations.json')
  }

  return args
}

function printHelp() {
  console.log(`apply_translations.js

Apply translations into existing locale namespace files. Two input shapes:

  flat   : { locale: { key: translation } }
           → all keys go to a single namespace (--namespace, or auto-detect)

  nested : { locale: { ns: { key: translation } } }
           → each ns is written to its own {locale}/{ns}.json file
           → entries under "__unknown__" fall back to --namespace

Default behavior: do NOT overwrite existing keys.

--translations 可重复传入, 多份按出现顺序深合并 (后覆前):
  --translations api.json --translations llm-fallback.json

Usage:
  node scripts/apply_translations.js \\
    --translations /tmp/i18n-diff-translations.json \\
    [--translations /tmp/i18n-llm-fallback.json] \\
    [--locales-root client/src/i18n/locales] \\
    [--namespace page] \\
    [--unknown-ns __unknown__] \\
    [--dry-run] [--overwrite]
`)
}

// 把多份翻译文件深合并: 后者覆盖前者
//   { locale: { key } }                        扁平
//   { locale: { ns: { key } } }                按 ns 嵌套
//   { locale: { ns: { a: { b: key } } } }      任意深度嵌套
function mergeTranslations(target, incoming) {
  for (const [locale, payload] of Object.entries(incoming)) {
    if (!isObject(payload)) continue
    if (!isObject(target[locale])) {
      target[locale] = {}
    }
    deepMerge(target[locale], payload)
  }
  return target
}

function runGit(args) {
  return execFileSync('git', args, { encoding: 'utf-8' })
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8')
  return JSON.parse(raw)
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// 递归 flatten 深层嵌套对象为 { "a.b.c": "value" } 形式
function flattenObject(obj, prefix) {
  const result = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') {
      result[key] = v
    } else if (isObject(v)) {
      Object.assign(result, flattenObject(v, key))
    }
  }
  return result
}

// 把 { "a.b.c": "value" } 还原为 { a: { b: { c: "value" } } }
function unflattenObject(obj) {
  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    const parts = key.split('.')
    let current = result
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (!isObject(current[parts[i]])) current[parts[i]] = {}
      current = current[parts[i]]
    }
    current[parts[parts.length - 1]] = value
  }
  return result
}

// 递归深合并两个对象（后者覆盖前者）
function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') {
      target[key] = value
    } else if (isObject(value)) {
      if (!isObject(target[key])) target[key] = {}
      deepMerge(target[key], value)
    }
  }
  return target
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
    const matched = patterns.some((p) => p.test(file))
    if (!matched) continue

    const parts = file.split('/')
    // Find the locale segment: .../locales/<locale>/<namespace>.json
    const localesIndex = parts.lastIndexOf('locales')
    if (localesIndex < 0 || localesIndex + 2 >= parts.length) continue
    const root = parts.slice(0, localesIndex + 1).join('/')
    candidates.set(root, (candidates.get(root) || 0) + 1)
  }

  if (candidates.size === 0) throw new Error('Unable to auto-detect localesRoot (no locales JSON tracked by git).')

  const sorted = Array.from(candidates.entries()).sort((a, b) => b[1] - a[1])
  const best = sorted[0]
  const second = sorted[1]
  if (second && second[1] === best[1]) {
    throw new Error(
      `Multiple localesRoot candidates with same score: ${best[0]} (${best[1]}), ${second[0]} (${second[1]}). Use --locales-root.`,
    )
  }
  return best[0]
}

// 在仓库内 grep `defaultNS: 'xxx'` 字面量；优先取与 localesRoot 路径前缀重合最长的命中。
// 之所以不再硬编码 client/src，是因为不同项目的 i18n 配置位置差异很大：
//   workshop:   client/src/i18n/Provider.tsx
//   NextVR:     src/lib/config/i18n.ts
//   my.realsee: 没有显式配置（注释掉了），应当返回 null 让外层回落
function detectDefaultNamespace(localesRoot) {
  let raw = ''
  try {
    raw = runGit(['grep', '-nE', "defaultNS\\s*:\\s*['\"][^'\"]+['\"]"])
  } catch {
    return null
  }

  const localesSegments = localesRoot ? localesRoot.split('/').filter(Boolean) : []
  const candidates = []

  for (const line of raw.split('\n')) {
    if (!line) continue
    const firstColon = line.indexOf(':')
    if (firstColon < 0) continue
    const filePath = line.slice(0, firstColon)
    const rest = line.slice(firstColon + 1)

    // 过滤明显不是运行时配置的来源：类型声明、文档、测试、构建产物
    if (filePath.endsWith('.d.ts')) continue
    if (filePath.endsWith('.md') || filePath.endsWith('.mdx')) continue
    if (/(^|\/)docs?\//.test(filePath)) continue
    if (/(^|\/)__tests?__\//.test(filePath)) continue
    if (/(^|\/)tests?\//.test(filePath)) continue
    if (/(^|\/)(dist|build|out|coverage|\.next|\.cache)\//.test(filePath)) continue
    if (/\.(test|spec)\.[a-z]+$/.test(filePath)) continue

    const match = rest.match(/defaultNS\s*:\s*['"]([^'"]+)['"]/)
    if (!match) continue

    const fileSegments = filePath.split('/')
    let prefixLen = 0
    while (
      prefixLen < localesSegments.length &&
      prefixLen < fileSegments.length &&
      localesSegments[prefixLen] === fileSegments[prefixLen]
    ) {
      prefixLen += 1
    }

    candidates.push({ filePath, value: match[1], prefixLen })
  }

  if (candidates.length === 0) return null

  // 路径前缀越长越优先；同分时优先更短路径（更接近根的配置文件更可能是主配置）
  candidates.sort((a, b) => {
    if (b.prefixLen !== a.prefixLen) return b.prefixLen - a.prefixLen
    if (a.filePath.length !== b.filePath.length) return a.filePath.length - b.filePath.length
    return a.filePath.localeCompare(b.filePath)
  })

  return candidates[0].value
}

function mostCommonNamespaceUnder(localesRoot) {
  const files = runGit(['ls-files', `${localesRoot}/*/*.json`]).split('\n').filter(Boolean)
  const counts = new Map()
  for (const f of files) {
    const base = path.basename(f, '.json')
    counts.set(base, (counts.get(base) || 0) + 1)
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  return sorted.length ? sorted[0][0] : null
}

// 探测 translations 的二级形态：是否任一 locale 下出现 { ns: { key: string } } 嵌套
function isNestedByNamespace(translations) {
  for (const localeMap of Object.values(translations)) {
    if (!isObject(localeMap)) continue
    for (const value of Object.values(localeMap)) {
      if (isObject(value)) return true
    }
  }
  return false
}

// 把每个 locale 的 payload 归一化成 { ns: { ... } }。
// 旧扁平输入（{ locale: { key: value } }）会塞到 fallbackNs 下。
// 嵌套输入中残留的字符串叶子（少见，混合形态）也归并到 fallbackNs，避免静默丢失。
// ns 桶内的值可以是任意深度嵌套对象。
function normalizeToNsBuckets(localeMap, fallbackNs) {
  const buckets = {}
  for (const [k, v] of Object.entries(localeMap)) {
    if (typeof v === 'string') {
      if (!buckets[fallbackNs]) buckets[fallbackNs] = {}
      buckets[fallbackNs][k] = v
    } else if (isObject(v)) {
      buckets[k] = buckets[k] || {}
      deepMerge(buckets[k], v)
    }
  }
  return buckets
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  const translations = {}
  for (const filePath of args.translations) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`translations file not found: ${filePath}`)
    }
    const part = readJson(filePath)
    if (!isObject(part)) {
      throw new Error(`translations JSON must be an object in ${filePath}`)
    }
    mergeTranslations(translations, part)
  }
  if (Object.keys(translations).length === 0) {
    throw new Error('translations JSON must be an object: { locale: { ... } }')
  }

  const localesRoot = args.localesRoot || detectLocalesRootFromGit()
  const agentConfig = loadAgentConfig(process.cwd())

  // fallback ns 探测优先级（高 → 低）：
  //   1) --namespace 命令行覆盖
  //   2) agent.md defaultNamespace
  //   3) git grep `defaultNS:'xxx'` 字面量
  //   4) localesRoot 下出现次数最多的 ns 文件名
  //   5) 'common'
  let fallbackNs = args.namespace
  let fallbackSource = fallbackNs ? 'cli' : null
  if (!fallbackNs) {
    fallbackNs = agentConfig.defaultNamespace
    if (fallbackNs) fallbackSource = 'agent.md'
  }
  if (!fallbackNs) {
    fallbackNs = detectDefaultNamespace(localesRoot)
    if (fallbackNs) fallbackSource = 'defaultNS-literal'
  }
  if (!fallbackNs) {
    fallbackNs = mostCommonNamespaceUnder(localesRoot)
    if (fallbackNs) fallbackSource = 'most-common'
  }
  if (!fallbackNs) {
    fallbackNs = 'common'
    fallbackSource = 'hardcoded-default'
  }

  const nested = isNestedByNamespace(translations)

  // 判定 fallbackNs 是否真被消费：扁平输入一定用；嵌套输入只有显式存在 unknownNs 桶时才用。
  // 这个标志只影响日志展示，不影响实际行为，目的是避免大量"用不到却天天打印"的噪音。
  let fallbackUsed = !nested
  if (!fallbackUsed) {
    for (const localeMap of Object.values(translations)) {
      if (!isObject(localeMap)) continue
      if (Object.prototype.hasOwnProperty.call(localeMap, args.unknownNs)) {
        fallbackUsed = true
        break
      }
    }
  }

  const writtenLocaleNs = new Set() // "locale:ns"
  const skippedNoDir = new Set()
  const skippedNoFile = new Set() // "locale:ns"
  let skippedExisting = 0
  let added = 0
  const changedFiles = new Set()

  for (const [locale, localeMap] of Object.entries(translations)) {
    if (!isObject(localeMap)) continue
    const localeDir = path.join(localesRoot, locale)
    if (!fs.existsSync(localeDir) || !fs.statSync(localeDir).isDirectory()) {
      skippedNoDir.add(locale)
      continue
    }

    // 把 unknownNs 桶映射到 fallbackNs；其他 ns 保留
    const rawBuckets = normalizeToNsBuckets(localeMap, fallbackNs)
    const buckets = {}
    for (const [ns, m] of Object.entries(rawBuckets)) {
      const targetNs = ns === args.unknownNs ? fallbackNs : ns
      if (!buckets[targetNs]) buckets[targetNs] = {}
      Object.assign(buckets[targetNs], m)
    }

    for (const [ns, mapping] of Object.entries(buckets)) {
      const target = path.join(localeDir, `${ns}.json`)
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        skippedNoFile.add(`${locale}:${ns}`)
        continue
      }

      const current = readJson(target)
      if (!isObject(current)) throw new Error(`${target} must be a JSON object`)

      // flatten 双方以便逐 key 比较，写完再 unflatten 回原结构
      const currentFlat = flattenObject(current, '')
      const incomingFlat = flattenObject(mapping, '')

      let touched = 0
      for (const [key, value] of Object.entries(incomingFlat)) {
        if (typeof key !== 'string' || typeof value !== 'string') continue
        const exists = Object.prototype.hasOwnProperty.call(currentFlat, key)
        if (exists && !args.overwrite) {
          skippedExisting += 1
          continue
        }
        // overwrite 模式下，只有值真正变化才算 touched（避免空写）
        if (exists && currentFlat[key] === value) continue
        currentFlat[key] = value
        touched += 1
        added += 1
      }

      if (touched > 0) {
        // 检测原文件是否使用嵌套结构：如果原文件有嵌套对象，unflatten 回去；否则保持扁平
        const hasNesting = Object.values(current).some((v) => isObject(v))
        const merged = hasNesting ? unflattenObject(currentFlat) : currentFlat
        if (!args.dryRun) writeJson(target, merged)
        writtenLocaleNs.add(`${locale}:${ns}`)
        changedFiles.add(target)
      }
    }
  }

  // 汇总：按 locale 列出涉及的 ns
  const writtenSummary = {}
  for (const item of writtenLocaleNs) {
    const [locale, ns] = item.split(':')
    if (!writtenSummary[locale]) writtenSummary[locale] = []
    writtenSummary[locale].push(ns)
  }

  console.log(`translationSources=${args.translations.join(',')}`)
  console.log(`agentConfig=${agentConfig.agentPath || '(missing)'}`)
  console.log(`localesRoot=${localesRoot}`)
  console.log(`format=${nested ? 'nested-by-ns' : 'flat'}`)
  if (fallbackUsed) {
    console.log(`fallbackNamespace=${fallbackNs} (source=${fallbackSource})`)
  }
  console.log(`writtenLocales=${Object.keys(writtenSummary).length ? Object.keys(writtenSummary).sort().join(',') : '(none)'}`)
  for (const locale of Object.keys(writtenSummary).sort()) {
    console.log(`  ${locale}: ${writtenSummary[locale].sort().join(',')}`)
  }
  console.log(`writtenFiles=${changedFiles.size}`)
  console.log(`added=${added}`)
  if (skippedNoDir.size) console.log(`skippedNoDir=${Array.from(skippedNoDir).sort().join(',')}`)
  if (skippedNoFile.size) console.log(`skippedNoFile=${Array.from(skippedNoFile).sort().join(',')}`)
  if (skippedExisting) console.log(`skippedExisting=${skippedExisting}`)

  for (const filePath of changedFiles) readJson(filePath)

  if (args.dryRun) console.log('dryRun=true (no files written)')
}

main()
