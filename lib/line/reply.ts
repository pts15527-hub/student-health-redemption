type LineTextMessage = {
  type: "text";
  text: string;
};

type ReplyPayload = {
  replyToken: string;
  messages: LineTextMessage[];
};

const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";

export async function replyLineText(replyToken: string, text: string) {
  const payload: ReplyPayload = {
    replyToken,
    messages: [
      {
        type: "text",
        text,
      },
    ],
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
