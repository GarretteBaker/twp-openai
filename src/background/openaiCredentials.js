/* Local credential discovery for the TWP OpenAI fork. MPL-2.0. */
"use strict";
var openaiCredentials = (() => {
  async function resolve(saved = {}) {
    if (saved.apiKey?.trim()) return { apiKey: saved.apiKey.trim(), source: "Firefox settings" };
    if (saved.autoDetect === false) throw new Error("API key detection is disabled. Enter a key or enable detection in OpenAI settings.");
    const local = await browser.runtime.sendNativeMessage("local.twp_openai_key", { action: "get_key" }).catch(error => {
      console.error("OpenAI native helper unavailable", error);
      throw new Error("No API key found. Install the local TWP key helper, or enter an API key in OpenAI settings.");
    });
    if (local.error) throw new Error(local.error);
    if (typeof local.apiKey !== "string" || !local.apiKey.startsWith("sk-")) throw new Error("The local helper did not return an API key.");
    return local;
  }
  return { resolve };
})();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== "detectOpenAIKey" || !sender.url?.startsWith(chrome.runtime.getURL("/options/"))) return;
  browser.storage.local.get("openaiCredentials")
    .then(({ openaiCredentials: saved }) => openaiCredentials.resolve(saved))
    .then(key => sendResponse({ available: true, source: key.source }), error => sendResponse({ available: false, error: error.message }));
  return true;
});
