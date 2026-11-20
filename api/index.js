// Vercel serverless entry: the whole Express app as one function.
// Static files are served from public/ by vercel.json; this handles the API routes.
const cloudinary = require("cloudinary").v2;
const { createApp } = require("../app");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = createApp();
