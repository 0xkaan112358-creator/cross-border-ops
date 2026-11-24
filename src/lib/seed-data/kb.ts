export type SampleDoc = { title: string; category: string; content: string };

const NOTE = "> 示例文档：用于演示知识库问答，内容为通用要点整理，具体要求请以平台后台、官方机构的最新公告为准。";

export const SAMPLE_DOCS: SampleDoc[] = [
  {
    title: "Amazon FBA 库存与入库管理要点",
    category: "平台规则",
    content: `${NOTE}

# 库容限制
FBA 按店铺分配库容（Capacity Limits），以立方英尺/立方米计，通常按月更新。库容不足时新的入库计划无法创建，旺季前要提前规划发货节奏。库存绩效指标（IPI）和销售表现会影响库容分配。

# 入库配置费
创建入库计划时，如果选择"最少分仓"，亚马逊会收取入库配置服务费；选择亚马逊优化的多仓分配可以降低或免除这项费用，但需要把货发往多个仓库。是否值得分仓，要比较头程分仓的额外成本和配置费。

# 超龄库存附加费
在 FBA 仓库存放超过一定天数（目前从 181 天起分档）的库存会被收取超龄库存附加费，库龄越长费率越高。建议每月检查超龄库存，对库龄超过 150 天的商品提前安排促销、移除或弃置。

# 断货的影响
断货期间 Listing 无法产生销量，自然排名和广告权重都会下降；恢复到货后通常需要额外的广告投入才能找回排名。对于头部 SKU，宁可用空运小批量衔接，也要尽量避免断货。

# 入库时效
FBA 收货上架时间受季节影响明显。平时一般为 1～2 周，Q4 旺季可能延长到 3 周以上。补货计划中的"上架时效"在旺季前应适当调高。`,
  },
  {
    title: "Amazon 买家消息沟通规范",
    category: "平台规则",
    content: `${NOTE}

# 回复时效
买家消息需要在 24 小时内回复（包含周末和节假日），回复时效会体现在账户健康的客户服务指标中。对于不需要回复的消息，可以使用"标记为无需回复"。

# 禁止的内容
- 索要好评，或以退款、折扣、赠品等利益换取评价
- 包含外部网站链接（完成订单所需的安全链接除外）
- 引导买家到亚马逊以外的渠道沟通或交易，例如提供个人邮箱、电话、WhatsApp 等
- 营销和促销信息，例如推荐其他商品、发放优惠券
- 附带公司 Logo 以外的营销图片

# 允许的消息
解决订单问题、确认定制信息、安排配送、发送发票、回复买家的产品问题等与订单履约直接相关的沟通。

# 处理建议
回复要简洁、礼貌，直接回应买家的问题；涉及退款、补发时说明具体处理方式和时间；不要承诺无法兑现的时效。`,
  },
  {
    title: "欧盟 GPSR 通用产品安全法规要点",
    category: "认证标准",
    content: `${NOTE}

# 适用范围
欧盟《通用产品安全法规》（GPSR，Regulation (EU) 2023/988）自 2024 年 12 月 13 日起适用，覆盖在欧盟市场销售的大多数非食品消费品，包括通过电商平台销售的商品。

# 欧盟境内负责人
非欧盟制造商在欧盟销售产品，需要指定一个位于欧盟境内的经济经营者（如欧盟负责人、进口商等）承担产品安全相关责任。其名称和联系方式需要标注在产品、包装或随附文件上。

# 标签与信息要求
- 制造商名称、注册商号或商标、邮寄地址和电子联系方式
- 欧盟负责人的名称和联系方式
- 产品型号、批次或序列号等识别信息
- 必要的警示和安全信息，使用销售国的官方语言

# 线上销售展示
在电商平台的商品页面上，也需要展示制造商信息、欧盟负责人信息、产品识别信息和警示信息。亚马逊等平台已在后台提供相应的填写字段。

# 技术文件与事故报告
制造商需要进行内部风险分析并保存技术文件；发现产品存在安全事故时，需要通过欧盟 Safety Business Gateway 进行通报。`,
  },
  {
    title: "欧洲 EPR 生产者延伸责任概览",
    category: "认证标准",
    content: `${NOTE}

# 什么是 EPR
生产者延伸责任（EPR）要求把商品投放到当地市场的企业，对包装、电子电气设备、电池等废弃物的回收处理承担责任，通常需要在当地注册并按投放量申报、缴纳回收费用。

# 德国
- 包装：需要在 LUCID 系统注册，并与双元回收系统签约申报包装量
- 电子电气设备：需要在 stiftung ear 注册获取 WEEE 注册号
- 电池：需要按电池法规完成注册
亚马逊德国站要求卖家提供相应品类的 EPR 注册号，否则可能限制销售。

# 法国
法国 EPR 涵盖的品类较多，包括包装、电子电气设备、电池、家具、纺织品、纸张、玩具、运动休闲用品等。每个品类都需要通过对应的生态组织注册，取得唯一识别码（UIN）。

# 其他国家
西班牙、意大利等国也在逐步落实包装等品类的 EPR 要求，进入新站点前应确认当地的注册要求。

# 带电产品提醒
充电器、露营灯、暖手宝等带电或含电池的产品，通常同时涉及电子电气设备和电池两类 EPR，需要分别注册。`,
  },
  {
    title: "CE / UKCA / FCC / CPSIA 认证概览",
    category: "认证标准",
    content: `${NOTE}

# CE（欧盟）
CE 标志表示产品符合适用的欧盟指令或法规。常见的有：低电压指令（LVD，适用于交流 50～1000V 的电气产品，如充电器）、电磁兼容指令（EMC）、无线电设备指令（RED，适用于带蓝牙/Wi-Fi 的产品）、有害物质限制指令（RoHS）。制造商需要准备技术文件并签署欧盟符合性声明（DoC）。

# UKCA（英国）
英国脱欧后推出了 UKCA 标志。英国政府已宣布在多数产品领域继续认可 CE 标志，在英国站销售前请以 GOV.UK 的最新指引为准，确认产品可以使用 CE 还是需要 UKCA。

# FCC（美国）
带无线功能的产品（有意发射设备，如蓝牙产品）需要进行 FCC ID 认证；不带无线功能但有电子电路的产品（如充电器、LED 灯带）通常适用 SDoC（供应商符合性声明）程序。

# CPSIA / CPC（美国儿童产品）
面向 12 岁及以下儿童的产品（如婴儿牙胶）属于儿童产品，需要在 CPSC 认可的第三方实验室检测，并出具儿童产品证书（CPC）。产品和包装上通常还需要永久性的追踪标签。

# 加州 65 号提案
如果产品含有加州 65 号提案清单上的化学物质且可能导致暴露，向加州消费者销售时需要提供警示。`,
  },
  {
    title: "头程物流与清关常识",
    category: "物流关务",
    content: `${NOTE}

# 运输方式与参考时效
以下为从中国发货到亚马逊仓库的大致范围，实际时效受船期、港口拥堵、旺季等影响：
- 美国海运（普船）：约 30～45 天到仓
- 美国海运（快船，如美森等）：约 18～28 天到仓
- 欧洲海运：约 40～55 天到仓
- 中欧铁路（卡航/铁路）：约 25～40 天到仓
- 空运 / 快递：约 7～15 天到仓
上架时效需另外计算，平时 1～2 周，旺季更长。

# 选择原则
- 常规补货优先海运，成本最低
- 断货风险高的头部 SKU，用空运小批量衔接海运到货前的缺口
- 欧洲站可以考虑铁路，时效和成本介于海运和空运之间

# 清关基本文件
商业发票、装箱单、提单/运单，以及必要的产品认证文件。美国进口需要有进口商（IOR）；欧盟进口需要 EORI 号，增值税（VAT）按目的国规则处理。

# HS 编码
HS 编码决定关税税率和监管条件，申报错误可能导致补税、罚款或扣货。新品首次发货前应与货代确认 HS 编码和适用税率。`,
  },
  {
    title: "Product FAQ for Customer Service",
    category: "产品资料",
    content: `> 示例文档：客服常见问题的英文标准答案，可直接用于回复参考。

# 65W GaN Charger (EL-CHG-005)
Q: Can I charge a laptop and a phone at the same time?
A: Yes. The charger has 2 USB-C ports and 1 USB-A port. When a single USB-C port is used it delivers up to 65W, enough for a MacBook Air or most 13-14 inch laptops. When two USB-C devices are connected, power is shared automatically (typically 45W + 20W), so the laptop charges a little slower while the phone still fast-charges.
Q: Is it safe to use while travelling?
A: Yes. It supports 100-240V input and has over-current, over-voltage and temperature protection. Use a plug adapter where needed.

# Stainless Steel Water Bottle 750ml (HK-BOT-001)
Q: How long does it keep drinks hot or cold?
A: About 12 hours hot and 24 hours cold when the lid is fully closed.
Q: Is it dishwasher safe?
A: The bottle body should be hand washed to protect the vacuum insulation and the coating. The lid can go on the top rack of a dishwasher.

# Camping Lantern (OD-CMP-004)
Q: How do I charge it and how long does it last?
A: Charge via the USB-C port; a full charge takes about 4 hours. It runs about 8 hours on high and up to 40 hours on low.
Q: The lantern does not turn on.
A: Please charge it for at least 30 minutes first, then hold the power button for 3 seconds. If it still does not work, contact us with your order ID so we can help.

# TPE Yoga Mat 6mm (SP-YOG-008)
Q: Is it non-slip for hot yoga?
A: The textured surface is non-slip in most conditions. For hot yoga with heavy sweating we recommend using a yoga towel on top.
Q: How do I clean it?
A: Wipe with a damp cloth and mild soap, then air dry away from direct sunlight. Do not machine wash.

# LED Strip Lights 5m (HK-LMP-014)
Q: Can the strip be cut?
A: Yes, it can be cut along the marked cutting lines (every 3 LEDs). The part after the cut will no longer be powered unless reconnected with a connector.
Q: How do I clean it?
A: Unplug first, then gently wipe with a dry or slightly damp cloth. Do not submerge it in water.

# Rechargeable Hand Warmer (HG-HTR-011)
Q: One side feels warmer than the other. Is that normal?
A: A small difference is normal because the heating element sits closer to one side. A large difference or overheating is not normal; please stop using it and contact us with your order ID.`,
  },
  {
    title: "客服售后处理 SOP",
    category: "公司SOP",
    content: `> 示例文档：请根据公司实际流程修改。

# 分类处理原则
- 物流查询：查询订单物流状态后直接回复，给出承运商、追踪号和预计送达时间
- 物流显示已签收但客户称未收到：转人工，先请客户确认收货地址和周边，再联系承运商调查，必要时补发
- 产品使用咨询：优先引用《Product FAQ》中的标准答案
- 退换货：按平台退货政策处理，客服在后台授权退货
- 质量投诉：转人工，收集照片或视频，判断补发或退款
- 索赔、差评威胁：紧急转人工，由主管当天处理

# 退款与补发权限
- 订单金额 30 美元/欧元以下：客服可直接全额退款或补发
- 30～100 美元/欧元：需要客服主管审批
- 100 美元/欧元以上：需要运营负责人审批

# 话术要求
- 24 小时内首次回复
- 不得在消息中索要好评，不得提供站外联系方式
- 先致歉、再说明处理方案和时间，避免推卸责任

# 差评处理
差评出现后 24 小时内联系买家了解原因并解决问题，不得以退款换取删评。`,
  },
  {
    title: "补货与发货 SOP",
    category: "公司SOP",
    content: `> 示例文档：请根据公司实际流程修改。

# 补货节奏
- 每周一上午由计划员在系统中查看补货建议，确认下单数量
- 偏离系统建议超过 20% 时，需要填写调整原因
- 采购在周二前向工厂下单，财务按补货计划安排付款

# 运输方式选择
- 默认海运；断货风险 SKU 由运营负责人决定是否空运衔接
- 空运数量原则上只覆盖海运到货前的缺口，不做常规补货

# 旺季备货
- Q4 旺季（黑五、圣诞）的货需在 9 月底前发出海运
- 大促前在"设置 > 促销日历"中维护大促系数，系统会自动按系数提高预测

# 冗余库存处理
- 库龄超过 150 天的 SKU 每月评估一次，优先站内促销
- 多站点之间可以评估调拨，调拨成本高于清货损失时选择清货或移除`,
  },
];
