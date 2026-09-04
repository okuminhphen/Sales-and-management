import { z } from "zod";

export const userIdParams = z.object({ userId: z.coerce.number().int().positive() });
