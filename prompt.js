const getTextPrompt = (
  generalTextPrompt
) => `Generate a witty and humorous meme in JSON format using the ALL CAPS "GeneralPrompt" shown below. The return value should be JSON data in the provided example format.
Response Format Schema:
{
  "memeText": (string),
  "visualDescription": (string)
}

Here is the "general" prompt which provides a description of the image content. Please use your creativity and humor to generate a funny and engaging meme based on the given prompt. 
Note: visual descriptions should have no "caption" and no "text" and no "speech bubble" and no "thought bubble" in it. The image generator prompt shouldn't require any text or words or captions in the image. Please include a lot of scenic information in the visualDescription so that the image generator knows about the setting for the image.

"GeneralPrompt": ${generalTextPrompt.toUpperCase()}

Please return only JSON data and no plain text.`;

const getImagePrompt = (visualDescription) =>
  `${visualDescription.toUpperCase()} whimsical artistic illustration cartoon detailed`;

module.exports = { getTextPrompt, getImagePrompt };
