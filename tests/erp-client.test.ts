import { describe, expect, it } from "vitest";
import { ErpClient, type ErpConfig } from "@/lib/erp/client";

const config: ErpConfig = { baseUrl: new URL("https://erp.example.test/"), username: "u", password: "p", fingerprint: null };

/** Serves `total` numbered rows from memory instead of the network. */
class FakeErp extends ErpClient {
  requests: { offset: number; length: number }[] = [];
  constructor(
    private readonly total: number,
    private readonly opts: { cap?: number; ignoreOffset?: boolean; reportTotal?: boolean } = {},
  ) {
    super(config);
  }
  override async post(_path: string, body: unknown) {
    const { offset, length } = body as { offset: number; length: number };
    this.requests.push({ offset, length });
    const from = this.opts.ignoreOffset ? 0 : offset;
    const size = Math.min(length, this.opts.cap ?? length);
    const rows = Array.from({ length: Math.max(0, Math.min(size, this.total - from)) }, (_, i) => ({ n: from + i }));
    return { code: 0, data: rows, ...(this.opts.reportTotal === false ? {} : { total: this.total }) };
  }
}

const pick = (json: unknown) => {
  const j = json as { data: { n: number }[]; total?: number };
  return { rows: j.data, total: j.total };
};

describe("ErpClient.paginate", () => {
  it("keeps paging by rows actually returned when the server caps the page size", async () => {
    const erp = new FakeErp(1200, { cap: 500 });
    const rows = await erp.paginate<{ n: number }>("orders", {}, { pageSize: 1000, pick });
    expect(rows).toHaveLength(1200);
    expect(rows.at(-1)?.n).toBe(1199);
    expect(erp.requests.map((r) => r.offset)).toEqual([0, 500, 1000]);
    expect(erp.fetchStats.orders).toMatchObject({ fetched: 1200, total: 1200, pages: 3, done: true });
  });

  it("stops on a short page when the server reports no total", async () => {
    const erp = new FakeErp(250, { reportTotal: false });
    const rows = await erp.paginate("orders", {}, { pageSize: 100, pick });
    expect(rows).toHaveLength(250);
    expect(erp.requests).toHaveLength(3);
  });

  it("fails fast when the server ignores the offset", async () => {
    const erp = new FakeErp(5000, { ignoreOffset: true });
    await expect(erp.paginate("orders", {}, { pageSize: 100, pick })).rejects.toThrow("没有按 offset 翻页");
    expect(erp.requests).toHaveLength(2);
  });
});
