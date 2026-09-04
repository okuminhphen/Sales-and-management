import { z } from "zod";

export const notificationIdParams = z.object({ id: z.coerce.number().int().positive() });
