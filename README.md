# Meme Generator

This project is a meme generator that uses OpenAI's text and image models to create humorous memes. The picture and the caption are generated independently, so you can make an image-only meme, a caption on an existing picture, or both together.

## Setup

1. Clone the repository:
   ```
   git clone https://github.com/vandyand/meme-generator.git
   cd meme-generator
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with the following content:
   ```
   OPENAI_API_KEY=your_openai_api_key
   CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
   CLOUDINARY_API_KEY=your_cloudinary_api_key
   CLOUDINARY_API_SECRET=your_cloudinary_api_secret

   # Optional overrides (defaults shown)
   # OPENAI_TEXT_MODEL=gpt-3.5-turbo
   # OPENAI_IMAGE_MODEL=dall-e-3
   # OPENAI_IMAGE_SIZE=1024x1024
   # OPENAI_TEXT_TEMPERATURE=   (unset = model default; some reasoning models reject it)
   ```
   Replace the placeholder values with your actual API keys. The older `gpt-3.5-turbo` and `dall-e-3` models have been retired by OpenAI; set the model variables if you want to use a different current model.

4. Start the development server:
   ```
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:3000` to use the meme generator.

## Usage

The form has two independent parts. Fill in either one or both, then click **Generate Meme**.

- **Image**: describe the picture you want. Leave it empty to keep the current picture, for example to try a new caption on it.
- **Caption**: pick how the caption is made:
  - **AI writes it from a prompt**: describe the joke and the AI writes the caption. It also sees your image prompt, if you gave one.
  - **Use my exact text**: the text is used word for word, with no AI call.

  Leave the caption empty for an **image-only** meme with no caption bar.

When a meme is shown:

- **Edit the caption in place**: click the caption, or the **Edit caption** link under the meme, and type. Press **Enter** or click away to apply the edit, or press **Esc** to cancel. The meme is re-rendered and re-uploaded without generating a new image. Clearing the text removes the caption bar.
- **Copy the link**: click the image to copy its Cloudinary URL to the clipboard. The link is updated each time the meme changes.

If you only give a caption and there is no picture yet, the caption is shown on a plain dark panel.

## API

| Route | Body | Response |
| --- | --- | --- |
| `POST /generate-image` | `{ "prompt": string }` | `{ "imageBase64": string, "adjustedPrompt"?: string }` |
| `POST /generate-caption` | `{ "prompt": string, "imagePrompt"?: string }` | `{ "caption": string }` |
| `POST /upload-meme` | `{ "imageBase64": string }` | `{ "imageUrl": string }` |

An empty prompt returns `400`. The old combined `POST /generate-meme` route has been removed.

When OpenAI rejects a request, the route returns `502` with a short reason the page can show, for example `The image request was refused: Your request was rejected as a result of our safety system.` The server log records OpenAI's error message and code, such as `content_policy_violation`, without the API key or request headers.

If OpenAI's safety system blocks an image prompt (code `moderation_blocked`), the server asks the text model once to rewrite the prompt. The rewrite replaces named or recognisable characters, franchises, real people and living artists with generic, original ones. The server then retries the image once with the rewrite. If the retry works, the response includes `adjustedPrompt`, and the page shows it under the meme as "Prompt was adjusted to pass the safety filter: …", with a **Use this prompt** button that copies it into the image field. If the retry is also refused, the refusal is shown as usual. A blocked request can take a minute or two, so the server retries only once.

If `CLOUDINARY_CLOUD_NAME` is not set, `/upload-meme` returns `503`. The page then skips uploads quietly, and the meme is shown without a copyable link.

## Tests

```
npm test
```

The tests use the built-in `node:test` runner and mock the OpenAI and Cloudinary calls, so no API keys are needed.

## Technologies Used

- Node.js
- Express.js
- OpenAI API (Chat Completions and GPT Image models)
- Cloudinary
- TailwindCSS

## Hosting

This application is hosted on Heroku. You can access the live version at:
https://dumb-meme.herokuapp.com/

## License

This project is licensed under the ISC License.
