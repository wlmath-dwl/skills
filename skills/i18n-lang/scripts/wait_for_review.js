#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('node:fs')

function parseArgs(argv) {
  const args = {
    output: '/tmp/i18n-diff-source-reviewed.json',
    timeout: 30 * 60 * 1000,
    interval: 1000,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--output') args.output = argv[++i]
    else if (token === '--timeout') args.timeout = Number(argv[++i]) * 1000
    else if (token === '--interval') args.interval = Number(argv[++i])
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
  console.log(`wait_for_review.js

Wait until the browser review page writes the reviewed source JSON.

Usage:
  node scripts/wait_for_review.js \\
    --output /tmp/i18n-diff-source-reviewed.json \\
    [--timeout 1800] [--interval 1000]
`)
}

function readValidJson(filePath) {
  if (!fs.existsSync(filePath)) return null
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${filePath} must contain a JSON object`)
  }
  return data
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const startedAt = Date.now()

  while (Date.now() - startedAt <= args.timeout) {
    const data = readValidJson(args.output)
    if (data) {
      const total = Object.values(data).reduce((sum, value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return sum
        return sum + Object.keys(value).length
      }, 0)
      console.log(`reviewConfirmed=true`)
      console.log(`reviewed=${args.output}`)
      console.log(`keys=${total}`)
      return
    }
    await sleep(args.interval)
  }

  throw new Error(`Timed out waiting for review confirmation: ${args.output}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
