const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const openai = require("./lib/openai");
const { getCaptionPrompt, getImagePrompt, cleanCaption } = require("./prompt");

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
      console.error("Error generating image:", error.message);
      res.status(502).json({ error: "Error generating image" });
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
      console.error("Error generating caption:", error.message);
      res.status(502).json({ error: "Error generating caption" });
    }
  });

  app.post("/upload-meme", async (req, res) => {
    const imageBase64 = asTrimmedString(req.body.imageBase64);
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required." });
    }

    try {
      const result = await uploadImage(`data:image/png;base64,${imageBase64}`);
      res.json({ imageUrl: result.secure_url });
    } catch (error) {
      console.error("Error uploading to Cloudinary:", error.message);
      res.status(500).send("Error uploading to Cloudinary");
    }
  });

  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send("Something went wrong.");
  });

  return app;
};

module.exports = { createApp };
