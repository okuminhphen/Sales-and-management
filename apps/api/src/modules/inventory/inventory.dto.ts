import { z } from "zod";

export const branchIdParams = z.object({ branchId: z.coerce.number().int().positive() });
