---
name: lark-test-doc
version: 1.0.0
description: "生成提测文档模板。提供标准化的提测文档格式，包含方案流程、改造范围、接口详情、上线顺序等模块。当用户需要创建提测文档、按照模板生成测试文档时使用。"
metadata:
  requires:
    bins: ["lark-cli"]
---

# 提测文档

> **前置条件：** 先阅读 [`../lark-shared/SKILL.md`](../lark-shared/SKILL.md)。

本 skill 提供标准化的提测文档模板，帮助快速生成格式统一的提测文档。

## 支持字段

| 模块 | 说明 |
|------|------|
| 方案主要流程 | 核心步骤描述 |
| 改造范围 | 服务改动表格 |
| 接口详情 | 各服务接口请求示例 |
| 上线顺序 | 阶段顺序和回滚方案 |

## 命令

```bash
# 直接输出提测文档模板（Markdown 格式）
# 用户提供各模块内容后，组合生成完整的提测文档 Markdown
```

### 提测文档 Markdown 模板

```markdown
# 二、方案主要流程
1. **第一步** → 描述
2. **第二步** → 描述
3. **第三步** → 描述

---

# 三、改造范围

<lark-table rows="{rows}" cols="3" header-row="true" column-widths="244,244,244">
<lark-tr>
<lark-td>

**服务**

</lark-td>
<lark-td>

**改动类型**

</lark-td>
<lark-td>

**说明**

</lark-td>
</lark-tr>
<lark-tr>
<lark-td>

服务名

</lark-td>
<lark-td>

新增/改造/无改造

</lark-td>
<lark-td>

说明文字

</lark-td>
</lark-tr>
</lark-table>

---

# 四、接口详情

## 环境说明
> 联调环境：xxx

## 4.1 服务名
### [新增/改造] /api/path
- 描述：接口功能
- method：POST/GET
- 主要逻辑：
  1. 步骤一
  1. 步骤二
- 入参示例：
```json
{
    "key": "value"
}
```

---

## 4.2 服务名
### [新增/改造] /api/path
- 描述：接口功能
- 入参示例：
```json
{
    "key": "value"
}
```

---

# 五、上线顺序（必须严格按顺序执行）

## 阶段一：服务名（底层服务）
- 部署内容
- 验证要点

## 阶段二：服务名（任务调度）
- 部署内容
- 验证要点

## 阶段三：服务名（触发服务）
- 部署内容
- 验证要点

## 阶段四：服务名（如需改造）
- 视实际情况部署

> **回滚方案**：若上线后出现问题，按相反顺序回滚
```

## 使用流程

1. **用户输入**：用户提供各模块的具体内容
   - 方案主要流程步骤
   - 改造范围表格数据（服务名、改动类型、说明）
   - 接口详情（服务名、接口路径、请求示例）
   - 上线顺序阶段

2. **生成文档**：将用户内容填充到模板，生成完整的提测文档 Markdown

3. **创建文档**：使用 `lark-cli docs +create` 创建飞书文档

## 示例

### 用户输入
```
方案流程：
1. 创建项目 → import 类型
2. 调用牧羊人 → 新增任务-算子
3. 算子回调 → import 三元组数据
4. 回调接口 → 修改项目状态

改造范围：
- Shepherd-alg: 新增算子 run_work_import_pipeline
- shepherd配置: 新增任务 task.work_import_pipeline
- meta.gapi: 改造接口，新增 atlas_vr_id 入参
- fd.gapi: 触发和回调，新增路由
- mix-svc: 无改造，创建项目接口
- 路由配置: 新增路由

接口详情：
- fd.gapi: /fd/vr/v1/import/submit.json
- meta.gapi: /ent/work/v1/import.json
- shepherd-alg: /process/submit/run_work_import_pipeline

上线顺序：
- 阶段一: Shepherd-alg（底层算子）
- 阶段二: shepherd 配置（任务调度）
- 阶段三: fd.gapi（触发和回调���
- 阶段四: meta.gapi（如需改造）
```

