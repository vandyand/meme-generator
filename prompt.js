const getCaptionPrompt = (captionPrompt, imageDescription) => {
  const context = imageDescription
    ? `\nThe meme image shows: ${imageDescription}\n`
    : "";
  return `Write one short, witty, humorous meme caption based on the idea below.
${context}
Caption idea: ${captionPrompt}

Return only the caption text itself: no quotes, no hashtags, no explanation.`;
};

const getImagePrompt = (imageDescription) =>
  `${imageDescription}. Whimsical, detailed cartoon illustration with plenty of scenic detail. ` +
  `Do not include any text, words, letters, captions, speech bubbles or thought bubbles in the image.`;

// Used after OpenAI's image safety system blocks a prompt. A light paraphrase
// is not enough: describing a character by its signature traits ("a boy wizard
// with a lightning-bolt scar") is blocked just like naming it.
const getSafeImagePromptRewrite = (imagePrompt) =>
  `The image prompt below was blocked by an image generator's safety system, most likely because it names or unmistakably identifies copyrighted or trademarked characters, franchises, real people, or living artists.

Rewrite it so that it describes only ORIGINAL characters and content, while keeping the scene, setting, mood, composition and the joke.

Rules:
- Remove every name of a character, franchise, brand, real person, or living artist, and every place, object, or term that belongs to a specific franchise.
- A paraphrase is NOT enough. Do not describe a protected character by its signature traits either. Drop identifying details such as distinctive scars, specific or iconic weapons and props (for example a glowing sword, a ring on a chain, a shield with a star), costumes, uniforms, color schemes, emblems, logos, hairstyles, and catchphrases.
- Replace each such character with a broad, generic, original archetype that plays the same role in the joke. Example: "Frodo, Luke Skywalker, Harry Potter and Captain America" (or "a barefoot halfling with a ring on a chain, a young space knight with a glowing blue sword, a boy wizard with round glasses and a lightning-bolt scar, and a super soldier with a star-spangled shield") becomes "a small adventurer, a young sci-fi hero, a teenage wizard and a muscular superhero".
- Replace a living artist's name with a plain description of a general art style.
- Keep it to one or two sentences. Do not add text, captions or speech bubbles to the image.

Blocked prompt: ${imagePrompt}

Return only the rewritten prompt: no quotes, no labels, no explanation.`;

// Strip quotes or a "Rewritten prompt:" label a model may add anyway.
const cleanRewrittenPrompt = (text) =>
  cleanCaption(
    String(text)
      .trim()
      .replace(/^(rewritten|revised|new|safe)?\s*prompt\s*:\s*/i, "")
  );

// Models sometimes wrap the caption in quotes despite instructions.
const cleanCaption = (text) =>
  text
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();

module.exports = {
  getCaptionPrompt,
  getImagePrompt,
  getSafeImagePromptRewrite,
  cleanRewrittenPrompt,
  cleanCaption,
};
