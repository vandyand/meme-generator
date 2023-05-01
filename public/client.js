document.addEventListener("DOMContentLoaded", () => {
  const memeForm = document.getElementById("meme-form");
  const promptInput = document.getElementById("prompt-input");
  const generateButton = document.getElementById("generate-button");
  const memeImage = document.getElementById("meme-image");
  const memeText = document.getElementById("meme-text");
  const memeContainer = document.getElementById("meme-container");
  const loading = document.getElementById("loading");

  memeForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const prompt = promptInput.value;
    if (!prompt) return;

    generateButton.disabled = true;
    loading.classList.remove("hidden");

    try {
      const response = await fetch("/generate-meme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (response.ok) {
        const data = await response.json();
        memeText.innerText = data.memeText.memeText;
        memeImage.src = data.imageUrl;
        memeContainer.classList.remove("hidden");
      } else {
        console.error("Failed to generate meme");
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      generateButton.disabled = false;
      loading.classList.add("hidden");
    }
  });
});
