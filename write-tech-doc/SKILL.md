---
name: write-tech-doc
description: 写技术方案文档时的规范流程，包括关联 ONES 和部署分支信息
---

# 写技术方案文档规范

## 触发场景

当用户要求写技术方案文档（如"写一份 XXX 技术方案"、"创建技术方案文档"）时使用此规范。

## 流程

### 1. 检查必要信息

在开始写技术方案之前，必须确认以下信息：

| 信息 | 说明 | 示例 |
|------|------|------|
| 关联 ONES | ONES 工作项链接 | https://ones.realsee.com/project/#/workspace/team/8kZMQ1TP/filter/view/ft-t-001/task/B45rgjWC7PHpdPKm/3s7qhfb396u50 |
| 部署分支 | 部署分支名称，需包含服务前缀 | meta: feature/20260401/79206/profile |

### 2. 询问用户

如果没有上述信息，需要询问用户：

```
请提供以下信息以完善技术方案：
1. 关联 ONES（工作项链接）：_____
2. 部署分支：_____
```

**选项**：
- 立即填入：用户在当前对话中提供信息
- 过后填入：先写技术方案，后续再补充

### 3. 文档开头格式

技术方案文档开头必须包含以下内容，格式如下：

```
<文档标题>
关联 ONES
<ONES 工作项链接>
部署分支
<meta: 或 svc:> <分支名称>

<正文内容>
```

### 4. 示例

```
统计模块技术方案
关联 ONES
https://ones.realsee.com/project/#/workspace/team/8kZMQ1TP/filter/view/ft-t-001/task/B45rgjWC7PHpdPKm/3s7qhfb396u50
部署分支
meta: feature/20260401/79206/profile

一、需求概述
...
```

## 注意事项

- 部署分支格式：`服务名: 分支名`，如 `meta: feature/xxx`、`svc: feature/xxx`
- "关联 ONES" 和 "部署分支" 后面分别是链接/分支名，单独一行
- 如果技术方案涉及多个服务，每个服务单独一行部署分支
