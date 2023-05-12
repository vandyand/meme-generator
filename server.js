require("dotenv").config();
const path = require("path");
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const { getTextPrompt } = require("./prompt");
const cloudinary = require("cloudinary").v2;

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const generateText = async (
  prompt,
  model = "gpt-3.5-turbo",
  temperature = 0.7
) => {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: model,
        messages: [{ role: "user", content: prompt }],
        temperature: temperature,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error("Error generating text:", error);
    return null;
  }
};

const generateImage = async (prompt, n = 1, size = "1024x1024") => {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/images/generations",
      {
        prompt,
        n,
        size,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        responseType: "json",
      }
    );

    const imageUrl = response.data.data[0].url;

    const imageResponse = await axios.get(imageUrl, {
      responseType: "arraybuffer",
    });

    const base64Image = Buffer.from(imageResponse.data, "binary").toString(
      "base64"
    );

    return base64Image;
  } catch (error) {
    console.error("Error generating image:", error);
    return null;
  }
};

app.use(express.static(path.join(__dirname, "public")));

app.post("/generate-meme", async (req, res) => {
  const prompt = req.body.prompt || "Create a meme";
  const generatedTextResponse = await generateText(getTextPrompt(prompt));
  console.log(generatedTextResponse);

  const generatedText = JSON.parse(generatedTextResponse);

  try {
    const base64Image = await generateImage(generatedText.visualDescription);

    res.json({
      memeText: generatedText,
      imageBase64: base64Image,
    });
  } catch (error) {
    console.error("Error generating meme:", error);
    res.status(500).send("Error generating meme");
  }
});

app.post("/upload-meme", async (req, res) => {
  try {
    const result = await cloudinary.uploader.upload(
      `data:image/png;base64,${req.body.imageBase64}`,
      {
        upload_preset: "ml_default",
      }
    );

    res.json({ imageUrl: result.secure_url });
  } catch (error) {
    console.error("Error uploading to Cloudinary:", error);
    res.status(500).send("Error uploading to Cloudinary");
  }
});

app.use((err, req, res) => {
  console.error(err.stack);
  res.status(500).send("Something went wrong.");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
