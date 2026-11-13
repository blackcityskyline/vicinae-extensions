import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";

import type { Config, Environment } from "./config";
import { refreshToken } from "./oauth";

/**
 * The cTrader Open API as measured: JSON on port 5036, one object per message with **no length
 * prefix** (a 4-byte prefix is answered `Corrupted frame.`), the envelope
 * `{clientMsgId, payloadType, payload}`, errors on `payloadType 2142` with `errorCode` and
 * `description`, and an idle connection dropped by the server after 30 s.
 *
 * Nothing here imports `@vicinae/api`, so the tests can run it headless. The payload numbers and
 * the field names below come from Spotware's own generated descriptors — `docs/audits/ctrader-pl.md`
 * records the digest of both.
 */

export const PAYLOAD = {
  heartbeat: 51,
  appAuth: 2100,
  appAuthRes: 2101,
  accountAuth: 2102,
  accountAuthRes: 2103,
  assets: 2112,
  assetsRes: 2113,
  symbols: 2114,
  symbolsRes: 2115,
  symbolById: 2116,
  symbolByIdRes: 2117,
  trader: 2121,
  traderRes: 2122,
  reconcile: 2124,
  reconcileRes: 2125,
  error: 2142,
  accountsByToken: 2149,
  accountsByTokenRes: 2150,
  unrealizedPnl: 2187,
  unrealizedPnlRes: 2188,
} as const;

export type Address = { host: string; port: number };

export const ENDPOINTS: Record<Environment, Address> = {
  demo: { host: "demo.ctraderapi.com", port: 5036 },
  live: { host: "live.ctraderapi.com", port: 5036 },
};

type Wire = {
  clientMsgId?: string;
  payloadType?: number;
  payload?: Record<string, unknown> | null;
};

export class CTraderError extends Error {
  constructor(readonly code: string, description = "") {
    super(description ? `${code}: ${description}` : code);
  }
}

/**
 * The first complete JSON object in `text`, with whatever follows it.
 *
 * A read can carry two replies and half of a third; `JSON.parse` cannot say where the first one
 * ends, so this walks the bytes and counts braces outside strings.
 */
export function cutObject(text: string): { value: unknown; rest: string } | null {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (start < 0) {
      if (char.trim() === "") continue;
      if (char !== "{") throw new Error(`cTrader sent something that is not a JSON object: ${JSON.stringify(text.slice(0, 40))}`);
      start = index;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return { value: JSON.parse(text.slice(start, index + 1)), rest: text.slice(index + 1) };
    }
  }
  return null;
}

export class Connection {
  private buffer = "";
  private inbox: Wire[] = [];
  private failure: Error | null = null;
  private wake: (() => void) | null = null;
  private sequence = 0;

