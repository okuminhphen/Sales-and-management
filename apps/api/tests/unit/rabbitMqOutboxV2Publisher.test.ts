import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import type { ConfirmChannel } from "amqplib";
import { RabbitMqOutboxV2Publisher } from "../../src/infrastructure/events/rabbitmq-outbox-v2.publisher.js";
import type { OutboxV2Event } from "../../src/modules/outbox/application/outbox-publisher-v2.worker.js";

const event: OutboxV2Event = {
    eventId: "a32345aa-4113-4d3e-a89b-366e62640002", eventType: "catalog.product.upserted",
    aggregateType: "product", aggregateId: "9007199254740993",
    payload: { product_id: "9007199254740993" }, occurredAt: "2026-09-25T00:00:00.000Z",
};

describe("RabbitMQ V2 outbox adapter", () => {
    it("sends the stable eventId in a persistent message and waits for broker acknowledgement", async () => {
        let ack: ((error: Error | null) => void) | undefined;
        let sent: { exchange: string; key: string; body: string; options: Record<string, unknown> } | undefined;
        const channel = Object.assign(new EventEmitter(), { publish: (exchange: string, key: string, body: Buffer,
            options: Record<string, unknown>, callback: (error: Error | null) => void) => {
            sent = { exchange, key, body: body.toString("utf8"), options };
            ack = callback;
            return true;
        } }) as unknown as ConfirmChannel;
        const publishing = new RabbitMqOutboxV2Publisher(channel).publish(event);
        expect(sent?.exchange).toBe("sales.domain-events");
        expect(sent?.key).toBe(event.eventType);
        expect(sent?.options).toMatchObject({ persistent: true, mandatory: true,
            contentType: "application/json", messageId: event.eventId });
        expect(JSON.parse(sent!.body)).toEqual(event);
        ack?.(null);
        await expect(publishing).resolves.toBeUndefined();
    });

    it("keeps a negative broker acknowledgement as a retryable failure", async () => {
        const channel = Object.assign(new EventEmitter(), { publish: (_exchange: string, _key: string, _body: Buffer,
            _options: Record<string, unknown>, callback: (error: Error | null) => void) => {
            callback(new Error("nack"));
            return true;
        } }) as unknown as ConfirmChannel;
        await expect(new RabbitMqOutboxV2Publisher(channel).publish(event)).rejects.toThrow("nack");
    });

    it("times out an unacknowledged publish so the worker can reconnect", async () => {
        const channel = Object.assign(new EventEmitter(), { publish: () => true }) as unknown as ConfirmChannel;
        await expect(new RabbitMqOutboxV2Publisher(channel, 5).publish(event)).rejects.toThrow("timed out");
    });

    it("does not acknowledge an unroutable message even when the exchange confirms it", async () => {
        const emitter = new EventEmitter();
        const channel = Object.assign(emitter, { publish: (_exchange: string, _key: string, _body: Buffer,
            _options: Record<string, unknown>, callback: (error: Error | null) => void) => {
            emitter.emit("return", { properties: { messageId: event.eventId } });
            callback(null);
            return true;
        } }) as unknown as ConfirmChannel;
        await expect(new RabbitMqOutboxV2Publisher(channel).publish(event)).rejects.toThrow("unroutable");
    });
});
