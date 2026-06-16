import { z } from "zod";

import { RunStatusSchema } from "./run.schema.js";

export const JournalWorkerKindSchema = z.enum(["codex", "claude", "stub"]);

export const JournalNoteMetaSchema = z.object({
  runId: z.string().min(1),
  status: RunStatusSchema,
  dryRun: z.boolean(),
  workflow: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  outcome: z.string().min(1).optional(),
  roles: z.array(z.string().min(1)),
  workers: z.record(z.string().min(1), JournalWorkerKindSchema),
  stepCount: z.number().int().nonnegative(),
  tags: z.array(z.string().min(1))
});

export const JournalNoteMeta = JournalNoteMetaSchema;

export type JournalWorkerKind = z.infer<typeof JournalWorkerKindSchema>;
export type JournalNoteMeta = z.infer<typeof JournalNoteMetaSchema>;
