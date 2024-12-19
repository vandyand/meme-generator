document.addEventListener("DOMContentLoaded", () => {
  const memeForm = document.getElementById("meme-form");
  const promptInput = document.getElementById("prompt-input");
  const generateButton = document.getElementById("generate-button");
  const memeImage = document.getElementById("meme-image");
  const memeText = document.getElementById("meme-text");
  const memeContainer = document.getElementById("meme-container");
  const memeWrapper = document.getElementById("meme-wrapper");
  const loadingBarContainer = document.getElementById("loading-bar-container");
  const loadingBar = document.getElementById("loading-bar");
  const copyMessage = document.getElementById("copy-message");
  const loadingPercentage = document.getElementById("loading-percentage");
  const loadingMessageContainer = document.getElementById("loading-message");
  let incrementDelay = 500; // Initial delay in ms
  let incrementAmount = 5; // Initial increment percentage
  let loadingMessages = [];
  let currentLoadingMessage = "";
  let messageInterval = null;

  // Fetch loading messages from the JSON file
  fetch("/fun_loading_messages.json")
    .then((response) => response.json())
    .then((data) => {
      loadingMessages = data;
    })
    .catch((error) => {
      console.error("Error fetching loading messages:", error);
    });

  function copyToClipboard(text) {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }

  function showTooltip(event) {
    const tooltip = document.getElementById("tooltip");
    const memeUrlContainer = document.getElementById("meme-url-container");
    const tooltipX =
      event.clientX - memeUrlContainer.getBoundingClientRect().left;
    const tooltipY =
      event.clientY - memeUrlContainer.getBoundingClientRect().top;
    tooltip.style.left = `${tooltipX}px`;
    tooltip.style.top = `${tooltipY}px`;
    tooltip.classList.remove("hidden");

    setTimeout(() => {
      tooltip.classList.add("hidden");
    }, 2000);
  }

  function handleClickToCopy(event) {
    if (
      event.target === memeImage ||
      event.target === memeText ||
      event.target === copyMessage
    ) {
      copyToClipboard(copyMessage.dataset.url);
      showTooltip(event);
    }
  }

  memeContainer.addEventListener("click", handleClickToCopy);

  function setButtonState(disabled) {
    generateButton.disabled = disabled;
    if (disabled) {
      generateButton.classList.add("cursor-wait", "opacity-50");
    } else {
      generateButton.classList.remove("cursor-wait", "opacity-50");
    }
  }

  let currentLoadListener = null;
  let loadingInterval = null;
  let loadingProgress = 0;

  function displayRandomLoadingMessage() {
    if (loadingMessages.length === 0) return;
    const randomIndex = Math.floor(Math.random() * loadingMessages.length);
    currentLoadingMessage = loadingMessages[randomIndex];
    loadingMessageContainer.innerText = currentLoadingMessage;
  }

  function startLoadingMessages() {
    loadingMessageContainer.classList.remove("hidden");
    displayRandomLoadingMessage();
    // Change the message every 3 seconds
    messageInterval = setInterval(displayRandomLoadingMessage, 3000);
  }

  function stopLoadingMessages() {
    clearInterval(messageInterval);
    loadingMessageContainer.classList.add("hidden");
    loadingMessageContainer.innerText = "";
  }

  function startLoadingBar() {
    loadingBarContainer.classList.remove("hidden");
    loadingProgress = 0;
    loadingBar.style.width = `${loadingProgress}%`;
    loadingPercentage.innerText = `${loadingProgress}%`;
    incrementDelay = 500;
    incrementAmount = 5;

    {
      {
        // Start displaying loading messages
        startLoadingMessages();
      }
    }

    loadingInterval = setInterval(() => {
      // Update progress with exponential slowdown
      loadingProgress += incrementAmount;
      if (loadingProgress >= 100) {
        loadingProgress = 99;
      }
      loadingBar.style.width = `${loadingProgress}%`;
      loadingPercentage.innerText = `${Math.floor(loadingProgress)}%`;

      // Decrease increment amount to slow down
      incrementAmount = Math.max(1, incrementAmount * 0.95);
      // Optionally adjust delay if needed
    }, incrementDelay);
  }

  function stopLoadingBar() {
    clearInterval(loadingInterval);
    loadingBarContainer.classList.add("hidden");
    loadingPercentage.innerText = `0%`;

    {
      {
        // Stop displaying loading messages
        stopLoadingMessages();
      }
    }
  }

  function handleImageLoad() {
    // Use requestAnimationFrame to wait for the next repaint
    requestAnimationFrame(() => {
      domtoimage
        .toPng(memeWrapper)
        .then(async (dataUrl) => {
          const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");

          try {
            const uploadResponse = await fetch("/upload-meme", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageBase64: base64Data }),
            });

            if (uploadResponse.ok) {
              const uploadData = await uploadResponse.json();
              copyMessage.classList.remove("hidden");
              copyMessage.dataset.url = uploadData.imageUrl;
              console.log("Image URL:", uploadData.imageUrl);
            } else {
              console.error("Failed to upload meme");
            }
          } catch (error) {
            console.error("Error:", error);
          }
        })
        .catch((error) => {
          console.error("Error:", error);
        });
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const prompt = promptInput.value;
    if (!prompt) return;

    setButtonState(true);
    startLoadingBar();

    try {
      const response = await fetch("/generate-meme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (response.ok) {
        const data = await response.json();
        memeText.innerText = data.memeText.memeText;

        // Remove existing listener if there is one
        if (currentLoadListener) {
          memeImage.removeEventListener("load", currentLoadListener);
        }

        // Set new listener
        currentLoadListener = handleImageLoad;
        memeImage.addEventListener("load", currentLoadListener);

        memeImage.src = `data:image/png;base64,${data.imageBase64}`;
        memeContainer.classList.remove("hidden");
      } else {
        console.error("Failed to generate meme");
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      stopLoadingBar();
      setButtonState(false);
    }
  }

  memeForm.addEventListener("submit", handleSubmit);

  // Initialize button state
  setButtonState(false);
});
