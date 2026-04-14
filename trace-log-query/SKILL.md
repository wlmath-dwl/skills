---
name: trace-log-query
description: >
  根据 trace_id 查询测试环境的日志。
  触发关键词：trace_id、查询日志、查日志、trace 日志。
---

# 根据 Trace ID 查询日志

## 核心要求

**必须输出所有日志的完整原始内容，禁止做任何总结、摘要或省略。**

每条日志的 context 字段包含完整的请求参数、请求头、响应数据等信息，这些信息对问题排查至关重要，必须完整输出。

## 触发条件

用户输入 trace_id，需要查询对应的日志进行分析。

## 执行步骤

### Step 1 - 获取日志

使用 VRSchedulerAuth 认证调用日志查询接口：

```python
# 接口参数说明
# start_time, end_time: 时间戳，单位为秒
payload = {
    "log_project": "test-tke-inf-1",
    "log_store": "test-cube-app-logs",
    "query": f"trace_id:{trace_id}",
    "start_time": end_time - 3600 * 24,  # 过去24小时
    "end_time": end_time,
    "page": 1,
    "page_size": 100
}
```

### Step 2 - 处理响应

**重要：必须返回原始日志内容，不要做总结或省略。**

解析返回的日志数据，输出以下字段：
- log_time: 日志时间
- level: 日志级别
- app_name: 服务名称
- uri: 请求路径
- log_type: 日志类型（input/output/api）
- context: **完整 JSON 内容，包含请求参数、响应数据等**
- extra: 额外信息

### Step 3 - 输出结果

**必须输出所有日志条目的完整内容，一条都不能少。直接运行脚本获取格式化输出。**

```bash
python scripts/query_trace_log.py <trace_id>
```

脚本会输出所有日志的完整 context 和 extra 内容。

## 输出格式示例

```
## 查询结果
**日志数量**: N 条

### 1. [时间] [级别] [服务] [路径] [类型]
```json
{
  "context字段的完整JSON内容": "...",
  "包含请求参数、请求头、响应数据等": "..."
}
```
**extra:**
```json
{
  "extra字段的完整JSON内容": "..."
}
```

### 2. [时间] [级别] [服务] [路径] [类型]
...
```

**严格禁止：**
- 禁止只输出摘要或关键信息
- 禁止省略任何一条日志
- 禁止省略 context 字段中的任何内容
- 禁止对日志内容做解读或分析
- 禁止添加"请求链路概览"、"关键信息"等总结性内容

## 使用方式

```bash
# 查询最近24小时的日志
python scripts/query_trace_log.py <trace_id>

# 指定时间范围（秒级时间戳）
python scripts/query_trace_log.py <trace_id> --start-time 1775124635 --end-time 1775211035

# 输出到文件
python scripts/query_trace_log.py <trace_id> -o output.md
```

## 注意事项

- 接口每次最多返回 100 条日志，如需更多请分页查询
- 查询时间范围建议 24 小时内，避免超时
- start_time 和 end_time 单位为秒，不是毫秒
- trace_id 可能存在于多个服务的日志中