---
name: trace-log-query
description: >
  根据 trace_id 查询测试环境的日志。
  触发关键词：trace_id、查询日志、查日志、trace 日志。
---

# 根据 Trace ID 查询日志

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

解析返回的日志数据，提取关键信息：
- log_time: 日志时间
- level: 日志级别
- app_name: 服务名称
- message: 日志内容
- uri: 请求路径

### Step 3 - 输出结果

将所有日志格式化输出，按时间排序。

## 输出格式

```
## 查询结果
**日志数量**: N 条

1. [时间] [级别] [服务] [路径]
   内容

2. [时间] [级别] [服务] [路径]
   内容
...
```

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