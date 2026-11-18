import { handle, requireUser } from "@/lib/server/http";
import { sendPush } from "@/lib/server/push";

/** Sends a test notification to the signed-in user's devices. */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase } = await requireUser(req);
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth");
    if (error) throw error;
    const sent = await sendPush(supabase, data ?? [], {
      title: "Word Buddy",
      body: "It works! You'll get a reminder every morning.",
      url: "/review",
    });
    return { sent };
  });
}
