import assert from "node:assert/strict";
import { createServer, type Server } from "node:net";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig, saveConfig, type Config } from "../src/api/config.ts";
import { Connection, Session, cutObject, scale, sideOf, type Address } from "../src/api/ctrader.ts";
import { authorizationUrl, codeFromRedirect, SCOPE } from "../src/api/oauth.ts";
import { lots, money, percent, price, signedMoney, statusLine, tradingViewUrl, tradingViewSymbol } from "../src/utils/format.ts";

/**
 * The self-check.
 *
 * The protocol half runs against a local server that speaks the measured wire — bare JSON objects,
 * no length prefix, replies carrying `clientMsgId`, failures on payloadType 2142 — because there is
 * no cTrader account to talk to. The message shapes are the ones Spotware's descriptors declare;
 * the arithmetic is asserted against hand-computed values, not
 * against the code under test.
 */

type Message = { clientMsgId?: string; payloadType?: number; payload?: Record<string, unknown> };
type Handler = (payload: Record<string, unknown>) => Record<string, unknown> | null;

async function broker(reply: (message: Message) => Message | Message[] | null): Promise<{ address: Address; close: () => void }> {
  const sockets: Array<{ destroy: () => void }> = [];
  const server: Server = createServer((socket) => {
    sockets.push(socket);
    socket.on("data", (chunk) => {
      // The client writes one message per write, so one chunk is one message.
      const answer = reply(JSON.parse(chunk.toString()) as Message);
      if (!answer) return;
      for (const message of Array.isArray(answer) ? answer : [answer]) socket.write(JSON.stringify(message));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  return {
    address: { host: "127.0.0.1", port },
    close: () => {
      for (const socket of sockets) socket.destroy();
      server.close();
    },
  };
}

const config: Config = {
  environment: "demo",
  clientId: "12345",
  clientSecret: "secret-value",
  redirectUri: "http://localhost:7331/callback",
  accessToken: "access-1",
  refreshToken: "refresh-1",
  accountId: 7001,
  traderLogin: "1234567",
};

/** The response payloadType of each request, from the descriptor's enum. */
const RESPONSE: Record<number, number> = { 2100: 2101, 2102: 2103, 2112: 2113, 2114: 2115, 2116: 2117, 2121: 2122, 2124: 2125, 2187: 2188 };

const reply = (message: Message) => (payload: Record<string, unknown> = {}) => ({
  clientMsgId: message.clientMsgId,
  payloadType: RESPONSE[message.payloadType ?? 0],
  payload,
});

const table: Record<number, Handler> = {
  2100: () => ({}),
  2102: () => ({}),
  2112: () => ({ asset: [{ assetId: 1, name: "USD", displayName: "USD" }] }),
  2114: () => ({ symbol: [{ symbolId: 1, symbolName: "EURUSD" }] }),
  2116: (payload) => ({
    symbol: (payload.symbolId as number[]).map((id) => ({ symbolId: id, digits: 5, lotSize: 10_000_000 })),
  }),
  2121: () => ({ trader: { balance: "1000000", moneyDigits: 2, depositAssetId: 1 } }),
  2124: () => ({
    position: [
      { positionId: 11, tradeData: { symbolId: 1, volume: "10000000", tradeSide: "BUY", openTimestamp: 1_700_000_000_000 }, moneyDigits: 2, price: 1.0855, usedMargin: "50000", swap: "-150", commission: "-250" },
      // This one carries five digits, as some brokers do: its own margin must scale by 1e5 while
      // the P/L response above stays on its own two.
      { positionId: 12, tradeData: { symbolId: 1, volume: "25000000", tradeSide: "SELL", openTimestamp: 1_700_000_000_000 }, moneyDigits: 5, price: 1.09, usedMargin: "12500000", swap: "0", commission: "-10000" },
    ],
  }),
  2187: () => ({
    moneyDigits: 2,
    positionUnrealizedPnL: [
      { positionId: 11, grossUnrealizedPnL: "2800", netUnrealizedPnL: "2400" },
      { positionId: 12, grossUnrealizedPnL: "-800", netUnrealizedPnL: "-900" },
    ],
  }),
};

const standard = (message: Message): Message | Message[] | null => {
  const handler = message.payloadType === undefined ? undefined : table[message.payloadType];
  if (!handler) return null;
  return reply(message)(handler(message.payload ?? {}) ?? {});
};

let passed = 0;
let failed = 0;

async function check(name: string, body: () => Promise<void> | void): Promise<void> {
  try {
    await body();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}\n  ${(error as Error).message}`);
  }
}

async function main() {
  await check("a heartbeat and the reply in one read are split into two messages", async () => {
    // Measured: the server frames by JSON, not by length, and a read can carry more than one
    // object. A client that parses the buffer as a single value loses the reply behind the
    // heartbeat and hangs.
    const pair = cutObject('{"payloadType":51,"payload":{}}{"payloadType":2101,"clientMsgId":"m1","payload":{}}');
    assert.ok(pair, "the first object was not cut");
    assert.deepEqual(pair.value, { payloadType: 51, payload: {} });
    assert.match(pair.rest, /"clientMsgId":"m1"/);
    const second = cutObject(pair.rest);
    assert.equal((second?.value as Message | undefined)?.payloadType, 2101);
  });

  await check("a length-prefixed frame is refused, as the broker refuses it", async () => {
    // Sending one earns `Corrupted frame.` from cTrader; reading one must not be mistaken for JSON.
    const framed = "\u0000\u0000\u0000\u002a{\"payloadType\":51}";
    assert.throws(() => cutObject(framed), /not a JSON object/);
  });

  await check("an error reply is raised with the broker's own code and description", async () => {
    const fake = await broker((message) => ({
      clientMsgId: message.clientMsgId,
      payloadType: 2142,
      payload: { errorCode: "CH_CLIENT_AUTH_FAILURE", description: "clientId or clientSecret is incorrect" },
    }));
    try {
      const connection = await Connection.connect(fake.address, { secure: false });
      await assert.rejects(
        () => connection.request(2100, { clientId: "x" }, 2101),
        (error: Error) => /CH_CLIENT_AUTH_FAILURE: clientId or clientSecret is incorrect/.test(error.message),
      );
      connection.close();
    } finally {
      fake.close();
    }
  });

  await check("a snapshot is built from reconcile, P/L and trader, with money and lots scaled", async () => {
    const fake = await broker(standard);
    try {
      const session = new Session(config, () => undefined, { address: fake.address, secure: false });
      const snapshot = await session.snapshot();
      session.close();

      assert.equal(snapshot.account.balance, 10_000, "1000000 scaled by moneyDigits 2");
      assert.equal(snapshot.unrealized.net, 15, "24.00 + -9.00");
      assert.equal(snapshot.unrealized.gross, 20, "28.00 + -8.00");
      assert.equal(snapshot.account.equity, 10_015, "balance plus net");
      assert.equal(snapshot.account.usedMargin, 625, "500 at two digits plus 125 at five");
      assert.equal(snapshot.account.freeMargin, 9390, "equity minus margin");
      assert.ok(Math.abs(snapshot.unrealized.returnPct - 0.15) < 1e-9, "15 on a 10 000 balance");
      assert.equal(snapshot.account.currency, "USD");

      assert.equal(snapshot.positions.length, 2);
      const [biggest, smaller] = snapshot.positions;
      assert.equal(biggest!.id, 11, "sorted by absolute P/L");
      assert.equal(biggest!.pnl, 24);
      assert.equal(biggest!.symbol, "EURUSD");
      assert.equal(biggest!.side, "BUY");
      assert.equal(biggest!.lots, 1, "volume 10 000 000 over lotSize 10 000 000");
      assert.equal(biggest!.swap, -1.5);
      assert.equal(biggest!.commission, -2.5);
      assert.equal(smaller!.lots, 2.5);
      assert.equal(smaller!.side, "SELL");
      assert.equal(smaller!.pnl, -9, "the P/L response's digits, not the position's");
      assert.equal(smaller!.usedMargin, 125, "the position's own five digits");
      assert.equal(smaller!.commission, -0.1, "commission scales with the position too");
    } finally {
      fake.close();
    }
  });

  await check("an expired access token is refreshed once and the request retried", async () => {
    let authenticated = 0;
    let refreshed = 0;
    const fake = await broker((message) => {
      if (message.payloadType === 2102) {
        authenticated += 1;
        if (authenticated === 1) {
          return {
            clientMsgId: message.clientMsgId,
            payloadType: 2142,
            payload: { errorCode: "CH_ACCESS_TOKEN_EXPIRED", description: "token expired" },
          };
        }
      }
      return standard(message);
    });
    try {
      const expiring: Config = { ...config };
      const session = new Session(expiring, () => undefined, {
        address: fake.address,
        secure: false,
        refresh: async () => {
          refreshed += 1;
          expiring.accessToken = "access-2";
        },
      });
      await session.snapshot();
      session.close();
      assert.equal(refreshed, 1);
      assert.equal(authenticated, 2);
      assert.equal(expiring.accessToken, "access-2", "the retry uses the refreshed token");
    } finally {
      fake.close();
    }
  });

  await check("a wrong client id is not retried and does not refresh anything", async () => {
    let refreshed = 0;
    const fake = await broker((message) => ({
      clientMsgId: message.clientMsgId,
      payloadType: 2142,
      payload: { errorCode: "CH_CLIENT_AUTH_FAILURE", description: "clientId or clientSecret is incorrect" },
    }));
    try {
      const session = new Session(config, () => undefined, {
        address: fake.address,
        secure: false,
        refresh: async () => {
          refreshed += 1;
        },
      });
      await assert.rejects(() => session.snapshot(), /CH_CLIENT_AUTH_FAILURE/);
      session.close();
      assert.equal(refreshed, 0);
    } finally {
      fake.close();
    }
  });

  await check("the config is written owner-only and read back whole", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "ctrader-pl-"));
    try {
      const path = join(scratch, "config.json");
      assert.equal(loadConfig(path), null, "a missing file is not an error");
      saveConfig(path, config);
      assert.equal(statSync(path).mode & 0o777, 0o600);
      assert.deepEqual(loadConfig(path), config);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  await check("the authorisation URL asks for the read-only scope and carries the state", async () => {
    const url = new URL(authorizationUrl({ clientId: "12345", redirectUri: "http://localhost:7331/callback", state: "abc" }));
    assert.equal(url.origin + url.pathname, "https://id.ctrader.com/my/settings/openapi/grantingaccess/");
    assert.equal(url.searchParams.get("client_id"), "12345");
    assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:7331/callback");
    assert.equal(url.searchParams.get("scope"), "accounts");
    assert.equal(url.searchParams.get("state"), "abc");
    assert.equal(url.searchParams.get("product"), "web");
    assert.equal(SCOPE, "accounts", "the trading scope would be a write scope");
  });

  await check("a redirect is only accepted with the state this run sent", async () => {
    const good = "http://localhost:7331/callback?code=the-code&state=abc";
    assert.equal(codeFromRedirect(good, "abc"), "the-code");
    assert.equal(codeFromRedirect(good, "other"), null, "a stray callback cannot consume the code");
    assert.equal(codeFromRedirect("http://localhost:7331/elsewhere?code=x&state=abc", "abc"), null);
    assert.equal(codeFromRedirect("http://localhost:7331/callback?code=x", "abc"), null);
  });

  await check("the TradingView symbol follows the broker prefix and the share suffixes", async () => {
    assert.equal(tradingViewSymbol("EURUSD"), "EURUSD");
    assert.equal(tradingViewSymbol("eurusd", "mybroker"), "MYBROKER:EURUSD");
    assert.equal(tradingViewSymbol("TLT.US", "MYBROKER"), "TLT", "a US share opens the underlying listing");
    assert.equal(tradingViewSymbol("BHP.AU", "MYBROKER"), "ASX:BHP");
    assert.equal(tradingViewSymbol("#42"), "", "an unnamed symbol has no chart");
    assert.equal(tradingViewUrl("BHP.AU"), "https://www.tradingview.com/chart/?symbol=ASX%3ABHP");
  });

  await check("money, lots and prices are formatted the way the widget formatted them", async () => {
    assert.equal(money(1234.5), "1,234.50");
    assert.equal(money(-1234.5), "-1,234.50");
    assert.equal(signedMoney(24), "+24.00");
    assert.equal(signedMoney(-9), "-9.00");
    assert.equal(signedMoney(0), "0.00");
    assert.equal(percent(0.15), "+0.15%");
    assert.equal(percent(-1.234), "-1.23%");
    assert.equal(lots(1), "1");
    assert.equal(lots(2.5), "2.5");
    assert.equal(lots(0.01), "0.01");
    assert.equal(price(1.0855, 5), "1.08550");
    assert.equal(price(1.0855, 2), "1.09");
  });

  await check("the status line says how old the figure is, or what went wrong", async () => {
    const now = 1_700_000_000_000;
    assert.equal(statusLine({ at: now - 2_000, now }), "Live · updated just now");
    assert.equal(statusLine({ at: now - 12_000, now }), "Live · updated 12s ago");
    assert.equal(statusLine({ at: now - 600_000, now }), "Live · updated 10m ago");
    assert.equal(statusLine({ error: "CH_ACCESS_TOKEN_EXPIRED: token expired", at: now, now }), "CH_ACCESS_TOKEN_EXPIRED: token expired");
    assert.equal(statusLine({}), "Connecting to cTrader…");
  });

  await check("scale and sideOf tolerate the encodings the API actually uses", async () => {
    assert.equal(scale("2400", 2), 24);
    assert.equal(scale(2400, "2"), 24);
    assert.equal(scale(null, 2), 0);
    assert.equal(scale("abc", 2), 0);
    assert.equal(scale(1234, undefined), 12.34, "moneyDigits defaults to 2");
    assert.equal(scale("5000000", 5), 50, "five digits are not two");
    assert.equal(sideOf("BUY"), "BUY");
    assert.equal(sideOf(2), "SELL");
    assert.equal(sideOf("SELL"), "SELL");
    assert.equal(sideOf("SIDEWAYS"), "?");
  });

  console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
