import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Mail } from "lucide-react";
import {
  confirmationRequired,
  isNewsletterConfigured,
  subscribeToNewsletter,
} from "./lib/newsletter";

type FormState = "idle" | "submitting" | "success" | "error";

function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.includes("@") && trimmed.includes(".");
}

export default function Newsletter() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const valid = isValidEmail(email);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || state === "submitting") {
      return;
    }
    setState("submitting");
    setErrorMessage("");
    try {
      await subscribeToNewsletter(email.trim());
      setState("success");
      setEmail("");
    } catch (error) {
      setState("error");
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : "Subscription failed. Please try again.",
      );
    }
  }

  return (
    <section className="newsletter" id="newsletter" aria-labelledby="newsletter-title">
      <div className="newsletter-card">
        <span className="newsletter-icon" aria-hidden="true">
          <Mail size={20} strokeWidth={1.8} />
        </span>
        <h2 className="newsletter-title" id="newsletter-title">
          Stay in the loop
        </h2>
        <p className="newsletter-text">
          Get notified about BSO token milestones, the Bitsocial Chain L2, and ecosystem news. Low
          frequency, high signal.
        </p>

        {state === "success" ? (
          <p className="newsletter-success" role="status">
            <Check size={18} strokeWidth={2} aria-hidden="true" />
            {confirmationRequired
              ? "Check your email to confirm your subscription."
              : "You're on the list."}
          </p>
        ) : (
          <form className="newsletter-form" onSubmit={handleSubmit} noValidate>
            <input
              type="email"
              name="email"
              className="newsletter-input"
              placeholder="you@example.com"
              aria-label="Email address"
              autoComplete="email"
              spellCheck={false}
              required
              value={email}
              disabled={state === "submitting" || !isNewsletterConfigured}
              onChange={(event) => {
                setEmail(event.target.value);
                if (state === "error") {
                  setState("idle");
                }
              }}
            />
            <button
              type="submit"
              className="newsletter-submit"
              disabled={state === "submitting" || !valid || !isNewsletterConfigured}
            >
              {state === "submitting" ? (
                <>
                  <span className="newsletter-spinner" aria-hidden="true" />
                  Subscribing…
                </>
              ) : (
                <>
                  Subscribe
                  <ArrowRight size={16} strokeWidth={1.9} aria-hidden="true" />
                </>
              )}
            </button>
          </form>
        )}

        {state === "error" ? (
          <p className="newsletter-status newsletter-status-error" aria-live="polite">
            {errorMessage}
          </p>
        ) : !isNewsletterConfigured ? (
          <p className="newsletter-status" aria-live="polite">
            Newsletter signup is temporarily unavailable.
          </p>
        ) : null}

        <p className="newsletter-privacy">No spam, ever. Unsubscribe anytime.</p>
      </div>
    </section>
  );
}
