# TWP with OpenAI translation

A Firefox fork of [FilipePS/Traduzir-paginas-web](https://github.com/FilipePS/Traduzir-paginas-web), based on upstream commit `50a92116542ab93524594cc210f4bf4e5d86a925`.

Adds OpenAI as a provider to TWP's existing page and selected-text translation. Page extraction, inline links and formatting, dynamic content, and restoring originals use upstream TWP code. This is an independent fork, not an official OpenAI extension. The upstream MPL-2.0 license applies.

## Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on…**, then select `src/manifest.json` in this repository (or the generated `.xpi`).
3. Open the extension's **Settings → Translations → OpenAI**.
4. The local helper automatically detects the literal `OPENAI_API_KEY` assignment in `~/.bashrc`. You can also enter a manual key override. Choose a model ID. `gpt-4.1-mini` is the starter value; you can replace it with any model your API project can access that supports the Responses API and strict structured outputs. It is not a claim about the latest or best model.
5. Click **Save and use OpenAI**, optionally **Test translation**, then reload the webpage you want to translate.
6. Use TWP as usual. Its page-service button cycles providers; the **AI** button selects OpenAI in the text translation panel. **Show original** restores the original page.

Firefox's temporary add-on loader accepts this unsigned development build, but removes it when Firefox restarts. For a persistent installation in regular Firefox, submit it to Mozilla for **unlisted signing** and install the signed XPI. The fork has a distinct extension ID and can coexist with upstream TWP, though disabling one avoids overlapping translation controls and keyboard shortcuts.

## Automatic key detection on Linux

Install the local helper once:

```sh
uv run python tools/install-native-host.py
```

It uses its own uv virtual environment, installs a helper under `~/.local/share/twp-openai/`, and registers it with Firefox in both the legacy and XDG native-messaging locations. Firefox starts it only when needed; there is no listening server or background daemon. The host accepts connections only from `twp-openai@garrettbaker.local`. The helper reads a literal assignment from `.bashrc`; it does not execute the shell file or support command substitutions. Flatpak/sandboxed browser installations may need a separate host bridge; this installer targets native Linux Firefox.

With the updated extension loaded, open **Settings → Translations → OpenAI**. The status should say **API key available from ~/.bashrc**. Leave the key field blank and click **Save and use OpenAI**. A manually saved key takes precedence; **Use detected key** removes that override. **Forget saved key** also turns automatic detection off, so the extension cannot immediately rediscover a key you just asked it to forget. Your `.bashrc` is never modified.

To remove the helper, delete `~/.local/share/twp-openai/` and the `local.twp_openai_key.json` files from `~/.mozilla/native-messaging-hosts/` and `~/.config/mozilla/native-messaging-hosts/` (or your configured XDG directories).

## Install persistently in regular Firefox

1. Package the extension with `uv run python tools/package-firefox.py`.
2. Sign in to the [Mozilla Add-on Developer Hub](https://addons.mozilla.org/developers/addon/submit/distribution).
3. Choose **On your own** / self-distribution (unlisted), and upload `build/twp-openai-10.2.1.2.xpi`. This does not create a public add-on listing. Mozilla still validates/reviews it; signing may take time. If asked for source, the package is unminified source apart from the upstream prebuilt polyfill; the upstream `build-instructions.md` describes regenerating that polyfill.
4. Download Mozilla's **signed XPI** after signing completes.
5. In Firefox, open `about:addons` → gear menu → **Install Add-on From File…**, select that signed XPI, and click **Add**. This installation survives restarting Firefox.

The local package is **unsigned**. Signing requires your Mozilla developer account; OpenAI and GitHub credentials cannot sign Firefox extensions. A temporary `about:debugging` installation is still useful before signing, but disappears on restart. Future releases of this fork also need to be signed; automatic updates are not configured.

## Keys, data, and cost

- Supply your own **OpenAI API key**, not a ChatGPT login. API billing is separate from ChatGPT subscriptions.
- Translation text goes directly to `https://api.openai.com/v1/responses`, with `store: false`. This does not promise zero provider-side retention.
- Automatically detected keys are read from `.bashrc` through the native helper and kept only in background memory for requests. They are not copied into Firefox storage. Manual key overrides are saved locally in this Firefox profile, not encrypted by the extension. Keys are excluded from TWP's settings model and JSON exports and are not passed to webpages or placed in source code. This is a personal extension; never distribute a package containing a shared API key.
- TWP retains its existing broad page permissions. Other TWP providers and text-to-speech retain their original behavior. An OpenAI translation request never silently switches to another provider.
- OpenAI translations use a bounded memory cache, not TWP's optional disk cache. Changing credentials or model clears the cache. API requests run serially, batching nearby paragraphs up to about 6,000 source characters. A single paragraph can contain up to 12,000 characters / 200 fragments; larger paragraphs fail explicitly rather than being truncated.
- Dynamic content, automatic site/language translation, hover translation, and editable text can cause additional paid requests. These are TWP's existing settings. Restoring a page does not cancel an already queued API request.
- Errors appear in the toolbar popup and OpenAI settings. After a failure, requests pause until TWP retries or you save settings/test again, preventing a failed dynamic page from repeatedly hitting the API.
- A model refusing, truncating, or returning the wrong fragment structure is treated as an error. Text is inserted through TWP's text-node path, never as generated HTML. Fragment-level alignment can constrain word order across inline formatting; this implementation does not claim optimal translation quality.

## Implementation

`src/background/openaiService.js` implements TWP's `translate(sourceLanguage, targetLanguage, string[][])` provider contract. It sends numbered paragraphs and text fragments with a strict JSON schema. The returned structure is independently validated before TWP puts it back into the page. The background credential resolver uses either a manual override in `openaiCredentials` storage or the local native helper, while `src/options/openai-options.js` supplies setup and a manual test button. Existing service selection and icons are extended with an OpenAI choice.

This fork targets Firefox 140+ so Firefox can display its declared data-transmission permissions during installation. Its source is directly loadable; the older upstream transpilation/Chrome packaging flow has not been adapted for this provider.

## Checks and packaging

```sh
node --test tests/openai-service.test.cjs
uv run tests/firefox-smoke.py
uv run python tests/native-host-test.py
uv run python tools/package-firefox.py
```

By default, the Firefox smoke test uses Selenium in a temporary, isolated profile and injects a fake API only into its temporary test package. This default mode uses no real API key and makes no paid translation calls. The distributable package excludes that mock. Selenium may download geckodriver on first use. The smoke test checks settings, API integration, key-free settings export, page translation, links/formatting/inputs, dynamic content, restoring originals, and selected-text translation.

To run the same checks against the real API, export `OPENAI_API_KEY` in your shell and run `uv run tests/firefox-smoke.py --live`. This opt-in mode makes paid requests with `gpt-4.1-mini`; it reads the key from the environment, enters it only in the temporary Firefox profile, and does not add it to source files or packages. The profile is removed when Firefox exits. After installing the native helper, use `uv run tests/firefox-smoke.py --live --native` to test automatic `.bashrc` detection without entering or storing a key in Firefox.

The provider tests, native-helper tests, mocked Firefox tests, and live Firefox smoke test with automatic native key detection have passed. The live test used `gpt-4.1-mini` to translate a small French fixture into English, verifying settings, API requests, page translation, links/formatting/inputs, dynamic content, exact restoration, and selected-text translation. Translation quality across languages and larger real-world pages has not been evaluated.

## References

- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-4.1 mini model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
- [Temporary installation in Firefox](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)
- [Signing and distributing Firefox add-ons](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)
