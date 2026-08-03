type ResendMessage = {
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; content: string }>;
};

export async function sendResendEmail(
  message: ResendMessage,
  idempotencyKey?: string,
) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY og RESEND_FROM_EMAIL skal være sat");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({ from, ...message }),
  });
  if (!response.ok) {
    throw new Error(`Resend afviste e-mailen med status ${response.status}`);
  }
  const result: unknown = await response.json();
  if (
    !result ||
    typeof result !== "object" ||
    !("id" in result) ||
    typeof result.id !== "string"
  ) {
    throw new Error("Resend returnerede et ugyldigt svar");
  }
  return result.id;
}
