# 服务 5xx 问题治理 - Go 编码规范

## 概述

5xx 错误是服务端问题，会导致服务质量下降甚至雪崩：

| 错误码 | 原因 | 影响范围 |
|--------|------|----------|
| **500** | panic，单请求异常 | 单请求挂掉 |
| **502** | fatal，单实例崩溃 | 单实例挂掉，nginx 找不到实例 |
| **504** | nginx 超时 | 大量超时导致实例挂起，最终引发 502 |

---

## 500 错误：禁止写法清单

500 错误由 Go 语言的 panic 触发，Goframe 框架会捕获 panic 并返回 500。

### 1. 数组下标越界

**禁止写法：**
```go
// 数组为空时访问下标0
items := getItems()
name := items[0].Name // panic: index out of range [0] with length 0
```

**正确写法：**
```go
// 先检查长度
items := getItems()
if len(items) > 0 {
    name := items[0].Name
}

// 或使用索引安全访问
func safeIndex(items []Item, idx int) *Item {
    if idx >= 0 && idx < len(items) {
        return &items[idx]
    }
    return nil
}
```

### 2. 空指针解引用

**禁止写法：**
```go
var data *Response
process(data) // panic: invalid memory address or nil pointer dereference
```

**正确写法：**
```go
// 先判空
if data == nil {
    return errors.New("data is nil")
}
process(data)

// 或使用零值
type Response struct {
    Name string
}
data := &Response{} // 空对象不是nil
```

### 3. 类型断言失败

**禁止写法：**
```go
var iface interface{}
result := iface.(string) // panic: interface conversion
```

**正确写法：**
```go
var iface interface{}
result, ok := iface.(string)
if !ok {
    // 处理类型不匹配
}
```

### 4. JSON 序列化 NaN

**禁止写法：**
```go
// 使用 interface{} 存储浮点数，NaN 无法序列化
data := map[string]interface{}{
    "value": math.NaN(), // json: unsupported value: NaN
}
json.Marshal(data)
```

**正确写法：**
```go
// 明确类型，避免 NaN
type Result struct {
    Value float64 `json:"value"`
}

// 或在序列化前过滤 NaN
func filterNaN(v float64) float64 {
    if math.IsNaN(v) || math.IsInf(v, 0) {
        return 0
    }
    return v
}
```

### 5. 向 nil Map 写入

**禁止写法：**
```go
var m map[string]int
m["key"] = 1 // panic: assignment to entry in nil map
```

**正确写法：**
```go
// 先初始化
m := make(map[string]int)
m["key"] = 1

// 或使用 gmap
import "github.com/gogf/gf/v2/container/gmap"
var m *gmap.AnyAnyMap
```

### 6. 可变参数未展开 Slice

**禁止写法：**
```go
slice := []string{"a", "b", "c"}
set.Add(slice) // 传入1个参数，类型是 []string，panic: hash of unhashable type []string
```

**正确写法：**
```go
// 展开slice
slice := []string{"a", "b", "c"}
set.Add(gconv.Interfaces(slice)...) // 传入3个参数

// 或逐个添加
for _, v := range slice {
    set.Add(v)
}
```

### 7. 断言后直接使用

**禁止写法：**
```go
// 使用类型断言但不检查
value := getInterfaceValue().(string)
length := len(value) // 如果断言失败 panic
```

**正确写法：**
```go
// 使用 ok 模式
if v, ok := getInterfaceValue().(string); ok {
    length := len(v)
} else {
    // 处理类型不匹配
}

// 或使用 gvar
import "github.com/gogf/gf/v2/container/gvar"
v := gvar.New(getInterfaceValue())
if v.IsString() {
    length := v.Len()
}
```

### 8. JSON 解析不检查

**禁止写法：**
```go
data := `{"floor_map": null}`
var result map[string]interface{}
json.Unmarshal([]byte(data), &result)
count := len(result["floor_map"].([]int)) // 当 floor_map 为 null 时 panic
```

**正确写法：**
```go
data := `{"floor_map": null}`
var result map[string]interface{}
json.Unmarshal([]byte(data), &result)

if floorMap, ok := result["floor_map"].([]int); ok && floorMap != nil {
    count := len(floorMap)
} else {
    count = 0
}
```

