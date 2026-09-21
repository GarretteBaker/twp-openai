# TWP with OpenAI translation

A Firefox fork of [FilipePS/Traduzir-paginas-web](https://github.com/FilipePS/Traduzir-paginas-web), based on upstream commit `50a92116542ab93524594cc210f4bf4e5d86a925`.

Adds OpenAI as a provider to TWP's existing page and selected-text translation. Page extraction, inline links and formatting, dynamic content, and restoring originals use upstream TWP code. This is an independent fork, not an official OpenAI extension. The upstream MPL-2.0 license applies.

## Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on…**, then select `src/manifest.json` in this repository (or the generated `.xpi`).
3. Open the extension's **Settings → Translations → OpenAI**.
4. Enter your OpenAI API key and a model ID. `gpt-4.1-mini` is the starter value; you can replace it with any model your API project can access that supports the Responses API and strict structured outputs. It is not a claim about the latest or best model.
5. Click **Save and use OpenAI**, optionally **Test translation**, then reload the webpage you want to translate.
6. Use TWP as usual. Its page-service button cycles providers; the **AI** button selects OpenAI in the text translation panel. **Show original** restores the original page.

Firefox's temporary add-on loader accepts this unsigned development build, but removes it when Firefox restarts. For a persistent installation in regular Firefox, submit it to Mozilla for **unlisted signing** and install the signed XPI. The fork has a distinct extension ID and can coexist with upstream TWP, though disabling one avoids overlapping translation controls and keyboard shortcuts.

## Keys, data, and cost

- Supply your own **OpenAI API key**, not a ChatGPT login. API billing is separate from ChatGPT subscriptions.
- Translation text goes directly to `https://api.openai.com/v1/responses`, with `store: false`. This does not promise zero provider-side retention.
- The key is saved locally in this Firefox profile, not encrypted by the extension. It is excluded from TWP's settings model and JSON exports and is not passed to webpages or placed in source code. This is a personal extension; never distribute a package containing a shared API key.
- TWP retains its existing broad page permissions. Other TWP providers and text-to-speech retain their original behavior. An OpenAI translation request never silently switches to another provider.
- OpenAI translations use a bounded memory cache, not TWP's optional disk cache. Changing credentials or model clears the cache. API requests run serially, batching nearby paragraphs up to about 6,000 source characters. A single paragraph can contain up to 12,000 characters / 200 fragments; larger paragraphs fail explicitly rather than being truncated.
- Dynamic content, automatic site/language translation, hover translation, and editable text can cause additional paid requests. These are TWP's existing settings. Restoring a page does not cancel an already queued API request.
- Errors appear in the toolbar popup and OpenAI settings. After a failure, requests pause until TWP retries or you save settings/test again, preventing a failed dynamic page from repeatedly hitting the API.
- A model refusing, truncating, or returning the wrong fragment structure is treated as an error. Text is inserted through TWP's text-node path, never as generated HTML. Fragment-level alignment can constrain word order across inline formatting; this implementation does not claim optimal translation quality.

## Implementation

`src/background/openaiService.js` implements TWP's `translate(sourceLanguage, targetLanguage, string[][])` provider contract. It sends numbered paragraphs and text fragments with a strict JSON schema. The returned structure is independently validated before TWP puts it back into the page. The API key is isolated in `openaiCredentials` storage, while `src/options/openai-options.js` supplies setup and a manual test button. Existing service selection and icons are extended with an OpenAI choice.

This fork targets Firefox 128+. Its source is directly loadable; the older upstream transpilation/Chrome packaging flow has not been adapted for this provider.

## Checks and packaging

```sh
node --test tests/openai-service.test.cjs
uv run tests/firefox-smoke.py
uv run python tools/package-firefox.py
```

By default, the Firefox smoke test uses Selenium in a temporary, isolated profile and injects a fake API only into its temporary test package. This default mode uses no real API key and makes no paid translation calls. The distributable package excludes that mock. Selenium may download geckodriver on first use. The smoke test checks settings, API integration, key-free settings export, page translation, links/formatting/inputs, dynamic content, restoring originals, and selected-text translation.

To run the same checks against the real API, export `OPENAI_API_KEY` in your shell and run `uv run tests/firefox-smoke.py --live`. This opt-in mode makes paid requests with `gpt-4.1-mini`; it reads the key from the environment, enters it only in the temporary Firefox profile, and does not add it to source files or packages. The profile is removed when Firefox exits.

Protocol/DOM behavior has been verified with mocked responses. A successful live translation and model quality evaluation are still pending.

## References

- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-4.1 mini model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
- [Temporary installation in Firefox](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)
- [Signing and distributing Firefox add-ons](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)
