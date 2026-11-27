# 系统架构


```mermaid
flowchart TB
    User["用户 / User"] --> UI["原生 HTML、CSS、JavaScript<br/>对话 · 状态 · 小计划 · 研究回放"]
    UI -->|"同源 HTTP + 会话 Cookie"| API["FastAPI<br/>字段校验 · 用户隔离 · 幂等 · 版本检查"]
    API --> Route{"消息分流"}
    Route -->|"问候"| Greeting["日常交流"]
    Route -->|"具体困扰"| Extract["结构化状态抽取与证据校验"]
    Route -->|"直接危险表述"| Urgent["独立即时支持回应"]
    Extract --> Rank["30 个支持动作<br/>规则排序"]
    Rank --> Voice["Merel 语言技能<br/>角色语境 · 同动作示例"]
    Greeting --> Voice
    Voice --> Model["DeepSeek API<br/>生成 · 复核 · 必要时修写"]
    Model --> Commit["再次核对版本并提交"]
    Urgent --> Commit
    Commit --> DB[("SQLite<br/>会话 · 状态 · 反馈 · 计划 · 轨迹")]
    DB --> API
    API --> UI
    Assets["预览 WebP → 无损高清 WebP<br/>按可见区域加载"] --> UI
```

前后端由一个 Python 服务同源提供。浏览器不持有模型密钥，图片和字体随项目部署；正常运行无需 Node.js、前端构建工具或本地 GPU。

### Request Lifecycle | 一轮对话如何完成

```mermaid
sequenceDiagram
    autonumber
    participant U as Browser
    participant A as FastAPI
    participant D as SQLite
    participant M as DeepSeek
    U->>A: POST turns(text, expected_version, idempotency_key)
    A->>D: 核对归属、版本和请求标识，登记 pending
    A->>A: 判断问候、普通支持或即时支持分支
    opt 普通支持且已配置模型
        A->>M: 抽取有原文依据的状态
        M-->>A: 结构化结果
        A->>A: 校验结果，更新状态并排序支持动作
    end
    opt 在线问候或普通支持
        A->>M: 注入语言技能与近期对话，生成并复核
        M-->>A: 回复与模型调用信息
    end
    A->>D: 再次核对版本，事务保存回复与轨迹
    A-->>U: 回复、状态、动作、trace 与版本号
    U->>A: 反馈 / 加入计划 / 查看回放
```

模型请求在数据库事务之外执行。相同请求标识和内容重复提交会重放原结果；生成期间状态发生变化时拒绝过期提交。在线调用失败会明确记录回退情况，回放中的 `generator` 与 `warnings` 表示该轮实际执行结果。
