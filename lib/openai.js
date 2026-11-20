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

const MAX_REASON_LENGTH = 300;

// Never let anything that looks like an API key reach logs or the client.
const redactSecrets = (text) =>
  String(text).replace(/\b(sk-[A-Za-z0-9_\-*]{4,}|Bearer\s+\S+)/g, "[redacted]");

// A safe summary of an OpenAI failure. Unlike the raw axios error, it carries
// no request config, so the Authorization header cannot leak through it.
class OpenAIError extends Error {
  constructor({ status, code, type, apiMessage, network, message }) {
    super(message);
    this.network = !!network;
    this.name = "OpenAIError";
    this.status = status;
    this.code = code;
    this.type = type;
    this.apiMessage = apiMessage;
  }
}

const toOpenAIError = (error) => {
  if (error instanceof OpenAIError) return error;
  const status = error.response?.status;
  const apiError = error.response?.data?.error;
  const apiMessage =
    apiError && typeof apiError.message === "string"
      ? redactSecrets(apiError.message)
      : undefined;
  const code = apiError?.code ?? undefined;
  const type = apiError?.type ?? undefined;
  const detail = apiMessage || redactSecrets(error.message || "Unknown error");
  const message = `OpenAI request failed${status ? ` (HTTP ${status})` : ""}${
    code ? ` [${code}]` : ""
  }: ${detail}`;
  // Request sent but no response came back (DNS, timeout, connection reset).
  const network = !error.response && !!(error.request || error.code);
  return new OpenAIError({ status, code, type, apiMessage, network, message });
};

// Short reason suitable for showing to the end user. `what` is e.g. "image".
const userFacingReason = (error, what) => {
  const err = toOpenAIError(error);
  const truncate = (t) =>
    t.length > MAX_REASON_LENGTH ? `${t.slice(0, MAX_REASON_LENGTH - 1)}…` : t;

  if (err.status === 401 || err.status === 403) {
    return `The ${what} request failed: the server's OpenAI credentials were rejected.`;
  }
  if (err.status === 429) {
    return `The ${what} request failed: OpenAI rate limit or quota reached. Try again shortly.`;
  }
  if (err.status && err.status < 500) {
    const reason = err.apiMessage || err.code || `HTTP ${err.status}`;
    return truncate(`The ${what} request was refused: ${reason}`);
  }
  if (err.status) {
    return `The ${what} request failed: OpenAI is having problems (HTTP ${err.status}). Try again.`;
  }
  if (err.network) {
    return `The ${what} request failed: could not reach OpenAI.`;
  }
  return `The ${what} request failed: OpenAI returned an unexpected response.`;
};

const callOpenAI = async (fn) => {
  try {
    return await fn();
  } catch (error) {
    throw toOpenAIError(error);
  }
};

const generateText = async (prompt, { http = axios, env } = {}) => {
  const config = getConfig(env);
  const body = {
    model: config.textModel,
    messages: [{ role: "user", content: prompt }],
  };
  // Newer reasoning models may reject `temperature`, so only send it when set.
  if (config.temperature !== undefined) body.temperature = config.temperature;

  const response = await callOpenAI(() =>
    http.post(`${OPENAI_BASE_URL}/chat/completions`, body, {
      headers: authHeaders(config.apiKey),
    })
  );

  const content = response.data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Unexpected text response from OpenAI");
  }
  return content.trim();
};

const generateImage = async (prompt, { http = axios, env } = {}) => {
  const config = getConfig(env);
  const response = await callOpenAI(() =>
    http.post(
      `${OPENAI_BASE_URL}/images/generations`,
      {
        model: config.imageModel,
        prompt,
        n: 1,
        size: config.imageSize,
      },
      { headers: authHeaders(config.apiKey), responseType: "json" }
    )
  );

  const image = response.data?.data?.[0];
  if (!image) throw new Error("Unexpected image response from OpenAI");

  // GPT image models return base64 directly; older models returned a URL.
  if (image.b64_json) return image.b64_json;
  if (image.url) {
    const imageResponse = await callOpenAI(() =>
      http.get(image.url, { responseType: "arraybuffer" })
    );
    return Buffer.from(imageResponse.data).toString("base64");
  }
  throw new Error("OpenAI image response contained no image data");
};

module.exports = {
  generateText,
  generateImage,
  getConfig,
  OpenAIError,
  toOpenAIError,
  userFacingReason,
  redactSecrets,
  DEFAULT_TEXT_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_SIZE,
};
