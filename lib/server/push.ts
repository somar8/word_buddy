import { sendNotification, setVapidDetails } from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./http";

let configured = false;

function setup() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:word-buddy@example.com";
  if (!publicKey || !privateKey) {
    throw new HttpError(500, "Server is missing the VAPID keys. See README.");
  }
  setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

export type PushMessage = { title: string; body: string; url: string };

/** Sends a message to the given subscriptions and removes ones the browser dropped. */
export async function sendPush(
  db: SupabaseClient,
  subs: Sub[],
  message: PushMessage,
): Promise<number> {
  setup();
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(message),
          { TTL: 60 * 60 * 12 },
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.from("push_subscriptions").delete().eq("id", s.id);
        } else {
          console.error("push failed", status, err);
        }
      }
    }),
  );
  return sent;
}

export function reminderText(due: number): PushMessage {
  return {
    title: "Word Buddy",
    body:
      due === 1
        ? "1 word is waiting for you. Time for your review!"
        : `${due} words are waiting for you. Time for your review!`,
    url: "/review",
  };
}
