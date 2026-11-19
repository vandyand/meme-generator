const axios = require("axios");

const OPENAI_BASE_URL = "https://api.openai.com/v1";

// Defaults reflect OpenAI's model list as of Nov 2026 (dall-e-3, gpt-image-1
// and gpt-3.5-turbo have all been shut down). Override via env vars.
const DEFAULT_TEXT_MODEL = "gpt-6-luna";
const DEFAULT_IMAGE_MODEL = "gpt-image-2.6-sunburst";
const DEFAULT_IMAGE_SIZE = "1024x1024";

const getConfig = (env = process.env) => {
  const temperature =
    env.OPENAI_TEXT_TEMPERATURE !== undefined &&
    env.OPENAI_TEXT_TEMPERATURE !== ""
      ? Number(env.OPENAI_TEXT_TEMPERATURE)
      : undefined;

  return {
    apiKey: env.OPENAI_API_KEY,
    textModel: env.OPENAI_TEXT_MODEL || DEFAULT_TEXT_MODEL,
    imageModel: env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    imageSize: env.OPENAI_IMAGE_SIZE || DEFAULT_IMAGE_SIZE,
    temperature: Number.isFinite(temperature) ? temperature : undefined,
  };
};

const authHeaders = (apiKey) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${apiKey}`,
});

const generateText = async (prompt, { http = axios, env } = {}) => {
  const config = getConfig(env);
  const body = {
    model: config.textModel,
    messages: [{ role: "user", content: prompt }],
  };
  // Newer reasoning models may reject `temperature`, so only send it when set.
  if (config.temperature !== undefined) body.temperature = config.temperature;

  const response = await http.post(`${OPENAI_BASE_URL}/chat/completions`, body, {
    headers: authHeaders(config.apiKey),
  });

  const content = response.data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Unexpected text response from OpenAI");
  }
  return content.trim();
};

const generateImage = async (prompt, { http = axios, env } = {}) => {
  const config = getConfig(env);
  const response = await http.post(
    `${OPENAI_BASE_URL}/images/generations`,
    {
      model: config.imageModel,
      prompt,
      n: 1,
      size: config.imageSize,
    },
    { headers: authHeaders(config.apiKey), responseType: "json" }
  );

  const image = response.data?.data?.[0];
  if (!image) throw new Error("Unexpected image response from OpenAI");

  // GPT image models return base64 directly; older models returned a URL.
  if (image.b64_json) return image.b64_json;
  if (image.url) {
    const imageResponse = await http.get(image.url, {
      responseType: "arraybuffer",
    });
    return Buffer.from(imageResponse.data).toString("base64");
  }
  throw new Error("OpenAI image response contained no image data");
};

module.exports = {
  generateText,
  generateImage,
  getConfig,
  DEFAULT_TEXT_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_SIZE,
};
