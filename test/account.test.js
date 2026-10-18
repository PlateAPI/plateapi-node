const test = require("node:test");
const assert = require("node:assert/strict");
const { res, ok, makeClient } = require("./helpers");

test("usage parsing", async () => {
  const { client, calls } = makeClient([ok({
    email: "a@b.c", plan: "starter", monthly_limit: 600, used_this_month: 12, remaining: 588,
    percent_used: 2.0, rate_limit_per_min: 10, period_start: "2026-09-07 00:00:00", period_end: null,
    days_remaining: null, last_lookup_at: "2026-10-03 03:20:02", topup_credits: 40,
    cancel_at_period_end: false, cancel_at: null,
  })]);
  const u = await client.usage();
  assert.equal(calls[0].url, "https://api.plateapi.com.au/api/v1/keys/usage");
  assert.equal(u.plan, "starter");
  assert.equal(u.monthly_limit, 600);
  assert.equal(u.remaining, 588);
  assert.equal(u.period_end, null);
  assert.equal(u.topup_credits, 40);
});

test("logs params and parsing", async () => {
  const { client, calls } = makeClient([ok({
    logs: [{ plate: "ABC123", state: "VIC", success: 1, duration_ms: 1500.5, request_id: "req_1", created_at: "2026-10-01 00:00:00" }],
    count: 1, total: 9, limit: 50, offset: 10,
  })]);
  const logs = await client.logs({ limit: 50, offset: 10, since: "2026-10-01T00:00:00", plate: "ABC123", success: false });
  assert.deepEqual(calls[0].params, { limit: "50", offset: "10", since: "2026-10-01T00:00:00", plate: "ABC123", success: "false" });
  assert.equal(logs.logs[0].plate, "ABC123");
  assert.equal(logs.logs[0].success, 1);
  assert.equal(logs.logs[0].request_id, "req_1");
  assert.equal(logs.total, 9);
  assert.equal(logs.limit, 50);
});

test("health sends no key and makes one attempt", async () => {
  const { client, calls, sleeps } = makeClient([ok({ status: "ok" })]);
  const h = await client.health();
  assert.equal(h.status, "ok");
  assert.equal(h.version, null);
  assert.ok(!("X-API-Key" in calls[0].headers));

  const down = makeClient([res(503, { detail: "down" })]);
  await assert.rejects(down.client.health());
  assert.equal(down.calls.length, 1);
  assert.deepEqual(down.sleeps, []);
  assert.deepEqual(sleeps, []);
});

test("0.1.0 quick start still works", async () => {
  const { client } = makeClient([ok({ success: true, vehicle: { make: "TOYOTA", model: "HILUX", lowest_year: 2015 }, alternatives: [] })]);
  const result = await client.lookup("ABC123", "VIC");
  if (result.success) {
    assert.equal(result.vehicle.make, "TOYOTA");
    assert.equal(result.vehicle.year, 2015);
  }
  assert.deepEqual(result.alternatives, []);
});
