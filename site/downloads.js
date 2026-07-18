const PLATFORM_LABELS = Object.freeze({
  macos: "macOS",
  windows: "Windows",
  linux: "Linux"
});

export function detectDownloadPlatform({ platform = "", userAgent = "", maxTouchPoints = 0 } = {}) {
  const identity = `${platform} ${userAgent}`.toLowerCase();

  if (
    /android|cros|iphone|ipad|ipod/u.test(identity) ||
    (/mac/u.test(identity) && maxTouchPoints > 1)
  ) {
    return null;
  }
  if (/mac/u.test(identity)) {
    return "macos";
  }
  if (/win/u.test(identity)) {
    return "windows";
  }
  if (/linux|x11/u.test(identity)) {
    return "linux";
  }
  return null;
}

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(megabytes >= 100 ? 0 : 1)} MB`;
}

export function validateDownloadManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1 || typeof manifest.version !== "string") {
    throw new Error("The download manifest is invalid.");
  }

  for (const platform of Object.keys(PLATFORM_LABELS)) {
    const download = manifest.downloads?.[platform];
    if (
      !download ||
      typeof download.url !== "string" ||
      !download.url.startsWith("https://github.com/mckay115/aval-design-studio/releases/download/") ||
      typeof download.detail !== "string"
    ) {
      throw new Error(`The ${platform} download is missing or invalid.`);
    }
  }

  return manifest;
}

function browserPlatform() {
  return detectDownloadPlatform({
    platform: navigator.userAgentData?.platform || navigator.platform,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints
  });
}

function enableDownload(anchor, download) {
  anchor.href = download.url;
  anchor.removeAttribute("aria-disabled");
}

function renderDownloads(manifest) {
  const preferredPlatform = browserPlatform();
  const primary = document.querySelector("[data-primary-download]");
  const primaryLabel = document.querySelector("[data-primary-download-label]");
  const status = document.querySelector("[data-download-status]");
  const options = document.querySelector("#download-options");

  for (const [platform, download] of Object.entries(manifest.downloads)) {
    const option = document.querySelector(`[data-download-option="${platform}"]`);
    if (!option) {
      continue;
    }
    enableDownload(option, download);
    const detail = option.querySelector("span");
    const size = formatFileSize(download.size);
    detail.textContent = [download.detail, size].filter(Boolean).join(" · ");
  }

  if (preferredPlatform && manifest.downloads[preferredPlatform]) {
    const download = manifest.downloads[preferredPlatform];
    enableDownload(primary, download);
    primaryLabel.textContent = `Download for ${PLATFORM_LABELS[preferredPlatform]}`;
    status.textContent = [
      `Latest v${manifest.version}`,
      download.detail,
      formatFileSize(download.size)
    ].filter(Boolean).join(" · ");
    return;
  }

  primary.href = "#download-options";
  primary.removeAttribute("aria-disabled");
  primaryLabel.textContent = "Choose a desktop download";
  status.textContent = `Latest v${manifest.version} for macOS, Windows, and Linux`;
  options.open = true;
  primary.addEventListener("click", () => {
    options.open = true;
  });
}

function renderDownloadError() {
  const primaryLabel = document.querySelector("[data-primary-download-label]");
  const status = document.querySelector("[data-download-status]");
  primaryLabel.textContent = "Downloads temporarily unavailable";
  status.textContent = "The latest release could not be loaded. Please try again shortly.";
}

export async function initializeDownloads() {
  try {
    const response = await fetch("downloads.json", {
      cache: "no-cache",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      throw new Error(`Download manifest request failed with ${response.status}.`);
    }
    renderDownloads(validateDownloadManifest(await response.json()));
  } catch (error) {
    console.error("Unable to initialize desktop downloads.", error);
    renderDownloadError();
  }
}

if (typeof document !== "undefined") {
  initializeDownloads();
}
