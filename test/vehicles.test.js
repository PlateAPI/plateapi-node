const test = require("node:test");
const assert = require("node:assert/strict");
const { ok, makeClient, level } = require("./helpers");

const RECORD = {
  vehicle_id: 1380801, vehicle_type: "car", make: "TOYOTA", model: "HILUX SR",
  year_range: "2015-2020", lowest_year: 2015, highest_year: 2020,
  years: [2015, 2016, 2017, 2018, 2019, 2020],
  description: "15~20 TOYOTA HILUX 2.8L DIESEL", long_description: "TOYOTA HILUX 10/2015~04/2020",
  series: "GUN126R -GUN126", engine: "2.8L,  DIE 1GDFTV I4 16v DOHC I/C Turbo CRD {130kW}",
  variant: "SR,  4D Ute -, 4WD MR0KA3CD  [THAILAND], AT/MT",
  body: "UTE", body_size: null, doors: 4, drive: "4WD", transmission: "AT/MT", detail: "full",
};

test("vehicles params including empty series", async () => {
  const { client, calls } = makeClient([level("engine", ["2.8L"])]);
  const result = await client.vehicles({ make: "TOYOTA", model: "HILUX", year: 2020, series: "" });
  assert.equal(calls[0].url, "https://api.plateapi.com.au/api/v1/vehicles");
  assert.deepEqual(calls[0].params, { make: "TOYOTA", model: "HILUX", year: "2020", series: "" });
  assert.equal(result.success, true);
  assert.equal(result.type, "engine");
  assert.deepEqual(result.data, ["2.8L"]);
  assert.equal(result.total, 1);
  assert.deepEqual(result.vehicle_ids, []);
  assert.deepEqual(result.vehicles, []);
});

test("makes level and years keep their types", async () => {
  const { client, calls } = makeClient([level("make", ["ABARTH", "TOYOTA"]), level("year", [2021, 2020])]);
  assert.equal((await client.vehicles()).type, "make");
  assert.deepEqual(calls[0].params, {});
  assert.deepEqual((await client.vehicles({ make: "TOYOTA", model: "HILUX" })).data, [2021, 2020]);
});

test("motorcycle type is sent; bad type makes no request", async () => {
  const { client, calls } = makeClient([level("make", ["YAMAHA"])]);
  await client.vehicles({ vehicle_type: "motorcycle" });
  assert.deepEqual(calls[0].params, { type: "motorcycle" });
  await assert.rejects(client.vehicles({ vehicle_type: "truck" }), /Invalid vehicle_type/);
  assert.equal(calls.length, 1);
});

test("vehicle level: records and ids", async () => {
  const { client } = makeClient([level("vehicle", [
    { vehicle_id: 5434441, select_text: "a", description: "d", long_description: "l" },
    { vehicle_id: 2573335, select_text: "b" },
  ])]);
  const result = await client.vehicles({ make: "KIA", model: "SELTOS", year: 2022, series: "EP81A", engine: "2.0L", variant: "x" });
  assert.deepEqual(result.vehicle_ids, [5434441, 2573335]);
  assert.equal(result.vehicles.length, 2);
  assert.equal(result.vehicles[0].long_description, "l");
  assert.equal(result.vehicles[1].description, null);
  assert.equal(result.data[0].vehicle_id, 5434441);
});

test("empty response", async () => {
  const { client } = makeClient([ok({ success: true, data: [], total: 0 })]);
  const result = await client.vehicles({ make: "NOPE" });
  assert.deepEqual(result.data, []);
  assert.equal(result.type, null);
});

test("vehicleById fields", async () => {
  const { client, calls } = makeClient([ok({ success: true, vehicle: RECORD, duration_ms: 2.2 })]);
  const record = await client.vehicleById(1380801);
  assert.equal(calls[0].url, "https://api.plateapi.com.au/api/v1/vehicles/1380801");
  assert.deepEqual(calls[0].params, {});
  assert.equal(record.vehicle_id, 1380801);
  assert.equal(record.vehicle_type, "car");
  assert.equal(record.model, "HILUX SR");
  assert.deepEqual(record.years, [2015, 2016, 2017, 2018, 2019, 2020]);
  assert.equal(record.series, "GUN126R -GUN126");
  assert.equal(record.doors, 4);
  assert.equal(record.drive, "4WD");
  assert.equal(record.transmission, "AT/MT");
  assert.equal(record.body_size, null);
  assert.equal(record.detail, "full");
  assert.deepEqual(record.raw, RECORD);
});

test("vehicleById digit string and basic record", async () => {
  const basic = { ...RECORD, vehicle_id: 7295503, detail: "basic", years: [], series: null, variant: null, long_description: null };
  const { client, calls } = makeClient([ok({ success: true, vehicle: RECORD }), ok({ success: true, vehicle: basic })]);
  await client.vehicleById("1380801");
  assert.ok(calls[0].url.endsWith("/vehicles/1380801"));
  const record = await client.vehicleById(7295503);
  assert.equal(record.detail, "basic");
  assert.deepEqual(record.years, []);
  assert.equal(record.series, null);
});

for (const bad of [true, false, "abc", "", -1, 1.5, null, undefined, "12a"]) {
  test(`vehicleById rejects ${JSON.stringify(bad)}`, async () => {
    const { client, calls } = makeClient([]);
    await assert.rejects(client.vehicleById(bad), /vehicle_id/);
    assert.equal(calls.length, 0);
  });
}
