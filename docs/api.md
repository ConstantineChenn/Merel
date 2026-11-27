# MEREL 接口说明

基础前缀为 `/api`，服务启动后通过 `/docs` 查看 OpenAPI。完整字段契约见 [`backend/api_contract.json`](../backend/api_contract.json)。以下示例使用合成输入。

## 1. 会话与数据归属

先调用 `POST /api/session`，浏览器保存服务返回的 `merel_session` Cookie。后续使用相同 Cookie 访问对话、状态、反馈与计划。身份由匿名 Cookie 表示，当前没有账号密码登录或跨设备账号同步。

```http
POST /api/session
Content-Type: application/json

{}
```

响应包含 `user` 和 `mode`。`mode.online=true` 表示服务端配置了模型；是否真正调用成功，应查看具体轮次的 `trace.generator` 和 `trace.warnings`。

## 2. 创建与发送

`POST /api/conversations` 接收可选的 `title`，返回 201 和对话 `id`、`version` 等字段。标题为 1–80 个字符，不能只有空白。

```json
{"title":"演示对话"}
```

向 `POST /api/conversations/{id}/turns` 提交：

```json
{
  "text": "这两天准备答辩有些累，想先安排一个轻松的小步骤。",
  "expected_version": 0,
  "idempotency_key": "demo-turn-00000001"
}
```

| 字段 | 约束与含义 |
| --- | --- |
| `text` | 1–5000 字符，不能仅为空白 |
| `expected_version` | 大于等于 0 的整数，必须与当前对话版本一致 |
| `idempotency_key` | 8–100 字符，每次新发送使用新标识；网络重试复用原标识与原内容 |

成功响应包含 `turn_id`、`conversation_id`、`version`、`response`、`state`、`selected_action`、`ranking` 和 `trace`。

- `trace.route`：问候、普通支持或即时支持分支。
- `trace.generator`：该轮实际使用在线 LLM 还是本地回复。
- `trace.extractor`：结构化模型提取、本地证据规则，或问候轮不适用。
- `trace.model_calls`：模型名称、用量与复核等运行信息。
- `trace.warnings`：抽取或生成回退情况。

同一标识与同一请求重放原结果，不新增轮次；同一标识对应不同内容时返回 409。生成尚未完成时，相同请求返回 202，客户端稍后重试原请求即可。

## 3. 状态、反馈与计划

`PATCH /api/conversations/{id}/state` 同样需要 `expected_version`。状态强度为 `0..3` 或 `null`，其中 `null` 表示未知；持续天数为 `0..3650` 或 `null`。未提供的字段不应被客户端无意覆盖。

`POST /api/turns/{id}/feedback` 接收 `helpfulness`、`burden`（均为 `1..5`）和可选 `note`（最多 1000 字符）。同一轮可修订反馈。

`POST /api/plans` 接收 `turn_id`，相同轮次返回同一计划。问候和即时支持分支不加入日常行动计划。`PATCH /api/plans/{id}` 接收 `status`：`todo`、`done`、`archived`。

`GET /api/export` 导出当前 Cookie 对应用户的数据。删除对话会一并删除其轮次、反馈、计划、状态事件和请求记录。

## 4. 错误与恢复

| 状态码 | 含义 | 客户端处理 |
| --- | --- | --- |
| 202 | 同一请求仍在生成 | 等待后重试完全相同的请求 |
| 401 | 缺少有效会话 | 重新连接会话 |
| 403 | 写入请求来源不匹配 | 使用页面的同源接口 |
| 404 | 不存在或不属于当前用户 | 刷新列表，避免使用其他会话的对象 ID |
| 409 | 版本、幂等内容或并发冲突 | 核对当前状态；版本更新时刷新后以新标识重新发送 |
| 422 | 字段、类型、边界或未知参数错误 | 修正输入后再发起请求 |
| 503 | 本轮未完成提交 | 保留内容，用原请求标识重试 |

网络中断不代表服务端未提交。优先使用原请求标识重试，防止重复生成。
