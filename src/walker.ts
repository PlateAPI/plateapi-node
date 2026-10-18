import type {
  CascadeItem,
  CascadeVehicle,
  VehiclesOptions,
  VehiclesResult,
  VehicleType,
  WalkOptions,
  WalkedVehicle,
} from "./types";

export const DEFAULT_WALK_DELAY = 150;
const VALID_VEHICLE_TYPES = new Set<string>(["car", "motorcycle"]);

export interface WalkClient {
  vehicles(options: VehiclesOptions): Promise<VehiclesResult>;
  sleep(ms: number): Promise<void>;
}

function isRecord(item: CascadeItem): item is CascadeVehicle {
  return typeof item === "object" && item !== null;
}

function asText(item: CascadeItem): string {
  return typeof item === "string" ? item : String(item);
}

export async function* walkVehicles(
  client: WalkClient,
  make: string,
  model: string,
  options: WalkOptions = {},
): AsyncGenerator<WalkedVehicle, void, undefined> {
  if (typeof make !== "string" || !make.trim()) {
    throw new Error("make must be a non-empty string");
  }
  if (typeof model !== "string" || !model.trim()) {
    throw new Error("model must be a non-empty string");
  }
  const { year_from, year_to, engine_contains, vehicle_type, per_year } = options;
  if (year_from !== undefined && year_to !== undefined && year_from > year_to) {
    throw new Error("year_from must not be greater than year_to");
  }
  if (vehicle_type !== undefined && !VALID_VEHICLE_TYPES.has(vehicle_type)) {
    throw new Error(`Invalid vehicle_type '${vehicle_type}'. Must be one of: car, motorcycle`);
  }
  const delay = options.delay ?? DEFAULT_WALK_DELAY;
  if (delay < 0) {
    throw new Error("delay must not be negative");
  }
  const trims = options.trims ?? true;
  const seen = options.known_ids ?? new Set<number | string>();
  const needle = engine_contains ? engine_contains.toUpperCase() : null;
  const resultType: VehicleType = vehicle_type ?? "car";

  const fetchLevel = async (params: VehiclesOptions): Promise<CascadeItem[]> => {
    const query: VehiclesOptions = { ...params };
    if (vehicle_type !== undefined) query.vehicle_type = vehicle_type;
    const result = await client.vehicles(query);
    if (delay) await client.sleep(delay);
    return result.data;
  };

  let models: string[];
  if (trims) {
    models = (await fetchLevel({ make }))
      .filter((m): m is string => typeof m === "string")
      .filter((m) => m === model || m.startsWith(model + " "));
  } else {
    models = [model];
  }

  for (const modelName of models) {
    for (const yearValue of await fetchLevel({ make, model: modelName })) {
      const year = Number(yearValue);
      if (!Number.isInteger(year)) continue;
      if (year_from !== undefined && year < year_from) continue;
      if (year_to !== undefined && year > year_to) continue;

      for (const seriesItem of await fetchLevel({ make, model: modelName, year })) {
        const series = asText(seriesItem);
        for (const engineItem of await fetchLevel({ make, model: modelName, year, series })) {
          const engine = asText(engineItem);
          if (needle && !engine.toUpperCase().includes(needle)) continue;
          for (const variantItem of await fetchLevel({ make, model: modelName, year, series, engine })) {
            const variant = asText(variantItem);
            const records = await fetchLevel({ make, model: modelName, year, series, engine, variant });
            for (const record of records) {
              if (!isRecord(record) || typeof record.vehicle_id !== "number") continue;
              const vehicleId = record.vehicle_id;
              const key: number | string = per_year ? `${vehicleId}:${year}` : vehicleId;
              if (seen.has(key)) continue;
              seen.add(key);
              yield {
                vehicle_id: vehicleId,
                make,
                model: modelName,
                year,
                series,
                engine,
                variant: typeof record.select_text === "string" ? record.select_text : variant,
                description: typeof record.description === "string" ? record.description : null,
                long_description:
                  typeof record.long_description === "string" ? record.long_description : null,
                vehicle_type: resultType,
                raw: record,
              };
            }
          }
        }
      }
    }
  }
}
