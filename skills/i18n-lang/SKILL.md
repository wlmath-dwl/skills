---
name: i18n-lang
description: >-
  Extract changed Chinese i18n copy from the current git branch or working tree
  diff, translate it directly with the active LLM, then apply the generated
  locale translations into the project's locale files. Use when replacing the
  manual chain of i18n-keys-from-branch-diff plus i18n-apply-translated-keys
  with one local workflow, especially for branch-based i18n generation,
  translation, and write back.
---

# i18n-lang：一体化 i18n 流水线

执行顺序固定为：读取 `agent.md` 配置、提取 diff key、打开本地确认页、生成 LLM 翻译模板、由当前大模型翻译、校验翻译 JSON、写回 locale 文件、在页面展示翻译结果、校验结果。

## 快速流程

1. 切到当前仓库根目录；优先使用用户指定的基准分支，否则默认使用 `origin/master`。仓库根目录必须有 `agent.md`（或 `AGENT.md`），配置 `defaultNamespace` 与 `locales`。
2. 用 `scripts/extract_diff_i18n.js` 从 diff 提取**按 namespace 分组**的 JSON：`{ ns: { key: 中文 } }`。
   - JSON 文件改动的 ns 直接来自路径段（`.../locales/{locale}/{ns}.json`）。
   - 支持动态插值参数：`t('key', { name })`、`t('key', 'ns', { name })`、`t('key', { ns: 'ns', name })`。
   - 代码里如果写了 `t('key', 'ns')` / `__('key', 'ns')` / `translate('key', 'ns')`，或参数对象里写了 `ns: 'ns'`，该 namespace 优先级最高。
   - 代码文件改动只在出现 `t('xx')` 的当前文件里查找 `useTranslation('xxx')`，找到就使用该 ns。
   - 当前文件没有 `useTranslation('xxx')` 时，使用 `agent.md` 的 `defaultNamespace`。
   - 非中文 key 会尝试从中文 locale 文件回查中文文案；查不到则以空字符串进入确认页。
3. 将提取结果写到 `/tmp/i18n-diff-source.json`，skipped 详情默认写到 `/tmp/i18n-diff-skipped.json`。
4. **无论中文文案是否为空、提取结果是否为空，都必须用 `scripts/review_i18n_keys.js` 自动打开本地浏览器页面**，展示 namespace、key、中文文案：
   - 中文文案可编辑。
   - 每行可从本次“翻译清单”删除，但这只影响 `/tmp/i18n-diff-source-reviewed.json`，**绝不删除或修改项目源码里的 `t('key')` 调用、调试代码、DOM 节点或其他业务代码**。
   - 点击确认时，如果仍有空中文文案，页面弹出“请填写完整”。
   - 确认后页面顶部必须显示“翻译中”并带转圈 loading 效果，同时写到 `/tmp/i18n-diff-source-reviewed.json`，后续翻译只使用确认后的文件。
   - 页面不要使用固定底栏，也不要显示单独顶栏标题；状态直接显示在内容区顶部。
   - Key 和中文文案编辑控件都使用单行 `input`，每行内容垂直居中；有插值参数时，在参数列展示 `{name}`、`{count}` 等占位符提示。
   - 用户在页面修改 Key 时，确认后必须同步修改源码里的 `t('oldKey')` / `__('oldKey')` / `translate('oldKey')` 字面量调用。
   - 翻译结果按不同 locale 使用 tab 切换展示，不要把所有语言混在一个 JSON 里一起展示。
   - **必须等待用户在浏览器页面点击确认；禁止用 `curl`、脚本、接口 POST 或模型自行构造中文文案来模拟用户确认。**
5. 用户在页面点击确认后，agent 必须自动继续，不再要求用户在对话里回复“已确认”。用 `scripts/wait_for_review.js` 等待 `/tmp/i18n-diff-source-reviewed.json` 出现后继续。
6. 如果页面修改了 Key，先用 `scripts/apply_key_edits.js` 将 key 改动同步回源码调用点。
7. 用 `scripts/translate_via_llm.py` 按 `agent.md` 的 `locales` 生成完整目标语种模板和可复用 prompt：
   - 模板结构是 `{ locale: { ns: { key: 中文原文 } } }`。
   - 脚本只做语种识别、模板生成和结构校验，不请求任何翻译接口。
