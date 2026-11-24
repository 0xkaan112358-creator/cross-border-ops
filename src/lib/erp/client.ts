import "server-only";
import http from "node:http";
import { isIP } from "node:net";
import https from "node:https";
import tls from "node:tls";

export type ErpConfig = {
  baseUrl: URL;
  username: string;
  password: string;
  fingerprint: string | null;
};

export function readErpConfig(): ErpConfig | null {
  const base = process.env.ERP_BASE_URL?.trim();
  const username = process.env.ERP_USERNAME?.trim();
  const password = process.env.ERP_PASSWORD ?? "";
  if (!base || !username || !password) return null;
  const baseUrl = new URL(base.endsWith("/") ? base : `${base}/`);
  const fp = process.env.ERP_TLS_FINGERPRINT?.trim();
  return { baseUrl, username, password, fingerprint: fp ? normalizeFingerprint(fp) : null };
}

export function describeErpConfig() {
  const config = readErpConfig();
  if (!config) {
    const missing = ["ERP_BASE_URL", "ERP_USERNAME", "ERP_PASSWORD"].filter((k) => !process.env[k]?.trim());
    return { configured: false as const, missing };
  }
  return { configured: true as const, host: config.baseUrl.host, pinned: config.fingerprint != null };
}

function normalizeFingerprint(v: string) {
  return v.replace(/^sha256[:=]?/i, "").replace(/[^0-9a-f]/gi, "").toUpperCase();
}

export class ErpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const REQUEST_TIMEOUT_MS = 30_000;

type CachedAgent = { key: string; agent: https.Agent };
type TokenState = { key: string; accessToken: string; refreshToken: string; expiresAt: number };
const globalForErp = globalThis as unknown as { __erpAgent?: CachedAgent; __erpToken?: TokenState };

