#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('node:fs')

function parseArgs(argv) {
  const args = {
    edits: '/tmp/i18n-diff-key-edits.json',
  }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--edits') args.edits = argv[++i]
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
  console.log(`apply_key_edits.js

Apply key edits confirmed in the review page back to source code string literals.

Usage:
  node scripts/apply_key_edits.js --edits /tmp/i18n-diff-key-edits.json
`)
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return []
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  if (!Array.isArray(data)) throw new Error(`${filePath} must contain an array`)
  return data
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeJsString(value, quote) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(new RegExp(quote, 'g'), `\\${quote}`)
}

function uniqueRefs(refs) {
  const seen = new Set()
  const result = []
  for (const ref of refs || []) {
    if (!ref || typeof ref.file !== 'string') continue
    const key = `${ref.file}:${ref.line || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(ref)
  }
  return result
}

function replaceKeyInFile(filePath, oldKey, newKey) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return 0
  const before = fs.readFileSync(filePath, 'utf-8')
  const escapedOld = escapeRegExp(oldKey)
  let changed = 0
  const pattern = new RegExp(`\\b(t|__|translate)\\(\\s*(['"])${escapedOld}\\2`, 'g')
  const after = before.replace(pattern, (match, fnName, quote) => {
    changed += 1
    return match.replace(`${quote}${oldKey}${quote}`, `${quote}${escapeJsString(newKey, quote)}${quote}`)
  })
  if (changed > 0 && after !== before) fs.writeFileSync(filePath, after, 'utf-8')
  return changed
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const edits = readJson(args.edits)
  let replacements = 0
  const touchedFiles = new Set()

  for (const edit of edits) {
    const oldKey = String(edit.oldKey || '')
    const newKey = String(edit.newKey || '')
    if (!oldKey || !newKey || oldKey === newKey) continue
    for (const ref of uniqueRefs(edit.refs)) {
      const count = replaceKeyInFile(ref.file, oldKey, newKey)
      if (count > 0) {
        replacements += count
        touchedFiles.add(ref.file)
      }
    }
  }

  console.log(`keyEdits=${edits.length}`)
  console.log(`replacements=${replacements}`)
  console.log(`touchedFiles=${touchedFiles.size}`)
  for (const file of Array.from(touchedFiles).sort()) console.log(`  ${file}`)
}

main()
