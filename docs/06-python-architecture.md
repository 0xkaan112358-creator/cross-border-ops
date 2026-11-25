# 跨境运营 AI 助手 · Python 技术栈重构方案（设计稿）

> **文档定位**：把现有系统改用 Python + FastAPI + MySQL + Milvus + Neo4j 实现的完整设计方案。
>
> **⚠️ 状态**：**只是设计，没有实现**。线上运行和代码仓库里的仍是 TypeScript 版本（Next.js 全栈 + Postgres）。不要把设计稿说成已实现。
>
> **适用场景**：回答"如果用 Python 栈会怎么做"、"为什么要用向量库和图数据库"、"多个存储怎么保证一致"这类架构问题。
>
> **标记说明**：【新增】表示现有系统没有、本方案新增的功能；【待验证】表示落地前需要实测或查官方文档确认的点。

---

## 目录

1. 结论
2. 范围：不变的、改变的、新增的
3. 总体架构
4. 技术选型和否决方案
5. 工程结构
6. 模块迁移对照
7. MySQL 设计
8. 登录和权限【新增】
9. 后台任务和 ERP 同步
10. 大模型层
11. 知识库：Milvus 混合检索【新增】
12. 合规知识图谱：Neo4j【新增】
13. 多个存储之间的一致性
14. 前端改造
15. 部署
16. 测试和评测
17. 日志和监控
18. 实施步骤
19. 风险和取舍


---

## 1. 结论

- **现有功能全部可以用 Python 栈实现**，包括补货算法、断货推断、头程时效、智能问答、客服工单、话术合规检查和 ERP 同步，而且大部分是逐行翻译，逻辑不变。
- **FastAPI + MySQL** 承担现有系统的全部职责。MySQL 是唯一的事实来源：所有业务数据以它为准。
- **Milvus** 用于知识库检索升级：从纯关键词检索升级为"关键词 + 语义"的混合检索，解决员工问法和文档用词不一致的问题。
- **Neo4j** 用于新增的合规知识图谱，回答"某个商品卖到某个国家，需要满足哪些法规、准备哪些文件、现在缺什么"。
- **Milvus 和 Neo4j 都是派生数据**，可以随时从 MySQL 全量重建。这是整个方案最重要的设计原则，一致性、备份、故障处理都建立在它上面。

---

## 2. 范围：不变的、改变的、新增的

| 类别 | 内容 |
|---|---|
| **不变** | 补货算法、断货推断、时效中位数的全部规则和参数；客服分流规则和合规正则；ERP 映射规则；问答的工具调用方式；页面和交互；三种角色（管理员、客服、普通员工）的权限分工 |
| **改变** | 后端从 Next.js API 路由改为 FastAPI；数据库从 Postgres 改为 MySQL；ERP 同步从"请求内执行，受 5 分钟限制"改为后台任务；登录从托管平台提供改为自建；测试从 Vitest 改为 pytest；部署从无服务器托管改为自己的服务器 + Docker Compose |
| **新增** | 账号密码登录；知识库混合检索；合规知识图谱，以及对应的问答工具和商品页"合规"标签；后台任务队列 |

---

## 3. 总体架构

```
浏览器
  │ HTTPS
Nginx（唯一对外入口，负责 TLS 和路由）
  ├─ /          → web    Next.js，只负责页面，不连数据库
  └─ /api/      → api    FastAPI（Uvicorn，多进程）
                    │
                    ├─ MySQL 8.0      业务数据，唯一事实来源
                    ├─ Milvus 2.5+    知识库检索索引（可重建）
                    ├─ Neo4j 5        合规知识图谱（可重建）
                    ├─ 大模型接口      DeepSeek，OpenAI 兼容
                    └─ 向量模型        BGE-M3（调用接口或本地部署）

worker   后台任务进程，与 api 同一份代码
  ├─ 任务：ERP 同步、工单批处理、知识库入库、图谱同步
  └─ 从 MySQL 的 jobs 表领取任务；结果写回 MySQL，再同步到 Milvus 和 Neo4j
```

**两条典型请求链路**：

1. **员工问"德国站 65W 充电器要准备哪些认证文件"**
   页面 → FastAPI 问答接口 → 大模型判断要调用合规工具 → 查 Neo4j 得到法规、所需文件和是否已具备 → 用 Milvus 检索相关法规原文作为引用 → 大模型组织回答，标注来源，结尾提示以官方最新规定为准。
2. **管理员点"立即同步"**
   页面 → FastAPI 写一条 `erp_sync` 任务 → 立即返回任务号 → worker 领取任务，拉取 ERP 并在一个事务里写入 MySQL，同时登记"同步商品到图谱"的任务 → 页面每 3 秒查询任务进度。

---

## 4. 技术选型和否决方案

| 层 | 选择 | 否决的方案 | 理由 |
|---|---|---|---|
| 语言 | Python 3.12 | TypeScript（现状） | 我的主力语言；向量模型、中文分词、数据处理等 AI 生态都以 Python 为主 |
| Web 框架 | FastAPI + Uvicorn | Django、Flask | 原生异步，适合本系统"大量等待外部服务"的特点（大模型、ERP、三个数据库）；用 Pydantic 校验并自动生成接口文档。Django 自带的模板、后台管理用不上，而且整体偏同步；Flask 需要自己拼校验和异步 |
| 数据校验 | Pydantic v2 | 手写校验 | 替代现在的 zod。接口入参、设置项、大模型输出用同一套模型校验 |
| 数据库访问 | SQLAlchemy 2.0（异步）+ asyncmy 驱动 | 手写 SQL；Tortoise ORM | SQLAlchemy 生态最成熟，配合 Alembic 做迁移；复杂查询仍可写原生 SQL |
| 迁移 | Alembic | 自己执行 SQL 文件（现状） | 有版本链和回退脚本，团队协作时不容易冲突 |
| 关系库 | MySQL 8.0（InnoDB，utf8mb4） | Postgres（现状） | 见下方说明 |
| 向量库 | Milvus 2.5+ Standalone | pgvector、Elasticsearch、Chroma | 一个库同时提供中文 BM25 全文检索和向量检索；支持按字段过滤。pgvector 依赖 Postgres，选了 MySQL 就没有它；Elasticsearch 也能做混合检索，但更重、更吃内存，向量不是它的强项；Chroma 适合原型，没有内置中文 BM25，生产部署方案也弱 |
| 图数据库 | Neo4j 5 社区版 | 用 MySQL 关联表 + 递归查询；NebulaGraph | 合规查询以多跳路径为主，还要返回推理路径作为依据，用 Cypher 表达更直接。NebulaGraph 面向分布式大图，这里数据量小，用不上 |
| 向量模型 | BGE-M3（1024 维） | OpenAI 的向量模型 | 中英文和多语种效果都好（知识库有中文也有英文）；可以本地部署，数据不出境 |
| 大模型 | `openai` Python SDK（AsyncOpenAI） | 绑定单一供应商的 SDK | 和现状一致，换供应商只改地址和模型名 |
| 后台任务 | MySQL 的 jobs 表 + 独立 worker 进程 | Celery + Redis；FastAPI 自带的 BackgroundTasks | 任务量小，不值得为任务队列多引入 Redis；BackgroundTasks 跑在接口进程里，进程重启任务就丢了 |
| HTTP 客户端 | httpx（异步） | requests | 支持异步、超时和自定义证书校验 |
| 文件解析 | pypdf、python-docx、openpyxl | — | 替代现在的 unpdf、mammoth、SheetJS |
| 测试 | pytest + pytest-asyncio + respx + testcontainers | unittest | respx 模拟 HTTP 接口；testcontainers 在测试里启动真实的 MySQL、Neo4j、Milvus |
| 工程工具 | uv（依赖管理）、ruff（代码检查）、mypy（类型检查） | pip + flake8 | 更快，配置集中在 `pyproject.toml` |

