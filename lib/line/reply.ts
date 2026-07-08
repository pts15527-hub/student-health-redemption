type LineTextMessage = {
  type: "text";
  text: string;
  quickReply?: {
    items: Array<{
      type: "action";
      action: {
        type: "message";
        label: string;
        text: string;
      };
    }>;
  };
};

type ReplyPayload = {
  replyToken: string;
  messages: LineTextMessage[];
};

type ReplyOptions = {
  quickReplies?: Array<{
    label: string;
    text: string;
  }>;
};

const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";

export async function replyLineText(replyToken: string, text: string, options: ReplyOptions = {}) {
  const message: LineTextMessage = {
    type: "text",
    text,
  };

  if (options.quickReplies?.length) {
    message.quickReply = {
      items: options.quickReplies.map((quickReply) => ({
        type: "action",
        action: {
          type: "message",
          label: quickReply.label,
          text: quickReply.text,
        },
      })),
    };
  }

  const payload: ReplyPayload = {
    replyToken,
    messages: [message],
  };

  if (shouldDryRunLineReply()) {
    return {
      dryRun: true,
      payload,
    };
  }

  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!channelAccessToken) {
    throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN.");
  }

  const response = await fetch(LINE_REPLY_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${channelAccessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LINE reply API failed: ${response.status} ${body}`);
  }

  return {
    dryRun: false,
    payload,
  };
}

function shouldDryRunLineReply() {
  return process.env.LINE_REPLY_DRY_RUN !== "false";
}
