---
name: i18n-keys-from-branch-diff
description: >-
  Runs git diff for the current repo against a configurable base ref (default origin/main),
  extracts only i18n key to Chinese string pairs as a single flat JSON object (no metadata or
  other fields), then replies with exactly one fenced text markdown code block containing
  pretty-printed JSON followed by a fixed locale sentence (one-click copy). No GUI or tkinter.
  Use when the user invokes this skill or asks for 当前分支多语言 key、多语言 json、i18n keys
  from diff, or a local-only workflow without GitLab API.
---

# 从当前分支 Git Diff 提取待翻译多语言 Key

## 目标

在**当前仓库根目录**（或用户指定的 `repoRoot`）本地执行：

1. 用 `git` 比较**基准分支**与**当前分支 HEAD** 的差异范围；
2. 仅从 **diff 文本**归纳 **key → 中文翻译**，合并为**一个**扁平 JSON 对象；**键与值之外不得出现任何其它字段**（禁止 `meta`、`locale`、`source`、`files`、`_comment`、数组包一层、嵌套对象等；**每个 value 必须是表示中文文案的 string**，不得为 number/boolean/object/array）。
3. **对 Cursor 的最终回复**：**仅**一个 Markdown 代码块（见「第四步」），块内自上而下为：经 `json.dumps(..., indent=2, ensure_ascii=False)` 格式化的扁平 JSON、**空一行**、**固定目标语言句**（与 JSON 同处一框，便于用户一次点击整段复制）；**不得**弹窗、**不得**用 `tkinter` / `osascript` / 剪贴板脚本等图形或辅助展示；**不得**在代码块外再写标题或其它说明。

本 skill **不调用远程 GitLab API**，不依赖 `hobber` 服务；仅使用本机已配置的 `git`。

## 上下文约束（必守）

**只根据 diff 输出，不要打开未出现在 diff 里的文件。**  
分析材料仅限：`git diff --name-only` / `git diff --name-status` 列出的路径，以及对其中相关路径执行 `git diff` 得到的补丁文本。禁止为「核对文案」而 `read_file` / 打开未在该 diff 文件列表中出现的源码或 JSON 全文。

## 前置条件

1. 工作目录为 git 仓库根目录（若用户在子目录，先 `cd` 到含 `.git` 的根目录）。
2. 已 `git fetch` 过基准远程分支（否则 `origin/main` 可能过旧或不存在）。

## 第一步：确定基准 ref（BASE）

按顺序尝试，**第一个存在即用**：

```bash
git rev-parse --verify origin/main^{commit} 2>/dev/null && echo origin/main
git rev-parse --verify origin/master^{commit} 2>/dev/null && echo origin/master
```

若用户已指定基准（如 `origin/develop`），以用户为准。

记为变量 **`BASE`**（例如 `origin/main`）。**`BASE` / 分支名不得出现在对用户的默认回复里**（默认仅单个可复制代码框）；仅在**扩展模式**下可写进回复。

## 第二步：当前分支与 diff 范围

在终端中执行（**不要把大段原始 diff 贴进对用户回复**；仅在本地用于解析）：

```bash
git rev-parse --abbrev-ref HEAD
git diff --name-status "$BASE"...HEAD
```

若用户明确要**含工作区未提交改动**，再执行：

```bash
git diff --name-status
```

将两批路径在**内存中合并**后参与解析；最终 JSON **去重**，同一 key 保留最后一次出现对应的中文值。**默认回复中不要**用文字分节描述「分支间 vs 工作区」。

## 第三步：按文件类型从 diff 提取 key（内部步骤）

### A. 语言包 JSON

若路径命中：`**/locales/**/*.json`、`**/i18n/locales/**/*.json`、`**/i18n/**/add.json`、`**/src/locales/**/*.json`：

```bash
git diff "$BASE"...HEAD -- path/to/file.json
```

从补丁中归纳：点分 key → 新增或变更后的**中文**文案（以 `+` 行与上下文为准）。无法判断的 key **不要**写入 JSON。

### B. 代码里的字面量 key

对变更的 `*.ts`、`*.tsx`、`*.js`、`*.jsx` 的 **diff 片段**，匹配：

