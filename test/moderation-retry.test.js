const { test, describe, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { createApp, isModerationBlocked } = require("../app");
const {
  getSafeImagePromptRewrite,
  cleanRewrittenPrompt,
} = require("../prompt");

const BLOCKED_PROMPT =
  "Frodo, Luke Skywalker, Harry Potter and Captain America arguing over pizza";
const REWRITE =
  "a small adventurer, a young sci-fi hero, a teenage wizard and a muscular superhero arguing over pizza";

// Axios-shaped error as OpenAI returns it for a safety-system refusal.
const openAIError = (status, apiError) => {
  const err = new Error(`Request failed with status code ${status}`);
  err.config = { headers: { Authorization: "Bearer sk-proj-SECRETSECRET" } };
  err.request = {};
  err.response = { status, data: { error: apiError } };
  return err;
};
const moderationBlocked = () =>
  openAIError(400, {
    message:
      "Your request was rejected by the safety system. If you believe this is an error, contact us.",
    type: "image_generation_user_error",
    code: "moderation_blocked",
  });

describe("POST /generate-image moderation retry", () => {
  let server;
  let baseUrl;
  let imageQueue; // results per call: string (base64) or Error to throw
  let textQueue;
  let imageCalls;
  let textCalls;
  let logs;

  const post = async (body) => {
    const res = await fetch(`${baseUrl}/generate-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  };

  before(async () => {
    const next = (queue) => {
      const item = queue.shift();
      if (item === undefined) throw new Error("unexpected extra call");
      if (item instanceof Error) throw item;
      return item;
    };
    const app = createApp({
      generateImage: async (prompt) => {
        imageCalls.push(prompt);
        return next(imageQueue);
      },
      generateText: async (prompt) => {
        textCalls.push(prompt);
        return next(textQueue);
      },
      uploadImage: async () => ({ secure_url: "x" }),
      isUploadConfigured: () => true,
    });
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  beforeEach((t) => {
    imageQueue = [];
    textQueue = [];
    imageCalls = [];
    textCalls = [];
    logs = [];
    const record = (...args) =>
      logs.push(
        args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")
      );
    t.mock.method(console, "error", record);
    t.mock.method(console, "log", record);
  });

  test("rewrites the prompt and retries once when moderation_blocked", async () => {
    imageQueue = [moderationBlocked(), "UkVUUlk="];
    textQueue = [`"${REWRITE}"`];

    const res = await post({ prompt: BLOCKED_PROMPT });

    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { imageBase64: "UkVUUlk=", adjustedPrompt: REWRITE });
    assert.equal(imageCalls.length, 2);
    assert.match(imageCalls[0], /Frodo/);
    assert.ok(imageCalls[1].startsWith(REWRITE), "retry uses the rewritten prompt");
    assert.equal(textCalls.length, 1);
    assert.match(textCalls[0], /Frodo, Luke Skywalker/);

    const logged = logs.join("\n");
    assert.match(logged, /attempt 1 of 2/);
    assert.match(logged, /moderation_blocked/);
    assert.match(logged, /attempt 2 of 2/);
    assert.ok(logged.includes(REWRITE));
    assert.ok(!logged.includes("SECRETSECRET"));
  });

  test("shows the refusal when the retry is also blocked, without looping", async () => {
    imageQueue = [moderationBlocked(), moderationBlocked()];
    textQueue = [REWRITE];

    const res = await post({ prompt: BLOCKED_PROMPT });

    assert.equal(res.status, 502);
    assert.match(res.json.error, /^The image request was refused: Your request was rejected by the safety system/);
    assert.equal(res.json.adjustedPrompt, undefined);
    assert.equal(imageCalls.length, 2, "exactly one retry");
    assert.equal(textCalls.length, 1, "exactly one rewrite");
    const logged = logs.join("\n");
    assert.match(logged, /attempt 1 of 2/);
    assert.match(logged, /Image retry failed \(attempt 2 of 2\)/);
  });

  test("returns the retry's own error if it fails differently", async () => {
    imageQueue = [
      moderationBlocked(),
      openAIError(429, { message: "Rate limit", code: "rate_limit_exceeded" }),
    ];
    textQueue = [REWRITE];
    const res = await post({ prompt: BLOCKED_PROMPT });
    assert.equal(res.status, 502);
    assert.match(res.json.error, /rate limit/);
    assert.equal(imageCalls.length, 2);
  });

  test("does not retry other 400 errors", async () => {
    imageQueue = [
      openAIError(400, {
        message: "Invalid size",
        type: "invalid_request_error",
        code: "invalid_value",
      }),
    ];
    const res = await post({ prompt: "a cat" });
    assert.equal(res.status, 502);
    assert.equal(res.json.error, "The image request was refused: Invalid size");
    assert.equal(imageCalls.length, 1);
    assert.equal(textCalls.length, 0);
  });

  test("shows the original refusal if the rewrite itself fails", async () => {
    imageQueue = [moderationBlocked()];
    textQueue = [openAIError(500, { message: "server error" })];
    const res = await post({ prompt: BLOCKED_PROMPT });
    assert.equal(res.status, 502);
    assert.match(res.json.error, /rejected by the safety system/);
    assert.equal(imageCalls.length, 1);
    assert.match(logs.join("\n"), /Could not rewrite/);
  });

  test("does not retry when the rewrite is empty or unchanged", async () => {
    for (const rewrite of ["", `  "${BLOCKED_PROMPT.toUpperCase()}"  `]) {
      imageQueue = [moderationBlocked()];
      textQueue = [rewrite];
      imageCalls = [];
      const res = await post({ prompt: BLOCKED_PROMPT });
      assert.equal(res.status, 502);
      assert.match(res.json.error, /rejected by the safety system/);
      assert.equal(imageCalls.length, 1, `no retry for ${JSON.stringify(rewrite)}`);
    }
  });
});

describe("isModerationBlocked", () => {
  test("matches only HTTP 400 moderation_blocked", () => {
    assert.equal(isModerationBlocked(moderationBlocked()), true);
    assert.equal(
      isModerationBlocked(openAIError(400, { code: "content_policy_violation" })),
      false
    );
    assert.equal(isModerationBlocked(openAIError(500, { code: "moderation_blocked" })), false);
    assert.equal(isModerationBlocked(new Error("boom")), false);
  });
});

describe("safe rewrite prompt", () => {
  const p = getSafeImagePromptRewrite(BLOCKED_PROMPT);

  test("includes the blocked prompt", () => {
    assert.ok(p.includes(BLOCKED_PROMPT));
  });

  test("demands more than a paraphrase: drop signature traits", () => {
    assert.match(p, /paraphrase is NOT enough/);
    for (const trait of ["scars", "weapons", "costumes", "logos", "catchphrases"]) {
      assert.match(p, new RegExp(trait), `mentions ${trait}`);
    }
  });

  test("covers characters, franchises, real people and living artists", () => {
    for (const kind of ["characters", "franchises", "real people", "living artists"]) {
      assert.match(p, new RegExp(kind));
    }
  });

  test("gives the generic-archetype example and keeps the joke", () => {
    assert.match(p, /a small adventurer, a young sci-fi hero, a teenage wizard and a muscular superhero/);
    assert.match(p, /lightning-bolt scar/);
    assert.match(p, /keeping the scene, setting, mood, composition and the joke/);
  });

  test("cleanRewrittenPrompt strips labels and quotes", () => {
    assert.equal(cleanRewrittenPrompt(`Rewritten prompt: "${REWRITE}"`), REWRITE);
    assert.equal(cleanRewrittenPrompt(`  “${REWRITE}”\n`), REWRITE);
    assert.equal(cleanRewrittenPrompt(REWRITE), REWRITE);
  });
});