**为什么用 MySQL 而不是 Postgres（要坦诚回答）**：

- 单从技术上看，Postgres 对本项目更顺手：现有 SQL 用到的 `returning`、`unnest`、jsonb，以及可选的 pgvector 扩展，它都有。
- 选 MySQL 是工程上的考虑：国内团队最常用，云厂商都有成熟的托管版，团队的运维经验多。
- 向量检索和图查询已经交给 Milvus 和 Neo4j，关系库只负责事务数据，MySQL 8.0 完全够用。
- 迁移的代价是改写一批 SQL，具体见第 7 节。

---

## 5. 工程结构

```
backend/
  pyproject.toml
  alembic/versions/          数据库迁移
  app/
    main.py                  创建应用、注册路由、启动和关闭时管理连接池
    config.py                用 pydantic-settings 读取环境变量
    deps.py                  依赖注入：数据库会话、当前用户、角色检查
    api/                     路由层：只做参数校验、权限检查、调用服务
      auth.py  inventory.py  replenishment.py  assistant.py  knowledge.py
      tickets.py  erp.py  settings.py  imports.py  compliance.py  jobs.py
    domain/                  纯函数：不访问数据库，不调用外部接口
      replenishment.py       补货算法
      stockout.py            断货日推断
      transit.py             头程时效中位数
      ticket_routing.py      客服分流规则
      reply_guard.py         客服回复的话术合规检查（正则）
      erp_mapping.py         ERP 数据映射
      kb_text.py             切片 + 内存版 BM25（降级用）
    services/                业务流程：组合数据库、外部接口和纯函数
      inventory.py  assistant.py  tickets.py  kb.py  erp_sync.py
      compliance_graph.py  importer.py  settings.py
    repositories/            SQL 访问
    integrations/            外部系统客户端
      llm.py  embedding.py  milvus.py  neo4j.py  erp_client.py
    models/                  SQLAlchemy 表定义
    schemas/                 Pydantic 请求和响应模型
    worker/                  任务循环和各类任务的处理函数
    cli.py                   命令行：创建管理员、写入示例数据、重建索引
  tests/
web/                         现有 Next.js 页面（去掉 API 路由和数据库代码）
deploy/
  docker-compose.yml  nginx.conf  .env.example
```

**两个命名上的注意点**：

- 现有的 `compliance.ts` 是"客服回复的话术合规检查"，新增的是"商品的法规合规图谱"，两者完全不同。Python 版分别命名为 `reply_guard.py` 和 `compliance_graph.py`，避免混淆。
- 分层原则不变：核心算法写成纯函数放在 `domain/`，单元测试不需要数据库。

---

## 6. 模块迁移对照

| 现有文件（TypeScript） | Python 模块 | 迁移要点 |
|---|---|---|
| `replenishment.ts` | `domain/replenishment.py` | 输入输出用不可变的 dataclass；日期用 `datetime.date`。⚠️ 取整规则不同，见下文 |
| `stockout.ts` | `domain/stockout.py` | 泊松概率用 `math.exp`，逐步累加，不需要 scipy |
| `erp/mapping.ts` | `domain/erp_mapping.py`、`domain/transit.py` | 最大余数法分摊、时效中位数。⚠️ 中位数取整同样受影响 |
| `ticket-routing.ts` | `domain/ticket_routing.py` | 直接翻译 |
| `compliance.ts` | `domain/reply_guard.py` | 用 `re` 模块。⚠️ 正则行为有差异，见下文 |
| `kb-text.ts` | `domain/kb_text.py` | 切片规则不变；BM25 保留，作为 Milvus 不可用时的降级方案和评测基线 |
| `llm.ts` | `integrations/llm.py` | AsyncOpenAI；JSON 输出用 Pydantic 校验，失败重试 1 次 |
| `assistant.ts` | `services/assistant.py` | 工具调用循环不变；新增合规查询工具 |
| `tickets.ts` | `services/tickets.py` | 原子领取改写，见第 7 节 |
| `erp/client.ts` | `integrations/erp_client.py` | 证书指纹固定改用 `ssl` 模块，见第 9 节 |
| `erp/sync.ts` | `services/erp_sync.py` + worker | 改为后台任务，不再受 5 分钟限制 |
| `db.ts` | `models/` + Alembic | — |
| `viewer.ts` | `deps.py` + `api/auth.py` | 改为自建登录 |
| `importer.ts` | `services/importer.py` | openpyxl 读 Excel |
| `seed.ts` | `cli.py seed` | 示例数据改为命令行写入 |

**迁移中最容易出错的三处（迁移重点）**：

1. **四舍五入规则不同**。JavaScript 的 `Math.round` 是"四舍五入"，Python 的 `round` 是"银行家舍入"（逢 5 取偶）。
   例如时效中位数的样本是 22 天和 23 天，平均是 22.5：TypeScript 得 23，Python 的 `round` 得 22。
   做法：统一用一个 `round_half_up` 函数（`math.floor(x + 0.5)`，或 `Decimal` 的 `ROUND_HALF_UP`），并禁止在 `domain/` 里直接用 `round`。
