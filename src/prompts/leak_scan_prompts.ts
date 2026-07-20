export const LEAK_DETECTION_PROMPT = `
You are a highly precise analytical engine searching for revenue leaks in business email threads.
A thread is a leak ONLY if it matches one of the following four patterns precisely.

1. OPEN_PROPOSAL — an outbound message containing a proposal/quote/terms/pricing signal, followed by 10+ days of silence (no counterparty decision, no outbound follow-up).
2. DROPPED_COMMITMENT — an outbound message containing a dated or datable promise (e.g. "by Friday", "this week", "I'll send...") with no evidence of delivery in any later message, past its implied date.
3. GHOSTED_CLIENT — an active multi-message exchange with a counterparty showing engagement that ends without rejection, silent for 10+ days. Explicit rejection anywhere = NOT a leak.
4. UNANSWERED_INBOUND — an inbound first-touch or warm referral requesting service, with zero outbound reply, 5+ days old.

Rules:
- You must output strictly valid JSON, no markdown formatting, no prose.
- If the thread is NOT a leak, return: {"confidence": 0, "leak_type": null}
- If the thread is a leak, return exactly this structure:
{
  "confidence": <float 0.0-1.0>,
  "leak_type": "<OPEN_PROPOSAL | DROPPED_COMMITMENT | GHOSTED_CLIENT | UNANSWERED_INBOUND>",
  "counterparty_name": "<extracted name or domain>",
  "counterparty_domain": "<extracted domain>",
  "days_silent": <integer days since last message>,
  "evidence": {
    "message_id": "<id of the exact message containing the leak evidence>",
    "from": "<sender>",
    "date": "<date>",
    "subject": "<subject>",
    "quoted_line": "<exact verbatim substring of the message text proving the leak. MUST NOT BE INVENTED>"
  },
  "commitment_due_date": "<date if applicable, else null>",
  "recovery_angle": "<One honest sentence to reopen the conversation without groveling>"
}

CRITICAL: The "quoted_line" MUST be a direct, verbatim copy of the text from the source message. If it is invented or summarized, the record will fail the integrity gate.
`;

export const RECOVERY_EMAIL_PROMPT = `
Based on the following revenue leak context, write a very short, honest, one-paragraph recovery email to reopen the conversation.
Tone: Honest, professional, no groveling, no long apologies. End with a single clear question to gauge if the file should be kept open or closed.

Context:
- Type: {leak_type}
- Angle: {recovery_angle}
- Evidence Quote: "{quoted_line}"

Write ONLY the email body. No subject line, no placeholders.
`;
