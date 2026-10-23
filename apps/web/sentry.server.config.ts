import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./lib/sentry-scrub";

Sentry.init({
  dsn: process.env["NEXT_PUBLIC_SENTRY_DSN"],
  environment: process.env["NODE_ENV"],
  tracesSampleRate: 0.1,
  // /api/internal/* bodies carry customer SMTP passwords: never send them.
  beforeSend: (event) => scrubSentryEvent(event as never) as typeof event,
});
