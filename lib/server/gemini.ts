import { GoogleGenAI } from "@google/genai";
import { DEFAULT_GEMINI_MODEL } from "../config";
import { HttpError } from "./http";

let client: GoogleGenAI | null = null;

function gemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new HttpError(500, "The server is not set up yet: GEMINI_API_KEY is missing. See the README.", "setup");
  }
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

/** Asks Gemini for JSON that matches the given JSON schema. */
export async function generateJson<T>(
  prompt: string,
  schema: Record<string, unknown>,
  temperature = 0.6,
): Promise<T> {
  const res = await gemini().models.generateContent({
    model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: schema,
      temperature,
      httpOptions: { timeout: 30_000 },
    },
  });
  const text = res.text;
  if (!text) throw new Error("Empty answer from Gemini");
  return JSON.parse(text) as T;
}
