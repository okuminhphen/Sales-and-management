import { z } from "zod";

const entityId = z.string().regex(/^[1-9]\d{0,18}$/)
    .pipe(z.string().refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n));

export const inventoryBranchV2Params = z.object({ branchId: entityId }).strict();
