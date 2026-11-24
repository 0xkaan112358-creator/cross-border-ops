import { z } from "zod";

export const replenishmentSettingsSchema = z.object({
  safetyDays: z.number().int().min(0).max(120),
  coverDays: z.number().int().min(7).max(180),
  excessBufferDays: z.number().int().min(0).max(365),
  agedShareThreshold: z.number().min(0).max(1),
  weights: z.tuple([z.number().min(0), z.number().min(0), z.number().min(0)]),
});
export type ReplenishmentSettings = z.infer<typeof replenishmentSettingsSchema>;

export const DEFAULT_REPLENISHMENT: ReplenishmentSettings = {
  safetyDays: 14,
  coverDays: 30,
  excessBufferDays: 45,
  agedShareThreshold: 0.25,
  weights: [0.5, 0.3, 0.2],
};

export const csSettingsSchema = z.object({
  confidenceThreshold: z.number().min(0.3).max(0.99),
  aiEligibleIntents: z.array(z.enum(["logistics", "usage"])),
});
export type CsSettings = z.infer<typeof csSettingsSchema>;

export const DEFAULT_CS: CsSettings = {
  confidenceThreshold: 0.75,
  aiEligibleIntents: ["logistics", "usage"],
};
