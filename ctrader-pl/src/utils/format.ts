/**
 * The pure half of the widget's `Model.js`: money, ages, and the TradingView symbol.
 *
 * Kept away from `@vicinae/api` so the tests can run it headless.
 */

/** Thousands separators, always two decimals — the shape a P/L column wants. */
export function money(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const fixed = Math.abs(value).toFixed(2);
  const whole = fixed.slice(0, fixed.length - 3).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${value < 0 ? "-" : ""}${whole}.${fixed.slice(-2)}`;
}

/** The pill leads with the sign so a glance answers up-or-down before the eye reaches the digits. */
export function signedMoney(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${money(value)}`;
}

export function percent(value: number): string {
  if (!Number.isFinite(value)) return "";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

/** Trim to the finest size a broker fills, then drop dead zeros. */
export function lots(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(2).replace(/\.?0+$/, "") || "0";
}

export function ago(seconds: number): string {
  if (seconds < 5) return "just now";
  if (seconds < 90) return `${Math.round(seconds)}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

/** How long a position has been open, in the compact form the widget uses. */
export function openedFor(openedAt: number, now = Date.now()): string {
  if (!Number.isFinite(openedAt) || openedAt <= 0) return "";
  const minutes = Math.max(0, Math.round((now - openedAt) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function price(value: number, digits: number): string {
  if (!Number.isFinite(value)) return "—";
  const places = Number.isFinite(digits) && digits >= 0 && digits <= 10 ? digits : 5;
  return value.toFixed(places);
}

/**
 * The status line under the total: what the last read was, and how long ago it was.
 *
 * A list cannot dim a stale figure the way the bar pill does, so the age is spelled out instead.
 */
export function statusLine(options: { error?: string; at?: number; now?: number }): string {
  if (options.error) return options.error;
  if (!options.at) return "Connecting to cTrader…";
  return `Live · updated ${ago(((options.now ?? Date.now()) - options.at) / 1000)}`;
}

/**
 * The chart that belongs to a position, opened on TradingView.
 *
 * Many brokers list their CFDs under their own exchange prefix, which is why the preference
 * exists; left blank, the bare symbol lets TradingView pick a listing. Share CFDs (`TLT.US`,
 * `BHP.AU`) open the underlying exchange either way.
 */
const SHARE_EXCHANGES: Record<string, string> = { US: "", AU: "ASX", UK: "LSE", DE: "XETR" };

export function tradingViewSymbol(symbol: string, exchange = ""): string {
  const name = symbol.trim();
  if (!name || name.startsWith("#")) return "";
  const dot = name.lastIndexOf(".");
  if (dot > 0) {
    const suffix = name.slice(dot + 1).toUpperCase();
    if (suffix in SHARE_EXCHANGES) {
      const ticker = name.slice(0, dot).toUpperCase();
      const listing = SHARE_EXCHANGES[suffix] ?? "";
      return listing ? `${listing}:${ticker}` : ticker;
    }
  }
  const prefix = exchange.trim().toUpperCase();
  return prefix ? `${prefix}:${name.toUpperCase()}` : name.toUpperCase();
}

export function tradingViewUrl(symbol: string, exchange = ""): string {
  const ticker = tradingViewSymbol(symbol, exchange);
  return ticker ? `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(ticker)}` : "";
}
