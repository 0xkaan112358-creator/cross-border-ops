# 跨境运营助手（一期）

面向跨境电商公司内部使用的运营工具，覆盖 Amazon 美国站和欧洲站（英、德、法、意、西），重点解决三件事：

- **补货**：按 SKU × 站点计算可售天数、全部库存天数和补货建议（下单量、国内仓发货、空运衔接），自动剔除断货日、计入大促系数，并给出中文解释。计划员确认数量时，偏离建议超过 20% 需要填写原因。
- **查询**：智能问答可以直接问库存、在途货件，以及平台规则、EPR、GPSR、认证等跨境合规标准。回答会标注数据和知识库来源。
- **客服分拣**：AI 识别客户消息的语言、问题类型、情绪和紧急程度。物流查询、产品使用这类简单问题由 AI 起草回复；退换货、质量投诉、差评威胁、情绪激动或置信度低的消息转人工。发送前会做话术合规检查（禁止索要好评、以利益换评价、站外引流等）。

数据可以从 ERP 一键同步（领星风格接口），也可以通过 Excel/CSV 导入。一期不对接亚马逊消息接口，客服回复采用“复制并标记已回复”的方式发送。

需求分析和产品需求文档在 [docs/](./docs/README.md) 目录。

## 本地运行

需要 Node.js 20 及以上版本。

```bash
npm install
npm run dev
```

打开 <http://localhost:3747>。首次访问时会在 `.data/pglite` 创建本地数据库，并写入示例数据（14 款产品、47 个 SKU × 站点、12 封客户消息、9 份示例资料）。

运行单元测试（补货算法、断货推断、客服分流、ERP 数据映射和翻页）：

```bash
npm test
```

- 删除 `.data/` 目录可以完全重置本地数据，也可以在“数据导入”页恢复示例数据或清空业务数据。
- 本地开发时，登录用户是 `cursor/identity.dev.ts` 中的模拟管理员。

## 接入大模型

不配置大模型时，应用以**模拟模式**运行：问答、分类和回复都由规则与模板生成，可以完整体验流程，但只能识别常见说法。配置以下环境变量后，会自动切换为大模型：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `LLM_API_KEY` | 模型服务的 API Key | 无（模拟模式） |
| `LLM_BASE_URL` | 兼容 OpenAI 接口的地址 | `https://api.deepseek.com` |
| `LLM_MODEL` | 模型名称 | `deepseek-chat` |

国产模型的常见配置如下。模型名称和地址可能更新，请以各家官方文档为准：

- DeepSeek：`LLM_BASE_URL=https://api.deepseek.com`，`LLM_MODEL=deepseek-chat`
- 通义千问（阿里云百炼兼容模式）：`LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`，`LLM_MODEL=qwen-plus`
- 智谱：`LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4`，`LLM_MODEL=glm-4-plus`

## 对接 ERP

配置以下环境变量后，管理员可以在“数据导入”页点“立即同步”，从 ERP 拉取产品、库存、采购待到货、在途货件和近 60 天订单。未配置时继续使用示例数据或表格导入。

| 变量 | 说明 |
| --- | --- |
| `ERP_BASE_URL` | ERP 接口地址，例如 `https://erp.example.com/lingxing-erp` |
| `ERP_USERNAME` | ERP 管理员账号 |
| `ERP_PASSWORD` | ERP 管理员密码 |
| `ERP_TLS_FINGERPRINT` | ERP 使用自签名证书时填写证书的 SHA-256 指纹，系统只信任这张证书 |

可以用下面的命令查看服务器证书的指纹：

```bash
echo | openssl s_client -connect erp.example.com:443 2>/dev/null | openssl x509 -noout -fingerprint -sha256
```

首次同步会清空示例业务数据。接口与数据的对应关系、同步规则和已知限制见 [docs/04-erp-integration.md](./docs/04-erp-integration.md)。

本地没有 ERP 账号时，可以先启动模拟 ERP 再启动应用：

```bash
npm run mock-erp
ERP_BASE_URL=http://127.0.0.1:19437 ERP_USERNAME=mock-admin ERP_PASSWORD=mock-pass npm run dev
```

## 导入公司数据

在“数据导入”页下载模板，或直接上传从领星、积加等 ERP 导出的表格。表头支持中英文常见写法。建议按以下顺序导入：

1. SKU 主数据：箱规、起订量、生产和头程时效。
2. 库存快照：FBA 可售、入库中、在途、海外仓、国内仓、在产。
3. 每日销量：至少最近 30 天，需注明断货日。
4. 在途货件。
5. 订单物流：客服回复物流查询时使用。
6. 客服消息。

知识库支持上传 PDF、Word（.docx）、Markdown 和 TXT。内置的示例资料仅作演示，正式使用前请替换为公司核实过的版本。

## 角色

| 角色 | 权限 |
| --- | --- |
| 普通员工（默认） | 查库存、看补货计划、确认补货、使用智能问答和知识库 |
| 客服 | 以上权限，加上处理客服工单、导入客户消息 |
| 管理员 | 全部权限，包括数据导入、知识库管理、参数设置和成员角色 |

Cursor 团队管理员自动成为管理员。其他成员由管理员在“设置 > 成员角色”中按邮箱指定。

## 技术说明

- Next.js 16（App Router）、TypeScript、Tailwind CSS、shadcn/ui。
- 数据库：设置了 `DATABASE_URL` 时使用 Postgres，否则使用本地 PGlite。表结构在 `migrations/` 中，构建时由 `scripts/migrate.mjs` 执行迁移。
- 补货计算在 `src/lib/replenishment.ts`，是纯函数，便于单独校验。
- 知识库检索使用 BM25（中文按双字切分）。一期没有使用向量检索，资料量较大时可以升级为 pgvector。
