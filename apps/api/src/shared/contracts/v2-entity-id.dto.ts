import { z } from "zod";

const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n;

/** HTTP boundary for every V2 entity column declared as signed MySQL BIGINT. */
export const v2EntityId = z.string().regex(/^[1-9]\d{0,18}$/)
    .pipe(z.string().refine((value) => BigInt(value) <= MAX_SIGNED_BIGINT));
