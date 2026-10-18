const test = require("node:test");
const assert = require("node:assert/strict");
const { PlateAPI, VERSION } = require("../dist");
const { ok, makeClient } = require("./helpers");

const HILUX = {
  year_range: "2015-2020", lowest_year: 2015, highest_year: 2020,
  make: "TOYOTA", model: "HILUX", description: "15~20 TOYOTA HILUX 2.8L DIESEL",
  body: "UTE", engine: "2.8L", vehicle_id: 1380801,
};
const COROLLA_A = {
  year_range: "2003-2006", lowest_year: 2003, highest_year: 2006,
  make: "TOYOTA", model: "COROLLA", description: "03~06 TOYOTA COROLLA SPORTIVO 1.8L PETROL",
  body: "HATCHBACK", engine: "1.8L", vehicle_id: 5152708,
};
const COROLLA_B = { ...COROLLA_A, description: "03~06 TOYOTA COROLLA ASCENT 1.8L PETROL", body: "SEDAN", vehicle_id: 1857621 };

test("exact lookup: params, headers and fields", async () => {
  const { client, calls } = makeClient([ok({
    success: true, vehicle: HILUX, alternatives: [], match: "exact",
    source: "plateapi", duration_ms: 1509.9, request_id: "req_abc",
  }, { "X-RateLimit-Limit": "600", "X-RateLimit-Remaining": "599", "X-RateLimit-Plan": "starter" })]);
  const result = await client.lookup("abc 123", "vic");
  assert.equal(calls[0].url, "https://api.plateapi.com.au/api/v1/lookup");
  assert.deepEqual(calls[0].params, { plate: "ABC 123", state: "VIC" });
  assert.equal(calls[0].headers["X-API-Key"], "pk_live_test");
  assert.equal(calls[0].headers["User-Agent"], "plateapi-node/" + VERSION);
  assert.equal(result.success, true);
  assert.equal(result.match, "exact");
  assert.equal(result.vehicle.vehicle_id, 1380801);
  assert.equal(result.vehicle.year, 2015);
  assert.equal(result.vehicle.make, "TOYOTA");
  assert.deepEqual(result.candidate_ids, [1380801]);
  assert.equal(result.request_id, "req_abc");
  assert.deepEqual(result.rate_limit, { limit: 600, remaining: 599, plan: "starter", topup_remaining: null });
});

test("multiple: candidate_ids in order without duplicates", async () => {
  const { client } = makeClient([ok({ success: true, vehicle: COROLLA_A, match: "multiple", alternatives: [COROLLA_B, COROLLA_A] })]);
  const result = await client.lookup("ABC123", "VIC");
  assert.equal(result.match, "multiple");
  assert.deepEqual(result.candidate_ids, [5152708, 1857621]);
  assert.deepEqual(result.alternatives.map((a) => a.vehicle_id), [1857621, 5152708]);
});

test("ambiguous: primary has no id", async () => {
  const { client } = makeClient([ok({ success: true, vehicle: { ...COROLLA_A, vehicle_id: null }, match: "ambiguous", alternatives: [COROLLA_A, HILUX] })]);
  const result = await client.lookup("ABC123", "VIC");
  assert.equal(result.match, "ambiguous");
  assert.equal(result.vehicle.vehicle_id, null);
  assert.deepEqual(result.candidate_ids, [5152708, 1380801]);
});

test("not found is a normal result", async () => {
  const { client } = makeClient([ok({ success: false, vehicle: null, code: "not_found", error: "No vehicle found", request_id: "req_nf" })]);
  const result = await client.lookup("ZZZ999", "NSW");
  assert.equal(result.success, false);
  assert.equal(result.code, "not_found");
  assert.equal(result.vehicle, null);
  assert.deepEqual(result.candidate_ids, []);
  assert.equal(result.match, null);
  assert.equal(result.request_id, "req_nf");
});

test("sandbox and detailed", async () => {
  const { client, calls } = makeClient([ok({ success: true, vehicle: { ...HILUX, detailed_description: "long" }, sandbox: true, match: "exact" })]);
  const result = await client.lookup("TEST123", "VIC", { detailed: true });
  assert.equal(calls[0].params.detailed, "true");
  assert.equal(result.sandbox, true);
  assert.equal(result.vehicle.detailed_description, "long");
});

test("request_id falls back to the header", async () => {
  const { client } = makeClient([ok({ success: true, vehicle: HILUX }, { "X-Request-ID": "req_hdr" })]);
  assert.equal((await client.lookup("ABC123", "VIC")).request_id, "req_hdr");
});

test("topup remaining and unlimited headers", async () => {
  const { client } = makeClient([
    ok({ success: true, vehicle: HILUX }, { "X-Topup-Remaining": "17" }),
    ok({ success: true, vehicle: HILUX }, { "X-RateLimit-Limit": "unlimited", "X-RateLimit-Remaining": "unlimited" }),
  ]);
  assert.equal((await client.lookup("ABC123", "VIC")).rate_limit.topup_remaining, 17);
  const rl = (await client.lookup("ABC123", "VIC")).rate_limit;
  assert.equal(rl.limit, null);
  assert.equal(rl.remaining, null);
});

test("internal_error is retried then returned", async () => {
  const internal = { success: false, vehicle: null, code: "internal_error", error: "Internal error" };
  const { client, calls, sleeps } = makeClient([ok(internal), ok({ success: true, vehicle: HILUX })]);
  const result = await client.lookup("ABC123", "VIC");
  assert.equal(result.success, true);
  assert.equal(calls.length, 2);
  assert.equal(sleeps.length, 1);

  const again = makeClient([ok(internal), ok(internal), ok(internal), ok(internal)]);
  const r2 = await again.client.lookup("ABC123", "VIC");
  assert.equal(r2.success, false);
  assert.equal(r2.code, "internal_error");
  assert.equal(again.calls.length, 4);
});

test("invalid state and empty plate make no request", async () => {
  const { client, calls } = makeClient([]);
  await assert.rejects(client.lookup("ABC123", "XX"), /Invalid state/);
  await assert.rejects(client.lookup("   ", "VIC"), /empty/);
  assert.equal(calls.length, 0);
});

test("empty api key rejected", () => {
  assert.throws(() => new PlateAPI(""), /non-empty/);
});