2. **正则的单词边界不同**。JavaScript 正则不加 `u` 标志时，`\b` 只认英文字母；Python 3 默认按 Unicode 判断。德语、法语里带变音符号的词（如 "Bewertung für"）匹配结果可能不同。
   做法：靠对拍测试发现差异，见第 16 节。
3. **日期和时区**。现有代码按站点日期计算，Python 版统一用 `date` 对象，并禁止在业务逻辑里调用 `date.today()`，"今天"由调用方传入。现有代码也是这样做的，所以测试可以固定日期。

---

## 7. MySQL 设计

### 7.1 全局约定

- **引擎和字符集**：InnoDB，`utf8mb4`，排序规则 `utf8mb4_0900_ai_ci`。
  - ⚠️ 这个排序规则不区分大小写，也不区分重音：`sku-a` 和 `SKU-A` 会被唯一键视为相同，`ü` 和 `u` 也相同。
  - SKU、货件号这类编码字段改用 `utf8mb4_bin`，按原样区分。
- **时间**：时间点统一用 UTC 存成 `DATETIME(3)`，连接时设置 `time_zone = '+00:00'`；业务日期（销量日期、到货日期）用 `DATE`，表示站点当地日期。
- **严格模式**：开启 `STRICT_TRANS_TABLES`，非法数据直接报错，不会被悄悄截断。
- **主键**：自增 `BIGINT`。原来用 `text` 做主键的表（`app_meta`、`app_settings`、`orders`）改成 `VARCHAR(255)`，因为 MySQL 不能直接用 TEXT 做主键。

### 7.2 表清单

现有 14 张表全部保留，字段含义不变。`user_roles` 由 `users` 替代，另外新增 8 张表：

| 类别 | 表 | 说明 |
|---|---|---|
| 主数据和库存 | `skus`、`inventory`、`daily_sales`、`shipments`、`orders` | 不变 |
| 补货 | `promotions`、`replenishment_decisions` | 不变 |
| 知识库 | `kb_documents`、`kb_chunks` | `kb_documents` 新增 `index_status` 字段（入库中、已就绪、失败） |
| 客服 | `tickets` | 不变 |
| 系统 | `app_settings`、`erp_sync_runs`、`app_meta` | 不变 |
| 登录【新增】 | `users`、`refresh_tokens`、`login_attempts` | 替代 `user_roles` |
| 任务【新增】 | `jobs` | 后台任务队列 |
| 合规【新增】 | `compliance_regulations`、`compliance_rules`、`sku_attributes`、`sku_documents` | 合规图谱的源数据，见第 12 节 |

### 7.3 关键表结构

```sql
CREATE TABLE users (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL,
  name          VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('admin', 'cs', 'staff') NOT NULL DEFAULT 'staff',
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  token_version INT NOT NULL DEFAULT 0,       -- 改密码、停用时加 1，旧令牌立即失效
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_users_email (email)
);

CREATE TABLE jobs (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  type          VARCHAR(32) NOT NULL,         -- erp_sync / tickets_process / kb_index / graph_sync
  payload       JSON NOT NULL,
  status        ENUM('queued', 'running', 'succeeded', 'failed') NOT NULL DEFAULT 'queued',
  dedupe_key    VARCHAR(64) NULL,             -- 同一时间只允许一个 ERP 同步；结束时置空
  attempts      INT NOT NULL DEFAULT 0,
  max_attempts  INT NOT NULL DEFAULT 3,
  run_after     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  locked_by     VARCHAR(64) NULL,
  heartbeat_at  DATETIME(3) NULL,
  progress      JSON NULL,
  result        JSON NULL,
  error         TEXT NULL,
  created_by    BIGINT NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at   DATETIME(3) NULL,
  UNIQUE KEY uk_jobs_dedupe (dedupe_key),     -- MySQL 唯一键允许多个 NULL
  KEY idx_jobs_pick (status, run_after)
);
```

### 7.4 Postgres 写法到 MySQL 的改写

| 现有写法 | 用途 | MySQL 改写 | 注意点 |
|---|---|---|---|
| `insert ... returning id` | 取新行 ID | `cursor.lastrowid`，SQLAlchemy 自动处理 | — |
| `update ... where status = 'new' ... returning id` | 工单原子领取 | 事务内 `SELECT ... FOR UPDATE SKIP LOCKED` 后再 `UPDATE` | 见 7.5 |
| `unnest($1::int[], ...)` | 一条 SQL 批量写入 | 多行 `INSERT ... VALUES`，每批 1000 行 | 单条 SQL 受 `max_allowed_packet` 限制，所以要分批 |
| `on conflict do update` | 有则更新，无则插入 | `INSERT ... AS new ON DUPLICATE KEY UPDATE col = new.col` | 旧的 `VALUES()` 写法在 8.0.20 后已不推荐；冲突时自增 ID 也会被消耗，造成跳号 |
| `count(*) filter (where ...)` | 工单分状态统计 | `SUM(CASE WHEN ... THEN 1 ELSE 0 END)` | — |
| `jsonb` | 同步记录、合规命中、知识库引用 | `JSON` | 没有 GIN 索引，需要按 JSON 内字段查询时用生成列加索引 |
| `timestamptz` | 时间点 | `DATETIME(3)`，存 UTC | — |
| `serial` / `boolean` | 自增、布尔 | `AUTO_INCREMENT` / `TINYINT(1)` | — |
| Postgres 咨询锁 | 防止多个构建同时迁移 | `GET_LOCK('migrate', 60)` | 部署时只有一个迁移步骤，见第 15 节，实际可以不用 |
| 迁移文件放在事务里执行 | 失败整体回滚 | ⚠️ MySQL 的 DDL 会隐式提交，**不能回滚** | 每个迁移只做一件事，写成可重复执行的；失败时人工处理 |

### 7.5 工单原子领取

现在的写法是一条 `update ... returning`，MySQL 的 UPDATE 不支持 `returning`，改成：

```python
async def claim_tickets(session: AsyncSession, limit: int = 4) -> list[int]:
    async with session.begin():
        rows = await session.execute(
            text("""
                SELECT id FROM tickets
                WHERE status = 'new'
                ORDER BY received_at
                LIMIT :limit
                FOR UPDATE SKIP LOCKED
            """),
            {"limit": limit},
        )
        ids = [r.id for r in rows]
        if ids:
            await session.execute(
                update(Ticket).where(Ticket.id.in_(ids)).values(status="processing", processed_at=func.now())
            )
    return ids
```

