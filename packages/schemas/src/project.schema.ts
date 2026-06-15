import { z } from "zod";

export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  createdAt: z.string().datetime()
});

export type Project = z.infer<typeof ProjectSchema>;
