# Ampere API — change report v2.0.0 → v2.3.0

_Generated from a structural diff of the OpenAPI spec (`/api/v2-json`) between the
v2.0.0 baseline and the current v2.3.0 release. Purpose: surface **every**
contract change — including ones that never made the human-written changelog — so
API clients can react before an unnoticed change breaks them._

> **Scope note.** This diff compares the **v2.0.0** and **v2.3.0** spec snapshots
> only. We do not hold archived specs for the intermediate **v2.1.0** / **v2.2.0**
> releases, so changes cannot be attributed to a specific minor version — every
> item below happened somewhere in the `2.0.0 → 2.3.0` range. If you can supply
> the intermediate spec snapshots, we can split this per version.

Legend: 🟢 additive / safe · 🟡 review (contract change) · 🔴 likely-breaking / bug

---

## 1. New endpoints (5) — 🟢

**Curtailment-pool group membership**
- `POST   /api/v2/groups/{group_uuid}/addresses/{address_uuid}` — Add an address to a curtailment pool group.
- `DELETE /api/v2/groups/{group_uuid}/addresses/{address_uuid}` — Remove an address from a curtailment pool group.
  - Both return the new `GroupMembershipChangeDto`.

**Battery forecasting**
- `GET  /api/v2/addresses/{address_uuid}/batteries/{battery_uuid}/forecast` — Get the battery forecast for a time range.
- `POST /api/v2/addresses/{address_uuid}/batteries/{battery_uuid}/forecast` — Compute a battery forecast with optional custom electricity prices.
- `GET  /api/v2/addresses/{address_uuid}/batteries/{battery_uuid}/forecast/strategies` — List available battery forecast strategies.

**New schemas backing the above (8):** `BatteryForecastDto`, `BatteryForecastIntervalDto`,
`BatteryForecastPriceDto`, `BatteryForecastStrategyDto`, `BatteryForecastWithPricesRequestDto`,
`PaginatedBatteryForecastDtoResponse`, `PaginatedBatteryForecastStrategyDtoResponse`,
`GroupMembershipChangeDto`.

No endpoints were **removed**.

---

## 2. New / changed required fields — 🟡

These change the response/request contract; clients that validate strictly must adapt.

| Schema | Change | Impact |
|---|---|---|
| `UserGroupDto` | **New field `groupKind`** (enum `PARTNER` \| `CURTAILMENT_POOL`), now **required** | Clients parsing groups will see a new always-present field. |
| `UserGroupDto` | `updatedAt` is now **nullable** | Was always present; handle `null`. |
| `BatteryDto`, `ChargerDto`, `HvacDto`, `SolarInverterInfoDto`, `VehicleInfoDto` | `brand` is **no longer required** | May be absent/null; stop assuming it is set. |
| `SolarInverterProductionForecastDto` | `modelVersion` is **no longer required** | May be absent. |
| `SmartMeterReturnForecastDto` | `intervals` changed **nullable → non-null** | Safer: array is now always present. |
| `SolarInverterProductionForecastDto` | `intervals` changed **nullable → non-null** | Safer: array is now always present. |

---

## 3. Field type corrections (`object` → proper type) — 🟢 (mostly)

In v2.0.0 many fields were mis-declared as `type: object`. v2.3.0 types them
properly. Runtime values are unchanged, but generated clients (orval, openapi-generator,
etc.) will now produce correct primitive/date types instead of opaque objects.

**Timestamps `object` → `string(date-time)`:**
- `BatteryDto`: `createdAt`, `updatedAt`, `installationDate`
- `ChargerDto`: `createdAt`, `updatedAt`, `deletedAt`
- `HvacDto`: `createdAt`, `updatedAt`
- `VehicleDto`: `createdAt`, `updatedAt`, `deletedAt`
- `GridConnectionDto`: `installationDate`, `endDate`
- `ChargerChargeStateDto`, `BatteryChargeStateDto`, `VehicleChargeDto`, `VehicleLocationDto`, `VehicleOdometerDto`: `time`
- `VehicleInfoDto`: `lastSeen`
- `HvacTemperatureStateDto`: `time`
- `FlintDto`, `SparkyDto`: `connectedAt`, `disconnectedAt`, `createdAt`, `updatedAt` (now typed as date-time)

**`BatteryChargeStateDto` numeric/enum fields corrected:**
- `batteryCapacity`, `batteryLevel`, `chargeRate`: `object` → `number`
- `status`: `object` → `string` enum `UNKNOWN | IDLE | CHARGING | DISCHARGING | FAULT`

---

## 4. ⚠️ Regressions — fields that LOST their type — 🔴

**This is the class of change most likely to silently break clients**, and it is
_not_ in the published changelog. These fields were correctly typed in v2.0.0 but
are now declared `type: object` (nullable) in v2.3.0. The underlying API still
returns the original scalar values (the spec's own `example` values confirm this),
so it reads as a **spec-generation bug**, not an intentional contract change.

| Schema | Field | v2.0.0 | v2.3.0 | Runtime value |
|---|---|---|---|---|
| `ChargerDto` | `brand` | `string` | `object` (nullable) | still a string, e.g. `"Zaptec"` |
| `BatteryDto` | `brand` | `string` | `object` (nullable) | still a string, e.g. `"Tesla"` |
| `HvacDto` | `brand` | `string` | `object` (nullable) | still a string, e.g. `"Daikin"` |
| `SolarInverterInfoDto` | `brand` | `string` | `object` (nullable) | still a string, e.g. `"SolarEdge"` |
| `VehicleInfoDto` | `brand` | `string` | `object` (nullable) | still a string, e.g. `"Tesla"` |
| `SmartMeterDeliveryForecastIntervalsDto` | `whSum` | `number` | `object` (nullable) | still a number, e.g. `1000` |
| `SmartMeterReturnForecastIntervalsDto` | `whSum` | `number` | `object` (nullable) | still a number, e.g. `1000` |
| `SolarInverterProductionForecastIntervalsDto` | `whSum` | `number` | `object` (nullable) | still a number, e.g. `1000` |

**Effect on code-generated clients:** tools generate `{ [key: string]: unknown }`
for these fields, so `charger.brand`, `interval.whSum`, etc. lose their type and
require casts.

**Recommended actions**
- **Ampere API team:** fix the serializer so these fields declare `type: string` /
  `type: number` again (the `example` values already imply the right type).
- **API clients (interim):** treat these fields as their documented scalar type; the
  wire format is unchanged. The Developer Playground normalizes them automatically on
  spec pull (see `scripts/pull-spec.mjs` → `normalizeSchema`), so its generated client
  keeps proper `string | null` / `number | null` types.

---

## How this report was produced

1. `npm run api:pull` fetches the live spec into `openapi.json`.
2. The v2.0.0 baseline is the previously vendored `openapi.json` (git history).
3. A structural diff compares paths, operations, parameters, response codes, and
   every schema property (type, format, nullability, enum, required) between the two.

Re-run against a future release to regenerate this report.
