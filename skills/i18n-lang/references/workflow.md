# Workflow Rules

## 配置规则

1. 先定位 repo root，再读取 `agent.md` / `AGENT.md` / `agents.md` / `AGENTS.md`。
2. `agent.md` 负责配置项目差异：

```yaml
i18n:
  defaultNamespace: page
  locales:
    - de-DE
    - en-US
    - ja-JP
```

3. 脚本识别这些字段名：
   - namespace：`defaultNamespace`、`default_namespace`、`namespace`、`defaultNS`
   - locale 列表：`locales`、`targetLocales`、`target_locales`、`languages`
4. 如果没有 `agent.md` 的 `locales`，`translate_via_llm.py` 必须要求显式传 `--locales`，不要按项目名猜测。
5. 如果没有 `agent.md` 的 `defaultNamespace`，代码文件里又没有 `useTranslation('xxx')`，该 key 才进入 skipped。

## 提取规则

1. 先定位 repo root，再确定 `BASE`：
   - 用户指定基准分支时以用户为准
   - 否则默认使用 `origin/master`
2. 提取阶段只依赖这些命令的输出：
   - `git diff --name-status "$BASE"...HEAD`
   - 若用户明确要包含未提交改动，再补 `git diff --name-status`
   - 对相关文件执行 `git diff "$BASE"...HEAD -- path/to/file`
3. 默认按 `{ ns: { key: 中文 } }` 分组提取；只在用户明确要兼容旧链路时输出扁平。
4. 不要为了"核对原文"去打开未在 diff 中出现的文件；但出现 `t('xx')` 的已修改文件允许读取一次，用来查找当前文件里的 `useTranslation('xxx')`。

### 可提取场景

- 语言包 JSON：
  - `**/locales/**/*.json`
  - `**/i18n/locales/**/*.json`
  - `**/i18n/**/add.json`
  - `**/src/locales/**/*.json`
- 代码中的字面量 key：
  - `t('...')`
  - `t("...")`
  - `__('...')`
  - `translate('...', ...)`

### Namespace 规则

- JSON 文件的 namespace 直接来自路径：`.../locales/{locale}/{ns}.json`。
- 代码文件的 namespace 只按当前文件判断：
  - 如果调用写成 `t('key', 'ns')` / `__('key', 'ns')` / `translate('key', 'ns')`，第二个字面量参数是手动 namespace，优先级最高。
  - 如果调用写成 `t('key', { ns: 'ns', name })`，参数对象里的 `ns` 也是手动 namespace，优先级最高。
  - 读取出现 `t('xx')` 的当前文件。
  - 找第一个 `useTranslation('xxx')`。
  - 找到则使用该 namespace。
  - 找不到则使用 `agent.md` 的 `defaultNamespace`。
  - 两者都没有，才写入 skipped。
- 不再按 diff hunk 行号找最近锚点，也不再识别 `getFixedT` 来推断 namespace。

### 文案规则

- `t(\`...\`)` 这类动态 key 不写入结果，记录到 skipped。
- 中文 key 直接使用 key 作为中文文案。
- 非中文 key 先从中文 locale 文件回查文案；查不到则以空字符串进入本地确认页。
- 动态插值参数会进入 meta，并在确认页参数列展示为 `{name}`、`{count}` 等，提醒用户中文文案里保留占位符。
- 同一 (ns, key) 多次出现时，按 zh-CN > zh-TW > 代码回查 > 空值的优先级保留。
- 提取不到任何 key 时，输出 `{}`，不要杜撰内容。
- 空中文文案不是删除信号。不得因为文案为空而删除源码里的 `t('key')` 调用、调试代码、DOM 节点或其他业务代码。

## 本地确认页

使用 `scripts/review_i18n_keys.js`：

```bash
node scripts/review_i18n_keys.js \
  --input /tmp/i18n-diff-source.json \
  --output /tmp/i18n-diff-source-reviewed.json \
  --result /tmp/i18n-diff-translations.json
```

页面行为：

- 无论提取结果是否为空，都要自动打开本地浏览器页面让用户确认。
- 展示 namespace、key、中文文案。
- 中文文案允许编辑。
- 每一行允许从本次翻译清单删除；这只影响 `/tmp/i18n-diff-source-reviewed.json`，不得改动项目源码。
- 点击确认时，如果有空中文文案，弹出“请填写完整”，不写输出文件。
- 确认成功后写 `/tmp/i18n-diff-source-reviewed.json`，页面顶部显示“翻译中”并带转圈 loading 效果，将确认按钮置为已确认状态。
- 页面不要有固定底栏，也不要有单独顶栏标题；状态直接显示在内容区顶部。
- Key 和中文文案编辑控件都使用单行 `input`，表格每行内容垂直居中。
- 有插值参数时，参数列展示占位符提示。
- 用户修改 Key 时，确认后写 `/tmp/i18n-diff-key-edits.json`，agent 必须用 `scripts/apply_key_edits.js` 同步源码调用点。
- `/tmp/i18n-diff-translations.json` 出现后，页面自动展示翻译结果；不同 locale 用 tab 切换展示，不要把所有语言混在一个 JSON 中一起显示。

