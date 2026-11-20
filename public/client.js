document.addEventListener("DOMContentLoaded", () => {
  const memeForm = document.getElementById("meme-form");
  const imagePromptInput = document.getElementById("image-prompt-input");
  const captionInput = document.getElementById("caption-input");
  const captionModeInputs = document.querySelectorAll(
    'input[name="caption-mode"]'
  );
  const errorMessage = document.getElementById("error-message");
  const editCaptionButton = document.getElementById("edit-caption-button");
  const memePlaceholder = document.getElementById("meme-placeholder");
  const memeTextWrapper = document.getElementById("meme-text-wrapper");
  const adjustedPrompt = document.getElementById("adjusted-prompt");
  const adjustedPromptText = document.getElementById("adjusted-prompt-text");
  const useAdjustedPromptButton = document.getElementById(
    "use-adjusted-prompt-button"
  );
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
  const LOADING_TICK_MS = 250;
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
    // Clicking the caption edits it; clicking the picture copies the link.
    if (
      (event.target === memeImage ||
        event.target === memePlaceholder ||
        event.target === copyMessage) &&
      copyMessage.dataset.url
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
  let loadingStartedAt = 0;

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
    loadingStartedAt = performance.now();
    renderLoadingState();

    // Start displaying loading messages
    startLoadingMessages();

    clearInterval(loadingInterval);
    loadingInterval = setInterval(() => {
      renderLoadingState();
    }, LOADING_TICK_MS);
  }

  // Progress depends only on elapsed time, so throttled timers in a
  // background tab don't slow it down.
  function renderLoadingState() {
    const seconds = (performance.now() - loadingStartedAt) / 1000;
    loadingBar.style.width = `${LoadingProgress.loadingWidth(seconds)}%`;
    loadingPercentage.innerText = LoadingProgress.loadingText(seconds);
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

  let uploadSeq = 0;
  let uploadsDisabled = false;

  function captureAndUpload() {
    const seq = ++uploadSeq;
    // The copy link is stale until the new render has been uploaded.
    copyMessage.classList.add("hidden");
    delete copyMessage.dataset.url;
    if (uploadsDisabled) return;

    // Use requestAnimationFrame to wait for the next repaint
    requestAnimationFrame(() => {
      domtoimage
        // Skip the <img> when it has no src (caption-only meme), otherwise
        // dom-to-image fails trying to inline it.
        .toPng(memeWrapper, {
          filter: (node) => node !== memeImage || hasImage(),
        })
        .then(async (dataUrl) => {
          if (seq !== uploadSeq) return; // a newer render superseded this one
          const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");

          try {
            const uploadResponse = await fetch("/upload-meme", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageBase64: base64Data }),
            });

            if (seq !== uploadSeq) return;
            if (uploadResponse.status === 503) {
              // Uploads aren't configured on this server: skip them quietly.
              uploadsDisabled = true;
              console.info("Meme uploads are disabled on this server.");
              return;
            }
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

  function showError(message) {
    errorMessage.innerText = message;
    errorMessage.classList.toggle("hidden", !message);
  }

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Request to ${url} failed`);
    }
    return data;
  }

  function getCaptionMode() {
    const checked = document.querySelector('input[name="caption-mode"]:checked');
    return checked ? checked.value : "prompt";
  }

  function updateCaptionPlaceholder() {
    captionInput.placeholder =
      getCaptionMode() === "direct"
        ? "Type the exact caption... (leave empty for no caption)"
        : "What should the caption be about? (leave empty for no caption)";
  }

  captionModeInputs.forEach((input) =>
    input.addEventListener("change", updateCaptionPlaceholder)
  );

  function setCaption(text) {
    memeText.innerText = text;
    memeTextWrapper.classList.toggle("hidden", !text);
  }

  function hasImage() {
    return !memeImage.classList.contains("hidden") && !!memeImage.src;
  }

  function showImage(base64) {
    memePlaceholder.classList.add("hidden");
    memeImage.classList.remove("hidden");

    return new Promise((resolve) => {
      // Remove existing listener if there is one
      if (currentLoadListener) {
        memeImage.removeEventListener("load", currentLoadListener);
      }
      currentLoadListener = () => resolve();
      memeImage.addEventListener("load", currentLoadListener, { once: true });
      memeImage.src = `data:image/png;base64,${base64}`;
    });
  }

  function showPlaceholder() {
    memeImage.classList.add("hidden");
    memeImage.removeAttribute("src");
    memePlaceholder.classList.remove("hidden");
  }

  // Shown when the server had to rewrite the image prompt to get past
  // OpenAI's safety filter.
  function showAdjustedPrompt(prompt) {
    adjustedPromptText.innerText = prompt || "";
    adjustedPrompt.classList.toggle("hidden", !prompt);
  }

  useAdjustedPromptButton.addEventListener("click", () => {
    imagePromptInput.value = adjustedPromptText.innerText;
    imagePromptInput.focus();
  });

  function showMeme() {
    memeContainer.classList.remove("hidden");
    editCaptionButton.classList.remove("hidden");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const imagePrompt = imagePromptInput.value.trim();
    const captionValue = captionInput.value.trim();
    const captionMode = getCaptionMode();

    showError("");
    if (!imagePrompt && !captionValue) {
      showError("Enter an image prompt, a caption, or both.");
      return;
    }

    const needsServer = !!imagePrompt || captionMode === "prompt";
    setButtonState(true);
    if (needsServer) startLoadingBar();

    try {
      // Image and caption are generated independently, in parallel.
      const imagePromise = imagePrompt
        ? postJson("/generate-image", { prompt: imagePrompt })
        : Promise.resolve(null);

      let captionPromise;
      if (!captionValue) {
        captionPromise = Promise.resolve("");
      } else if (captionMode === "direct") {
        captionPromise = Promise.resolve(captionValue);
      } else {
        captionPromise = postJson("/generate-caption", {
          prompt: captionValue,
          imagePrompt,
        }).then((data) => data.caption);
      }

      const [imageResult, captionResult] = await Promise.allSettled([
        imagePromise,
        captionPromise,
      ]);

      const errors = [imageResult, captionResult]
        .filter((r) => r.status === "rejected")
        .map((r) => r.reason.message);

      const newImage =
        imageResult.status === "fulfilled" ? imageResult.value : null;
      const newCaption =
        captionResult.status === "fulfilled" ? captionResult.value : null;

      // Nothing usable came back: leave the current meme untouched.
      if (!newImage && (newCaption === null || (!newCaption && !hasImage()))) {
        showError(errors.join(" ") || "Nothing to show.");
        return;
      }

      if (newCaption !== null) setCaption(newCaption);

      if (newImage) {
        showAdjustedPrompt(newImage.adjustedPrompt);
        await showImage(newImage.imageBase64);
      } else if (!hasImage()) {
        // Caption-only meme with no picture yet: render on a plain panel.
        showPlaceholder();
      }

      showMeme();
      captureAndUpload();
      showError(errors.join(" "));
    } catch (error) {
      console.error("Error:", error);
      showError("Something went wrong generating the meme.");
    } finally {
      if (needsServer) stopLoadingBar();
      setButtonState(false);
    }
  }

  // --- Caption editing in place (re-renders without regenerating the image)
  let captionBeforeEdit = "";

  memeText.addEventListener("focus", () => {
    captionBeforeEdit = memeText.innerText;
  });

  memeText.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      memeText.blur();
    } else if (event.key === "Escape") {
      memeText.innerText = captionBeforeEdit;
      memeText.blur();
    }
  });

  memeText.addEventListener("paste", (event) => {
    // Keep the caption plain text.
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData).getData("text");
    document.execCommand("insertText", false, text.replace(/\s+/g, " "));
  });

  memeText.addEventListener("blur", () => {
    const text = memeText.innerText.replace(/\s+/g, " ").trim();
    setCaption(text);
    if (text !== captionBeforeEdit.trim()) captureAndUpload();
  });

  editCaptionButton.addEventListener("click", () => {
    memeTextWrapper.classList.remove("hidden");
    memeText.focus();
    // Put the caret at the end of the existing caption.
    const range = document.createRange();
    range.selectNodeContents(memeText);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });

  memeForm.addEventListener("submit", handleSubmit);

  // Initialize button state
  setButtonState(false);
});
