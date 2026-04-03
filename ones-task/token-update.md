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

## 二、token（约每小时更新一次）

文件：`.claude/skills/ones-task/token`

Token 有效期约 **1 小时**，过期后需重新获取：

1. 打开浏览器，进入 [ONES](https://ones.realsee.com) 任意页面
2. 按 `F12` 打开开发者工具，切到 **Network（网络）** 面板
3. 在页面上随便点击一个操作（如切换工作项），触发一次请求
4. 在请求列表中点击任意一条 `ones.realsee.com` 的请求
5. 查看 **Request Headers**，找到 `Authorization` 字段
6. 复制 `Bearer ` **后面**的内容（不含 "Bearer " 前缀）
7. 将复制内容写入 `token` 文件（仅一行，无需引号）

---

## 说明

- 两个文件中只放内容本身，不加引号、不加前缀
- Token 是个人凭证，**不要提交到 Git**