### 生成结果
```markdown
# 二、方案主要流程
1. **创建项目** → import 类型
2. **调用牧羊人** → 新增任务-算子
3. **算子回调** → import 三元组数据
4. **回调接口** → 修改项目状态

---

# 三、改造范围

<lark-table rows="7" cols="3" header-row="true" column-widths="244,244,244">
<lark-tr>
<lark-td>

**服务**

</lark-td>
<lark-td>

**改动类型**

</lark-td>
<lark-td>

**说明**

</lark-td>
</lark-tr>
<lark-tr>
<lark-td>

Shepherd-alg

</lark-td>
<lark-td>

新增算子

</lark-td>
<lark-td>

run_work_import_pipeline

</lark-td>
</lark-tr>
<lark-tr>
<lark-td>

shepherd配置

</lark-td>
<lark-td>

新增任务

</lark-td>
<lark-td>

task.work_import_pipeline

</lark-td>
</lark-tr>
<lark-tr>
<lark-td>

meta.gapi

</lark-td>
<lark-td>

改造接口

</lark-td>
<lark-td>

新增 atlas_vr_id 入参

</lark-td>
</lark-tr>
<lark-tr>
<lark-td>

fd.gapi

</lark-td>
<lark-td>

触发和回调

</lark-td>
<lark-td>

新增路由

</lark-td>
</lark-tr>
<lark-tr>
<lark-td>

mix-svc

</lark-td>
<lark-td>

无改造

</lark-td>
<lark-td>

创建项目接口

</lark-td>
</lark-tr>
<lark-tr>
<lark-td>

路由配置

</lark-td>
<lark-td>

新增路由

</lark-td>
<lark-td>

- /fd/vr/v1/import/submit.json
- /ent/work/v1/import.json

</lark-td>
</lark-tr>
</lark-table>

---

# 四、接口详情

## 4.1 fd.gapi
### [新增] /fd/vr/v1/import/submit.json
- 描述：导入项目生产流触发
- method：POST
- 主要逻辑：
  1. 查询项目状态
  1. 触发牧羊人任务 work_import_pipeline
- 入参示例：
```json
{
    "project_id": "auto3d-light-yWb4ZLRBvPqMpjL6",
    "work_params": {
        "idenname": "atlas_alg_input_data",
        "filenames": ["project.zip"],
        "primary_ids": ["test_data_upload", "123"]
    },
    "source": "REALSEE_TECH"
}
```

---

## 4.2 meta.gapi
### [改造] /ent/work/v1/import.json
- 主要逻辑：新增入参 atlas_vr_id，修改 work 表 atlas_vr_id 字段
- 入参示例：
```json
{
    "work_id": 41977673,
    "atlas_vr_id": 262396528671830016
}
```

---

## 4.3 shepherd-alg
### [新增算子] run_work_import_pipeline
- 接口：`/process/submit/run_work_import_pipeline`
- 入参示例：
```json
{
    "input": {
        "project_id": "auto3d-light-yWb4ZLRBvPqMpjL6",
        "work_params": {
            "idenname": "atlas_alg_input_data",
            "filenames": ["project.zip"],
            "primary_ids": ["test_data_upload", "123"]
        },
        "source": "REALSEE_TECH"
    },
    "type": "run_work_import_pipeline"
}
```

---

# 五、上线顺序（必须严格按顺序执行）

## 阶段一：Shepherd-alg（底层算子）
- 部署新算子 run_work_import_pipeline
- 验证：算子可独立运行

## 阶段二：shepherd 配置（任务调度）
- 新增任务 task.work_import_pipeline
- 验证：任务可触发算子执行

## 阶段三：fd.gapi（触发和回调）
- 部署触发和回调接口
- 验证：完整流程联调

## 阶段四：meta.gapi（如需改造）
- 视实际情况部署

> **回滚方案**：若上线后出现问题，按相反顺序回滚
```

## 相关文档

- [docs +create](../lark-doc/references/lark-doc-create.md) — 创建飞书云文档
- [docs +update](../lark-doc/references/lark-doc-update.md) — 更新飞书云文档