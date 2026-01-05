/**
 * AlphaDrop - Background Service Worker (Client-Side Version)
 */

let offscreenCreated = false;

async function ensureOffscreen() {
  if (offscreenCreated) return;
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["DOM_PARSER"],
      justification: "Process images with ML model"
    });
    offscreenCreated = true;
  } catch (e) {
    if (!e.message.includes("already exists")) throw e;
    offscreenCreated = true;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "alphadrop-remove-bg",
    title: "Remove Background",
    contexts: ["image"],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "alphadrop-remove-bg" && info.srcUrl) {
    chrome.storage.local.set({
      pendingImage: { url: info.srcUrl, timestamp: Date.now() }
    }, () => chrome.action.openPopup());
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "FETCH_IMAGE") {
    fetch(msg.imageUrl)
      .then(r => r.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => sendResponse({ success: true, data: reader.result });
        reader.readAsDataURL(blob);
      })
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg.type === "PROCESS_IMAGE") {
    (async () => {
      await ensureOffscreen();
      const result = await chrome.runtime.sendMessage({ type: "REMOVE_BG", imageData: msg.imageData });
      sendResponse(result);
    })();
    return true;
  }
});