- `FOR UPDATE` 锁住选中的行，其他事务读到被锁的行时直接跳过（`SKIP LOCKED`），不会等待，也不会领到同一张工单。MySQL 8.0 起支持。
- `(status, received_at)` 要有联合索引。否则 InnoDB 会锁住扫描过的所有行，而不只是返回的几行，并发时互相阻塞。
- "处理中超过 5 分钟放回队列"的恢复逻辑不变。

### 7.6 ERP 数据写入

- **做法不变**：全部拉取完，再在一个事务里先删除旧数据、再写入新数据。
- **读不阻塞**：InnoDB 默认隔离级别是"可重复读"，基于多版本读取。同步过程中，页面查询读到的仍是旧数据的快照，不会被写入阻塞，也看不到写了一半的数据。
- **数据量变大后**：改用影子表。先把新数据写入 `daily_sales_new` 等表，再用一条 `RENAME TABLE a TO a_old, a_new TO a` 原子切换（MySQL 一条语句里重命名多张表是原子的），避免一个很大的事务长时间占用回滚日志。

---

## 8. 登录和权限【新增】

现在的应用以私有方式发布，登录由托管平台提供。部署到自己的服务器后没有这层保护，必须自建。

### 8.1 账号

- **没有注册入口**。管理员在"设置"页创建账号、分配角色、停用账号。
- **第一个管理员**用命令行创建：`python -m app.cli create-admin --email ...`。密码在交互提示里输入，不作为命令参数传入，避免留在命令历史和进程列表里。
- **密码存储**：Argon2id 哈希（`argon2-cffi`），不存明文。

### 8.2 令牌

| 令牌 | 内容 | 有效期 | 存放 |
|---|---|---|---|
| 访问令牌 | JWT：用户 ID、`token_version`、过期时间 | 15 分钟 | HttpOnly、Secure、SameSite=Lax 的 Cookie |
| 刷新令牌 | 256 位随机数；数据库只存它的 SHA-256 | 7 天 | HttpOnly Cookie，只在 `/api/auth/refresh` 路径发送 |

- **为什么放 Cookie 而不是浏览器本地存储**：HttpOnly 的 Cookie 前端脚本读不到，即使页面有 XSS 漏洞，令牌也不会被偷走。
- **刷新令牌轮换**：每用一次就换新的，旧的作废。如果作废的旧令牌又被使用，说明它可能被盗，这个用户的所有刷新令牌全部作废。
- **立即失效**：每个请求都按用户 ID 查一次 `users` 表（主键查询，开销很小），检查 `is_active` 和 `token_version`。所以停用账号、修改角色、修改密码都立即生效，不用等 15 分钟后令牌过期。角色也以数据库为准，不读令牌里的。

### 8.3 防护

- **跨站请求**：Cookie 设置 SameSite=Lax；另外保留现有的检查：写请求校验 `Sec-Fetch-Site` 和 `Origin` 头，做成 FastAPI 中间件。
- **防暴力破解**：`login_attempts` 表按"邮箱 + IP"记录失败次数，连续失败 5 次锁定 15 分钟。错误提示统一为"邮箱或密码错误"，不暴露账号是否存在。之所以用数据库而不是进程内存记录，是因为接口有多个进程，内存计数不共享。

### 8.4 权限检查

权限分工和现在完全一致：设置、ERP 同步、导入和知识库上传只限管理员；工单处理限管理员和客服；其余功能所有登录用户都能用。用 FastAPI 的依赖注入实现：

```python
Role = Literal["admin", "cs", "staff"]

def require_roles(*roles: Role):
    async def checker(user: User = Depends(current_user)) -> User:
        if roles and user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "没有权限执行此操作")
        return user
    return checker

@router.post("/erp/sync")
async def start_sync(user: User = Depends(require_roles("admin"))) -> JobOut:
    ...
```

第九部分提到的已知不足（确认补货数量没有限制角色）可以顺便修复，限定为管理员或新增"计划员"角色。这属于需求变更，列为可选项。

---

## 9. 后台任务和 ERP 同步

### 9.1 为什么需要后台任务

现在 ERP 同步在一次 HTTP 请求里执行，受托管平台 5 分钟上限约束，所以要设置"200 秒后不再发新请求"的预算，还要用"超过 6 分钟仍在同步就标记为已中断"来兜底。改成后台任务后：

- 接口只负责登记任务，立即返回任务号；
- 同步时间不再受 HTTP 请求限制；
- 进程意外退出能通过心跳发现，而不是靠猜时间。

### 9.2 任务队列

用 MySQL 的 `jobs` 表（结构见 7.3），worker 循环领取：

```python
async def claim_job(session: AsyncSession, worker_id: str) -> Job | None:
    async with session.begin():
        job = (await session.execute(
            select(Job)
            .where(Job.status == "queued", Job.run_after <= func.now())
            .order_by(Job.id)
            .limit(1)
            .with_for_update(skip_locked=True)
        )).scalar_one_or_none()
        if job:
            job.status, job.locked_by = "running", worker_id
            job.attempts += 1
            job.heartbeat_at = func.now()
    return job
```

- **心跳**：执行期间每 10 秒更新一次 `heartbeat_at`；超过 2 分钟没有心跳的任务视为进程已死，放回队列重试。超过最大重试次数就标记失败。
- **去重**：登记 ERP 同步时写入 `dedupe_key = 'erp_sync'`，唯一键保证同一时间只有一个同步；任务结束时把它置空。
- **进度**：同步过程中最多每 2 秒把进度写入 `progress` 字段，页面每 3 秒查询一次。和现在的做法一致。
- **任务类型**：

| 类型 | 触发 | 内容 |
|---|---|---|
| `erp_sync` | 管理员手动；以后可加定时 | 拉取、映射、写入 MySQL，再登记 `graph_sync` |
| `tickets_process` | 新工单到达、手动批量处理 | 分类、分流、写草稿、合规检查 |
| `kb_index` | 上传文档 | 生成向量，写入 Milvus |
| `graph_sync` | ERP 同步后、导入商品或合规数据后 | 把 MySQL 的数据同步到 Neo4j |

**为什么不用 Celery + Redis**：任务量很小（每天几次同步、几百张工单），用 MySQL 做队列不需要新组件，而且"写业务数据"和"登记任务"可以放在同一个事务里，保证不会出现数据写了、任务没登记的情况（见第 13 节）。任务量上来以后再换 Celery 或 arq，任务处理函数本身不用改。

### 9.3 ERP 客户端

规则和现在一致：单个请求 30 秒超时；token 过期前续期，401 时重新登录并重试一次；分页按 ERP 报告的总数翻页；接口忽略翻页参数时立即报错。

