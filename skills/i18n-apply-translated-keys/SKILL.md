---
name: i18n-apply-translated-keys
description: >-
  Applies user-provided translated i18n JSON into locale files by auto-discovering
  locales (glob + i18next init); semanticizes Chinese-as-key, skips existing keys,
  syncs call sites. When finished, replies with exactly one json code block mapping
  final keys to Chinese copy for this batch. Use when writing translations or invoking
  this skill.
---

# 将已翻译多语言写入项目（自动定位 locales）

## 适用范围

任意前端/全栈仓库；**不得**假设仓库名或目录结构固定。先**自动分析**本仓多语言文件落点，再写入。

## 自动发现 locales（Agent 必做，顺序执行）

1. **粗搜 JSON 落点**（排除 `node_modules`、`dist`、`.next`、`build`、`coverage`）：
   - `glob`：`**/i18n/locales/**/*.json`、`**/src/locales/**/*.json`、`**/locales/**/*.json`**（后者易误匹配，需结合第 2 步确认是否为 i18n 资源）。
2. **从代码反查「权威」路径**（优先于盲猜）：
   - `grep` / 语义搜索：`resourcesToBackend`、`react-i18next`、`i18next`、`import(.*locales`、`@/i18n/locales`、`defaultNS`、`ns:`、`loadPath`、`localePath`。
   - 解析动态 `import(\`…/${language}/${namespace}.json\`)` 或等价字符串，得到 **locales 根目录**（含 `{locale}` 的那段路径的父级的父级，或模板中语言段上一级目录）。
3. **校验目录形态**：典型为  
   `{localesRoot}/{locale}/{namespace}.json`  
   其中 `{locale}` 为 `zh-CN`、`en-US` 等 BCP-47 风格目录名；同构的 `*.json` 在各 locale 下**同名成对**出现。若结构不符（例如单文件多语言），按该仓**既有**文件形态写入，不强行改成目录分语言。
4. **多候选时**：
   - 优先选择与**本次改动的源码**同属 monorepo 子包、路径最近的一处 `localesRoot`；
   - 仍无法区分则**询问用户**指定根路径或 `namespace` 文件名，**禁止**同时往多处写入相同业务 key。

## 默认命名空间文件（`*.json` 文件名）

在已确定的 `localesRoot` 下：

1. 从 **i18next 初始化**读取 `defaultNS` / `ns` 数组首项，对应 `{locale}/{defaultNS}.json` 作为**默认写入文件**。
2. 若代码使用 `translate(key, 'home')`、`t(key, { ns: 'team' })` 等且上下文明确，则写入**对应** `home.json`、`team.json` 等。
3. **无把握**时：选该仓 `zh-CN`（或存在的第一个 locale）目录下**体量适中、偏通用**的已有 json（常为 `common.json`、`global.json`、`page.json`、`core.json` 之一）；仍无法判断则**询问用户**，勿瞎选。

## 目标 locale 集合

- **以仓库为准**：对用户输入的每个顶层 locale key，仅当 `{localesRoot}/{该 locale}/` **已存在**时才写入；**不新建**未知语言目录（除非用户明确要求新增某语言并确认范围）。
- 用户 JSON 中多出的 locale 若无对应目录 → **跳过该语言**并可在扩展说明里列出（默认任务可静默跳过）。

## 输入数据格式

用户应提供「已翻译」的键值，推荐二选一：

1. **按语言分包（推荐）**：顶层为 locale，内层为扁平 `key → 译文 string`。
2. **仅中文参考**：单层 `key → 中文`，则只更新 **`zh-CN`**（或该仓实际中文目录名，如 `zh_CN`——以磁盘上**真实目录名**为准）下对应文件。

**禁止**把 `meta`、`source`、嵌套非 string 结构塞进各语言 JSON；保持与仓库现有文件一致的**扁平** string 键值。

## 执行流程（写入与改名）

1. **锁定单仓单 localesRoot + 默认 json 文件名**（见上节）。
2. **读取**各 `{localesRoot}/{locale}/{target}.json`，解析为对象；文件不存在则视为 `{}`（且若连 `{locale}` 目录都不存在则不要创建）。
3. **中文作 key 时的语义化**（满足任一即视为需改名）：
   - key 含 CJK，或明显为自然语言短语而非 ASCII 标识符。
   - 结合 **引用处的源码路径 / 模块名** 生成 **ASCII**、`camelCase` 分段 key（如 `mosaic.xxx`）。
   - **改名后必须**在本包内 `grep` 并替换 `t('旧')` / `translate('旧'` 等，**禁止**只改 JSON。
4. **跳过已存在 key**：若**最终 key**在某 locale 的 `*.json` 顶层已存在 → **整项跳过**（不覆盖）。旧中文 key 不自动删，除非用户明确要求清理。
5. **合并写入**：仅追加；JSON **2 空格缩进**、`ensure_ascii=False` 语义；尽量保持原文件 key 顺序，新 key 放末尾。
6. **校验**：合并后 JSON 可解析；按需跑 lint/typecheck。

## 任务结束后的输出（必守）

本技能**执行完毕**后，对用户的**整条回复**只能包含**一个** Markdown 代码块：`` ```json `` … `` ``` ``；**代码块外不得出现任何字符**（禁止标题、列表、文件路径说明、统计、`BASE` 等）。

- **代码块内**：**单个**合法 JSON **对象**，**2 空格缩进**，`ensure_ascii=False` 语义。
- **语义**：**最终生效的 i18n key**（语义化改名后的 key；未改名则与输入一致）→ **对应中文展示文案**（`string`）。
  - 中文取值优先取本次写入后 **`zh-CN`**（或该仓实际简体中文目录，如 `zh_CN`）目标 `*.json` 中该 key 的 value；若无 `zh-CN` 则从用户输入的 `zh-CN` 包中取；仍无则取本批中文参考（与 key 同结构的输入）。
  - **仅收录本批实际处理过的 key**：已成功写入的项**必须**出现；因「目标 key 已存在」被**整项跳过**未改文件的 key **不得**写入该 JSON（避免冒充本批成果）。若本批全部跳过，输出 `{}`。
- **禁止**：顶层数组、嵌套对象、非 string 的 value、元数据字段、多个代码块、代码块外的尾句。

## 与 `i18n-keys-from-branch-diff` 的配合

diff 技能常产出「中文 key = 中文参考」；本技能负责**定位 locales**、**落盘**、**按需语义化 key + 改引用**。

## 参考示例（非穷举，仅帮助识别模式）

以下路径在历史上出现过，**实际执行仍以当前仓库搜索结果为准**：

- `client/src/i18n/locales/{locale}/*.json`
- `src/client/locales/{locale}/*.json`
- `src/locales/{locale}/*.json`

## 反模式

- **不要**在默认收尾回复中于 `` ```json `` 外再写任何说明（含「已完成」「路径如下」）；**仅**允许扩展模式用户明确要求长文时例外。
- **不要**写死「仅某四个仓库名」或固定相对路径作为唯一真理。
- **不要**在发现多套 locales 时未经确认就写入多套。
- **不要**默认覆盖已有翻译。
- **不要**为未出现的 locale 目录批量新建语言文件夹（除非用户明确要求）。
- **不要**把说明性文字写进各语言 JSON 的 key/value。