  private constructor(private readonly socket: Socket, private readonly timeoutMs: number) {
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      try {
        for (;;) {
          const cut = cutObject(this.buffer);
          if (!cut) break;
          this.buffer = cut.rest;
          this.inbox.push(cut.value as Wire);
        }
      } catch (error) {
        this.fail(error as Error);
        return;
      }
      this.wake?.();
    });
    socket.on("error", (error) => this.fail(new Error(error.message)));
    socket.on("close", () => this.fail(new Error("cTrader closed the connection")));
  }

  /**
   * `secure: false` is for the self-check, which speaks the same protocol over plain TCP on
   * 127.0.0.1 — the wire has no TLS-specific behaviour.
   */
  static connect(address: Address, options: { secure?: boolean; timeoutMs?: number } = {}): Promise<Connection> {
    const { secure = true, timeoutMs = 20_000 } = options;
    return new Promise((resolve, reject) => {
      const socket = secure
        ? tlsConnect({ host: address.host, port: address.port, servername: address.host })
        : netConnect({ host: address.host, port: address.port });
      socket.setTimeout(timeoutMs, () => socket.destroy(new Error(`timed out connecting to ${address.host}`)));
      socket.once("error", reject);
      socket.once(secure ? "secureConnect" : "connect", () => {
        socket.removeListener("error", reject);
        socket.setTimeout(0);
        resolve(new Connection(socket, timeoutMs));
      });
    });
  }

  private fail(error: Error): void {
    if (!this.failure) this.failure = error;
    this.wake?.();
  }

  send(payloadType: number, payload: Record<string, unknown> = {}): string {
    this.sequence += 1;
    const clientMsgId = `m${this.sequence}`;
    this.socket.write(JSON.stringify({ clientMsgId, payloadType, payload }));
    return clientMsgId;
  }

  private async take(deadline: number): Promise<Wire> {
    for (;;) {
      const message = this.inbox.shift();
      if (message) return message;
      if (this.failure) throw this.failure;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error("timed out waiting for cTrader");
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.wake = null;
          reject(new Error("timed out waiting for cTrader"));
        }, left);
        this.wake = () => {
          clearTimeout(timer);
          this.wake = null;
          resolve();
        };
      });
    }
  }

  /**
   * Sends a request and answers its reply's payload.
   *
   * A failure is a normal message on `payloadType 2142`, not a dropped connection, so it is read
   * as data and raised here. Heartbeats and any event that answers nothing are skipped.
   */
  async request(payloadType: number, payload: Record<string, unknown> = {}, expect?: number): Promise<Record<string, unknown>> {
    const clientMsgId = this.send(payloadType, payload);
    const deadline = Date.now() + this.timeoutMs;
    for (;;) {
      const message = await this.take(deadline);
      const body = message.payload ?? {};
      if (message.payloadType === PAYLOAD.error && (message.clientMsgId === clientMsgId || message.clientMsgId === undefined)) {
        throw new CTraderError(String(body.errorCode ?? "UNKNOWN_ERROR"), String(body.description ?? ""));
      }
      if (message.payloadType === PAYLOAD.heartbeat) continue;
      const mine = message.clientMsgId === clientMsgId;
      const unnamed = expect !== undefined && message.clientMsgId === undefined && message.payloadType === expect;
      if (!mine && !unnamed) continue;
      if (expect !== undefined && message.payloadType !== expect) {
        throw new CTraderError("UNEXPECTED_RESPONSE", `wanted payloadType ${expect}, got ${message.payloadType}`);
      }
      return body;
    }
  }

  close(): void {
    this.failure ??= new Error("connection closed");
    this.socket.destroy();
  }
}

export type Position = {
  id: number;
  symbol: string;
  side: "BUY" | "SELL" | "?";
  /** In lots, from the symbol's own lot size. */
  lots: number;
  openPrice: number;
  digits: number;
  /** Money, already scaled by the digits the API sent it with. */
  pnl: number;
  grossPnl: number;
  swap: number;
  commission: number;
  usedMargin: number;
  openedAt: number;
};

export type Account = {
  id: number;
  login: string;
  currency: string;
  balance: number;
  equity: number;
  usedMargin: number;
  freeMargin: number;
};

export type Snapshot = {
  at: number;
  environment: Environment;
  account: Account;
  unrealized: { net: number; gross: number; currency: string; returnPct: number };
  positions: Position[];
};

/**
 * Money on the wire is an integer scaled by 10^moneyDigits, and the digits differ per message:
 * the position carries its own, the unrealised P/L response carries another.
 */
export function scale(value: unknown, moneyDigits: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const digits = Number(moneyDigits ?? 2);
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return number / 10 ** (Number.isFinite(digits) ? digits : 2);
}

/** The JSON encoding sends enums as names, but the numeric form is tolerated. */
export function sideOf(value: unknown): "BUY" | "SELL" | "?" {
  if (value === 1 || value === "1") return "BUY";
  if (value === 2 || value === "2") return "SELL";
  const text = String(value ?? "").toUpperCase();
  return text === "BUY" || text === "SELL" ? text : "?";
}

/** Every distinct symbol the open positions are in. */
function symbolIdsOf(positions: Array<Record<string, unknown>>): number[] {
  const ids = new Set<number>();
  for (const position of positions) {
    const trade = (position.tradeData as Record<string, unknown> | undefined) ?? {};
    const id = Number(trade.symbolId);
    if (Number.isFinite(id)) ids.add(id);
  }
  return [...ids];
}

export type ListedAccount = { id: number; login: string; live: boolean };

export type SessionOptions = {
  address?: Address;
  secure?: boolean;
  /** Replaced by the self-check; the real one persists the new token. */
  refresh?: () => Promise<void>;
};

