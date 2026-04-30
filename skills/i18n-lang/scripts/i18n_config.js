const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function runGit(args) {
  return execFileSync('git', args, { encoding: 'utf-8' })
}

function findRepoRoot(startDir) {
  try {
    return runGit(['-C', startDir || process.cwd(), 'rev-parse', '--show-toplevel']).trim()
  } catch {
    return process.cwd()
  }
}

function findAgentMd(startDir, repoRoot) {
  const names = ['agent.md', 'AGENT.md', 'agents.md', 'AGENTS.md']
  let current = path.resolve(startDir || repoRoot || process.cwd())
  const stop = path.resolve(repoRoot || current)

  while (current.startsWith(stop)) {
    for (const name of names) {
      const filePath = path.join(current, name)
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return filePath
    }
    if (current === stop) break
    current = path.dirname(current)
  }

  for (const name of names) {
    const filePath = path.join(stop, name)
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return filePath
  }
  return null
}

function cleanValue(value) {
  return String(value || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/,$/, '')
    .trim()
}

function parseInlineList(raw) {
  const match = raw.match(/\[([^\]]*)\]/)
  if (!match) return null
  return match[1]
    .split(',')
    .map((item) => cleanValue(item))
    .filter(Boolean)
}

function parseAgentConfigText(text) {
  const config = { defaultNamespace: null, locales: [] }
  const lines = text.split(/\r?\n/)

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const nsMatch = line.match(/^\s*(?:defaultNamespace|default_namespace|namespace|defaultNS)\s*:\s*(.+?)\s*$/)
    if (nsMatch && !config.defaultNamespace) {
      config.defaultNamespace = cleanValue(nsMatch[1])
      continue
    }

    const localesMatch = line.match(/^\s*(?:locales|targetLocales|target_locales|languages)\s*:\s*(.*)$/)
    if (!localesMatch || config.locales.length > 0) continue

    const inline = parseInlineList(localesMatch[1])
    if (inline) {
      config.locales = inline
      continue
    }

    const list = []
    const parentIndent = line.match(/^\s*/)[0].length
    for (let j = i + 1; j < lines.length; j += 1) {
      const child = lines[j]
      if (!child.trim()) continue
      const indent = child.match(/^\s*/)[0].length
      const itemMatch = child.match(/^\s*-\s*(.+?)\s*$/)
      if (indent <= parentIndent && !itemMatch) break
      if (!itemMatch) break
      const value = cleanValue(itemMatch[1])
      if (value) list.push(value)
      i = j
    }
    config.locales = list
  }

  return config
}

function loadAgentConfig(startDir) {
  const cwd = startDir || process.cwd()
  const repoRoot = findRepoRoot(cwd)
  const agentPath = findAgentMd(cwd, repoRoot)
  if (!agentPath) return { repoRoot, agentPath: null, defaultNamespace: null, locales: [] }
  const parsed = parseAgentConfigText(fs.readFileSync(agentPath, 'utf-8'))
  return { repoRoot, agentPath, ...parsed }
}

module.exports = {
  findRepoRoot,
  loadAgentConfig,
  parseAgentConfigText,
}