**证书指纹固定**的 Python 写法：

```python
import hashlib, hmac, ssl

def pinned_ssl_context(host: str, port: int, expected_sha256: str) -> ssl.SSLContext:
    pem = ssl.get_server_certificate((host, port), timeout=10)
    actual = hashlib.sha256(ssl.PEM_cert_to_DER_cert(pem)).hexdigest()
    expected = expected_sha256.replace(":", "").lower()
    if not hmac.compare_digest(actual, expected):
        raise ErpError("ERP 服务器证书指纹与配置不一致，已拒绝连接")
    return ssl.create_default_context(cadata=pem)

client = httpx.AsyncClient(base_url=base_url, verify=pinned_ssl_context(host, port, fp), timeout=30)
```

- 第一次连接只取证书、比对指纹，不发送任何业务数据。
- 指纹一致后，把这张证书设为唯一信任的证书，后续请求仍做完整的 TLS 校验，包括主机名检查。
- 现有 TypeScript 版本在每次握手时还会再比对一次指纹。Python 版如果要做到同样严格，可以从 httpx 响应的 `network_stream` 扩展里取出 TLS 连接的证书再比对。【待验证】

**两处改进**：

- **并发拉取**：不同接口之间用 `asyncio.gather` 并发拉取，用 `asyncio.Semaphore` 限制同时最多 3 个请求，避免触发 ERP 的限流。同一个接口内部仍按顺序翻页，因为"检测重复页"依赖顺序。ERP 的限流规则需要确认。【待验证】
- **token 续期加锁**：并发请求可能同时发现 token 过期，用 `asyncio.Lock` 保证只续期一次，其他请求等它完成后直接用新 token。

---

## 10. 大模型层

- **客户端**：`AsyncOpenAI(base_url=..., api_key=..., timeout=60, max_retries=2)`。没有配置密钥时走模拟模式，规则和现在一致。
- **结构化输出**：工单分类定义成 Pydantic 模型，取值用 `Literal` 限定，例如意图只能是 6 类之一。模型输出用 `model_validate_json` 校验，不合格重试 1 次，仍失败就转人工并记录原因。
- **工具定义**：工具参数也用 Pydantic 模型定义，用 `model_json_schema()` 生成给大模型的参数格式，参数说明只写一处。
- **问答参数不变**：最多 5 轮工具调用，只带最近 10 轮对话，温度 0.2。
- **新增工具**：`check_product_compliance(sku, marketplace)`，见第 12 节。
- **异步的坑**：
  - 在异步接口里调用同步库（同步的数据库驱动、`requests`、本地向量模型推理）会卡住整个事件循环，期间所有请求都在等。CPU 计算和同步调用要用 `run_in_threadpool` 放到线程池，或者放到 worker 进程里执行。
  - 补货计划计算是纯 CPU 计算，当前数据量下单次只需几毫秒，可以直接在接口里算；数据量变大后改为同步完成后预先算好并缓存。
- **工单批处理并行化**：现在每批 4 条顺序处理。改为用 `asyncio.Semaphore(4)` 限制并发，并行调用大模型，同时注意模型服务的限流。

---

## 11. 知识库：Milvus 混合检索【新增】

### 11.1 要解决的问题

现在用 BM25 关键词检索，问法和文档用词不同时会漏检。例如：

| 员工的问法 | 文档里的写法 |
|---|---|
| 欧盟要什么证 | CE 认证、符合性声明 |
| 货到亚马逊仓库要多久 | FBA 入库时效 |
| 客户说东西坏了怎么回 | 质量问题处理 SOP |

向量检索按语义匹配，能弥补这一点；但它对型号、SKU、法规编号这类精确词反而不如关键词检索。所以两者结合使用。

### 11.2 集合结构

```python
schema = MilvusClient.create_schema()
schema.add_field("chunk_id", DataType.INT64, is_primary=True)       # 等于 MySQL kb_chunks.id
schema.add_field("document_id", DataType.INT64)
schema.add_field("category", DataType.VARCHAR, max_length=32)        # 用于按分类过滤
schema.add_field("text", DataType.VARCHAR, max_length=4096,
                 enable_analyzer=True, analyzer_params=CN_ANALYZER)
schema.add_field("sparse", DataType.SPARSE_FLOAT_VECTOR)             # BM25 由 Milvus 自动生成
schema.add_field("dense", DataType.FLOAT_VECTOR, dim=1024)           # BGE-M3
schema.add_function(Function(
    name="bm25", function_type=FunctionType.BM25,
    input_field_names=["text"], output_field_names=["sparse"],
))

index_params = client.prepare_index_params()
index_params.add_index("dense", index_type="HNSW", metric_type="COSINE",
                       params={"M": 16, "efConstruction": 200})
index_params.add_index("sparse", index_type="SPARSE_INVERTED_INDEX", metric_type="BM25")
```

- **写入的文本**：`文档标题 · 章节标题` 加正文。标题参与检索，命中率更高。
- **中文分词**：Milvus 默认分词器按英文设计，处理中文可能什么都检索不到，所以必须配置中文分词器。
  - Milvus 内置的 `chinese` 分词器基于 jieba，会过滤掉非中文、英文、数字的字符；
  - 知识库里中英文混排（例如 GPSR、FBA），计划自定义为"jieba 分词 + 转小写 + 过滤"，并给 jieba 加自定义词典，收录"欧代""英代""海外仓"等业务词，防止被切错。
  - 自定义词典的参数写法要按 Milvus 版本确认。【待验证】
- **原文以 MySQL 为准**：Milvus 只返回切片 ID 和分数，标题、章节和正文按 ID 从 MySQL 读取，避免两边内容不一致。

### 11.3 检索流程

```
问题
  ├─ 向量检索（dense，前 20 条，余弦相似度）  ┐
  └─ 关键词检索（BM25，前 20 条）            ┘ 两路并行（asyncio.gather）
       → 在 Python 里用 RRF 融合（k = 60），取前 5 条
       → 判断是否命中：向量相似度 ≥ 阈值，或 BM25 分数 ≥ 阈值
       → 按 ID 从 MySQL 读取原文，返回"文档名 · 章节"和分数
```

**为什么不直接用 Milvus 的 `hybrid_search`，而是分两次查询、自己融合**：

