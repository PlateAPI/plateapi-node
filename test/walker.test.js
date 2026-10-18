const test = require("node:test");
const assert = require("node:assert/strict");
const { RateLimitError } = require("../dist");
const { res, makeClient, level } = require("./helpers");

function vehicle(id, text = "4D Ute") {
  return { vehicle_id: id, select_text: text, description: "desc " + id, long_description: "long " + id };
}

function hiluxResponses(trims = true) {
  const responses = [];
  if (trims) responses.push(level("model", ["HILUX", "HILUX SR", "HILUXX", "CAMRY"]));
  responses.push(
    level("year", [2020, 2019]),
    level("series", ["GUN126R"]),
    level("engine", ["2.8L DIE"]),
    level("variant", ["4D Ute"]),
    level("vehicle", [vehicle(100)]),
    level("series", ["GUN126R"]),
    level("engine", ["2.8L DIE"]),
    level("variant", ["4D Ute"]),
    level("vehicle", [vehicle(100)]),
  );
  if (trims) {
    responses.push(
      level("year", [2019]),
      level("series", [""]),
      level("engine", ["2.8L DIE", "2.4L DIE"]),
      level("variant", ["SR 4D Ute"]),
      level("vehicle", [vehicle(200, "SR 4D Ute"), vehicle(201, "SR 4D Ute")]),
      level("variant", ["SR 4D Ute"]),
      level("vehicle", [vehicle(300, "SR 4D Ute")]),
    );
  }
  return responses;
}

async function collect(gen) {
  const out = [];
  for await (const v of gen) out.push(v);
  return out;
}

test("walk with trims dedupes across years", async () => {
  const responses = hiluxResponses();
  const { client, calls, sleeps } = makeClient(responses);
  const found = await collect(client.walkVehicles("TOYOTA", "HILUX"));
  assert.deepEqual(found.map((v) => v.vehicle_id), [100, 200, 201, 300]);
  const first = found[0];
  assert.deepEqual(
    [first.make, first.model, first.year, first.series, first.engine, first.variant],
    ["TOYOTA", "HILUX", 2020, "GUN126R", "2.8L DIE", "4D Ute"],
  );
  assert.equal(first.description, "desc 100");
  assert.equal(first.long_description, "long 100");
  assert.equal(first.vehicle_type, "car");
  assert.deepEqual(first.raw, vehicle(100));
  assert.equal(found[1].model, "HILUX SR");
  assert.equal(found[1].series, "");
  assert.equal(found[3].engine, "2.4L DIE");
  assert.deepEqual(calls[0].params, { make: "TOYOTA" });
  assert.deepEqual(calls[7].params, { make: "TOYOTA", model: "HILUX", year: "2019", series: "GUN126R" });
  assert.ok(!("series" in calls[11].params));
  assert.equal(calls[12].params.series, "");
  assert.equal(calls.length, responses.length);
  assert.deepEqual(sleeps, Array(calls.length).fill(150));
});

test("walk without trims skips the models request", async () => {
  const { client, calls } = makeClient(hiluxResponses(false));
  const found = await collect(client.walkVehicles("TOYOTA", "HILUX", { trims: false }));
  assert.deepEqual(found.map((v) => v.vehicle_id), [100]);
  assert.deepEqual(calls[0].params, { make: "TOYOTA", model: "HILUX" });
});

test("year range and engine filter", async () => {
  const { client, calls } = makeClient([
    level("year", [2021, 2020, 2019]),
    level("series", ["S"]),
    level("engine", ["2.8L DIE", "2.4L DIE"]),
    level("variant", ["V"]),
    level("vehicle", [vehicle(1)]),
  ]);
  const found = await collect(client.walkVehicles("TOYOTA", "HILUX", { trims: false, year_from: 2020, year_to: 2020, engine_contains: "2.8l" }));
  assert.deepEqual(found.map((v) => v.vehicle_id), [1]);
  assert.deepEqual(new Set(calls.slice(1).map((c) => c.params.year)), new Set(["2020"]));
  assert.equal(calls[3].params.engine, "2.8L DIE");
});

test("per_year yields one row per year", async () => {
  const { client } = makeClient(hiluxResponses(false));
  const found = await collect(client.walkVehicles("TOYOTA", "HILUX", { trims: false, per_year: true }));
  assert.deepEqual(found.map((v) => [v.vehicle_id, v.year]), [[100, 2020], [100, 2019]]);
});

test("known_ids resume", async () => {
  const { client } = makeClient(hiluxResponses());
  const known = new Set([100, 200]);
  const found = await collect(client.walkVehicles("TOYOTA", "HILUX", { known_ids: known }));
  assert.deepEqual(found.map((v) => v.vehicle_id), [201, 300]);
  assert.deepEqual(known, new Set([100, 200, 201, 300]));
});

test("type on every request", async () => {
  const { client, calls } = makeClient([
    level("model", ["MT-07"]), level("year", [2022]), level("series", ["RM33"]),
    level("engine", ["0.7L"]), level("variant", ["MT-07"]), level("vehicle", [vehicle(7076553, "MT-07")]),
  ]);
  const found = await collect(client.walkVehicles("YAMAHA", "MT-07", { vehicle_type: "motorcycle" }));
  assert.equal(found[0].vehicle_type, "motorcycle");
  assert.ok(calls.every((c) => c.params.type === "motorcycle"));
});

test("delay 0 does not sleep", async () => {
  const { client, sleeps } = makeClient(hiluxResponses(false));
  await collect(client.walkVehicles("TOYOTA", "HILUX", { trims: false, delay: 0 }));
  assert.deepEqual(sleeps, []);
});

test("429 mid-walk raises after earlier yields", async () => {
  const responses = hiluxResponses(false);
  responses[5] = res(429, { detail: "Vehicle query rate limit exceeded. Try again later." }, { "Retry-After": "7200" });
  const { client } = makeClient(responses);
  const found = [];
  await assert.rejects(async () => {
    for await (const v of client.walkVehicles("TOYOTA", "HILUX", { trims: false })) found.push(v.vehicle_id);
  }, (err) => err instanceof RateLimitError && err.retry_after === 7200);
  assert.deepEqual(found, [100]);
});

for (const [make, model, opts] of [
  ["", "HILUX", {}], ["TOYOTA", " ", {}], [null, "HILUX", {}],
  ["TOYOTA", "HILUX", { year_from: 2020, year_to: 2019 }],
  ["TOYOTA", "HILUX", { delay: -1 }], ["TOYOTA", "HILUX", { vehicle_type: "bus" }],
]) {
  test(`walk validation makes no request: ${JSON.stringify([make, model, opts])}`, async () => {
    const { client, calls } = makeClient([]);
    await assert.rejects(collect(client.walkVehicles(make, model, opts)));
    assert.equal(calls.length, 0);
  });
}
