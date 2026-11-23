import assert from "node:assert/strict";

import { analyze, trustBand } from "../src/lib/analysis.ts";
import type { Asn, IpRecord, LookupOk } from "../src/lib/ipdata.ts";

let checks = 0;
function check(name: string, body: () => void) {
  try {
    body();
    checks++;
    console.log(`ok   ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(`     ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

check("trustBand thresholds", () => {
  assert.equal(trustBand(null), null);
  assert.equal(trustBand(81), "low risk");
  assert.equal(trustBand(80), "moderate risk");
  assert.equal(trustBand(51), "moderate risk");
  assert.equal(trustBand(50), "high risk");
  assert.equal(trustBand(0), "high risk");
});

const ASN: Asn = { asn: "AS16509", name: "Amazon.com, Inc.", domain: "amazon.com", route: null, type: "CIDR" };

function lookup(over: Partial<IpRecord>): LookupOk {
  const model: IpRecord = {
    ip: "1.2.3.4",
    version: 4,
    source: "free",
    country_code: "SE",
    country_name: "Sweden",
    emoji: "🇸🇪",
    is_eu: true,
    continent: null,
    city: null,
    region: null,
    region_code: null,
    postal: null,
    calling_code: null,
    latitude: null,
    longitude: null,
    asn: null,
    org: null,
    company: null,
    carrier: null,
    time_zone: null,
    currency: null,
    languages: null,
    threat: null,
    count: null,
    ...over,
  };
  return { ok: true, model, raw: {}, rate: null, degraded: false, source: "free", host: "1.2.3.4" };
}

check("analyze: tor record", () => {
  const a = analyze(
    lookup({
      city: "Stockholm",
      region: "Stockholm County",
      asn: ASN,
      threat: { is_tor: true, scores: { trust_score: 90 } },
    }),
  );
  assert.equal(a.type, "Tor");
  assert.equal(a.kind, "A Tor exit");
  assert.match(a.analysis, /Tor exit node/);
  assert.equal(
    a.summary,
    "A Tor exit in Stockholm, Stockholm County, Sweden, on the network of Amazon.com, Inc. (AS16509). Trust score 90, low risk.",
  );
});

check("analyze: clean address, trust 60", () => {
  const a = analyze(lookup({ threat: { scores: { trust_score: 60, vpn_score: 5 } } }));
  assert.equal(a.type, "-");
  assert.equal(a.kind, "An address");
  assert.equal(a.summary, "An address in Sweden. Trust score 60, moderate risk.");
});

check("analyze: summary without asn or place", () => {
  const a = analyze(lookup({ threat: { is_proxy: true } }));
  assert.equal(a.type, "Proxy");
  assert.equal(a.kind, "A proxy address");
  assert.equal(a.summary, "A proxy address in Sweden.");
});

console.log(`\n${checks} checks`);
