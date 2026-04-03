---
name: go-unit-test
description: >
  为 Go 代码生成单元测试。当用户想为某个函数、文件或包生成/补全单元测试时使用。
  触发关键词：UT、单元测试、unit test、写测试、补充测试、测试覆盖。
---

# Go 单元测试生成 Skill

## 概述

本 skill 负责为 Go 代码自动生成高质量的单元测试。适用于：
- 为指定函数/方法生成测试
- 为整个文件补全测试覆盖
- 为指定包批量生成测试文件

---

## 执行步骤

### Step 1 — 确认目标

若用户未明确指定测试目标（文件/函数/包路径），使用 **AskUserQuestion** 询问：
> "请提供需要生成单元测试的目标，可以是：文件路径、函数名、或包路径。"

### Step 2 — 读取源码

1. 使用 **Read** 工具读取目标源文件。
2. 检查是否已存在同包的 `*_test.go` 文件：
   - 若存在，先读取，避免重复测试已有函数。
3. 识别所有**可测试的导出函数/方法**（公开的 `func` 或 `method`）以及业务逻辑复杂的私有函数。

### Step 3 — 分析被测代码

对每个目标函数分析：
- **函数签名**：入参类型、返回类型、是否返回 error
- **依赖关系**：是否依赖外部服务、数据库、HTTP、文件系统
  - 有外部依赖 → 设计 Mock 或用 interface 注入
  - 纯逻辑函数 → 直接构造输入输出
- **边界条件**：零值、nil、空串、越界、非法输入
- **业务场景**：正常路径、错误路径、边界值

### Step 4 — 生成测试代码

遵循以下规范编写测试：

#### 文件命名
- 与源文件同包，文件名为 `<source_file>_test.go`
- 若源文件为 `foo.go`，测试文件为 `foo_test.go`

#### 包声明
- 优先使用**白盒测试**（同包）：`package <pkg_name>`
- 若测试公开 API 行为，可使用黑盒测试：`package <pkg_name>_test`

#### 测试函数命名
```
Test<FunctionName>          // 普通函数
Test<TypeName>_<MethodName> // 方法
```

#### 测试结构选择

**表驱动测试**（推荐用于多组输入输出的纯函数）：
```go
func TestFoo(t *testing.T) {
    tests := []struct {
        name    string
        input   <InputType>
        want    <OutputType>
        wantErr bool
    }{
        {name: "正常输入", input: ..., want: ...},
        {name: "空输入", input: ..., wantErr: true},
        {name: "边界值", input: ..., want: ...},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := Foo(tt.input)
            if (err != nil) != tt.wantErr {
                t.Errorf("Foo() error = %v, wantErr %v", err, tt.wantErr)
                return
            }
            if got != tt.want {
                t.Errorf("Foo() = %v, want %v", got, tt.want)
            }
        })
    }
}
```

**子测试**（推荐用于场景差异大、setup 不同的情况）：
```go
func TestBar(t *testing.T) {
    t.Run("场景描述", func(t *testing.T) {
        // arrange
        // act
        // assert
    })
}
```

#### 断言规范
- 使用标准库 `testing.T`，不引入第三方断言库（除非项目已使用）
- 优先使用 `t.Errorf` 而非 `t.Fatalf`，除非后续代码依赖此检查
- error 比较：对比 `.Error()` 字符串，或用 `errors.Is`

#### Mock 策略
- **interface 依赖**：在测试文件内定义 `mock<InterfaceName>` struct 实现 interface
- **HTTP 外部调用**：使用 `net/http/httptest` 搭建 mock server
- **gin.Context**：使用 `&gin.Context{}` 或通过 `httptest` 构造
- **禁止**：不要在测试中发起真实的网络请求、数据库操作

#### 注释规范
- 每个测试函数顶部写一行中文注释说明测试目的
- 复杂 mock 结构旁加注释说明

### Step 5 — 写入测试文件

1. 若 `*_test.go` 不存在：使用 **Write** 工具创建。
2. 若已存在：使用 **Edit** 工具追加新测试函数（避免覆盖已有内容）。
3. 确认 import 块包含所有必要依赖。

### Step 6 — 自动运行测试 + 覆盖率（必须执行）

写入测试文件后，**必须**使用 **Bash** 工具运行测试并统计覆盖率，不需要用户要求：

```bash
# 第一步：运行测试并生成覆盖率 profile
go test ./path/to/package/... -v -count=1 -timeout 60s -coverprofile=coverage.out

# 第二步：按文件维度展示覆盖率
go tool cover -func=coverage.out

# 完成后清理临时文件
rm -f coverage.out
```

> `-count=1` 禁用缓存；`-coverprofile` 生成覆盖率数据；`go tool cover -func` 输出每个文件及每个函数的行覆盖率。

**结果处理规则：**

| 情况 | 处理方式 |
|------|----------|
| 编译失败 | 分析错误信息，修正测试代码，重新运行，最多重试 3 次 |
| 测试 FAIL | 分析失败原因：若是测试逻辑有误则修正测试；若是发现真实 bug 则告知用户，不擅自修改源码 |
| 测试全部 PASS | 在最终汇报中展示通过结果与覆盖率 |
| 运行超时 | 检查是否有外部依赖未 mock，修正后重试 |

**重试上限：3 次**。超过后停止重试，向用户报告具体错误信息，并给出修复建议。

**覆盖率汇报格式（在最终输出中展示）：**

```
文件                         覆盖率
----                         ----
path/to/foo.go               72.3%
path/to/bar.go               88.0%
total                        75.1%
```

- 覆盖率 ≥ 70%：正常汇报
- 覆盖率 < 70%：标注"⚠ 覆盖率偏低"，并列出未覆盖的主要函数（从 `go tool cover -func` 输出中找出覆盖率为 `0.0%` 的函数），说明是因为存在外部依赖无法 mock 还是测试用例不足

---

## 生成质量标准

| 维度 | 要求 |
|------|------|
| 覆盖率 | 每个公开函数至少 3 个测试用例（正常、异常、边界） |
| 可读性 | 测试名用中文或英文清晰描述场景 |
| 独立性 | 测试间无依赖，每个 t.Run 独立可运行 |
| 确定性 | 无随机性、无时间依赖，结果可复现 |
| 速度   | 单元测试不依赖外部服务，毫秒级完成 |

---

## 特殊场景处理

### gin.Context 依赖
```go
// 方式1：空 Context（测试前置校验逻辑）
ctx := &gin.Context{}

// 方式2：httptest 构造完整 Context
w := httptest.NewRecorder()
c, _ := gin.CreateTestContext(w)
c.Request, _ = http.NewRequest("POST", "/", bytes.NewBufferString(`{}`))
c.Request.Header.Set("Content-Type", "application/json")
```

### 函数返回多值含 error
```go
got, err := SomeFunc(input)
if err != nil {
    t.Errorf("unexpected error: %v", err)
    return
}
// 继续断言 got
```

### 私有函数
- 与源文件同包（白盒测试）可直接测试
- 若私有函数逻辑复杂，应通过公开函数间接覆盖，或考虑提取为公开函数

---

## 输出格式

完成后向用户汇报：
1. 生成的测试文件路径
2. 覆盖的函数列表及用例数量
3. 测试运行结果：PASS / FAIL，附带 `go test` 输出摘要
4. 每个文件的行覆盖率（来自 `go tool cover -func`），标注低于 70% 的文件及未覆盖原因
4. 如有跳过的函数，说明原因（如依赖无法 mock 的全局状态）
5. 如有修复过的编译/逻辑错误，简述修复内容
