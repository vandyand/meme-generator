const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
  generateText,
  generateImage,
  getConfig,
  DEFAULT_TEXT_MODEL,
  DEFAULT_IMAGE_MODEL,
} = require("../lib/openai");

// Minimal axios stand-in: records requests and replies with canned data.
const fakeHttp = (responses) => {
  const requests = [];
  return {
    requests,
    post: async (url, body, options) => {
      requests.push({ method: "post", url, body, options });
      return { data: responses[url] };
    },
    get: async (url, options) => {
      requests.push({ method: "get", url, options });
      return { data: responses[url] };
    },
  };
};

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const IMAGE_URL = "https://api.openai.com/v1/images/generations";

describe("config", () => {
  test("uses current default models when env vars are unset", () => {
    const config = getConfig({});
    assert.equal(config.textModel, DEFAULT_TEXT_MODEL);
    assert.equal(config.imageModel, DEFAULT_IMAGE_MODEL);
    assert.equal(config.imageSize, "1024x1024");
    assert.equal(config.temperature, undefined);
    assert.notEqual(config.textModel, "gpt-3.5-turbo");
    assert.notEqual(config.imageModel, "dall-e-3");
  });

  test("reads model overrides from env vars", () => {
    const config = getConfig({
      OPENAI_TEXT_MODEL: "my-text-model",
      OPENAI_IMAGE_MODEL: "my-image-model",
      OPENAI_IMAGE_SIZE: "1536x1024",
      OPENAI_TEXT_TEMPERATURE: "0.7",
    });
    assert.equal(config.textModel, "my-text-model");
    assert.equal(config.imageModel, "my-image-model");
    assert.equal(config.imageSize, "1536x1024");
    assert.equal(config.temperature, 0.7);
  });
});

describe("generateText", () => {
  test("posts to chat completions with the configured model", async () => {
    const http = fakeHttp({
      [CHAT_URL]: { choices: [{ message: { content: "  hello  " } }] },
    });
    const env = { OPENAI_API_KEY: "sk-test", OPENAI_TEXT_MODEL: "m1" };
    const text = await generateText("prompt", { http, env });

    assert.equal(text, "hello");
    const [req] = http.requests;
    assert.equal(req.url, CHAT_URL);
    assert.equal(req.body.model, "m1");
    assert.deepEqual(req.body.messages, [{ role: "user", content: "prompt" }]);
    assert.equal("temperature" in req.body, false);
    assert.equal(req.options.headers.Authorization, "Bearer sk-test");
  });

  test("sends temperature only when configured", async () => {
    const http = fakeHttp({
      [CHAT_URL]: { choices: [{ message: { content: "x" } }] },
    });
    await generateText("p", { http, env: { OPENAI_TEXT_TEMPERATURE: "0.3" } });
    assert.equal(http.requests[0].body.temperature, 0.3);
  });

  test("throws on a malformed response", async () => {
    const http = fakeHttp({ [CHAT_URL]: { choices: [] } });
    await assert.rejects(generateText("p", { http, env: {} }));
  });
});

describe("generateImage", () => {
  test("returns b64_json from GPT image models", async () => {
    const http = fakeHttp({ [IMAGE_URL]: { data: [{ b64_json: "QUJD" }] } });
    const env = { OPENAI_IMAGE_MODEL: "img-model" };
    const result = await generateImage("a dog", { http, env });

    assert.equal(result, "QUJD");
    assert.equal(http.requests.length, 1);
    const [req] = http.requests;
    assert.equal(req.body.model, "img-model");
    assert.equal(req.body.prompt, "a dog");
    assert.equal(req.body.size, "1024x1024");
    assert.equal(req.body.n, 1);
  });

  test("falls back to downloading a URL response", async () => {
    const http = fakeHttp({
      [IMAGE_URL]: { data: [{ url: "https://img.example/x.png" }] },
      "https://img.example/x.png": Buffer.from("ABC"),
    });
    const result = await generateImage("a dog", { http, env: {} });
    assert.equal(result, Buffer.from("ABC").toString("base64"));
    assert.equal(http.requests[1].url, "https://img.example/x.png");
  });

  test("throws when no image data is returned", async () => {
    const http = fakeHttp({ [IMAGE_URL]: { data: [{}] } });
    await assert.rejects(generateImage("a dog", { http, env: {} }));
  });
});
