export type Scenario = "stockout" | "stockout_domestic" | "reorder" | "healthy" | "excess" | "excess_aged";

export type SampleProduct = {
  sku: string;
  name: string;
  category: string;
  owner: string;
  usDaily: number;
  unitCost: number;
  casePack: number;
  moq: number;
  season: "summer" | "winter" | "none";
  markets: Partial<Record<"US" | "UK" | "DE" | "FR" | "IT" | "ES", Scenario>>;
};

export const MARKET_MULTIPLIER: Record<string, number> = {
  US: 1,
  UK: 0.4,
  DE: 0.45,
  FR: 0.25,
  IT: 0.2,
  ES: 0.2,
};

export const SAMPLE_PRODUCTS: SampleProduct[] = [
  { sku: "HK-BOT-001", name: "不锈钢真空保温杯 750ml", category: "家居厨房", owner: "张婷", usDaily: 45, unitCost: 32, casePack: 24, moq: 480, season: "none", markets: { US: "healthy", UK: "reorder", DE: "healthy" } },
  { sku: "HK-ORG-002", name: "可折叠布艺收纳箱 3 件套", category: "家居收纳", owner: "张婷", usDaily: 30, unitCost: 45, casePack: 10, moq: 300, season: "none", markets: { US: "healthy", DE: "healthy", FR: "excess_aged" } },
  { sku: "PT-BED-003", name: "宠物冷感垫 L 号", category: "宠物用品", owner: "王磊", usDaily: 6, unitCost: 38, casePack: 20, moq: 300, season: "summer", markets: { US: "excess", UK: "excess", DE: "healthy", IT: "healthy" } },
  { sku: "OD-CMP-004", name: "USB-C 充电露营灯", category: "户外运动", owner: "王磊", usDaily: 18, unitCost: 41, casePack: 20, moq: 300, season: "none", markets: { US: "reorder", DE: "healthy", ES: "healthy" } },
  { sku: "EL-CHG-005", name: "65W 氮化镓三口充电器", category: "电子配件", owner: "李航", usDaily: 60, unitCost: 58, casePack: 50, moq: 1000, season: "none", markets: { US: "stockout", UK: "healthy", DE: "reorder", FR: "healthy", IT: "healthy", ES: "healthy" } },
  { sku: "EL-CBL-006", name: "USB-C 编织数据线 2m 双支装", category: "电子配件", owner: "李航", usDaily: 80, unitCost: 12, casePack: 100, moq: 2000, season: "none", markets: { US: "stockout_domestic", UK: "healthy", DE: "healthy" } },
  { sku: "HK-KNF-007", name: "德式不锈钢刀具 6 件套", category: "家居厨房", owner: "张婷", usDaily: 12, unitCost: 85, casePack: 8, moq: 200, season: "none", markets: { US: "healthy", DE: "excess" } },
  { sku: "SP-YOG-008", name: "TPE 双面防滑瑜伽垫 6mm", category: "户外运动", owner: "陈静", usDaily: 35, unitCost: 36, casePack: 12, moq: 300, season: "none", markets: { US: "healthy", UK: "healthy", DE: "reorder", FR: "healthy" } },
  { sku: "BY-TTH-009", name: "食品级硅胶婴儿牙胶", category: "母婴用品", owner: "陈静", usDaily: 20, unitCost: 9, casePack: 100, moq: 1000, season: "none", markets: { US: "healthy", UK: "healthy" } },
  { sku: "HG-HUM-010", name: "静音迷你加湿器 300ml", category: "家用电器", owner: "李航", usDaily: 40, unitCost: 48, casePack: 24, moq: 500, season: "winter", markets: { US: "stockout", DE: "reorder", FR: "healthy" } },
  { sku: "HG-HTR-011", name: "充电式暖手宝 10000mAh", category: "家用电器", owner: "李航", usDaily: 30, unitCost: 26, casePack: 40, moq: 500, season: "winter", markets: { US: "reorder", UK: "stockout_domestic", DE: "healthy" } },
  { sku: "OD-FAN-012", name: "便携挂脖风扇", category: "户外运动", owner: "王磊", usDaily: 3, unitCost: 22, casePack: 50, moq: 500, season: "summer", markets: { US: "excess", DE: "excess", IT: "excess", ES: "healthy" } },
  { sku: "PT-FDR-013", name: "智能自动喂食器 4L", category: "宠物用品", owner: "王磊", usDaily: 10, unitCost: 120, casePack: 6, moq: 100, season: "none", markets: { US: "healthy", UK: "healthy", DE: "healthy" } },
  { sku: "HK-LMP-014", name: "RGB LED 氛围灯带 5m", category: "家居装饰", owner: "张婷", usDaily: 40, unitCost: 30, casePack: 40, moq: 500, season: "none", markets: { US: "healthy", DE: "healthy", FR: "reorder", ES: "healthy" } },
];

export function scenarioDays(scenario: Scenario, leadTime: number, seaLead: number) {
  switch (scenario) {
    case "stockout":
      return { sellable: Math.round(seaLead * 0.55), domestic: 0, production: 0, aged: 0 };
    case "stockout_domestic":
      return { sellable: Math.round(seaLead * 0.4), domestic: leadTime, production: 0, aged: 0 };
    case "reorder":
      return { sellable: leadTime - 5, domestic: 0, production: 12, aged: 0 };
    case "healthy":
      return { sellable: leadTime + 20, domestic: 20, production: 15, aged: 0 };
    case "excess":
      return { sellable: 180, domestic: 70, production: 0, aged: 0.3 };
    case "excess_aged":
      return { sellable: leadTime + 30, domestic: 15, production: 0, aged: 0.4 };
  }
}