---

## 502 错误：禁止写法清单

502 由 Go 的 fatal error 引起，通常是 **Map 并发读写** 问题，会导致整个实例崩溃。

### 1. Map 并发写

**禁止写法：**
```go
// 多个 goroutine 同时写 map
m := make(map[string]int)
for i := 0; i < 100; i++ {
    go func() {
        m["key"] = i // fatal error: concurrent map writes
    }()
}
```

**正确写法：**
```go
// 使用 sync.RWMutex
var mu sync.RWMutex
m := make(map[string]int)

mu.Lock()
m["key"] = value
mu.Unlock()

mu.RLock()
v := m["key"]
mu.RUnlock()

// 或使用 sync.Map
var syncM sync.Map
syncM.Store("key", value)
if v, ok := syncM.Load("key"); ok {
    // ...
}
```

### 2. Map 并发读写

**禁止写法：**
```go
m := make(map[string]int)
go func() {
    for {
        _ = m["key"] // fatal error: concurrent map read and map write
    }
}()
go func() {
    for {
        m["key"] = 1
    }
}()
```

**正确写法：**
```go
var mu sync.RWMutex
m := make(map[string]int)

go func() {
    for {
        mu.RLock()
        _ = m["key"]
        mu.RUnlock()
    }
}()

go func() {
    for {
        mu.Lock()
        m["key"] = 1
        mu.Unlock()
    }
}()
```

### 3. Map 并发迭代与写入

**禁止写法：**
```go
m := make(map[string]int)
// 初始化数据...
for k, v := range m { // fatal error: concurrent map iteration and map write
    if v > 0 {
        delete(m, k)
    }
}
```

**正确写法：**
```go
var mu sync.Mutex
m := make(map[string]int)

mu.Lock()
for k, v := range m {
    if v > 0 {
        delete(m, k)
    }
}
mu.Unlock()
```

### 4. 在 goroutine 中传递 gin.Context

**禁止写法：**
```go
func (a *AppMosaicTransfer) Submit() {
    go a.TransferAppMosaic(a.GinCtx, params) // GinCtx 内部有 map，并发访问不安全
}
```

**正确写法：**
```go
// 方案1：提前取值，传值不传 ctx
func (a *AppMosaicTransfer) Submit() {
    udid := a.GinCtx.GetHeader("X-Lianjia-Udid")
    go a.TransferAppMosaic(udid, params) // 传值
}

// 方案2：使用 Copy()
func (a *AppMosaicTransfer) Submit() {
    ctxCopy := a.GinCtx.Copy()
    go a.TransferAppMosaic(ctxCopy, params)
}
```

### 5. 批量获取用户信息的并发 Map 写入

**禁止写法：**
```go
func GetBatchUserInfo(userIds []string) map[string]*UserInfo {
    result := make(map[string]*UserInfo)
    for _, id := range userIds {
        go func(uid string) {
            result[uid] = getUserInfo(uid) // concurrent map writes
        }(id)
    }
    return result
}
```

**正确写法：**
```go
func GetBatchUserInfo(userIds []string) map[string]*UserInfo {
    var mu sync.Mutex
    result := make(map[string]*UserInfo)

    var wg sync.WaitGroup
    for _, id := range userIds {
        wg.Add(1)
        go func(uid string) {
            defer wg.Done()
            userInfo := getUserInfo(uid)
            mu.Lock()
            result[uid] = userInfo
            mu.Unlock()
        }(id)
    }
    wg.Wait()
    return result
}
```

---

## 504 错误：禁止写法清单

504 是 nginx 超时，通常由数据库慢查询或接口响应时间过长引起。

### 1. 全表扫描 + LIKE '%xxx%'

**禁止写法：**
```sql
-- 无索引命中，查询上千万行数据
SELECT * FROM project
WHERE name LIKE '%清河%'  -- 前缀通配符无法使用索引
  AND type IN (0,1,2)
```

