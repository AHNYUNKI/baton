import { z } from "zod";

export const BatonConfigSchema = z
  .object({
    version: z.literal(1),
    obsidian: z
      .object({
        vault: z.string().optional()
      })
      .strict()
      .optional(),
    test: z
      .object({
        command: z.array(z.string()).optional()
      })
      .strict()
      .optional(),
    workers: z
      .object({
        codex: z.boolean().optional(),
        claude: z.boolean().optional(),
        test: z.boolean().optional(),
        fix: z.boolean().optional(),
        maxFixAttempts: z.number().int().min(1).max(5).optional()
      })
      .strict()
      .optional()
  })
  .strict();

export type BatonConfig = z.infer<typeof BatonConfigSchema>;