- RRF 只看排名：每条结果在每一路的得分是 1 ÷ (60 + 名次)，再相加。它适合排序，但**融合后的分数不能用来判断"有没有找到"**，因为排第一的结果不管多不相关，得分都差不多。
- 现在系统有"分数低于 2.5 视为没找到"的规则，问答和客服都依赖它：找不到就明确说没找到，或者转人工。
- 分两路查询能拿到各自的原始分数，既能做"是否命中"的判断，也能在页面上显示"关键词分、语义分"，便于解释。代价只是多一次请求，两路并行执行，耗时基本不变。
- 两路的阈值要在评测集上标定，不能沿用 2.5，因为分数的含义变了。【待验证】

**可选的第三步：重排序**。用 bge-reranker 对融合后的前 20 条重新打分。重排序模型的分数是"问题和片段的相关度"，可以直接用作阈值，精度也更高。代价是每次检索多一次模型推理，列为二期。

### 11.4 入库和删除

```
上传文件 → 解析（pypdf / python-docx） → 切片（规则不变：按标题分节，每块不超过 600 字）
  → MySQL 事务：写文档（状态"入库中"）+ 写切片 + 登记 kb_index 任务
  → worker：每 16 条一批调用向量模型 → 按切片 ID 写入 Milvus（upsert，重复执行结果不变）
  → 文档状态改为"已就绪"
```

- **删除**：MySQL 删除文档和切片，同一事务里登记"删除索引"任务；worker 按 `document_id` 删除 Milvus 中的数据。
- **检索只返回已就绪的文档**：检索结果里的切片 ID 如果在 MySQL 中已经不存在（刚删除、索引还没清理），直接丢弃。

### 11.5 向量模型部署

| 方式 | 优点 | 缺点 |
|---|---|---|
| 调用国内模型服务的 BGE-M3 接口 | 不占服务器内存，部署简单 | 知识库内容会发给服务商；有调用费用 |
| 本地部署（FlagEmbedding 或 sentence-transformers，CPU 推理） | 数据不出服务器 | 需要额外几 GB 内存；CPU 推理慢，只适合入库这种批量任务，查询时还要给单条问题生成向量 |

默认用接口方式，配置项可以切换。本地部署时，向量模型单独作为一个服务运行，不放在 API 进程里，避免卡住事件循环。

### 11.6 降级

Milvus 或向量模型不可用时，自动退回内存版 BM25（即现有算法的 Python 移植）。回答中标注"当前为关键词检索模式"。资料量小的情况下，降级后仍然可用。

### 11.7 评测（落地前必须做）

- **评测集**：基于 9 份示例文档，人工编写约 50 个问题，每题标注应该命中的切片。其中一部分是同义改写的问法，另有约 10 个知识库里没有答案的问题。
- **指标**：
  - 前 5 条命中率（Recall@5）：应该命中的切片有没有出现在前 5 条里；
  - 平均倒数排名（MRR）：正确切片排得有多靠前；
  - 无答案识别率：没有答案的问题，系统是否正确回答"没找到"。
- **对比**：现有 BM25、纯向量检索、混合检索三种方式。
- **用途**：一是证明升级确实有效；二是标定两路的命中阈值。
- 结果以实测为准，文档中不预设任何数字。

---

## 12. 合规知识图谱：Neo4j【新增】

### 12.1 要解决的问题

运营上新品或开新站点时，经常要回答这些问题：

- 这个商品卖到这个国家，要满足哪些法规？
- 要准备哪些认证和文件？我们现在缺哪些、哪些快过期了？
- 某条法规更新了，影响哪些商品、哪些站点？

这些知识现在散落在知识库的几份文档里（GPSR、EPR，以及 CE、UKCA、FCC、CPSIA 认证概览）。靠检索文档，只能得到一段法规原文，没法直接得出"这个商品缺什么"这种结论。

### 12.2 图模型

**节点**：

| 标签 | 含义 | 示例 |
|---|---|---|
| `Product` | 商品，按 SKU 编码，不分站点 | EL-CHG-005 65W 氮化镓三口充电器 |
| `Category` | 品类，支持多层级 | 电子配件 → 消费电子 |
| `Attribute` | 触发法规的商品特征 | 市电供电、含锂电池、无线功能、接触食品、婴幼儿用品、带包装 |
| `Market` | 站点 | US、UK、DE、FR、IT、ES |
| `Region` | 区域 | EU（包含 DE、FR、IT、ES） |
| `Regulation` | 法规或认证要求 | GPSR、德国包装法 EPR、WEEE、CE（低电压和电磁兼容）、UKCA、FCC、CPSIA |
| `Document` | 需要准备的文件 | 欧盟符合性声明、检测报告、欧盟负责人信息、EPR 注册号、UN38.3 报告 |

**关系**：

```
(Product)-[:IN_CATEGORY]->(Category)-[:SUBCATEGORY_OF]->(Category)
(Product)-[:HAS_ATTRIBUTE]->(Attribute)
(Category)-[:HAS_ATTRIBUTE]->(Attribute)            品类的默认特征，例如家用电器默认市电供电
(Product)-[:LISTED_ON]->(Market)-[:IN_REGION]->(Region)
(Regulation)-[:APPLIES_IN]->(Market 或 Region)
(Regulation)-[:TRIGGERED_BY]->(Attribute 或 Category)
(Regulation)-[:REQUIRES {note}]->(Document)
(Regulation)-[:CITES]->(KbChunk {chunk_id})        指向知识库原文，用于回答时引用
(Product)-[:HOLDS {valid_until, file_ref}]->(Document)  已具备的文件
```

**约束**：

```cypher
CREATE CONSTRAINT product_sku IF NOT EXISTS FOR (p:Product) REQUIRE p.sku IS UNIQUE;
CREATE CONSTRAINT regulation_code IF NOT EXISTS FOR (r:Regulation) REQUIRE r.code IS UNIQUE;
CREATE CONSTRAINT document_code IF NOT EXISTS FOR (d:Document) REQUIRE d.code IS UNIQUE;
CREATE CONSTRAINT market_code IF NOT EXISTS FOR (m:Market) REQUIRE m.code IS UNIQUE;
```

### 12.3 核心查询

**查询 1：某商品在某站点需要哪些文件、缺什么，以及为什么需要**

