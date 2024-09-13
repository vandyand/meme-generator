# Meme Generator

This project is a meme generator that uses OpenAI's GPT and DALL-E models to create humorous memes based on user prompts.

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
   ```
   Replace the placeholder values with your actual API keys.

4. Start the development server:
   ```
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:3000` to use the meme generator.

## Usage

1. Enter a meme description in the input field.
2. Click the "Generate Meme" button.
3. Wait for the meme to be generated and displayed.
4. Click on the generated meme to copy its URL to the clipboard.

## Technologies Used

- Node.js
- Express.js
- OpenAI API (GPT-3.5 and DALL-E)
- Cloudinary
- TailwindCSS

## Hosting

This application is hosted on Heroku. You can access the live version at:
https://dumb-meme.herokuapp.com/

## License

This project is licensed under the ISC License.
