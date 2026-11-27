# MEREL 启动与部署

当前版本是一个 FastAPI 服务同时提供前端和 API。运行需要 Python 3.11+，依赖版本记录在 `requirements.txt`。模型通过外部 API 调用，不需要下载模型权重或配置 GPU。

## 本地启动

按照 [README](../README.md#快速启动) 创建虚拟环境并安装依赖。复制 `.env.example` 为 `.env` 后填写自己的模型配置。

```bash
python -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env
.venv/bin/python run.py --host 127.0.0.1 --port 8787
```

Windows 将 `.venv/bin/python` 替换为 `.venv\Scripts\python.exe`，复制文件使用 `Copy-Item`。使用 `--open-browser` 可在本地服务就绪后打开页面。

## 服务器运行

在服务器获取仓库、创建环境、安装依赖和配置 `.env`。供外部访问时绑定需要使用的网络接口，例如：

```bash
.venv/bin/python run.py --host 0.0.0.0 --port 8787
```

这条命令在前台运行，关闭终端后不能依靠它保持服务。长期演示应由服务器上的 systemd 等进程管理工具托管，配置正确的工作目录和 Python 路径。

网络入口、安全组、反向代理和 HTTPS 取决于实际部署环境。本仓库上传不等于服务器已部署；本次新版代码仍待恢复服务器控制台登录后完成远端验收。

## 配置与数据

| 配置项 | 用途 |
| --- | --- |
| `DEEPSEEK_API_KEY` | 在线模型凭据；空值使用本地演示模式 |
| `DEEPSEEK_BASE_URL` | API 基础地址，默认 `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 模型名称，当前演示配置为 `deepseek-flash` |
| `MEREL_MODEL_TIMEOUT` | 单次模型请求超时秒数；网关限制在 1–30 秒 |
| `MEREL_DB` | 可选数据库路径，默认 `data/merel.sqlite3` |

环境变量优先于 `.env`。模型轮次包含多个调用，整轮耗时可能超过单次超时值。

数据库由服务创建，更新代码时保留原数据路径及 `.env`。备份运行中的 SQLite 应使用 SQLite 的备份机制，或停止服务后进行一致性备份；不要把正在写入的单个主文件当作完整备份。

## 更新与验收

1. 记录当前版本，备份代码、配置和数据库。
2. 获取已验证的新代码，安装本次版本要求的依赖。
3. 保留原配置和数据路径，重启服务。
4. 检查 `/health/live`、`/health/ready`。
5. 新建独立测试会话，检查 `/api/settings` 的模型配置，再发送实际消息核对 `trace.generator=llm`。
6. 用目标访问地址验证箭头发送、Enter、刷新、图片低清/高清替换与数据保留。

`.env`、数据库、日志和私有部署压缩包均由 `.gitignore` 排除。本仓库的素材目录已包含完整运行所需的预览与高清 WebP，不必再上传原始 PNG。
