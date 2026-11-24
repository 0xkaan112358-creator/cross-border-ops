import "server-only";
import type { z } from "zod";
import { sql } from "./db";
import {
  csSettingsSchema,
  DEFAULT_CS,
  DEFAULT_REPLENISHMENT,
  replenishmentSettingsSchema,
  type CsSettings,
  type ReplenishmentSettings,
} from "./settings-defaults";

export * from "./settings-defaults";

async function readSetting<T>(key: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
  const rows = await sql<{ value: unknown }>("select value from app_settings where key = $1", [key]);
  if (rows.length === 0) return fallback;
  const parsed = schema.safeParse(rows[0].value);
  return parsed.success ? parsed.data : fallback;
}

async function writeSetting(key: string, value: unknown) {
  await sql(
    `insert into app_settings (key, value, updated_at) values ($1, $2::jsonb, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

export const getReplenishmentSettings = () =>
  readSetting("replenishment", replenishmentSettingsSchema, DEFAULT_REPLENISHMENT);
export const saveReplenishmentSettings = (v: ReplenishmentSettings) => writeSetting("replenishment", v);

export const getCsSettings = () => readSetting("cs", csSettingsSchema, DEFAULT_CS);
export const saveCsSettings = (v: CsSettings) => writeSetting("cs", v);