/**
 * One account, read over one connection.
 *
 * The Omarchy plugin polls in a systemd unit forever; here the session lives exactly as long as
 * the window, and closes with it. That is why there is no heartbeat: a 10-second refresh keeps
 * the socket well inside the measured 30-second idle timeout, and a machine that slept through a
 * tick reconnects on the next one.
 */
export class Session {
  private connection: Connection | null = null;
  private symbols = new Map<number, string>();
  private details = new Map<number, { lotSize: number; digits: number }>();
  private currency = "";
  private readonly address: Address;

  constructor(
    private readonly config: Config,
    private readonly persist: (config: Config) => void,
    private readonly options: SessionOptions = {},
  ) {
    this.address = options.address ?? ENDPOINTS[config.environment];
  }

  close(): void {
    this.connection?.close();
    this.connection = null;
  }

  private async call(payloadType: number, expect: number, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    if (!this.connection) throw new Error("not connected");
    return this.connection.request(payloadType, payload, expect);
  }

  private authenticate(accessToken: string): Promise<Record<string, unknown>> {
    return this.call(PAYLOAD.accountAuth, PAYLOAD.accountAuthRes, {
      ctidTraderAccountId: this.config.accountId,
      accessToken,
    });
  }

  private async refresh(): Promise<void> {
    if (this.options.refresh) return this.options.refresh();
    const tokens = await refreshToken({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      refreshToken: this.config.refreshToken,
    });
    this.config.accessToken = tokens.accessToken;
    if (tokens.refreshToken) this.config.refreshToken = tokens.refreshToken;
    this.persist(this.config);
  }

  private async open(): Promise<Connection> {
    if (this.connection) return this.connection;
    const connection = await Connection.connect(this.address, { secure: this.options.secure });
    this.connection = connection;
    try {
      await connection.request(PAYLOAD.appAuth, { clientId: this.config.clientId, clientSecret: this.config.clientSecret }, PAYLOAD.appAuthRes);
      try {
        await this.authenticate(this.config.accessToken);
      } catch (error) {
        // An expired access token is the ordinary case after a few weeks; a wrong client id is not.
        if (!(error instanceof CTraderError) || !/TOKEN/i.test(error.code)) throw error;
        await this.refresh();
        await this.authenticate(this.config.accessToken);
      }
      await this.loadSymbols();
    } catch (error) {
      this.close();
      throw error;
    }
    return connection;
  }

  private async loadSymbols(): Promise<void> {
    const body = await this.call(PAYLOAD.symbols, PAYLOAD.symbolsRes, { ctidTraderAccountId: this.config.accountId });
    const symbols = (body.symbol as Array<Record<string, unknown>> | undefined) ?? [];
    for (const symbol of symbols) {
      const id = Number(symbol.symbolId);
      if (Number.isFinite(id)) this.symbols.set(id, String(symbol.symbolName ?? `#${id}`));
    }
  }

  private async detailsFor(symbolIds: number[]): Promise<void> {
    const missing = symbolIds.filter((id) => !this.details.has(id));
    if (missing.length === 0) return;
    const body = await this.call(PAYLOAD.symbolById, PAYLOAD.symbolByIdRes, {
      ctidTraderAccountId: this.config.accountId,
      symbolId: missing,
    });
    const symbols = (body.symbol as Array<Record<string, unknown>> | undefined) ?? [];
    for (const symbol of symbols) {
      const id = Number(symbol.symbolId);
      if (!Number.isFinite(id)) continue;
      this.details.set(id, { lotSize: Number(symbol.lotSize ?? 0), digits: Number(symbol.digits ?? 5) });
    }
    // A symbol the server omitted must not be asked for again on every tick.
    for (const id of missing) if (!this.details.has(id)) this.details.set(id, { lotSize: 0, digits: 5 });
  }

  private async currencyOf(trader: Record<string, unknown>): Promise<string> {
    if (this.currency) return this.currency;
    const depositAssetId = trader.depositAssetId;
    if (depositAssetId === undefined || depositAssetId === null) return "";
    const body = await this.call(PAYLOAD.assets, PAYLOAD.assetsRes, { ctidTraderAccountId: this.config.accountId });
    const assets = (body.asset as Array<Record<string, unknown>> | undefined) ?? [];
    const asset = assets.find((entry) => Number(entry.assetId) === Number(depositAssetId));
    this.currency = String(asset?.displayName ?? asset?.name ?? "");
    return this.currency;
  }

