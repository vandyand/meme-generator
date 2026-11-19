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

// Models sometimes wrap the caption in quotes despite instructions.
const cleanCaption = (text) =>
  text
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();

module.exports = { getCaptionPrompt, getImagePrompt, cleanCaption };
