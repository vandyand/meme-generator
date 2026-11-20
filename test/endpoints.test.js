const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { createApp, describeUploadError } = require("../app");

const FAKE_KEY = "sk-proj-SECRETSECRETSECRET1234";

// Shape of an axios error for an HTTP 400 from OpenAI, including the request
// config (with the Authorization header) that must never be logged or returned.
const axiosOpenAIError = (status, apiError) => {
  const err = new Error(`Request failed with status code ${status}`);
  err.isAxiosError = true;
  err.code = "ERR_BAD_REQUEST";
  err.config = { headers: { Authorization: `Bearer ${FAKE_KEY}` } };
  err.request = {};
  err.response = {
    status,
    data: { error: apiError },
    config: err.config,
  };
  return err;
};

// Capture console.error output as one string per call.
const captureErrors = (t) => {
  const mock = t.mock.method(console, "error", () => {});
  return () =>
    mock.mock.calls.map((c) =>
      c.arguments
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join(" ")
    );
};

// Fake OpenAI / Cloudinary dependencies that record their calls.
const makeFakes = () => {
  const calls = { text: [], image: [], upload: [] };
  const fakes = {
    calls,
    textResult: '"WHEN THE BUILD PASSES ON THE FIRST TRY"',
    imageResult: "ZmFrZS1pbWFnZQ==",
    fail: { text: false, image: false, upload: false },
    errors: { text: null, image: null, upload: null },
    uploadConfigured: true,
    generateText: async (prompt) => {
      calls.text.push(prompt);
      if (fakes.errors.text) throw fakes.errors.text;
      if (fakes.fail.text) throw new Error("text boom");
      return fakes.textResult;
    },
    generateImage: async (prompt) => {
      calls.image.push(prompt);
      if (fakes.errors.image) throw fakes.errors.image;
      if (fakes.fail.image) throw new Error("image boom");
      return fakes.imageResult;
    },
    uploadImage: async (dataUri) => {
      calls.upload.push(dataUri);
      if (fakes.errors.upload) throw fakes.errors.upload;
      if (fakes.fail.upload) throw new Error("upload boom");
      return { secure_url: "https://res.cloudinary.com/demo/meme.png" };
    },
  };
  return fakes;
};

