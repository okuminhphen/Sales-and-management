import { describe, expect, it } from "vitest";
import { InventoryReservationExpiryV2Worker } from "../../src/modules/inventory-transfer/application/inventory-reservation-expiry-v2.worker.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

describe("InventoryReservationExpiryV2Worker", () => {
    it("advances past an unresolved payment instead of starving later expired holds", async () => {
        const first = serializeEntityId("1");
        const second = serializeEntityId("2");
        const searched: Array<string | null> = [];
        const expired: string[] = [];
        const worker = new InventoryReservationExpiryV2Worker({ repository: {
            findNextCandidate: async (afterId) => {
                searched.push(afterId);
                return afterId === null ? first : afterId === first ? second : null;
            },
            expireCandidate: async (id) => {
                if (id === first) return { kind: "skipped" };
                expired.push(id);
                return { kind: "expired" };
            },
        } });
        expect(await worker.runOnce()).toBe(false);
        expect(await worker.runOnce()).toBe(true);
        expect(expired).toEqual([second]);
        expect(await worker.runOnce()).toBe(false);
        expect(searched).toEqual([null, first, second]);
        expect(await worker.runOnce()).toBe(false);
        expect(searched[3]).toBeNull();
    });
});
