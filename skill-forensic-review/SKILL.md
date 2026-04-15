---
name: forensic-review
description: >
  刑侦需求评审技能。当讨论刑侦相关需求、评审刑侦功能、评估刑侦需求影响范围时触发。
  触发关键词：刑侦、需求评审、link_code、forensic。
---

# 刑侦需求评审规范

## 前置要求

> **⚠️ 必须先安装飞书 CLI 才能使用此技能**
>
> 安装方式：参考飞书 CLI 文档进行安装配置

## Step 1 — 确认本地路径

首先询问用户 **vrlab_server 的本地路径**：

```
请提供 vrlab_server 的本地路径，例如：/Users/xxx/codes/go/src/vrlab_server
```

## Step 2 — 服务地址信息

评审时结合以下服务地址进行考量：

| 服务 | 地址 | 完整路径示例 |
|------|------|-------------|
| meta 服务 | i.meta.gapi.realsee.com | `{本地路径}/i.meta.gapi.realsee.com` |
| 牧羊人服务 | realsee-shepherd-svc | `{本地路径}/realsee-shepherd-svc` |
| fd 服务 | i.fd.gapi.realsee.com | `{本地路径}/i.fd.gapi.realsee.com` |
| svc 服务 | i.svc.gapi.realsee.com | `{本地路径}/i.svc.gapi.realsee.com` |

## Step 3 — 加载飞书资料

使用飞书 CLI 读取以下资料：

### 3.1 刑侦相关文档

```bash
feishu wiki get HamOwJkkaihIPUkC7Nvcq8aPn2g
```

### 3.2 刑侦相关数据表

```bash
feishu wiki get MD0TwyHBGiExxWkLZ5IccN5Bnlb?table=tblwrKwftjKET4cw&view=vewOStxsGH
```

## Step 4 — 评审考量要点

### 4.1 刑侦特征识别

评审时识别以下关键词对应的功能属于刑侦范畴：
- 刑侦
- link_code
- Forensic

### 4.2 需求评审检查项

| 检查维度 | 考量内容 |
|----------|----------|
| **服务依赖** | 是否依赖 meta/fd/svc/shepherd 等服务 |
| **数据敏感性** | 刑侦数据是否涉及敏感信息，需单独处理 |
| **链路影响** | link_code 相关链路的变更是否会影响其他业务 |
| **权限控制** | 刑侦功能是否需要独立的权限校验 |
| **日志审计** | 是否需要记录操作审计日志 |
| **数据存储** | 刑侦数据的存储周期和清理策略 |

### 4.3 跨服务影响分析

1. **meta 服务影响**：i.meta.gapi.realsee.com 路径下如有变更，评估对刑侦功能的影响
2. **fd 服务影响**：i.fd.gapi.realsee.com 路径下如有变更，评估对 link_code 链路的影响
3. **svc 服务影响**：i.svc.gapi.realsee.com 路径下如有变更，评估对刑侦数据同步的影响
4. **shepherd 服务影响**：realsee-shepherd-svc 路径下如有变更，评估对牧羊人服务调用链的影响

## Step 5 — 输出格式

评审完成后，按以下格式输出：

```markdown
## 刑侦需求评审报告

### 需求概述
[简要描述需求内容]

### 服务依赖分析
| 服务 | 影响程度 | 说明 |
|------|----------|------|
| meta | [高/中/低] | [说明] |
| fd | [高/中/低] | [说明] |
| svc | [高/中/低] | [说明] |
| shepherd | [高/中/低] | [说明] |

### 风险点
1. [风险点1]
2. [风险点2]

### 建议
1. [建议1]
2. [建议2]
```