  async snapshot(): Promise<Snapshot> {
    await this.open();
    try {
      return await this.read();
    } catch (error) {
      // The session is per window: a failed tick starts from a fresh connection next time.
      this.close();
      throw error;
    }
  }

  private async read(): Promise<Snapshot> {
    const reconcile = await this.call(PAYLOAD.reconcile, PAYLOAD.reconcileRes, { ctidTraderAccountId: this.config.accountId });
    const pnl = await this.call(PAYLOAD.unrealizedPnl, PAYLOAD.unrealizedPnlRes, { ctidTraderAccountId: this.config.accountId });
    const traderBody = await this.call(PAYLOAD.trader, PAYLOAD.traderRes, { ctidTraderAccountId: this.config.accountId });

    const trader = (traderBody.trader as Record<string, unknown> | undefined) ?? {};
    const positions = (reconcile.position as Array<Record<string, unknown>> | undefined) ?? [];
    const rows = (pnl.positionUnrealizedPnL as Array<Record<string, unknown>> | undefined) ?? [];
    const pnlDigits = pnl.moneyDigits;
    const currency = await this.currencyOf(trader);

    const byId = new Map<number, Record<string, unknown>>();
    for (const row of rows) {
      const id = Number(row.positionId);
      if (Number.isFinite(id)) byId.set(id, row);
    }

    await this.detailsFor(symbolIdsOf(positions));

    let net = 0;
    let gross = 0;
    let margin = 0;
    const list: Position[] = [];

    for (const position of positions) {
      const trade = (position.tradeData as Record<string, unknown> | undefined) ?? {};
      const symbolId = Number(trade.symbolId);
      const detail = this.details.get(symbolId) ?? { lotSize: 0, digits: 5 };
      const volume = Number(trade.volume ?? 0);
      const row = byId.get(Number(position.positionId)) ?? {};
      const netPnl = scale(row.netUnrealizedPnL, pnlDigits);
      const grossPnl = scale(row.grossUnrealizedPnL, pnlDigits);
      const usedMargin = scale(position.usedMargin, position.moneyDigits);

      net += netPnl;
      gross += grossPnl;
      margin += usedMargin;

      list.push({
        id: Number(position.positionId ?? 0),
        symbol: this.symbols.get(symbolId) ?? `#${symbolId}`,
        side: sideOf(trade.tradeSide),
        lots: detail.lotSize ? volume / detail.lotSize : volume / 1e7,
        openPrice: Number(position.price ?? 0),
        digits: detail.digits,
        pnl: netPnl,
        grossPnl,
        swap: scale(position.swap, position.moneyDigits),
        commission: scale(position.commission, position.moneyDigits),
        usedMargin,
        openedAt: Number(trade.openTimestamp ?? 0),
      });
    }

    // Biggest movers first, so the list leads with what matters.
    list.sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));

    const balance = scale(trader.balance, trader.moneyDigits);
    const equity = balance + net;
    return {
      at: Date.now(),
      environment: this.config.environment,
      account: {
        id: this.config.accountId,
        login: this.config.traderLogin,
        currency,
        balance,
        equity,
        usedMargin: margin,
        freeMargin: equity - margin,
      },
      unrealized: {
        net,
        gross,
        currency,
        returnPct: balance ? (net / balance) * 100 : 0,
      },
      positions: list,
    };
  }
}

/** The accounts the token can see, for the setup form's picker. */
export async function listAccounts(config: Pick<Config, "environment" | "clientId" | "clientSecret">, accessToken: string, options: SessionOptions = {}): Promise<ListedAccount[]> {
  const connection = await Connection.connect(options.address ?? ENDPOINTS[config.environment], { secure: options.secure });
  try {
    await connection.request(PAYLOAD.appAuth, { clientId: config.clientId, clientSecret: config.clientSecret }, PAYLOAD.appAuthRes);
    const body = await connection.request(PAYLOAD.accountsByToken, { accessToken }, PAYLOAD.accountsByTokenRes);
    const accounts = (body.ctidTraderAccount as Array<Record<string, unknown>> | undefined) ?? [];
    return accounts.map((account) => ({
      id: Number(account.ctidTraderAccountId),
      login: String(account.traderLogin ?? ""),
      live: account.isLive === true,
    }));
  } finally {
    connection.close();
  }
}
