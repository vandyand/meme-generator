document.addEventListener("DOMContentLoaded", () => {
  const memeForm = document.getElementById("meme-form");
  const promptInput = document.getElementById("prompt-input");
  const generateButton = document.getElementById("generate-button");
  const memeImage = document.getElementById("meme-image");
  const memeText = document.getElementById("meme-text");
  const memeContainer = document.getElementById("meme-container");
  const memeWrapper = document.getElementById("meme-wrapper");
  const loadingIndicator = document.getElementById("loading-indicator");

  memeForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const prompt = promptInput.value;
    if (!prompt) return;

    generateButton.disabled = true;
    loadingIndicator.style.display = "block";

    try {
      const response = await fetch("/generate-meme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (response.ok) {
        const data = await response.json();
        memeText.innerText = data.memeText.memeText;
        memeImage.src = `data:image/png;base64,${data.imageBase64}`;
        memeContainer.classList.remove("hidden");

        memeImage.addEventListener("load", async () => {
          domtoimage
            .toPng(memeWrapper)
            .then(async function (dataUrl) {
              const base64Data = dataUrl.replace(
                /^data:image\/png;base64,/,
                ""
              );

              try {
                const response = await fetch("/upload-meme", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ imageBase64: base64Data }),
                });

                if (response.ok) {
                  const data = await response.json();
                  console.log("Image URL:", data.imageUrl);
                } else {
                  console.error("Failed to upload meme");
                }
              } catch (error) {
                console.error("Error:", error);
              }
            })
            .catch(function (error) {
              console.error("Error:", error);
            });
        });
      } else {
        console.error("Failed to generate meme");
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      generateButton.disabled = false;
      loadingIndicator.style.display = "none";
    }
  });
});