确认约束：

- `review_i18n_keys.js` 默认会自动打开浏览器，并默认要求打开成功。
- 如果自动打开失败，本次流程失败并停止；不要要求用户手动复制 URL 打开。
- 必须等待用户在浏览器页面点击确认。
- 禁止用 `curl -X POST /confirm`、直接写 reviewed JSON、脚本 POST、或模型自行填充文案来代替用户确认。
- 用户未确认前，不得生成 LLM 翻译模板，不得继续翻译或写回。
- 启动确认页后，agent 必须运行 `scripts/wait_for_review.js --output /tmp/i18n-diff-source-reviewed.json` 等待页面确认；等待成功后先运行 `scripts/apply_key_edits.js --edits /tmp/i18n-diff-key-edits.json`，再自动继续生成模板、翻译、校验和写回，不要要求用户在对话里再次回复。

## LLM 直译规则

- 不依赖任何多语言翻译接口；不要调用旧本地翻译服务、百度翻译或其它翻译服务。
- `scripts/translate_via_llm.py` 从 `agent.md` 读取目标 locale。
- 脚本只负责生成完整 per-locale 模板、生成 prompt、校验大模型产物；实际翻译由当前执行 skill 的大模型完成。
- 如果脚本无法从 `agent.md` 读取 locale 且用户未显式传 `--locales`，停止并要求指定目标语种，不要自行猜测。

模板结构：

```json
{
  "en-US": { "page": { "key.a": "中文文案" } },
  "ja-JP": { "page": { "key.a": "中文文案" } }
}
```

大模型输出结构：

```json
{
  "en-US": { "page": { "key.a": "English copy" } },
  "ja-JP": { "page": { "key.a": "日本語コピー" } }
}
```

- 翻译原则：保持 `{ locale: { ns: { key: ... } } }` 结构不变，只把中文 value 替换成对应语种译文。
- 占位符和简单标签（`{0}`、`{name}`、`%s`、`<i>` 等）必须原样保留。
- LLM 产物保存为单独 JSON，先用 `translate_via_llm.py --validate-output` 校验，再传给 `apply_translations.js --translations translations.json`。

## 写回规则

1. 自动发现 localesRoot：
   - 先 glob：`**/i18n/locales/**/*.json`、`**/src/locales/**/*.json`、`**/locales/**/*.json`
   - 再从代码里找 `i18next`、`resourcesToBackend`、`defaultNS`、`loadPath`、`localePath`
   - 优先使用与本次改动代码距离最近、且目录形态像 `{localesRoot}/{locale}/{namespace}.json` 的一处
2. 嵌套输入按 ns 分发：每个 `ns` 直接写到 `{localesRoot}/{locale}/{ns}.json`。
3. 选择 `fallbackNamespace`（用于 `__unknown__` 桶或扁平输入），按以下优先级：
   - `--namespace` 命令行参数
   - `agent.md` 的 `defaultNamespace`
   - `git grep defaultNS:'xxx'` 字面量，按路径前缀重合度选最匹配
   - `mostCommonNamespaceUnder(localesRoot)`
   - `'common'`
4. 仅写"磁盘上已有 locale 目录"与"LLM 产物已包含 locale"的交集；目标 `{ns}.json` 不存在时跳过该 ns 而不是新建。
5. 默认不覆盖已有 key；用 `--overwrite` 强制覆盖。
6. 写回格式：
   - JSON 2 空格缩进
   - 保持 UTF-8
   - 尽量保留原有 key 顺序，新 key 追加到末尾

## 失败与跳过

- 多套 localesRoot 无法区分时，先停下来询问用户，不要同时写多套。
- LLM 产物缺少某个 locale 时，跳过该语言并在结果里说明；不要补空值。
- locale 目录不存在时，默认跳过，不新建。
- 如果 LLM 产物结构异常（缺 ns/key、叶子非字符串、占位符缺失），先修正并重新校验，不继续落盘。

## 反模式

- 不要读取未出现在 diff 里的文件来“补猜”中文文案。
- 不要因为中文文案为空就删除或修改业务代码。
- 不要用接口 POST 或直接写文件来模拟用户在确认页点击确认。
- 不要按项目名硬编码 locale 或 default namespace。
- 不要覆盖已有翻译，除非用户明确要求。
- 不要把说明性文字写进 locale JSON。
- 不要把 `BASE`、原始大段 diff、或完整翻译模板整段贴给用户，除非用户明确要排查细节。
