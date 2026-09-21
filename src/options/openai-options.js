/* OpenAI settings for the TWP fork. MPL-2.0. */
"use strict";
(async () => {
  await twpConfig.onReady();
  const key = document.getElementById("openaiKey");
  const model = document.getElementById("openaiModel");
  const feedback = document.getElementById("openaiFeedback");
  const error = document.getElementById("openaiError");
  const settings = await browser.storage.local.get(["openaiCredentials", "openaiStatus"]);
  model.value = settings.openaiCredentials?.model || "gpt-4.1-mini";
  feedback.textContent = settings.openaiCredentials?.apiKey ? "API key saved in this Firefox profile." : "No API key saved yet.";
  error.textContent = settings.openaiStatus || "";
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.openaiStatus) error.textContent = changes.openaiStatus.newValue || "";
  });
  function showError(e) { console.error(e); error.textContent = e.message; }
  document.getElementById("saveOpenAI").onclick = () => (async () => {
    const saved = await browser.storage.local.get("openaiCredentials");
    const apiKey = key.value.trim() || saved.openaiCredentials?.apiKey;
    if (!apiKey || !model.value.trim()) throw new Error("Enter an API key and a model ID.");
    await browser.storage.local.set({ openaiCredentials: { apiKey, model: model.value.trim() }, openaiStatus: "" });
    key.value = "";
    const enabled = [...new Set([...twpConfig.get("enabledServices"), "openai"])];
    twpConfig.set("enabledServices", enabled);
    twpConfig.set("pageTranslatorService", "openai");
    twpConfig.set("textTranslatorService", "openai");
    document.getElementById("btnEnableOpenAI").checked = true;
    for (const id of ["pageTranslatorService", "textTranslatorService"]) {
      document.querySelector(`#${id} option[value="openai"]`).hidden = false;
      document.getElementById(id).value = "openai";
    }
    feedback.textContent = "Saved. OpenAI is selected for pages and text. Reload existing webpages to use the new default.";
  })().catch(showError);
  document.getElementById("testOpenAI").onclick = () => (async () => {
    if (key.value.trim()) throw new Error("Save the key before testing.");
    feedback.textContent = "Translating ‘Bonjour le monde.’ into English…";
    const result = await browser.runtime.sendMessage({ action: "testOpenAITranslation" });
    if (result.error) throw new Error(result.error);
    feedback.textContent = `Test succeeded: ${result.text}`;
  })().catch(showError);
  document.getElementById("removeOpenAI").onclick = () => (async () => {
    await browser.storage.local.remove("openaiCredentials");
    key.value = "";
    feedback.textContent = "API key removed. OpenAI translations will stop until you save a key.";
  })().catch(showError);
})().catch(error => { console.error(error); document.getElementById("openaiError").textContent = error.message; });
