import { z } from "zod";

import { RunSchema, RunStatusSchema } from "./run.schema.js";

export const READ_API_SCHEMA_VERSION = 1;

const NonnegativeIntegerSchema = z.number().int().nonnegative();

export const RunSummaryJsonSchema = z.object({
  runId: z.string().min(1),
  status: RunStatusSchema,
  dryRun: z.boolean(),
  workflowId: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  stepCount: NonnegativeIntegerSchema,
  outcome: RunStatusSchema.optional()
});

export const RunListJsonSchema = z.object({
  runs: z.array(RunSummaryJsonSchema),
  skipped: NonnegativeIntegerSchema
});

export const RunDetailJsonSchema = z.object({
  run: RunSchema,
  artifacts: z.array(z.string().min(1))
});

export const RunStatusCountsJsonSchema = z.object({
  planned: NonnegativeIntegerSchema,
  running: NonnegativeIntegerSchema,
  "awaiting-approval": NonnegativeIntegerSchema,
  completed: NonnegativeIntegerSchema,
  failed: NonnegativeIntegerSchema,
  cancelled: NonnegativeIntegerSchema
});

export const StateJsonSchema = z.object({
  total: NonnegativeIntegerSchema,
  byStatus: RunStatusCountsJsonSchema,
  recent: z.array(RunSummaryJsonSchema)
});

export const WatchEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("run.created"),
    runId: z.string().min(1),
    status: RunStatusSchema,
    run: RunSummaryJsonSchema
  }),
  z.object({
    type: z.literal("run.removed"),
    runId: z.string().min(1),
    status: RunStatusSchema,
    run: RunSummaryJsonSchema
  }),
  z.object({
    type: z.literal("run.status-changed"),
    runId: z.string().min(1),
    previousStatus: RunStatusSchema,
    status: RunStatusSchema,
    run: RunSummaryJsonSchema
  }),
  z.object({
    type: z.literal("run.updated"),
    runId: z.string().min(1),
    status: RunStatusSchema,
    previousUpdatedAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
    run: RunSummaryJsonSchema
  })
]);

export const JsonEnvelopeSchema = z.object({
  schemaVersion: z.literal(READ_API_SCHEMA_VERSION),
  kind: z.string().min(1),
  data: z.unknown()
});

export const RunListEnvelopeSchema = JsonEnvelopeSchema.extend({
  kind: z.literal("run-list"),
  data: RunListJsonSchema
});

export const RunDetailEnvelopeSchema = JsonEnvelopeSchema.extend({
  kind: z.literal("run-detail"),
  data: RunDetailJsonSchema
});

export const StateEnvelopeSchema = JsonEnvelopeSchema.extend({
  kind: z.literal("state"),
  data: StateJsonSchema
});

export const WatchEventEnvelopeSchema = JsonEnvelopeSchema.extend({
  kind: z.literal("event"),
  data: WatchEventSchema
});

export type RunSummaryJson = z.infer<typeof RunSummaryJsonSchema>;
export type RunListJson = z.infer<typeof RunListJsonSchema>;
export type RunDetailJson = z.infer<typeof RunDetailJsonSchema>;
export type RunStatusCountsJson = z.infer<typeof RunStatusCountsJsonSchema>;
export type StateJson = z.infer<typeof StateJsonSchema>;
export type WatchEvent = z.infer<typeof WatchEventSchema>;

export type JsonEnvelope<TKind extends string = string, TData = unknown> = {
  schemaVersion: typeof READ_API_SCHEMA_VERSION;
  kind: TKind;
  data: TData;
};

export function makeEnvelope<TKind extends string, TData>(kind: TKind, data: TData): JsonEnvelope<TKind, TData> {
  return {
    schemaVersion: READ_API_SCHEMA_VERSION,
    kind,
    data
  };
}
