const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PlateAPIError, AuthenticationError, BadRequestError, PermissionDeniedError,
  NotFoundError, RateLimitError, QuotaExceededError, ServerError,
} = require("../dist");
const { res, ok, makeClient } = require("./helpers");

const FOUND = { success: true, vehicle: { make: "TOYOTA", vehicle_id: 1 } };

for (const [status, cls, body, expected] of [
  [400, BadRequestError, { detail: "Invalid state. Use one of: ACT, NSW" }, "Invalid state. Use one of: ACT, NSW"],
  [401, AuthenticationError, { detail: "API key has been deactivated" }, "API key has been deactivated"],
  [401, AuthenticationError, null, "Request failed (HTTP 401)"],
  [403, PermissionDeniedError, { detail: "This API key is not allowed from your IP address." }, "This API key is not allowed from your IP address."],
  [404, NotFoundError, { success: false, code: "not_found", error: "No vehicle with that vehicle_id." }, "No vehicle with that vehicle_id."],
  [418, PlateAPIError, { detail: "teapot" }, "teapot"],
]) {
  test(`${status} maps to ${cls.name} without retry`, async () => {
    const { client, calls, sleeps } = makeClient([res(status, body, { "X-Request-ID": "req_x" })]);
    await assert.rejects(client.lookup("ABC123", "VIC"), (err) => {
      assert.ok(err instanceof cls, `expected ${cls.name}, got ${err.name}`);
      assert.equal(err.message, expected);
      assert.equal(err.status_code, status);
      assert.equal(err.request_id, "req_x");
      return true;
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(sleeps, []);
  });
}

test("404 carries code", async () => {
  const { client } = makeClient([res(404, { success: false, code: "not_found", error: "No vehicle with that vehicle_id." })]);
  await assert.rejects(client.vehicleById(1), (err) => err instanceof NotFoundError && err.code === "not_found");
});

test("429 Retry-After is slept then success", async () => {
  const { client, calls, sleeps } = makeClient([
    res(429, { detail: "Per-minute rate limit exceeded (10/min on starter plan). Slow down." }, { "Retry-After": "42" }),
    ok(FOUND),
  ]);
  assert.equal((await client.lookup("ABC123", "VIC")).success, true);
  assert.deepEqual(sleeps, [42000]);
  assert.equal(calls.length, 2);
});

test("429 above max_wait raises immediately", async () => {
  const { client, calls, sleeps } = makeClient([
    res(429, { detail: "Vehicle query rate limit exceeded. Try again later." }, { "Retry-After": "61" }),
  ], { max_wait: 60000 });
  await assert.rejects(client.vehicles({ make: "TOYOTA" }), (err) => {
    assert.ok(err instanceof RateLimitError);
    assert.ok(!(err instanceof QuotaExceededError));
    assert.equal(err.retry_after, 61);
    assert.equal(err.message, "Vehicle query rate limit exceeded. Try again later.");
    return true;
  });
  assert.deepEqual(sleeps, []);
  assert.equal(calls.length, 1);
});

test("429 without Retry-After uses backoff then raises", async () => {
  const { client, calls, sleeps } = makeClient(Array(4).fill(null).map(() => res(429, { detail: "slow down" })), { max_retries: 3 });
  await assert.rejects(client.lookup("ABC123", "VIC"), (err) => err instanceof RateLimitError && err.retry_after === undefined);
  assert.equal(sleeps.length, 3);
  assert.equal(calls.length, 4);
});

test("max_wait null sleeps any length", async () => {
  const { client, sleeps } = makeClient([res(429, { detail: "slow down" }, { "Retry-After": "3600" }), ok(FOUND)], { max_wait: null });
  assert.equal((await client.lookup("ABC123", "VIC")).success, true);
  assert.deepEqual(sleeps, [3600000]);
});

test("quota 429 raises at once and is a RateLimitError", async () => {
  const { client, calls, sleeps } = makeClient([
    res(429, { detail: "Monthly quota exceeded. Used 600/600 lookups on starter plan. Upgrade at plateapi.com.au" }, { "Retry-After": "3600" }),
  ]);
  await assert.rejects(client.lookup("ABC123", "VIC"), (err) => {
    assert.ok(err instanceof QuotaExceededError);
    assert.ok(err instanceof RateLimitError);
    assert.equal(err.code, "quota_exceeded");
    assert.equal(err.retry_after, 3600);
    assert.ok(err.message.startsWith("Monthly quota exceeded"));
    return true;
  });
  assert.deepEqual(sleeps, []);
  assert.equal(calls.length, 1);
});

test("quota by body code", async () => {
  const { client } = makeClient([res(429, { code: "quota_exceeded", error: "Quota exceeded" })]);
  await assert.rejects(client.lookup("ABC123", "VIC"), QuotaExceededError);
});

test("503 lookup_failed retried then ServerError", async () => {
  const failed = () => res(503, { success: false, vehicle: null, code: "lookup_failed", error: "Lookup temporarily unavailable. Please retry.", request_id: "req_lf" });
  const { client, calls, sleeps } = makeClient([failed(), failed(), failed(), failed()]);
  await assert.rejects(client.lookup("ABC123", "VIC"), (err) => {
    assert.ok(err instanceof ServerError);
    assert.equal(err.code, "lookup_failed");
    assert.equal(err.status_code, 503);
    assert.equal(err.request_id, "req_lf");
    assert.equal(err.message, "Lookup temporarily unavailable. Please retry.");
    return true;
  });
  assert.equal(calls.length, 4);
  assert.equal(sleeps.length, 3);
});

test("503 Retry-After is slept", async () => {
  const { client, sleeps } = makeClient([
    res(503, { success: false, code: "unavailable", data: [], total: 0 }, { "Retry-After": "5" }),
    ok({ success: true, data: [{ type: "make", data: ["TOYOTA"] }], total: 1 }),
  ]);
  assert.deepEqual((await client.vehicles()).data, ["TOYOTA"]);
  assert.deepEqual(sleeps, [5000]);
});

test("502 html body", async () => {
  const { client } = makeClient([res(502, null), res(502, null), res(502, null), res(502, null)]);
  await assert.rejects(client.lookup("ABC123", "VIC"), (err) => err instanceof ServerError && err.message === "Request failed (HTTP 502)" && err.code === undefined);
});

test("junk Retry-After counts as absent", async () => {
  const { client, sleeps } = makeClient([res(429, { detail: "slow" }, { "Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT" }), ok(FOUND)]);
  await client.lookup("ABC123", "VIC");
  assert.equal(sleeps.length, 1);
  assert.ok(sleeps[0] >= 1000 && sleeps[0] < 2000);
});

test("connection error retried then raised", async () => {
  const { client, sleeps } = makeClient([new TypeError("fetch failed"), new TypeError("fetch failed"), ok(FOUND)]);
  assert.equal((await client.lookup("ABC123", "VIC")).success, true);
  assert.equal(sleeps.length, 2);

  const again = makeClient([1, 2, 3, 4].map(() => new TypeError("fetch failed")));
  await assert.rejects(again.client.lookup("ABC123", "VIC"), (err) => err instanceof PlateAPIError && err.message.startsWith("Connection failed"));
  assert.equal(again.calls.length, 4);
});

test("timeout message", async () => {
  const abort = new Error("aborted");
  abort.name = "AbortError";
  const { client } = makeClient([abort], { max_retries: 0 });
  await assert.rejects(client.lookup("ABC123", "VIC"), (err) => err instanceof PlateAPIError && err.message === "Request timed out");
});