describe("meme endpoints", () => {
  let server;
  let baseUrl;
  let fakes;

  const post = async (path, body) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: res.status, json, text };
  };

  const reset = () => {
    fakes.calls.text.length = 0;
    fakes.calls.image.length = 0;
    fakes.calls.upload.length = 0;
    fakes.fail = { text: false, image: false, upload: false };
    fakes.errors = { text: null, image: null, upload: null };
    fakes.uploadConfigured = true;
  };

  before(async () => {
    fakes = makeFakes();
    const app = createApp({
      generateText: (...a) => fakes.generateText(...a),
      generateImage: (...a) => fakes.generateImage(...a),
      uploadImage: (...a) => fakes.uploadImage(...a),
      isUploadConfigured: () => fakes.uploadConfigured,
    });
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  describe("POST /generate-image", () => {
    test("returns a base64 image without calling the text model", async () => {
      reset();
      const res = await post("/generate-image", { prompt: "a cat on a skateboard" });
      assert.equal(res.status, 200);
      assert.deepEqual(res.json, { imageBase64: fakes.imageResult });
      assert.equal(fakes.calls.image.length, 1);
      assert.match(fakes.calls.image[0], /a cat on a skateboard/);
      assert.match(fakes.calls.image[0], /no.*text/i);
      assert.equal(fakes.calls.text.length, 0);
    });

    test("rejects an empty or missing prompt with 400", async () => {
      reset();
      for (const body of [{}, { prompt: "" }, { prompt: "   " }, { prompt: 42 }]) {
        const res = await post("/generate-image", body);
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.ok(res.json.error);
      }
      assert.equal(fakes.calls.image.length, 0);
    });

    test("returns 502 with a generic reason when image generation fails", async (t) => {
      reset();
      captureErrors(t);
      fakes.fail.image = true;
      const res = await post("/generate-image", { prompt: "anything" });
      assert.equal(res.status, 502);
      assert.equal(
        res.json.error,
        "The image request failed: OpenAI returned an unexpected response."
      );
    });

    test("surfaces OpenAI's refusal reason and logs message and code", async (t) => {
      reset();
      const errors = captureErrors(t);
      fakes.errors.image = axiosOpenAIError(400, {
        message: "Your request was rejected as a result of our safety system.",
        type: "invalid_request_error",
        code: "content_policy_violation",
      });
      const res = await post("/generate-image", { prompt: "something edgy" });

      assert.equal(res.status, 502);
      assert.equal(
        res.json.error,
        "The image request was refused: Your request was rejected as a result of our safety system."
      );
      assert.ok(!res.text.includes(FAKE_KEY));
      assert.ok(!res.text.includes("Authorization"));

      const logged = errors().join("\n");
      assert.match(logged, /Error generating image/);
      assert.match(logged, /HTTP 400/);
      assert.match(logged, /content_policy_violation/);
      assert.match(logged, /rejected as a result of our safety system/);
      assert.ok(!logged.includes(FAKE_KEY), "API key must not be logged");
      assert.ok(!logged.includes("Authorization"), "headers must not be logged");
    });

    test("does not echo OpenAI's message for auth failures", async (t) => {
      reset();
      const errors = captureErrors(t);
      fakes.errors.image = axiosOpenAIError(401, {
        message: `Incorrect API key provided: ${FAKE_KEY}.`,
        type: "invalid_request_error",
        code: "invalid_api_key",
      });
      const res = await post("/generate-image", { prompt: "a cat" });
      assert.equal(res.status, 502);
      assert.match(res.json.error, /credentials were rejected/);
      assert.ok(!res.text.includes("sk-"));
      const logged = errors().join("\n");
      assert.match(logged, /invalid_api_key/);
      assert.ok(!logged.includes(FAKE_KEY), "API key must be redacted in logs");
    });

    test("reports network failures as unreachable", async (t) => {
      reset();
      captureErrors(t);
      const err = new Error("socket hang up");
      err.code = "ECONNRESET";
      err.request = {};
      fakes.errors.image = err;
      const res = await post("/generate-image", { prompt: "a cat" });
      assert.equal(res.status, 502);
      assert.equal(res.json.error, "The image request failed: could not reach OpenAI.");
    });
  });

  describe("POST /generate-caption", () => {
    test("returns a cleaned caption without calling the image model", async () => {
      reset();
      const res = await post("/generate-caption", { prompt: "programmer joy" });
      assert.equal(res.status, 200);
      assert.deepEqual(res.json, {
        caption: "WHEN THE BUILD PASSES ON THE FIRST TRY",
      });
      assert.equal(fakes.calls.text.length, 1);
      assert.match(fakes.calls.text[0], /programmer joy/);
      assert.equal(fakes.calls.image.length, 0);
    });

    test("includes the image prompt as context when given", async () => {
      reset();
      await post("/generate-caption", {
        prompt: "monday mood",
        imagePrompt: "a sleepy dog at a desk",
      });
      assert.match(fakes.calls.text[0], /monday mood/);
      assert.match(fakes.calls.text[0], /a sleepy dog at a desk/);
    });

    test("rejects an empty prompt with 400", async () => {
      reset();
      const res = await post("/generate-caption", { prompt: "" });
      assert.equal(res.status, 400);
      assert.equal(fakes.calls.text.length, 0);
    });

    test("returns 502 when caption generation fails", async (t) => {
      reset();
      captureErrors(t);
      fakes.fail.text = true;
      const res = await post("/generate-caption", { prompt: "anything" });
      assert.equal(res.status, 502);
      assert.match(res.json.error, /^The caption request failed/);
    });

    test("surfaces OpenAI's reason for caption failures", async (t) => {
      reset();
      const errors = captureErrors(t);
      fakes.errors.text = axiosOpenAIError(400, {
        message: "The model `gpt-6-luna` does not exist or you do not have access to it.",
        type: "invalid_request_error",
        code: "model_not_found",
      });
      const res = await post("/generate-caption", { prompt: "monday" });
      assert.equal(res.status, 502);
      assert.equal(
        res.json.error,
        "The caption request was refused: The model `gpt-6-luna` does not exist or you do not have access to it."
      );
      const logged = errors().join("\n");
      assert.match(logged, /Error generating caption/);
      assert.match(logged, /model_not_found/);
      assert.ok(!logged.includes(FAKE_KEY));
    });

    test("rate limits get a retry hint", async (t) => {
      reset();
      captureErrors(t);
      fakes.errors.text = axiosOpenAIError(429, {
        message: "Rate limit reached",
        code: "rate_limit_exceeded",
      });
      const res = await post("/generate-caption", { prompt: "monday" });
      assert.match(res.json.error, /rate limit or quota reached/);
    });
  });

  describe("POST /upload-meme", () => {
    test("uploads a PNG data URI and returns the Cloudinary URL", async () => {
      reset();
      const res = await post("/upload-meme", { imageBase64: "cG5n" });
      assert.equal(res.status, 200);
      assert.deepEqual(res.json, {
        imageUrl: "https://res.cloudinary.com/demo/meme.png",
      });
      assert.deepEqual(fakes.calls.upload, ["data:image/png;base64,cG5n"]);
    });

    test("rejects a missing image with 400", async () => {
      reset();
      const res = await post("/upload-meme", {});
      assert.equal(res.status, 400);
      assert.equal(fakes.calls.upload.length, 0);
    });

    test("returns 500 when Cloudinary fails", async (t) => {
      reset();
      captureErrors(t);
      fakes.fail.upload = true;
      const res = await post("/upload-meme", { imageBase64: "cG5n" });
      assert.equal(res.status, 500);
    });

    test("logs Cloudinary errors that have no .message", async (t) => {
      reset();
      const errors = captureErrors(t);
      // Cloudinary rejects with a plain object, not an Error.
      fakes.errors.upload = {
        error: { message: "Upload preset not found", http_code: 400 },
      };
      const res = await post("/upload-meme", { imageBase64: "cG5n" });
      assert.equal(res.status, 500);
      const logged = errors().join("\n");
      assert.match(logged, /Upload preset not found/);
      assert.ok(!logged.includes("undefined"));
    });

    test("returns 503 without uploading when Cloudinary is not configured", async () => {
      reset();
      fakes.uploadConfigured = false;
      const res = await post("/upload-meme", { imageBase64: "cG5n" });
      assert.equal(res.status, 503);
      assert.match(res.json.error, /CLOUDINARY_CLOUD_NAME/);
      assert.equal(fakes.calls.upload.length, 0);
    });
  });

  test("the old combined /generate-meme route is gone", async () => {
    const res = await post("/generate-meme", { prompt: "x" });
    assert.equal(res.status, 404);
  });

  test("serves the static client", async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /id="image-prompt-input"/);
    assert.match(html, /id="caption-input"/);
  });
});

