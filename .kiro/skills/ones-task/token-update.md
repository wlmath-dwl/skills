# 初始配置与 Token 更新

skill 需要两个配置文件，均位于 `.claude/skills/ones-task/` 目录下。

---

## 一、user-id（首次配置，一般不变）

文件：`.claude/skills/ones-task/user-id`

`Ones-User-Id` 是你在 ONES 中的用户 UUID，可从 JWT token 中解码获取：

1. 获取一个有效的 token（步骤见下方）
2. 打开 [jwt.io](https://jwt.io)，将 token 粘贴进去
3. 在 **Payload** 区找到 `org_user_uuid` 字段，复制其值
4. 将该值写入 `user-id` 文件（仅一行，无需引号）

---

## 二、Token 获取（推荐：login.sh 脚本）

### 方式一：使用 login.sh 脚本（推荐）

运行登录脚本获取 token：

```bash
# 方式1：命令行直接指定账号密码
bash ~/.claude/skills/ones-task/scripts/login.sh -e "your-email@example.com" -p "your-password"

# 方式2：先配置 config.yaml，再运行脚本
# 创建 config.yaml（见下方配置说明）
bash ~/.claude/skills/ones-task/scripts/login.sh
```

**生成的 token 是永久有效的，请务必保存好！**

登录成功后，token 和 user_id 会自动写入 skill 目录：
- Token 保存到 `~/.claude/skills/ones-task/token`
- User ID 保存到 `~/.claude/skills/ones-task/user-id`

### config.yaml 配置（可选）

在 skill 目录下创建 `config.yaml`：

```yaml
host: "https://ones.realsee.com"
email: "your-email@example.com"
password: "your-password"
```

---

## 三、手动获取 Token（备选方式）

如果脚本不可用，可手动从浏览器获取：

1. 打开浏览器，进入 [ONES](https://ones.realsee.com) 任意页面
2. 按 `F12` 打开开发者工具，切到 **Network（网络）** 面板
3. 在页面上随便点击一个操作（如切换工作项），触发一次请求
4. 在请求列表中点击任意一条 `ones.realsee.com` 的请求
5. 查看 **Request Headers**，找到 `Authorization` 字段
6. 复制 `Bearer ` **后面**的内容（不含 "Bearer " 前缀）
7. 将复制内容写入 `token` 文件（仅一行，无需引号）

---

## 重要提示

- Token 是个人凭证，**不要提交到 Git**
- login.sh 生成的 token 为永久有效，**请妥善保存**
- 两个文件中只放内容本身，不加引号、不加前缀
