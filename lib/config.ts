/** The MVP is Dutch at B1 only. Levels and languages become settings in the next phase. */
export const TARGET_LANGUAGE = "Dutch";
export const SUPPORT_LANGUAGE = "English";
export const LEVEL = "B1";

/** Days after adding a word when each of the 6 reviews is due. */
export const REVIEW_DAYS = [1, 3, 7, 14, 30, 60];

/** Once learned, a word comes back for a check this often. */
export const LEARNED_CHECK_DAYS = 90;

/** Daily limits that keep the review session short. */
export const MAX_REVIEWS_PER_DAY = 60;
export const MAX_NEW_WORDS_PER_DAY = 10;

/** Free-tier Gemini model; override with GEMINI_MODEL if Google renames it. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