```cypher
MATCH (m:Market {code: $market})-[:IN_REGION*0..1]->(scope)<-[:APPLIES_IN]-(r:Regulation)
MATCH path = (p:Product {sku: $sku})-[:IN_CATEGORY|SUBCATEGORY_OF|HAS_ATTRIBUTE*1..5]->(t)<-[:TRIGGERED_BY]-(r)
MATCH (r)-[:REQUIRES]->(d:Document)
OPTIONAL MATCH (p)-[h:HOLDS]->(d)
WITH r, d, h, collect([n IN nodes(path) | coalesce(n.name, n.sku)])[0] AS reason
RETURN r.code AS regulation, r.name AS regulation_name, d.name AS document, reason,
       CASE WHEN h IS NULL THEN '缺失'
            WHEN h.valid_until < date() THEN '已过期'
            ELSE '已具备' END AS status
ORDER BY status, regulation
```

- `[:IN_REGION*0..1]` 同时匹配"适用于德国"和"适用于欧盟"的法规。
- `[:IN_CATEGORY|SUBCATEGORY_OF|HAS_ATTRIBUTE*1..5]` 一条可变长度的路径，同时覆盖三种触发方式：商品自身特征、所属品类及上级品类、品类的默认特征。
- 返回的 `reason` 就是推理路径，例如"65W 充电器 → 电子配件 → 市电供电 → 低电压指令"，可以直接展示在页面上作为依据。

**查询 2：法规更新的影响分析（反向查询）**

```cypher
MATCH (r:Regulation {code: $code})-[:APPLIES_IN]->(scope)
MATCH (m:Market)-[:IN_REGION*0..1]->(scope)
MATCH (p:Product)-[:LISTED_ON]->(m)
WHERE EXISTS { (p)-[:IN_CATEGORY|SUBCATEGORY_OF|HAS_ATTRIBUTE*1..5]->()<-[:TRIGGERED_BY]-(r) }
RETURN m.code AS market, collect(p.sku) AS affected_skus
```

**查询 3：某站点所有商品的文件缺口清单**：在查询 1 的基础上去掉 SKU 条件，按商品汇总状态为"缺失"和"已过期"的文件，用于上新前检查和定期巡检。

### 12.4 用同样的需求写 SQL 对比（用来说明为什么选图数据库）

用 MySQL 也能做：品类层级用递归 CTE 展开，触发条件用三个子查询 UNION 起来，再关联站点、区域、法规、文件，最后左关联已有文件。大约要 6 到 8 张表关联，而且"返回推理路径"需要在递归里拼字符串。

**结论要说得客观**：

- 在当前的数据规模下，MySQL 的性能完全没问题，选 Neo4j **不是为了性能**；
- 而是因为查询本身是路径形态：要返回"为什么需要"的路径，要做反向影响分析，以后还要接入供应商、工厂、检测机构、检测报告等关系。用图来建模，加关系不需要改表结构，查询也更直观；
- 代价是多维护一个组件，还要做数据同步。如果团队不想多一个库，可以用 MySQL 递归查询实现，对外的接口不变。

### 12.5 数据来源和维护

- **源数据存在 MySQL**（`compliance_regulations`、`compliance_rules`、`sku_attributes`、`sku_documents`），Neo4j 是由它们生成的图。备份、审计和回滚都只需要管 MySQL。
- **维护方式**：管理员下载 Excel 模板，按"法规、触发条件、所需文件、商品特征、已具备文件"几张工作表填写后导入；导入成功后登记 `graph_sync` 任务。
- **商品节点**：ERP 同步或导入商品后自动同步商品、品类和上架站点。
- **同步方式**：图很小（几十个商品、几十条法规），每次同步在一个事务里删除旧的再重建，用 `MERGE` 保证重复执行结果不变。数据量变大后再改为增量同步。
- **可选的大模型辅助**：让大模型从知识库的法规文档中抽取"法规—触发条件—所需文件"候选规则，人工审核后才能导入，不直接写入图谱。

### 12.6 接入系统

- **问答工具** `check_product_compliance(sku, marketplace)`：返回查询 1 的结果，以及每条法规关联的知识库片段编号。大模型组织回答时按缺失、已过期、已具备分组，引用法规原文，结尾提示"以官方最新规定为准"。
- **商品详情页**新增"合规"标签：按站点列出所需文件和状态，并展示推理路径。
- **图谱不可用时**：工具返回"合规图谱暂不可用"，问答退回到知识库检索，回答时说明结论来自文档检索，而不是逐项核对。

### 12.7 风险说明

- 法规内容会变化，图谱里的规则是简化后的，**只作为运营自查的辅助，不构成合规意见**。页面和回答都要明确提示。
- 规则的准确性取决于人工维护。每条法规都记录"最后核对日期"和来源片段，超过一定时间未核对的在页面上提示。

---

## 13. 多个存储之间的一致性

**原则**：MySQL 是唯一的事实来源；Milvus 和 Neo4j 是派生数据，可以从 MySQL 全量重建。

| 问题 | 做法 |
|---|---|
| 写 MySQL 成功、同步到 Milvus 或 Neo4j 失败 | **事务性发件箱**：业务数据和"同步任务"在同一个 MySQL 事务里写入，要么都成功，要么都失败；worker 负责把任务应用到 Milvus 或 Neo4j，失败就重试 |
| 重试导致重复写入 | 所有同步操作都写成重复执行结果不变：Milvus 按切片 ID upsert，Neo4j 用 `MERGE` |
| 长期运行后数据有偏差 | 管理员可以一键"重建索引"；另外定期比对 MySQL 和 Milvus 的切片 ID 集合 |
| 读到已删除的数据 | 检索结果按 ID 回 MySQL 取原文，取不到就丢弃 |
| Milvus 或 Neo4j 宕机 | 问答和客服降级为关键词检索；合规查询提示暂不可用；核心的补货和工单功能不受影响 |
| 备份 | 只需定期备份 MySQL；Milvus 和 Neo4j 丢了可以重建 |

**为什么不在接口里直接"写 MySQL，再写 Milvus"**：这种"双写"在第二步失败时没法回滚第一步，而且接口进程随时可能重启，两边会永久不一致。发件箱把"要同步什么"可靠地记在 MySQL 里，worker 重启后还能继续执行。

---

## 14. 前端改造

- **保留现有的 Next.js 页面和组件**，删除 `src/app/api/` 下的路由和所有数据库代码，新增一个调用 FastAPI 的客户端模块。
- **服务端组件**通过内部网络地址调用 FastAPI（例如 `http://api:8000`），并转发浏览器的 Cookie；**客户端组件**直接请求同域名下的 `/api/...`，由 Nginx 转发。前后端同一个域名，不需要处理跨域，Cookie 也能正常携带。
- **类型共享**：现在前后端共享 TypeScript 类型。改造后用 `openapi-typescript` 从 FastAPI 自动生成的接口文档生成前端类型，接口改了，前端重新生成类型后，类型检查就能发现不匹配。
- **新增页面**：登录页；设置页的"账号管理"；商品详情页的"合规"标签；知识库文档的"入库状态"。
- **否决方案**：改写成 Vite 单页应用。页面要全部重写，收益不大。

