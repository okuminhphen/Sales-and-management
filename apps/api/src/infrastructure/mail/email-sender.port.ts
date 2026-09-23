export interface SendEmailOptions {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    from?: string;
}

export interface SendEmailResult {
    id?: string;
    success: boolean;
}

export interface EmailSender {
    send(options: SendEmailOptions): Promise<SendEmailResult>;
}
