/* Show actionable provider errors in TWP's existing popup. MPL-2.0. */
"use strict";
const openaiNotice = document.createElement("p");
openaiNotice.style.cssText = "font: 12px sans-serif; padding: 8px; white-space: normal; overflow-wrap: anywhere;";
document.body.append(openaiNotice);
function showOpenAIStatus(status) {
  openaiNotice.replaceChildren();
  openaiNotice.hidden = !status;
  if (!status) return;
  const link = document.createElement("a");
  link.textContent = "OpenAI settings";
  link.href = chrome.runtime.getURL("/options/options.html#translations");
  link.target = "_blank";
  openaiNotice.append(document.createTextNode(status + " "), link);
}
browser.storage.local.get("openaiStatus").then(result => showOpenAIStatus(result.openaiStatus));
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.openaiStatus) showOpenAIStatus(changes.openaiStatus.newValue);
});
