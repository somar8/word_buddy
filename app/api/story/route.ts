import { generateJson } from "@/lib/server/gemini";
import { handle, HttpError, readJson, requireUser, spendAiQuota } from "@/lib/server/http";
import { cleanStory, storyPrompt, storySchema, type StoryContent } from "@/lib/server/story";

const MAX_WORDS = 7;

/**
 * Today's story for the language being learned: made once per day from the learner's most recent words,
 * then stored, so opening it again costs no AI request.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, level, lang, prefs } = await requireUser(req);
    const { today } = await readJson<{ today?: string }>(req);
    if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new HttpError(400, "Invalid date.", "bad_request");

    const existing = await supabase
      .from("stories")
      .select("id, content, word_ids, score")
      .eq("language", lang)
      .eq("day", today)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return { story: existing.data };

    // The words you met most recently: last reviewed or added.
    const { data, error } = await supabase
      .from("words")
      .select("id, word, article, last_reviewed_on, added_on")
      .eq("language", lang)
      .order("last_reviewed_on", { ascending: false, nullsFirst: false })
      .order("added_on", { ascending: false })
      .limit(MAX_WORDS);
    if (error) throw error;
    const words = data ?? [];
    if (words.length < 3) {
      throw new HttpError(422, "Add at least 3 words first — the story is written with your own words.", "too_few_words");
    }

    await spendAiQuota(supabase);
    const forms = words.map((w) => (w.article ? `${w.article} ${w.word}` : w.word));
    const content = cleanStory(await generateJson<StoryContent>(storyPrompt(forms, lang, level, prefs.support), storySchema, 0.8));
    if (!content.text || content.questions.length === 0) {
      throw new HttpError(502, "The AI sent back a story the app couldn't use. Try again.", "ai_bad_answer", true);
    }

    const saved = await supabase
      .from("stories")
      .upsert(
        { language: lang, day: today, word_ids: words.map((w) => w.id), content },
        { onConflict: "user_id,language,day", ignoreDuplicates: false },
      )
      .select("id, content, word_ids, score")
      .single();
    if (saved.error) throw saved.error;
    return { story: saved.data };
  });
}
