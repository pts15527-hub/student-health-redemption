export type LineTextCommand = {
  replyToken: string;
  adminUserId: string;
  messageText: string;
};

type LineWebhookBody = {
  events?: unknown;
};

type LineWebhookEvent = {
  type?: unknown;
  replyToken?: unknown;
  source?: {
    userId?: unknown;
  };
  message?: {
    type?: unknown;
    text?: unknown;
  };
};

export function extractLineTextCommands(body: LineWebhookBody) {
  if (!Array.isArray(body.events)) {
    return [];
  }

  return body.events.flatMap((event) => {
    const lineEvent = event as LineWebhookEvent;

    if (lineEvent.type !== "message") return [];
    if (lineEvent.message?.type !== "text") return [];
    if (typeof lineEvent.replyToken !== "string") return [];
    if (typeof lineEvent.source?.userId !== "string") return [];
    if (typeof lineEvent.message.text !== "string") return [];

    return [
      {
        replyToken: lineEvent.replyToken,
        adminUserId: lineEvent.source.userId,
        messageText: lineEvent.message.text,
      },
    ];
  });
}

export function isLineWebhookBody(body: unknown): body is LineWebhookBody {
  return typeof body === "object" && body !== null && Array.isArray((body as LineWebhookBody).events);
}