---

## 15. 部署

### 15.1 服务清单（Docker Compose）

| 服务 | 镜像 | 说明 |
|---|---|---|
| `nginx` | nginx | 唯一对外开放 80 和 443 端口；配置 HTTPS 证书 |
| `web` | Node | Next.js 生产模式 |
| `api` | Python | `uvicorn app.main:app --workers 2` |
| `worker` | 与 api 同一个镜像 | `python -m app.worker` |
| `migrate` | 与 api 同一个镜像 | `alembic upgrade head`，执行完就退出；api 和 worker 等它成功后再启动 |
| `mysql` | mysql:8.0 | 数据卷持久化 |
| `milvus` | Milvus Standalone | 官方的单机部署方式还要带 etcd（存元数据）和 MinIO（存数据文件）两个服务 |
| `neo4j` | neo4j:5-community | 管理界面端口不对外开放，需要时通过 SSH 隧道访问 |
| `embedding`（可选） | Python | 本地部署 BGE-M3 时才需要 |

### 15.2 服务器配置

- 粗略估计：向量模型走接口时，至少需要 4 核 8G；本地部署 BGE-M3 时建议 16G 内存。Milvus、Neo4j、MySQL 都会预留内存，三者加起来是主要开销。
- 以上是估计，上线前要按实际数据量压测。【待验证】
- 本地开发也用同一份 Docker Compose。Milvus Lite 是轻量版，官方定位是原型和小规模本地使用，与正式版的行为和功能有差异，所以开发、测试和生产都用 Standalone，保持一致。

### 15.3 密钥和安全

- 密钥写在服务器上的 `.env` 文件里，不提交到代码仓库。仓库里只放不含真实值的 `.env.example`。
- 需要的密钥：大模型密钥、ERP 账号和证书指纹、JWT 签名密钥、MySQL、Neo4j 和 MinIO 的密码。
- 数据库端口都不对外开放，只在 Docker 内部网络里互相访问。
- 健康检查接口 `/api/health` 分别检查 MySQL、Milvus、Neo4j 的连接，并报告各自的状态。

### 15.4 备份

- 每天备份一次 MySQL（`mysqldump`，或者用云厂商托管 MySQL 的自动备份），保留 7 天。
- Milvus 和 Neo4j 不需要备份，可以从 MySQL 重建。这是"派生数据"原则带来的直接好处。

---

## 16. 测试和评测

| 层次 | 做法 |
|---|---|
| 单元测试 | 现有 39 个测试逐个改写成 pytest，用例和期望值完全不变 |
| **对拍测试** | 用现有 TypeScript 版本对示例数据跑一遍，导出全部 SKU 的补货计划、断货推断、时效中位数、分流结果、合规检查结果，存为 JSON；Python 版本对同样的输入计算，逐项比对必须完全一致。专门用来发现四舍五入、正则、日期这类移植差异 |
| 接口测试 | httpx 的 `AsyncClient` + `ASGITransport` 直接调用应用，不启动服务；覆盖权限矩阵：每个接口用三种角色和未登录状态各调用一次 |
| 集成测试 | testcontainers 启动 MySQL、Neo4j、Milvus；用 respx 或模拟 ERP 服务跑完整同步，验证失败回滚和心跳恢复 |
| 检索评测 | 见 11.7 |
| 合规查询测试 | 构造一个小图谱，验证查询 1、2、3 的结果，尤其是品类继承、区域包含、文件过期这三种情况 |
| 大模型评测 | 仍是缺口：分类和回复的评测集列为二期，列为二期 |

---

## 17. 日志和监控

- 用结构化日志，每个请求带请求 ID，worker 任务带任务 ID，方便串起一次请求的完整过程。
- 记录每次大模型调用的耗时、令牌数和工具调用次数，用于估算成本。
- 日志里不记录密钥、令牌、客户邮箱和消息原文。
- 开启 MySQL 慢查询日志。

---

## 18. 实施步骤

每一步都有可以验证的验收标准，前一步通过再做下一步：

| 步骤 | 内容 | 验收标准 |
|---|---|---|
| 1 | 后端骨架：FastAPI、MySQL、Alembic、登录、权限 | 权限矩阵测试全部通过 |
| 2 | 纯函数移植 | 39 个单元测试和对拍测试全部一致 |
| 3 | 业务接口：库存、补货、设置、导入、工单、问答（先用内存 BM25），前端切换到新接口 | 页面功能与 TypeScript 版本一致 |
| 4 | 后台任务和 ERP 同步 | 用模拟 ERP 跑通完整同步；故意制造失败，验证回滚；强行结束 worker，验证心跳恢复 |
| 5 | Milvus 混合检索 | 在评测集上与 BM25 基线对比，结果写进文档 |
| 6 | Neo4j 合规图谱、问答工具、商品页合规标签 | 示例商品的查询结果人工逐项核对 |
| 7 | 部署、HTTPS、备份 | 从空服务器按文档能完整部署；从备份恢复 MySQL 后能重建索引和图谱 |

---

## 19. 风险和取舍

| 风险 | 影响 | 应对 |
|---|---|---|
| 组件变多（MySQL、Milvus 及其依赖、Neo4j、worker） | 运维成本和服务器费用上升，故障点变多 | Milvus 和 Neo4j 可重建、可降级，宕机不影响核心功能 |
| 三个存储的数据不一致 | 检索到已删除的内容，图谱和商品数据对不上 | 发件箱、操作可重复执行、按 ID 回 MySQL 取数据、一键重建 |
| 算法移植出现细微差异 | 补货数量和现在差 1 件、合规检查漏判 | 对拍测试 |
| 异步代码里误用同步调用 | 一个慢请求拖慢所有请求 | 代码审查清单；CPU 计算和同步库放到线程池或 worker |
| MySQL 的 DDL 不能回滚 | 迁移失败后表结构处于半完成状态 | 每个迁移只做一件事，写成可重复执行；上线前在备份数据上演练 |
| 合规规则不准确或过时 | 误导运营决策 | 明确提示只作为辅助；记录核对日期；规则需要人工审核才能导入 |
| 单台服务器 | 服务器故障时整个系统不可用 | 内部工具可以接受；MySQL 改用云托管版并开启自动备份 |

---