- `t('...')` / `t("...")` / `` t('ns:key') ``
- `__('...')` / `translate('...', ...)`

字面量即 key；中文翻译：若字面量为中文则与 value 相同；`t(\`...\`)` 动态拼接 **不写入** JSON。

### C. 无任何可解析 key

JSON 对象为空 `{}`。

## 第四步：输出形式（必守）

### 默认（本 skill 一经触发即适用）

1. **对用户的整条回复只能有一个** Markdown 代码块（推荐语言标签 `` ```text ``；**不得**使用 `` ```json ``，因块内除 JSON 外还有固定尾句，整块不是合法 JSON）。**代码块外不得出现任何字符**（禁止标题、`BASE`/`HEAD` 说明、表格、列表、代码块外的尾句、统计字数等）。
2. **代码块内自上而下顺序固定**（便于编辑器「复制」一次带走全部内容）：
   1. **第一段**：**单个**合法 JSON **对象**的文本（`json.dumps`，**2 空格缩进**、`ensure_ascii=False`），**仅**由若干 `"key": "中文"` 键值对组成。
      - **禁止**：顶层数组、嵌套对象、非 string 的 value、以 `_` 或 `$` 开头的元数据键、英文说明性假 key。
      - **key**：JSON 路径用点号；`t('...')` 用引号内完整字符串；`t('ns:key')` 用 `ns:key`。
      - **value**：仅从 diff 归纳的中文；不得臆造。
   2. **空一行**（仅一个换行段落分隔）。
   3. **第二段**：**固定目标语言句**一行（须与下文引号内全文一致，一字不改）。
3. 无 key 时：第一段为 `{}`，**仍须**包含空行与固定目标语言句。

**固定目标语言句（须与下面引号内全文一致，一字不改；用于告知需翻译到的 locale 目录，全部都要翻译）：**

请将以上 key 对应文案翻译并写入各语言包，需覆盖以下 locale（全部都要翻译）：de-DE、en-US、es-ES、fr-FR、id-ID、it-IT、ja-JP、ko-KR、ms-MY、nl-NL、pl-PL、pt-PT、sr-Cyrl、zh-CN、zh-TW。

**默认回复示例（整段用户可见内容只能长这样，注意尾句在框内）：**

```text
{
  "多语言测试1": "多语言测试1",
  "common.cancel": "取消"
}

请将以上 key 对应文案翻译并写入各语言包，需覆盖以下 locale（全部都要翻译）：de-DE、en-US、es-ES、fr-FR、id-ID、it-IT、ja-JP、ko-KR、ms-MY、nl-NL、pl-PL、pt-PT、sr-Cyrl、zh-CN、zh-TW。
```

### 扩展模式（极少数）

仅当用户**明确**使用以下意图之一时才允许 Markdown 长文：`要详细清单`、`要 Markdown`、`列出 BASE 和文件列表`、`不要只输出 json`。

扩展模式下仍须遵守「不读 diff 外文件」；且**不得**与默认「单代码框（JSON + 空行 + 固定尾句）」混在同一条回复里二选一。

## 与 hobber-react-starter 流水线的关系（内部）

`npm run i18n:diff` 等命令**不得**出现在**默认输出**的同一条回复中。用户另要 CLI 时，须其明确开启扩展模式或新开对话。

## 反模式

- **不要**打开、读取未出现在本次 `git diff` 中的文件。
- **不要**在默认模式下于代码块外输出任何文字（含「固定目标语言句」若写在框外、`BASE` 说明、文件列表等）；尾句**必须**写在唯一代码框内 JSON 后的空行之下。
- 不要假设分支一定叫 `main`，应先探测 `origin/main` / `origin/master`。
- 不要把「仅代码里出现字符串」都当成 i18n key，需结合调用形态与项目约定。
- 不要在未说明的情况下对用户的仓库执行 `git push` / 写文件。
- **不要**使用弹窗、`tkinter`、`osascript`、剪贴板辅助展示等多余步骤。
- **不要**在 JSON 内夹带除「多语言 key → 中文」以外的任何字段或结构（含 `summary`、`changes`、`operations` 等非扁平键值对）。
