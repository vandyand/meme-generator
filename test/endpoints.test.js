const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../app");

// Fake OpenAI / Cloudinary dependencies that record their calls.
const makeFakes = () => {
  const calls = { text: [], image: [], upload: [] };
  const fakes = {
    calls,
    textResult: '"WHEN THE BUILD PASSES ON THE FIRST TRY"',
    imageResult: "ZmFrZS1pbWFnZQ==",
    fail: { text: false, image: false, upload: false },
    generateText: async (prompt) => {
      calls.text.push(prompt);
      if (fakes.fail.text) throw new Error("text boom");
      return fakes.textResult;
    },
    generateImage: async (prompt) => {
      calls.image.push(prompt);
      if (fakes.fail.image) throw new Error("image boom");
      return fakes.imageResult;
    },
    uploadImage: async (dataUri) => {
      calls.upload.push(dataUri);
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
  };

  before(async () => {
    fakes = makeFakes();
    const app = createApp({
      generateText: (...a) => fakes.generateText(...a),
      generateImage: (...a) => fakes.generateImage(...a),
      uploadImage: (...a) => fakes.uploadImage(...a),
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

    test("returns 502 when image generation fails", async () => {
      reset();
      fakes.fail.image = true;
      const res = await post("/generate-image", { prompt: "anything" });
      assert.equal(res.status, 502);
      assert.equal(res.json.error, "Error generating image");
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

    test("returns 502 when caption generation fails", async () => {
      reset();
      fakes.fail.text = true;
      const res = await post("/generate-caption", { prompt: "anything" });
      assert.equal(res.status, 502);
      assert.equal(res.json.error, "Error generating caption");
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

    test("returns 500 when Cloudinary fails", async () => {
      reset();
      fakes.fail.upload = true;
      const res = await post("/upload-meme", { imageBase64: "cG5n" });
      assert.equal(res.status, 500);
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