describe("describeUploadError", () => {
  test("prefers .message", () => {
    assert.equal(describeUploadError(new Error("boom")), "boom");
  });
  test("falls back to .error.message", () => {
    assert.equal(describeUploadError({ error: { message: "nested" } }), "nested");
  });
  test("falls back to JSON", () => {
    assert.equal(describeUploadError({ http_code: 499 }), '{"http_code":499}');
  });
  test("survives circular objects", () => {
    const o = {};
    o.self = o;
    assert.equal(typeof describeUploadError(o), "string");
  });
});

describe("upload config default", () => {
  test("is driven by CLOUDINARY_CLOUD_NAME", async (t) => {
    const saved = process.env.CLOUDINARY_CLOUD_NAME;
    t.after(() => {
      if (saved === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
      else process.env.CLOUDINARY_CLOUD_NAME = saved;
    });
    delete process.env.CLOUDINARY_CLOUD_NAME;
    let uploads = 0;
    const app = createApp({
      uploadImage: async () => {
        uploads++;
        return { secure_url: "x" };
      },
    });
    const server = await new Promise((r) => {
      const s = app.listen(0, () => r(s));
    });
    t.after(() => server.close());
    const res = await fetch(`http://127.0.0.1:${server.address().port}/upload-meme`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: "cG5n" }),
    });
    assert.equal(res.status, 503);
    assert.equal(uploads, 0);
  });
});
