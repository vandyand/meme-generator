require("dotenv").config();
const path = require("path");
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const { getTextPrompt } = require("./prompt");

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

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
      }
    );

    return response.data.data;
  } catch (error) {
    console.error("Error generating image:", error);
    return null;
  }
};

// app.get("/", (_, res) => {
//   res.sendFile(path.join(__dirname, "public/index.html"));
// });

app.use(express.static(path.join(__dirname, "public")));

app.post("/generate-meme", async (req, res) => {
  const prompt = req.body.prompt || "Create a meme";
  const generatedTextResponse = await generateText(getTextPrompt(prompt));
  console.log(generatedTextResponse);

  // Parse the response to JSON
  const generatedText = JSON.parse(generatedTextResponse);

  try {
    const generatedImage = await generateImage(generatedText.visualDescription);
    console.log(generateImage);
    const imageData = generatedImage[0];

    res.json({
      memeText: generatedText,
      imageUrl: imageData.url,
    });
  } catch (error) {
    console.error("Error generating meme:", error);
    res.status(500).send("Error generating meme");
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
