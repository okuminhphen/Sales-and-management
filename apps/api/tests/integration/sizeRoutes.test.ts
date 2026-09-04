import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createSizeRouter } from "../../src/modules/size/size.routes.js";
import { SizeService } from "../../src/modules/size/size.service.js";
import type {
    CreateSizeCommand,
    SizeDto,
    SizeRepository,
    UpdateSizeCommand,
} from "../../src/modules/size/size.types.js";

class FakeSizeRepository implements SizeRepository {
    async list(): Promise<SizeDto[]> {
        return [{ id: 1, name: "M" }];
    }

    async create(command: CreateSizeCommand): Promise<SizeDto> {
        return { id: 2, name: command.name };
    }

    async update(command: UpdateSizeCommand): Promise<SizeDto | null> {
        return command.id === 1 ? { id: 1, name: command.name } : null;
    }

    async delete(id: number): Promise<boolean> {
        return id === 1;
    }
}

const createTestApp = () => {
    const app = express();
    app.use(express.json());
    app.use(
        "/api/v1/size",
        createSizeRouter({
            service: new SizeService(new FakeSizeRepository()),
            invalidateCache: vi.fn(async () => undefined),
            readCache: (_request, _response, next) => next(),
        })
    );
    return app;
};

describe("size routes", () => {
    it("exposes the typed CRUD contract", async () => {
        const app = createTestApp();

        expect((await request(app).get("/api/v1/size/read")).body.DT).toEqual([
            { id: 1, name: "M" },
        ]);
        expect(
            (await request(app).post("/api/v1/size/create").send({ name: "L" })).status
        ).toBe(201);
        expect(
            (await request(app).put("/api/v1/size/update").send({ id: 9, name: "XL" }))
                .status
        ).toBe(404);
        expect((await request(app).delete("/api/v1/size/delete/1")).status).toBe(200);
    });

    it("rejects malformed input before reaching persistence", async () => {
        const response = await request(createTestApp())
            .post("/api/v1/size/create")
            .send({ name: "" });

        expect(response.status).toBe(400);
        expect(response.body.EC).toBe(1);
    });
});
