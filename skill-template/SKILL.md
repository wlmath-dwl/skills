---
name: skill-template
description: >
  新建或更新 Claude Code 技能(Skill)的模板规范。
  触发关键词：新建 skill、更新 skill、skill 模板、创建 skill 规范。
---

# Skill 模板规范

## 目录结构

```
skill-name/
├── SKILL.md (必需)
│   ├── YAML frontmatter (name, description)
│   └── Markdown 说明文档
└── Bundled Resources (可选)
    ├── scripts/      - 可执行脚本
    ├── references/   - 按需加载的文档
    └── assets/       - 输出用的文件（模板、图片等）
```

## SKILL.md 结构

### Frontmatter (YAML)

```yaml
---
name: <skill-name>
description: >
  <简短描述，说明何时触发这个 skill。
  可以包含触发关键词。
---
```

- **name**: 技能名称，使用英文
- **description**: 描述文本，支持多行，告知何时触发

### 正文 (Markdown)

技能触发后加载的执行说明，包含：
- 触发条件说明
- 执行步骤
- 输出格式规范

## 打包资源说明

| 类型 | 用途 | 何时包含 |
|------|------|----------|
| scripts/ | 确定性的可重用代码 | 同一段代码被反复重写时 |
| references/ | 按需加载的文档 | Claude 执行任务时应参考的大型文档 |
| assets/ | 用于输出的文件（不加载到上下文中） | 模板、图片、样板代码 |

## 禁止包含

- README.md
- CHANGELOG.md
- INSTALLATION_GUIDE.md
- 其他辅助文档

---

## 新建 Skill 流程

### Step 1 — 确定技能名称与用途

使用 **AskUserQuestion** 确认：
1. 技能名称（英文）
2. 触发场景描述
3. 需要包含哪些资源（scripts/references/assets）

### Step 2 — 创建目录结构

```
skill-name/
├── SKILL.md
├── scripts/     (可选)
├── references/ (可选)
└── assets/     (可选)
```

### Step 3 — 编写 SKILL.md

1. 编写 YAML frontmatter（name、description）
2. 编写 Markdown 正文（触发条件、执行步骤、输出格式）
3. 确保包含完整的中文说明

### Step 4 — 添加打包资源

- **scripts/**: 放入可执行脚本，确保有执行权限
- **references/**: 放入参考文档
- **assets/**: 放入模板文件等

### Step 5 — 验证

1. 确认目录结构完整
2. 确认 SKILL.md 格式正确
3. 确认脚本有执行权限（如有）

---

## 更新现有 Skill 流程

### 需要更新的情况

- 功能扩展
- 参数格式变化
- 文档补充
- 脚本优化

### 更新步骤

1. **读取现有 SKILL.md**：了解当前规范
2. **识别变更点**：确定需要修改的部分
3. **修改 SKILL.md**：更新 description 或执行步骤
4. **更新资源**：如有脚本变更，同步更新
5. **验证**：确保更新后功能正常