**正确做法：**
```sql
-- 使用 UNION ALL + 拆分条件，让每个子查询能走索引
(SELECT * FROM project
 WHERE name LIKE '清河%'  -- 前缀匹配可使用索引
   AND type IN (0,1,2)
   AND is_deleted = 0
   AND user_id = ?
   AND source = 'xxx'
 ORDER BY create_time DESC
 LIMIT 100)
UNION ALL
(SELECT * FROM project
 WHERE project_id = ?
   AND type IN (0,1,2)
   AND is_deleted = 0
 ORDER BY create_time DESC
 LIMIT 100)
ORDER BY create_time DESC
LIMIT 10;
```

### 2. OR 条件导致索引失效

**禁止写法：**
```sql
WHERE (name LIKE '%xxx%' AND user_id = 1 AND source = 'xxx')
   OR (name LIKE '%xxx%' AND project_id = 'auto3d-xxx')
```

**正确做法：**
```sql
-- 拆分为多个查询用 UNION ALL
WHERE name LIKE '%xxx%'
  AND user_id = 1
  AND source = 'xxx'
UNION
WHERE name LIKE '%xxx%'
  AND project_id = 'auto3d-xxx'
```

### 3. HTTP 客户端无超时

**禁止写法：**
```go
client := &http.Client{} // 默认无超时，可能无限等待
resp, err := client.Get(url)
```

**正确写法：**
```go
client := &http.Client{
    Timeout: 30 * time.Second, // 设置合理超时
}
resp, err := client.Get(url)

// 或使用 context
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()
req = req.WithContext(ctx)
resp, err := client.Do(req)
```

### 4. 大数据量导出无分页

**禁止写法：**
```go
// 一次查询返回所有数据
allData := []Item{}
db.Where("status = ?", status).Find(&allData) // 数据量大时内存爆炸、查询超时
```

**正确写法：**
```go
// 使用分页或游标
limit := 1000
offset := 0
for {
    var batch []Item
    db.Where("status = ?", status).Offset(offset).Limit(limit).Find(&batch)
    if len(batch) == 0 {
        break
    }
    // 处理 batch
    offset += limit
}
```

### 5. 单次查询返回千万级数据

**禁止写法：**
```go
// 查询示例项目，查出上千万条数据
var projects []Project
db.Where("source = ?", "ALLIANCE").Find(&projects) // 内存打爆，服务重启
```

**正确做法：**
```go
// 使用 COUNT + 分页查询
var total int64
db.Model(&Project{}).Where("source = ?", "ALLIANCE").Count(&total)

// 分页获取
for page := 1; page <= int(math.Ceil(float64(total)/float64(pageSize))); page++ {
    var projects []Project
    db.Where("source = ?", "ALLIANCE).
        Order("id desc").
        Offset((page-1)*pageSize).
        Limit(pageSize).
        Find(&projects)
    // 处理
}
```

---

## 编码检查清单

写完代码后对照检查：

### 500 预防
- [ ] 访问数组/切片前检查 `len()` 或 `cap()`
- [ ] 使用类型断言时检查 `ok` 值
- [ ] 访问 map key 前检查 key 是否存在
- [ ] 使用 `math.IsNaN()` / `math.IsInf()` 检查特殊浮点值
- [ ] JSON 解析后检查目标类型
- [ ] 可变参数调用时展开 slice 或使用 `gconv.Interfaces()`

### 502 预防
- [ ] 所有 map 访问在并发场景下使用 `sync.Mutex` 或 `sync.RWMutex`
- [ ] 或使用 `sync.Map` / `gmap` 等线程安全结构
- [ ] `gin.Context` 不直接传递到 goroutine，使用 `Copy()` 或提前取值
- [ ] 批量并发任务使用 `sync.WaitGroup` 等待完成

### 504 预防
- [ ] 所有 HTTP 客户端设置 `Timeout`
- [ ] 数据库查询确保命中索引，使用 `EXPLAIN` 验证
- [ ] 避免 `LIKE '%xxx%'` 前缀通配符
- [ ] OR 条件拆分为 UNION ALL
- [ ] 大数据量查询使用分页或流式处理
- [ ] 设置合理的数据库超时

---

## 相关文档

- [飞书源文档](https://realsee.feishu.cn/docx/WLhIdW1e9ozUGHxQarjcXf4Wnwo)
- ONES 问题追踪: [#70230](https://ones.realsee.com/project/#/team/8kZMQ1TP/task/SjVPme6X9Csd3y7e)
