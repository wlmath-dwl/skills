---
name: go-5xx-prevention
description: >-
  本 skill 用于编写、审查或调试处理 HTTP 请求、并发操作、数据库查询或 JSON 序列化的 Go 代码时。
  触发关键词：写 Go 代码、Go 编码规范、500 错误、502 错误、504 错误、panic、concurrent map、goroutine 并发、
  HTTP 超时、SQL 慢查询、JSON 序列化、数组下标越界、空指针、类型断言、修复 5xx bug、代码 review。
  不适用于：纯算法问题、非 Go 语言、Kubernetes 配置、shell 脚本。
---

# Go 5xx 错误预防指南

## 概述

| 错误码 | 原因 | 影响 |
|--------|------|------|
| **500** | panic：数组越界、空指针、类型断言、NaN 序列化 | 单请求失败 |
| **502** | fatal：并发 map 读写 | 整个实例崩溃 |
| **504** | nginx 超时：慢查询、无 HTTP 超时 | 级联失败导致 502 |

## 快速检查清单

### 500 预防
- [ ] 访问数组/切片前检查 `len()`
- [ ] 类型断言使用 `ok` 模式
- [ ] Map 访问前检查 key 是否存在
- [ ] JSON 序列化前过滤 `math.NaN()` / `math.Inf()`
- [ ] Map 使用前用 `make()` 初始化
- [ ] 可变参数调用时展开 slice：`set.Add(gconv.Interfaces(slice)...)`
- [ ] JSON 解析后验证目标类型

### 502 预防
- [ ] goroutine 中访问 map 使用 `sync.Mutex` / `sync.RWMutex`
- [ ] 或使用 `sync.Map` / `gmap` 等线程安全结构
- [ ] 禁止将 `gin.Context` 直接传递到 goroutine，用 `Copy()` 或提前取值
- [ ] 批量并发任务使用 `sync.WaitGroup` 等待完成

### 504 预防
- [ ] 所有 HTTP 客户端设置 `Timeout`
- [ ] 确保 SQL 查询命中索引，用 `EXPLAIN` 验证
- [ ] 避免 `LIKE '%xxx%'` 前缀通配符
- [ ] OR 条件拆分为 `UNION ALL`
- [ ] 大数据量使用分页
- [ ] 设置数据库查询超时

## 典型反模式

### 500：数组下标越界

```go
// 禁止
items := getItems()
name := items[0].Name

// 正确
items := getItems()
if len(items) > 0 {
    name := items[0].Name
}
```

### 502：并发 Map 写

```go
// 禁止
m := make(map[string]int)
for i := 0; i < 100; i++ {
    go func() { m["key"] = i }()
}

// 正确
var mu sync.Mutex
m := make(map[string]int)
mu.Lock()
m["key"] = value
mu.Unlock()
```

### 504：HTTP 无超时

```go
// 禁止
client := &http.Client{}
resp, err := client.Get(url)

// 正确
client := &http.Client{Timeout: 30 * time.Second}
resp, err := client.Get(url)
```

## 详细规范

完整反模式列表见 `references/go-5xx-rules.md`：
- 8 种 500 反模式及代码示例
- 5 种 502 反模式及代码示例
- 5 种 504 反模式及代码示例

## 相关文档

- 源文档：[飞书文档](https://realsee.feishu.cn/docx/WLhIdW1e9ozUGHxQarjcXf4Wnwo)
- ONES 问题追踪：[#70230](https://ones.realsee.com/project/#/team/8kZMQ1TP/task/SjVPme6X9Csd3y7e)