8. **当前执行 skill 的大模型亲自翻译全部 locale**：读取模板，把每个中文 leaf string 替换成对应语种译文，保持 locale/ns/key 结构不变，写到 `/tmp/i18n-diff-translations.json`。
9. 再用 `scripts/translate_via_llm.py --validate-output` 校验大模型产物：locale 集合、ns/key 形状、叶子 string、占位符/简单标签保留。
10. 用 `scripts/apply_translations.js` 自动发现 `localesRoot`，按 ns 分别写到 `{locale}/{ns}.json`；fallback namespace 优先来自 `agent.md` 的 `defaultNamespace`。
11. 翻译结果写入 `/tmp/i18n-diff-translations.json` 后，本地页面会自动展示结果。

## 重要约定

- 不依赖任何多语言翻译接口；不要调用旧本地翻译服务、百度翻译或其它翻译服务。
- 项目的默认 namespace 和目标语言只从 `agent.md`（或显式 CLI 参数）读取，不再维护项目名白名单。
- 只应用“LLM 产物实际包含的 locale”与“项目磁盘上实际存在的 locale 目录”的交集。
- 大模型翻译前必须明确目标 locale；脚本无法从 `agent.md` 识别时，使用 `--locales de-DE,en-US,...` 显式指定。
- 默认不覆盖已有 key；若最终 key 已存在，则整项跳过。
- 遇到“中文直接当 key”的情况，默认保留原 key，除非用户明确要求语义化并同步替换调用处。
- **禁止因为中文文案为空而改动业务源码**。空文案代表“需要用户确认/填写”，不是“这个 key 或代码应该删除”。

## agent.md 配置

在目标项目根目录放置：

```yaml
i18n:
  defaultNamespace: page
  locales:
    - de-DE
    - en-US
    - ja-JP
```

脚本会识别 `defaultNamespace` / `default_namespace` / `namespace` / `defaultNS`，以及 `locales` / `targetLocales` / `target_locales` / `languages`。

## 第一步：提取待翻译文案

先打开 [references/workflow.md](references/workflow.md)，按其中"提取规则"执行。关键点：

- 优先使用 `scripts/extract_diff_i18n.js`，不要用 LLM 自己拼接 JSON。
- 默认输出 `{ ns: { key: 中文 } }`（嵌套）；只在用户明确要求或单 namespace 项目希望兼容旧链路时加 `--flat`。
- 提取阶段只看 `git diff --name-status` 和 `git diff` 的补丁文本；对出现 `t('xx')` 的已修改文件，允许读取当前文件一次来查找 `useTranslation('xxx')`。
- 同一 (ns, key) 在多个 locale 文件 diff 中重复出现时，按 zh-CN > zh-TW > 其他 的优先级保留中文 value。
- 当前文件找不到 `useTranslation('xxx')` 时，使用 `agent.md` 的 `defaultNamespace`。
- 非中文 key 如果从中文 locale 文件回查不到文案，会以空字符串进入确认页；不要删除该 key，也不要删除源码里的调用。
- 提取不到任何 key 时，输出 `{}`，不要杜撰内容。

```bash
node /absolute/path/to/scripts/extract_diff_i18n.js \
  [--base origin/master] \
  [--include-working-tree] \
  --output /tmp/i18n-diff-source.json \
  [--skipped-output /tmp/i18n-diff-skipped.json] \
  [--unknown-ns __unknown__]   # 显式开启则走老兜底，跳过 skipped 流程
```

当临时 JSON 为空对象时，仍可继续后续步骤；写回阶段通常只会得到无改动结果。

## 第二步：本地确认页

```bash
node /absolute/path/to/scripts/review_i18n_keys.js \
  --input /tmp/i18n-diff-source.json \
  --meta /tmp/i18n-diff-source-meta.json \
  --output /tmp/i18n-diff-source-reviewed.json \
  --key-edits-output /tmp/i18n-diff-key-edits.json \
  --result /tmp/i18n-diff-translations.json
```

脚本默认会自动打开本地浏览器页面，并默认要求打开成功。**如果自动打开失败，本次流程应失败并停止，不要要求用户手动复制 URL 打开。** 用户在浏览器页面确认后再继续后续步骤。确认页负责阻止空中文文案提交；用户在页面删除的行不会进入翻译。删除确认页里的行不等于删除项目源码，skill 执行过程中不得据此改动业务文件。

严禁用下面这些方式绕过页面确认：

- `curl -X POST /confirm`
- 直接写 `/tmp/i18n-diff-source-reviewed.json`
- 模型自行把空中文文案补成“测试1”等译文并继续流程
- 在未看到用户明确确认页面的情况下生成翻译模板

启动确认页后，必须用等待脚本自动衔接后续流程：

```bash
node /absolute/path/to/scripts/wait_for_review.js \
  --output /tmp/i18n-diff-source-reviewed.json
```

该命令成功后，先应用 key 修改，再继续生成模板、翻译、校验和写回；不要要求用户回到对话里再点一次或回复一句。

