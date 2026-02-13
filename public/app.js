const form = document.getElementById("metadata-form");
const submitButton = document.getElementById("submit-btn");
const statusLine = document.getElementById("status-line");
const responseBox = document.getElementById("response-box");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const siteId = String(formData.get("siteId") || "").trim();
  const mediaId = String(formData.get("mediaId") || "").trim();
  const title = String(formData.get("title") || "");
  const description = String(formData.get("description") || "");
  const customParamsInput = String(formData.get("customParams") || "");

  if (!siteId || !mediaId) {
    showStatus("Property ID and Media ID are required.", true);
    return;
  }

  let customParams = {};
  try {
    customParams = parseCustomParams(customParamsInput);
  } catch (error) {
    showStatus(error.message, true);
    return;
  }

  const payload = {
    siteId,
    mediaId,
    customParams,
  };

  if (title.trim()) {
    payload.title = title;
  }

  if (description.trim()) {
    payload.description = description;
  }

  setLoading(true);
  showStatus("Sending request...", false);
  responseBox.textContent = "";

  try {
    const response = await fetch("/api/media/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    const requestOutcome = response.ok
      ? "Metadata updated successfully."
      : "Update failed.";
    showStatus(`${requestOutcome} HTTP ${response.status}.`, !response.ok);
    responseBox.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    showStatus("Unable to reach the server. Check the app is running.", true);
    responseBox.textContent = String(error);
  } finally {
    setLoading(false);
  }
});

function parseCustomParams(input) {
  const result = {};
  const lines = input.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i].trim();
    if (!rawLine) {
      continue;
    }

    const separatorIndex = rawLine.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(
        `Custom parameter line ${i + 1} is invalid. Use key=value format.`
      );
    }

    const key = rawLine.slice(0, separatorIndex).trim();
    const value = rawLine.slice(separatorIndex + 1).trim();

    if (!key) {
      throw new Error(
        `Custom parameter line ${i + 1} has an empty key. Use key=value format.`
      );
    }

    result[key] = value;
  }

  return result;
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Updating..." : "Update metadata";
}

function showStatus(message, isError) {
  statusLine.textContent = message;
  statusLine.style.color = isError ? "#b91c1c" : "#065f46";
}
