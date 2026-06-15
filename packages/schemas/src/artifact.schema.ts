import { z } from "zod";

export const ArtifactKindSchema = z.enum([
  "request",
  "analysis",
  "design",
  "tasks",
  "test_result",
  "review",
  "final_summary",
  "log",
  "other"
]);

export const ArtifactSchema = z.object({
  runId: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  kind: ArtifactKindSchema
});

export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;
