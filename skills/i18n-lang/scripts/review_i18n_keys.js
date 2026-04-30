#!/usr/bin/env node
/* eslint-disable no-console */
const http = require('node:http')
const { execFile } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function parseArgs(argv) {
  const args = {
    input: '/tmp/i18n-diff-source.json',
    meta: '/tmp/i18n-diff-source-meta.json',
    output: '/tmp/i18n-diff-source-reviewed.json',
    keyEditsOutput: '/tmp/i18n-diff-key-edits.json',
    result: '/tmp/i18n-diff-translations.json',
    port: 4789,
    open: true,
    requireOpen: true,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--input') args.input = argv[++i]
    else if (token === '--meta') args.meta = argv[++i]
    else if (token === '--output') args.output = argv[++i]
    else if (token === '--key-edits-output') args.keyEditsOutput = argv[++i]
    else if (token === '--result') args.result = argv[++i]
    else if (token === '--port') args.port = Number(argv[++i])
    else if (token === '--open') args.open = true
    else if (token === '--no-open') args.open = false
    else if (token === '--require-open') args.requireOpen = true
    else if (token === '--no-require-open') args.requireOpen = false
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
  console.log(`review_i18n_keys.js

Start a local page for reviewing extracted i18n keys before LLM translation.

Usage:
  node scripts/review_i18n_keys.js \\
    --input /tmp/i18n-diff-source.json \\
    --meta /tmp/i18n-diff-source-meta.json \\
    --output /tmp/i18n-diff-source-reviewed.json \\
    --key-edits-output /tmp/i18n-diff-key-edits.json \\
    --result /tmp/i18n-diff-translations.json \\
    [--port 4789]
    [--open|--no-open]
    [--require-open|--no-require-open]
`)
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function flattenRows(source, meta) {
  const rows = []
  for (const [ns, mapping] of Object.entries(source || {})) {
    if (!isObject(mapping)) continue
    for (const [key, value] of Object.entries(mapping)) {
      const itemMeta = meta && meta[ns] && meta[ns][key] ? meta[ns][key] : {}
      const refs = Array.isArray(itemMeta.refs) ? itemMeta.refs : []
      const params = Array.isArray(itemMeta.params) ? itemMeta.params : []
      rows.push({ ns, key, originalKey: key, value: typeof value === 'string' ? value : '', params, refs })
    }
  }
  return rows
}

function rowsToNested(rows) {
  const nested = {}
  for (const row of rows) {
    const ns = String(row.ns || '').trim()
    const key = String(row.key || '').trim()
    const value = String(row.value || '').trim()
    if (!ns || !key) continue
    if (!nested[ns]) nested[ns] = {}
    nested[ns][key] = value
  }
  return nested
}

function rowsToKeyEdits(rows) {
  return rows
    .map((row) => ({
      ns: String(row.ns || '').trim(),
      oldKey: String(row.originalKey || row.key || '').trim(),
      newKey: String(row.key || '').trim(),
      refs: Array.isArray(row.refs) ? row.refs : [],
    }))
    .filter((row) => row.ns && row.oldKey && row.newKey && row.oldKey !== row.newKey)
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function renderPage(args, confirmed) {
  const source = readJson(args.output, null) || readJson(args.input, {})
  const meta = readJson(args.meta, {})
  const rows = flattenRows(source, meta)
  const result = readJson(args.result, null)
  const initialRows = JSON.stringify(rows)
  const initialResult = JSON.stringify(result)

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>i18n Review</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2937; background: #f7f7f4; }
    main { padding: 24px 28px 48px; max-width: 1200px; margin: 0 auto; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #deded8; }
    th, td { border-bottom: 1px solid #e8e8e2; padding: 10px 12px; vertical-align: middle; text-align: left; }
    th { font-size: 12px; color: #4b5563; background: #fbfbf8; }
    td.ns { width: 140px; color: #374151; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    td.key { width: 340px; color: #111827; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
    td.params { width: 180px; color: #4b5563; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .param { display: inline-block; margin: 2px 4px 2px 0; padding: 2px 6px; border: 1px solid #d8d8d1; border-radius: 999px; background: #fbfbf8; font-size: 12px; }
    input.copy, input.keyInput { width: 100%; height: 36px; border: 1px solid #cfcfc8; border-radius: 6px; padding: 0 10px; font: inherit; background: #fff; }
    input.copy:focus, input.keyInput:focus { outline: 2px solid #2563eb33; border-color: #2563eb; }
    input.keyInput { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    button { border: 1px solid #c9c9c1; background: #fff; color: #1f2937; border-radius: 6px; padding: 8px 12px; cursor: pointer; }
    button.primary { background: #155eef; border-color: #155eef; color: #fff; font-weight: 650; }
    button:disabled { opacity: .65; cursor: default; }
    button.danger { color: #b42318; }
    .statusPanel { margin: 0 0 16px; padding: 12px 14px; border: 1px solid #cfcfc8; border-radius: 6px; background: #fff; display: flex; align-items: center; gap: 10px; font-weight: 650; }
    .statusPanel.confirmed { border-color: #a7d7b7; background: #eefaf1; color: #196038; }
    .statusPanel.done { border-color: #b6c7ee; background: #f0f5ff; color: #174ea6; }
    .spinner { width: 16px; height: 16px; border: 2px solid #bcd0ff; border-top-color: #155eef; border-radius: 50%; animation: spin .8s linear infinite; display: none; }
    .statusPanel.confirmed .spinner { display: inline-block; }
    .statusPanel.done .spinner { display: none; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .empty { padding: 40px; text-align: center; color: #6b7280; background: #fff; border: 1px solid #deded8; }
    .actions { display: flex; justify-content: flex-end; margin-top: 14px; }
    .result { margin-top: 24px; background: #fff; border: 1px solid #deded8; }
    .resultHeader { padding: 14px 16px; border-bottom: 1px solid #e8e8e2; font-size: 16px; font-weight: 700; }
    .tabs { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 16px; border-bottom: 1px solid #e8e8e2; }
    .tab { padding: 6px 10px; border-radius: 6px; border: 1px solid #c9c9c1; background: #fff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .tab.active { border-color: #155eef; background: #eef4ff; color: #155eef; font-weight: 700; }
    .translationTable { padding: 16px; }
    .translationTable table { border: 1px solid #e8e8e2; }
    .translationTable td.value { width: 50%; }
    .translationTable input { width: 100%; height: 34px; border: 1px solid #d8d8d1; border-radius: 6px; padding: 0 10px; font: inherit; background: #fbfbf8; }
  </style>
</head>
<body>
  <main>
    <div class="statusPanel ${confirmed ? 'confirmed' : ''}" id="statusPanel">
      <span class="spinner" aria-hidden="true"></span>
      <span id="status">${confirmed ? '翻译中' : '请确认 key 和中文文案'}</span>
    </div>
    <div id="table"></div>
    <div class="actions">
      <button class="primary" id="confirm">确认</button>
    </div>
    <section class="result" id="result" style="display:none">
      <div class="resultHeader">翻译结果</div>
      <div class="tabs" id="tabs"></div>
      <div class="translationTable" id="resultBody"></div>
    </section>
  </main>
  <script>
    let rows = ${initialRows};
    let result = ${initialResult};
    let activeLocale = result ? Object.keys(result)[0] : null;

    function render() {
      const root = document.getElementById('table');
      if (!rows.length) {
        root.innerHTML = '<div class="empty">没有提取到待翻译 key</div>';
        return;
      }
      root.innerHTML = '<table><thead><tr><th>Namespace</th><th>Key</th><th>参数</th><th>中文文案</th><th></th></tr></thead><tbody>' +
        rows.map((row, index) => '<tr>' +
          '<td class="ns">' + escapeHtml(row.ns) + '</td>' +
          '<td class="key"><input class="keyInput" data-key-index="' + index + '" value="' + escapeHtml(row.key || '') + '" /></td>' +
          '<td class="params">' + renderParams(row.params) + '</td>' +
          '<td><input class="copy" data-index="' + index + '" value="' + escapeHtml(row.value || '') + '" /></td>' +
          '<td><button class="danger" data-delete="' + index + '">删除</button></td>' +
        '</tr>').join('') + '</tbody></table>';
      root.querySelectorAll('input.copy').forEach((el) => {
        el.addEventListener('input', () => { rows[Number(el.dataset.index)].value = el.value; });
      });
      root.querySelectorAll('input.keyInput').forEach((el) => {
        el.addEventListener('input', () => { rows[Number(el.dataset.keyIndex)].key = el.value; });
      });
      root.querySelectorAll('[data-delete]').forEach((el) => {
        el.addEventListener('click', () => {
          rows.splice(Number(el.dataset.delete), 1);
          render();
        });
      });
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
    }

    function renderParams(params) {
      if (!Array.isArray(params) || !params.length) return '';
      return params.map((name) => '<span class="param">{' + escapeHtml(name) + '}</span>').join('');
    }

    async function confirmRows() {
      const missing = rows.find((row) => !String(row.value || '').trim());
      if (missing) {
        alert('请填写完整');
        return;
      }
      const missingKey = rows.find((row) => !String(row.key || '').trim());
      if (missingKey) {
        alert('请填写完整 key');
        return;
      }
      const response = await fetch('/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      if (!response.ok) {
        alert(await response.text());
        return;
      }
      const payload = await response.json();
      setStatus('confirmed', payload.message || '翻译中');
      document.getElementById('confirm').disabled = true;
      document.getElementById('confirm').textContent = '已确认';
    }

    function setStatus(kind, text) {
      const panel = document.getElementById('statusPanel');
      panel.className = 'statusPanel' + (kind ? ' ' + kind : '');
      document.getElementById('status').textContent = text;
    }

    function renderResult(payload) {
      if (!payload) return;
      result = payload;
      const locales = Object.keys(payload);
      if (!locales.length) return;
      if (!activeLocale || !payload[activeLocale]) activeLocale = locales[0];
      document.getElementById('result').style.display = 'block';
      setStatus('done', '翻译完成');
      document.getElementById('tabs').innerHTML = locales.map((locale) =>
        '<button class="tab ' + (locale === activeLocale ? 'active' : '') + '" data-locale="' + escapeHtml(locale) + '">' + escapeHtml(locale) + '</button>'
      ).join('');
      document.querySelectorAll('.tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          activeLocale = tab.dataset.locale;
          renderResult(result);
        });
      });
      renderLocale(activeLocale, payload[activeLocale]);
    }

    function flattenTranslations(data, prefix) {
      const rows = [];
      Object.entries(data || {}).forEach(([key, value]) => {
        const next = prefix ? prefix + '.' + key : key;
        if (typeof value === 'string') rows.push({ key: next, value });
        else if (value && typeof value === 'object' && !Array.isArray(value)) rows.push(...flattenTranslations(value, next));
      });
      return rows;
    }

    function renderLocale(locale, payload) {
      const rows = [];
      Object.entries(payload || {}).forEach(([ns, mapping]) => {
        flattenTranslations(mapping, '').forEach((item) => rows.push({ ns, key: item.key, value: item.value }));
      });
      document.getElementById('resultBody').innerHTML = '<table><thead><tr><th>Namespace</th><th>Key</th><th>译文</th></tr></thead><tbody>' +
        rows.map((row) => '<tr><td class="ns">' + escapeHtml(row.ns) + '</td><td class="key">' + escapeHtml(row.key) + '</td><td class="value"><input readonly value="' + escapeHtml(row.value) + '" /></td></tr>').join('') +
        '</tbody></table>';
    }

    async function poll() {
      const response = await fetch('/status');
      const payload = await response.json();
      if (payload.result) renderResult(payload.result);
    }

    document.getElementById('confirm').addEventListener('click', confirmRows);
    render();
    renderResult(result);
    setInterval(poll, 2000);
  </script>
</body>
</html>`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  let confirmed = fs.existsSync(args.output)

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(renderPage(args, confirmed))
        return
      }
      if (req.method === 'GET' && req.url === '/status') {
        const result = readJson(args.result, null)
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ confirmed, output: args.output, result }))
        return
      }
      if (req.method === 'POST' && req.url === '/confirm') {
        const body = JSON.parse(await readBody(req))
        const rows = Array.isArray(body.rows) ? body.rows : []
        const missing = rows.find((row) => !String(row.value || '').trim())
        if (missing) {
          res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('请填写完整')
          return
        }
        writeJson(args.output, rowsToNested(rows))
        writeJson(args.keyEditsOutput, rowsToKeyEdits(rows))
        confirmed = true
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: true, output: args.output, message: '已确认，翻译流程正在执行。' }))
        return
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('not found')
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(error && error.stack ? error.stack : String(error))
    }
  })

  server.listen(args.port, '127.0.0.1', async () => {
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : args.port
    const reviewUrl = `http://127.0.0.1:${port}/`
    console.log(`reviewUrl=${reviewUrl}`)
    console.log(`input=${args.input}`)
    console.log(`output=${args.output}`)
    console.log(`keyEdits=${args.keyEditsOutput}`)
    console.log(`result=${args.result}`)
    if (args.open) {
      try {
        await openBrowser(reviewUrl)
        console.log(`opened=${reviewUrl}`)
      } catch (error) {
        console.error(`openBrowserFailed=${error.message}`)
        if (args.requireOpen) {
          server.close(() => process.exit(1))
        }
      }
    }
  })
}

function openBrowser(url) {
  const platform = process.platform
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url]
  return new Promise((resolve, reject) => {
    execFile(command, args, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

main()
