import type { ConfirmChannel } from "amqplib";
import type { OutboxV2Event, OutboxV2EventPublisher } from "../../modules/outbox/application/outbox-publisher-v2.worker.js";

/** The caller owns the channel; only a broker confirm resolves publication. */
export class RabbitMqOutboxV2Publisher implements OutboxV2EventPublisher {
    constructor(private readonly channel: ConfirmChannel, private readonly timeoutMs = 15_000) {
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new TypeError("Invalid publish timeout.");
    }

    publish(event: OutboxV2Event): Promise<void> {
        return new Promise((resolve, reject) => {
            let returned = false;
            const onReturn = (message: { properties?: { messageId?: string } }) => {
                if (message.properties?.messageId === event.eventId) returned = true;
            };
            const finish = (error?: Error) => {
                clearTimeout(timer);
                this.channel.off("return", onReturn);
                error ? reject(error) : resolve();
            };
            const timer = setTimeout(() => finish(new Error("RabbitMQ publish acknowledgement timed out.")), this.timeoutMs);
            this.channel.on("return", onReturn);
            try {
                this.channel.publish("sales.domain-events", event.eventType,
                    Buffer.from(JSON.stringify(event)),
                    { persistent: true, mandatory: true, contentType: "application/json", messageId: event.eventId },
                    (error) => {
                        finish(error ?? (returned ? new Error("RabbitMQ message was unroutable.") : undefined));
                    });
            } catch (error) {
                finish(error instanceof Error ? error : new Error("RabbitMQ publish failed."));
            }
        });
    }
}