function pemFromDer(raw: Buffer) {
  const b64 = raw.toString("base64").match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`;
}

// A self-signed ERP certificate is trusted only when its SHA-256 fingerprint matches the configured pin;
// the probe connection sends no application data, and every real request still runs full verification against it.
async function pinnedAgent(config: ErpConfig): Promise<https.Agent> {
  const port = Number(config.baseUrl.port || 443);
  const key = `${config.baseUrl.hostname}:${port}|${config.fingerprint}`;
  const cached = globalForErp.__erpAgent;
  if (cached?.key === key) return cached.agent;

  const cert = await new Promise<tls.PeerCertificate>((resolve, reject) => {
    const socket = tls.connect({
      host: config.baseUrl.hostname,
      port,
      servername: isIP(config.baseUrl.hostname) ? undefined : config.baseUrl.hostname,
      rejectUnauthorized: false,
      timeout: REQUEST_TIMEOUT_MS,
    });
    socket.once("secureConnect", () => {
      const c = socket.getPeerCertificate();
      socket.destroy();
      resolve(c);
    });
    socket.once("timeout", () => socket.destroy(new ErpError("连接 ERP 超时")));
    socket.once("error", reject);
  });
  const actual = normalizeFingerprint(cert.fingerprint256 ?? "");
  if (actual !== config.fingerprint) {
    console.warn(`[erp] 证书指纹不匹配 expected=${config.fingerprint} actual=${actual}`);
    throw new ErpError("ERP 服务器证书指纹与 ERP_TLS_FINGERPRINT 不一致，已拒绝连接。请确认服务器地址和证书是否变更。");
  }
  const pin = config.fingerprint;
  const agent = new https.Agent({
    keepAlive: true,
    ca: pemFromDer(cert.raw),
    checkServerIdentity: (host, peer) => {
      if (normalizeFingerprint(peer.fingerprint256 ?? "") !== pin) {
        return new Error(`ERP 证书指纹不一致（${host}）`);
      }
      return tls.checkServerIdentity(host, peer);
    },
  });
  globalForErp.__erpAgent = { key, agent };
  return agent;
}

async function rawRequest(
  config: ErpConfig,
  method: "GET" | "POST",
  pathWithQuery: string,
  body: unknown,
  token: string | null,
): Promise<{ status: number; json: unknown }> {
  const url = new URL(pathWithQuery.replace(/^\//, ""), config.baseUrl);
  const isHttps = url.protocol === "https:";
  const agent = isHttps && config.fingerprint ? await pinnedAgent(config) : undefined;
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  const headers: Record<string, string> = { accept: "application/json" };
  if (payload) {
    headers["content-type"] = "application/json";
    headers["content-length"] = String(payload.length);
  }
  if (token) headers.authorization = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    const req = (isHttps ? https : http).request(url, { method, headers, agent, timeout: REQUEST_TIMEOUT_MS }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json: unknown = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          return reject(new ErpError(`ERP 返回的不是 JSON（HTTP ${res.statusCode}）：${text.slice(0, 120)}`, res.statusCode));
        }
        resolve({ status: res.statusCode ?? 0, json });
      });
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new ErpError(`请求 ERP 超时：${url.pathname}`)));
    req.on("error", (error: NodeJS.ErrnoException) => {
      if (error instanceof ErpError) return reject(error);
      const hint =
        error.code === "DEPTH_ZERO_SELF_SIGNED_CERT" || error.code === "SELF_SIGNED_CERT_IN_CHAIN"
          ? "ERP 使用自签名证书，请配置 ERP_TLS_FINGERPRINT"
          : error.message;
      reject(new ErpError(`无法连接 ERP：${hint}`));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

type Envelope = { code?: number; message?: string; msg?: string; data?: unknown };

function envelopeMessage(json: unknown) {
  const e = (json ?? {}) as Envelope;
  return e.message || e.msg || "";
}

async function login(config: ErpConfig): Promise<TokenState> {
  const key = `${config.baseUrl.href}|${config.username}`;
  const cached = globalForErp.__erpToken;
  if (cached?.key === key && cached.expiresAt - Date.now() > 60_000) return cached;

  if (cached?.key === key && cached.refreshToken) {
    const r = await rawRequest(config, "POST", "api/auth-server/oauth/refresh", { appId: config.username, refreshToken: cached.refreshToken }, null);
    const data = (r.json as Envelope)?.data as Record<string, unknown> | undefined;
    if (r.status === 200 && data?.access_token) return storeToken(key, data);
    console.info(`[erp] refresh token 失效（HTTP ${r.status}），改用账号重新登录`);
  }

  const r = await rawRequest(config, "POST", "api/auth-server/oauth/access-token", { appId: config.username, appSecret: config.password }, null);
  const data = (r.json as Envelope)?.data as Record<string, unknown> | undefined;
  if (r.status !== 200 || !data?.access_token) {
    const msg = envelopeMessage(r.json) || `HTTP ${r.status}`;
    throw new ErpError(r.status === 401 ? `ERP 登录失败：${msg}。请检查 ERP_USERNAME 和 ERP_PASSWORD。` : `ERP 登录失败：${msg}`, r.status);
  }
  console.info(`[erp] 登录成功 role=${String(data.role ?? "")} expires_in=${String(data.expires_in ?? "")}`);
  return storeToken(key, data);
}

function storeToken(key: string, data: Record<string, unknown>): TokenState {
  const expiresIn = Number(data.expires_in) || 3600;
  const state = {
    key,
    accessToken: String(data.access_token),
    refreshToken: String(data.refresh_token ?? ""),
    expiresAt: Date.now() + expiresIn * 1000,
  };
  globalForErp.__erpToken = state;
  return state;
}

export type FetchStat = { fetched: number; total: number | null; pages: number; ms: number; done: boolean };

export class ErpClient {
  private calls = 0;
  /** Per endpoint, updated after every page: rows fetched, the total the ERP reported, pages requested and time spent. */
  readonly fetchStats: Record<string, FetchStat> = {};
  /** Called when an endpoint starts or finishes (important) and after every page (not important). */
  onPage?: (important: boolean) => void | Promise<void>;
  /** Epoch ms after which no new request is started. */
  deadline?: number;

  constructor(private readonly config: ErpConfig) {}

  get requestCount() {
    return this.calls;
  }

  private async call(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    if (this.deadline && Date.now() > this.deadline) {
      throw new ErpError(`同步耗时超过上限，已在请求 ${path.split("?")[0]} 前停止，数据没有变化。各接口的进度和耗时见下方。`, 504);
    }
    const started = Date.now();
    let token = await login(this.config);
    let r = await rawRequest(this.config, method, path, body, token.accessToken);
    if (r.status === 401) {
      globalForErp.__erpToken = undefined;
      token = await login(this.config);
      r = await rawRequest(this.config, method, path, body, token.accessToken);
    }
    this.calls++;
    const env = r.json as Envelope;
    const code = typeof env?.code === "number" ? env.code : 0;
    console.info(`[erp] ${method} ${path.split("?")[0]} -> HTTP ${r.status} code=${code} ${Date.now() - started}ms`);
    if (r.status === 403) throw new ErpError(`ERP 账号没有权限读取 ${path.split("?")[0]}：${envelopeMessage(r.json)}`, 403);
    if (r.status !== 200 || (code !== 0 && code !== 200)) {
      throw new ErpError(`ERP 接口 ${path.split("?")[0]} 返回错误：${envelopeMessage(r.json) || `HTTP ${r.status}`}`, r.status);
    }
    return r.json;
  }

  get(path: string) {
    return this.call("GET", path);
  }

  post(path: string, body: unknown) {
    return this.call("POST", path, body);
  }

  async ping() {
    await login(this.config);
  }

  private async progress(path: string, fetched: number, total: number | null, ms: number, done: boolean) {
    const prev = this.fetchStats[path];
    this.fetchStats[path] = { fetched, total, pages: (prev?.pages ?? 0) + (done ? 0 : 1), ms: (prev?.ms ?? 0) + ms, done };
    if (done) {
      const st = this.fetchStats[path];
      console.info(`[erp] ${path} 共拉取 ${fetched} 条，ERP 报告总数 ${total ?? "未提供"}，${st.pages} 页，${st.ms}ms`);
    }
    await this.onPage?.(done);
  }

  /**
   * Shared loop for both pagination styles. Advances by the rows actually returned and keeps going until the
   * reported total is reached, so a server that caps the page size below the requested length is not truncated.
   */
  private async pageThrough<T>(
    path: string,
    pageSize: number,
    maxRows: number,
    fetchPage: (offset: number) => Promise<{ rows: T[]; total?: number | null }>,
  ): Promise<T[]> {
    const all: T[] = [];
    let reported: number | null = null;
    let prevFirst: string | null = null;
    this.fetchStats[path] = { fetched: 0, total: null, pages: 0, ms: 0, done: false };
    await this.onPage?.(true);
    for (let offset = 0; ; ) {
      const started = Date.now();
      const { rows, total } = await fetchPage(offset);
      if (total != null && Number.isFinite(Number(total))) reported = Number(total);
      const first = rows.length ? JSON.stringify(rows[0]) : null;
      if (offset > 0 && first != null && first === prevFirst) {
        throw new ErpError(`ERP 接口 ${path} 没有按 offset 翻页（第 ${offset} 条起返回了和上一页相同的数据），已停止同步`);
      }
      prevFirst = first;
      all.push(...rows);
      offset += rows.length;
      await this.progress(path, all.length, reported, Date.now() - started, false);
      if (rows.length === 0) break;
      if (reported != null ? all.length >= reported : rows.length < pageSize) break;
      if (all.length >= maxRows) throw new ErpError(`${path} 数据超过 ${maxRows} 条，请缩小同步范围`);
    }
    await this.progress(path, all.length, reported, 0, true);
    return all;
  }

  /** Lingxing-style offset/length pagination (POST body). */
  paginate<T>(
    path: string,
    body: Record<string, unknown>,
    opts: { pageSize: number; pick: (json: unknown) => { rows: T[]; total?: number }; maxRows?: number },
  ): Promise<T[]> {
    return this.pageThrough(path, opts.pageSize, opts.maxRows ?? 50_000, async (offset) =>
      opts.pick(await this.post(path, { ...body, offset, length: opts.pageSize })),
    );
  }

  /** Local REST list endpoints (`items` + `total`, limit up to 200). */
  listAll<T>(path: string, query: Record<string, string> = {}, maxRows = 50_000): Promise<T[]> {
    const pageSize = 200;
    return this.pageThrough(path, pageSize, maxRows, async (offset) => {
      const qs = new URLSearchParams({ ...query, limit: String(pageSize), offset: String(offset) });
      const json = (await this.get(`${path}?${qs}`)) as { items?: T[]; total?: number; data?: { items?: T[]; total?: number } };
      const page = json.items ? json : (json.data ?? {});
      return { rows: page.items ?? [], total: page.total };
    });
  }
}
