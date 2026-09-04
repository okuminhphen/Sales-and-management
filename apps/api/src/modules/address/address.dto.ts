import { z } from "zod";

const id = z.coerce.number().int().positive();
export const provinceQuery = z.object({ provinceId: id });
export const districtQuery = z.object({ districtId: id });
