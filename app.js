const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const openai = require("./lib/openai");
const { getCaptionPrompt, getImagePrompt, cleanCaption } = require("./prompt");

const describeUploadError = (error) => {
  if (!error) return String(error);
  if (error.message) return error.message;
  if (error.error?.message) return error.error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const logOpenAIFailure = (label, error) => {
  const err = openai.toOpenAIError(error);
  // Only the safe summary is logged: never the axios config or headers.
  console.error(`${label}:`, err.message, {
    status: err.status,
    code: err.code,
    type: err.type,
  });
};

const defaultUploadImage = (dataUri) => {
  const cloudinary = require("cloudinary").v2;
  return cloudinary.uploader.upload(dataUri, { upload_preset: "ml_default" });
};

const asTrimmedString = (value) =>
  typeof value === "string" ? value.trim() : "";

// Dependencies are injectable so tests can mock OpenAI and Cloudinary.
const createApp = ({
  generateText = openai.generateText,
  generateImage = openai.generateImage,
  uploadImage = defaultUploadImage,
  isUploadConfigured = () => !!process.env.CLOUDINARY_CLOUD_NAME,
} = {}) => {
  const app = express();

  app.use(bodyParser.json({ limit: "10mb" }));
  app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));
  app.use(express.static(path.join(__dirname, "public")));

  app.post("/generate-image", async (req, res) => {
    const prompt = asTrimmedString(req.body.prompt);
    if (!prompt) {
      return res.status(400).json({ error: "An image prompt is required." });
    }

    try {
      const imageBase64 = await generateImage(getImagePrompt(prompt));
      res.json({ imageBase64 });
    } catch (error) {
      logOpenAIFailure("Error generating image", error);
      res.status(502).json({ error: openai.userFacingReason(error, "image") });
    }
  });

  app.post("/generate-caption", async (req, res) => {
    const prompt = asTrimmedString(req.body.prompt);
    const imagePrompt = asTrimmedString(req.body.imagePrompt);
    if (!prompt) {
      return res.status(400).json({ error: "A caption prompt is required." });
    }

    try {
      const text = await generateText(getCaptionPrompt(prompt, imagePrompt));
      res.json({ caption: cleanCaption(text) });
    } catch (error) {
      logOpenAIFailure("Error generating caption", error);
      res
        .status(502)
        .json({ error: openai.userFacingReason(error, "caption") });
    }
  });

  app.post("/upload-meme", async (req, res) => {
    if (!isUploadConfigured()) {
      return res.status(503).json({
        error:
          "Meme uploads are disabled: CLOUDINARY_CLOUD_NAME is not set on the server.",
      });
    }

    const imageBase64 = asTrimmedString(req.body.imageBase64);
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required." });
    }

    try {
      const result = await uploadImage(`data:image/png;base64,${imageBase64}`);
      res.json({ imageUrl: result.secure_url });
    } catch (error) {
      console.error("Error uploading to Cloudinary:", describeUploadError(error));
      res.status(500).send("Error uploading to Cloudinary");
    }
  });

  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send("Something went wrong.");
  });

  return app;
};

module.exports = { createApp, describeUploadError };
