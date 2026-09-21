/* OpenAI settings for the TWP fork. MPL-2.0. */
"use strict";
(async () => {
  await twpConfig.onReady();
  const key = document.getElementById("openaiKey");
  const model = document.getElementById("openaiModel");
  const autoDetect = document.getElementById("openaiAutoDetect");
  const feedback = document.getElementById("openaiFeedback");
  const error = document.getElementById("openaiError");
  const settings = await browser.storage.local.get(["openaiCredentials", "openaiStatus"]);
  model.value = settings.openaiCredentials?.model || "gpt-4.1-mini";
  autoDetect.checked = settings.openaiCredentials?.autoDetect !== false;
  error.textContent = settings.openaiStatus || "";
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.openaiStatus) error.textContent = changes.openaiStatus.newValue || "";
  });
  function showError(e) { console.error(e); error.textContent = e.message; }
  async function detect() {
    const detected = await browser.runtime.sendMessage({ action: "detectOpenAIKey" });
    feedback.textContent = detected.available ? `API key available from ${detected.source}.` : detected.error;
    return detected;
  }
  function useOpenAI() {
    const enabled = [...new Set([...twpConfig.get("enabledServices"), "openai"])];
    twpConfig.set("enabledServices", enabled);
    twpConfig.set("pageTranslatorService", "openai");
    twpConfig.set("textTranslatorService", "openai");
    document.getElementById("btnEnableOpenAI").checked = true;
    for (const id of ["pageTranslatorService", "textTranslatorService"]) {
      document.querySelector(`#${id} option[value="openai"]`).hidden = false;
      document.getElementById(id).value = "openai";
    }
  }
  document.getElementById("saveOpenAI").onclick = () => (async () => {
    const saved = await browser.storage.local.get("openaiCredentials");
    const apiKey = key.value.trim() || saved.openaiCredentials?.apiKey || "";
    if (!model.value.trim()) throw new Error("Enter a model ID.");
    if (!apiKey && !autoDetect.checked) throw new Error("Enter an API key or enable automatic detection.");
    await browser.storage.local.set({ openaiCredentials: { apiKey, model: model.value.trim(), autoDetect: autoDetect.checked }, openaiStatus: "" });
    key.value = "";
    const detected = await detect();
    if (!detected.available) throw new Error(detected.error);
    useOpenAI();
    feedback.textContent = `Saved. OpenAI uses the key from ${detected.source}. Reload existing webpages to use the new default.`;
  })().catch(showError);
  document.getElementById("testOpenAI").onclick = () => (async () => {
    if (key.value.trim()) throw new Error("Save the key before testing.");
    feedback.textContent = "Translating ‘Bonjour le monde.’ into English…";
    const result = await browser.runtime.sendMessage({ action: "testOpenAITranslation" });
    if (result.error) throw new Error(result.error);
    feedback.textContent = `Test succeeded: ${result.text}`;
  })().catch(showError);
  document.getElementById("removeOpenAI").onclick = () => (async () => {
    await browser.storage.local.set({ openaiCredentials: { apiKey: "", model: model.value.trim() || "gpt-4.1-mini", autoDetect: false }, openaiStatus: "" });
    key.value = "";
    autoDetect.checked = false;
    feedback.textContent = "Saved key removed and automatic detection disabled. The key in .bashrc is unchanged.";
  })().catch(showError);
  document.getElementById("detectOpenAI").onclick = () => (async () => {
    await browser.storage.local.set({ openaiCredentials: { apiKey: "", model: model.value.trim() || "gpt-4.1-mini", autoDetect: true }, openaiStatus: "" });
    key.value = "";
    autoDetect.checked = true;
    const detected = await detect();
    if (!detected.available) throw new Error(detected.error);
    useOpenAI();
  })().catch(showError);
  await detect();
})().catch(error => { console.error(error); document.getElementById("openaiError").textContent = error.message; });
