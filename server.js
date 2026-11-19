require("dotenv").config();
const cloudinary = require("cloudinary").v2;
const { createApp } = require("./app");

const port = process.env.PORT || 3000;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

createApp().listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