```bash
node /absolute/path/to/scripts/apply_key_edits.js \
  --edits /tmp/i18n-diff-key-edits.json
```

## 第三步：生成 LLM 翻译模板

优先使用脚本，不要手写目标 locale 模板：

```bash
python3 /absolute/path/to/scripts/translate_via_llm.py \
  --input /tmp/i18n-diff-source-reviewed.json \
  --template-output /tmp/i18n-diff-llm-template.json \
  --prompt-output /tmp/i18n-diff-llm-prompt.md \
  --output /tmp/i18n-diff-translations.json
```

可选参数：

- `--locales de-DE,en-US,...` 显式覆盖目标语种（不传则按 `agent.md` 自动识别）
- `--validate-output /tmp/i18n-diff-translations.json` 校验 LLM 已生成的翻译 JSON
- `--allow-missing-locales` 校验时允许 LLM 产物只覆盖部分目标 locale

脚本会按 `agent.md` 生成所有目标 locale 的模板；如果无法识别且未传 `--locales`，脚本会报错并要求显式指定目标语种。

脚本输入要求：

- UTF-8 JSON 文件
- 顶层为对象，value 允许两种形态：
  - 扁平：`{ key: 中文 }`
  - 嵌套：`{ ns: { key: 中文 } }`（默认推荐，多 namespace 项目必需）

脚本输出要求：

- `--template-output`：`{ locale: { ns: { key: 中文原文 } } }`，供当前大模型翻译。
- `--prompt-output`：包含模板路径、输出路径、目标语种和翻译约束的 markdown prompt。

## 第四步：当前大模型直接翻译

读取 `/tmp/i18n-diff-llm-template.json`，由当前执行 skill 的大模型把每个 locale 下的中文 value 替换为对应语种译文。要求：

- 严格保持 `{ locale: { ns: { key: ... } } }` 结构，不增删 key、不改 ns。
- 翻译质量尽量贴近原意，遵循目标语种的本地化习惯（专有名词通常保留；占位符 `{0}`、`{name}`、`<i>` 等原样保留）。
- 输出到 `/tmp/i18n-diff-translations.json`。
- 不输出说明性字段、注释、metadata 或 markdown 包裹。

翻译完成后必须校验：

```bash
python3 /absolute/path/to/scripts/translate_via_llm.py \
  --input /tmp/i18n-diff-source-reviewed.json \
  --validate-output /tmp/i18n-diff-translations.json
```

若校验失败，修正 `/tmp/i18n-diff-translations.json` 后重新校验；不要把结构异常的产物传给写回脚本。

## 第五步：写回 locale 文件

再打开 [references/workflow.md](references/workflow.md)，按其中"写回规则"执行。重点是：

- 优先使用 `scripts/apply_translations.js`，不要让 LLM 自己改 JSON。
- 自动发现唯一的 localesRoot；多候选且无法判断时再询问用户。
- 嵌套输入按 ns 分别写到 `{locale}/{ns}.json`；扁平输入或 `__unknown__` 桶会落到 `fallbackNamespace`。
- `fallbackNamespace` 优先级：`--namespace` → `agent.md defaultNamespace` → `git grep defaultNS:'xxx'` 字面量 → `mostCommonNamespaceUnder` → `'common'`。
- 只写已有 locale 目录与 `{ns}.json` 文件；不批量新建未知 locale 或 namespace。
- 默认追加新 key，不覆盖现有翻译。
- 如果中文被语义化成新 key，必须同步替换引用点。

```bash
node /absolute/path/to/scripts/apply_translations.js \
  --translations /tmp/i18n-diff-translations.json \
  [--locales-root client/src/i18n/locales] \
  [--namespace page] \
  [--unknown-ns __unknown__] \
  [--dry-run] [--overwrite]
```

## 校验

至少完成以下检查：

1. 所有被修改的 locale JSON 都能被再次解析。
2. 如果替换了调用处，至少做一次针对改动范围的检索，确认旧 key 没有遗漏在本包内。
3. 仓库已有轻量校验命令时，优先跑与 i18n 相关的最小检查集；没有就说明未运行。

## 收尾方式

用简短说明告诉用户：

- 提取到多少个待翻译 key（按 ns 分布）
- 本地确认页最终保留了多少 key，删除了多少 key，是否有手工补充中文文案
- LLM 实际翻译了哪些 locale
- 实际写入了哪些 locale
- 哪些 locale 因“LLM 产物缺失”或“目录不存在”而被跳过
- 改了哪些关键文件

不要输出旧 skill 那种固定代码框格式，除非用户明确要求只要可复制 JSON。
