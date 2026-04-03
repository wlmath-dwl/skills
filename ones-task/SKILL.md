# 获取 ONES 工作项详情

根据 ONES 工作项页面 URL，获取该工作项的**标题**、**描述**和**评论**。

## 触发方式

**显式调用**：
```
/ones-task <完整页面URL>
```

**隐式调用**（关键词）：
- "ONES 工作项"、"ones 任务"、"查看 ONES"
- "ones-task"、"ones task"
- URL 包含 "ones.realsee.com" 和 "task/"

例如：
```
/ones-task https://ones.realsee.com/project/#/workspace/team/8kZMQ1TP/filter/view/ft-t-001/task/B45rgjWCx6Iw2wTS/3s7qhfb396u50

或者直接说：帮我查一下这个 ONES 任务的详情
```

## Token 获取与更新方式见 [token-update.md](./token-update.md)。

## 支持的输入格式

脚本支持两种输入格式：

### 格式一：完整 URL
```
/ones-task https://ones.realsee.com/project/#/workspace/team/8kZMQ1TP/filter/view/ft-t-001/task/B45rgjWCx6Iw2wTS/3s7qhfb396u50
```

### 格式二：仅 taskUUID（推荐，更简洁）
```
/ones-task B45rgjWCx6Iw2wTS
```
仅 taskUUID 模式需要配置默认 teamUUID（见下文）。

## 配置默认 teamUUID

当使用仅 taskUUID 格式时，需要配置默认 teamUUID：

```bash
# 创建 team-uuid 文件，写入你的 team UUID
echo "8kZMQ1TP" > ~/.claude/skills/ones-task/team-uuid
```

teamUUID 可从 ONES URL 中获取，例如：
`https://ones.realsee.com/project/#/workspace/team/8kZMQ1TP/...`

## 登录配置（可选）
首次使用需先运行登录脚本，支持两种方式：

### 方式一：命令行参数（推荐）

```bash
bash ~/.claude/skills/ones-task/scripts/login.sh -e "your-email@example.com" -p "your-password"
```

可选参数：
- `-e` 邮箱（必填）
- `-p` 密码（必填）
- `-h` 主机地址（可选，默认 https://ones.realsee.com）

### 方式二：配置文件

1. 在 skill 目录下创建 `config.yaml`，内容如下：

```yaml
host: "https://ones.realsee.com"
email: "your-email@example.com"
password: "your-password"
```

2. 运行登录脚本：

```bash
bash ~/.claude/skills/ones-task/scripts/login.sh
```

登录成功后，token 和 user_id 会保存到 skill 目录，后续调用自动使用。

Token 有效期约 1 小时，过期后重新运行 login.sh 刷新。

## 获取 ones 工作详情执行步骤

直接运行脚本：

```bash
bash .claude/skills/ones-task/scripts/fetch-task.sh "$ARGUMENTS"
```

脚本会自动完成：
1. 从 URL 中解析 `ONES_TEAM_UUID` 和 `TASK_UUID`
2. 检查 `ONES_TOKEN` 环境变量
3. 调用工作项详情接口和评论接口
4. 按格式化输出标题、描述、评论

输出格式：

```
## 工作项 #<number>

**标题：** <summary>

**描述：**
<desc，为空则显示"（无描述）">

**评论（共 N 条）：**

[1] <from_name> · <YYYY-MM-DD HH:mm>
<text>

[2] <from_name> · <YYYY-MM-DD HH:mm>
<text>
...
```
