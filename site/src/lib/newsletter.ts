const SUBSCRIBE_URL = import.meta.env.VITE_NEWSLETTER_SUBSCRIBE_URL?.trim();

const LIST_UUIDS = (import.meta.env.VITE_NEWSLETTER_LIST_UUIDS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

/** True when the list uses double opt-in, so we tell the user to confirm via email. */
export const confirmationRequired =
  import.meta.env.VITE_NEWSLETTER_CONFIRMATION_REQUIRED === "true";

/** False until the BSO list URL + UUID are provided, so the form can degrade gracefully. */
export const isNewsletterConfigured = Boolean(SUBSCRIBE_URL && LIST_UUIDS.length > 0);

export class NewsletterUnavailableError extends Error {
  constructor() {
    super("Newsletter signup is not configured.");
    this.name = "NewsletterUnavailableError";
  }
}

type SubscribeResponse = { data?: boolean; message?: string };

// Subscribes an email to the BSO / Bitsocial Network list on the shared ListMonk
// instance. Same client-side POST pattern bitsocial.net uses, so bso-site needs no backend.
export async function subscribeToNewsletter(email: string): Promise<void> {
  if (!SUBSCRIBE_URL || LIST_UUIDS.length === 0) {
    throw new NewsletterUnavailableError();
  }

  const response = await fetch(SUBSCRIBE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, list_uuids: LIST_UUIDS }),
  });

  let payload: SubscribeResponse | null = null;
  try {
    payload = (await response.json()) as SubscribeResponse;
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.data === false) {
    throw new Error(payload?.message ?? "Newsletter signup failed.");
  }
}
