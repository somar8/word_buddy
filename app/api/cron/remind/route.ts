import { todayIn } from "@/lib/schedule";
import { handle, HttpError, serviceClient } from "@/lib/server/http";
import { reminderText, sendPush } from "@/lib/server/push";

/**
 * Runs once a day (see vercel.json). Sends each user one reminder with the number
 * of words due. Querying the database daily also keeps the free Supabase project
 * from being paused for inactivity.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
      throw new HttpError(401, "Unauthorized");
    }

    const db = serviceClient();
    const today = todayIn(process.env.APP_TIME_ZONE || "Europe/Amsterdam");

    const { data: subs, error } = await db
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth");
    if (error) throw error;

    const byUser = new Map<string, NonNullable<typeof subs>>();
    for (const s of subs ?? []) {
      byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
    }

    let sent = 0;
    for (const [userId, userSubs] of byUser) {
      const { count } = await db
        .from("words")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .lte("due_on", today);
      if (count && count > 0) sent += await sendPush(db, userSubs, reminderText(count));
    }
    return { today, users: byUser.size, sent };
  });
}
