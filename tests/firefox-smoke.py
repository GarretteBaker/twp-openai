# /// script
# dependencies = ["selenium==4.49.0"]
# ///
"""Run with uv run tests/firefox-smoke.py. Isolated Firefox profile, mocked API, no real key or API spending."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile, ZIP_DEFLATED
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from selenium import webdriver
from selenium.webdriver.firefox.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

ROOT = Path(__file__).resolve().parents[1]
class Fixture(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write('''<!doctype html><html lang="fr"><head><title>Exemple français</title></head><body>
        <h1>Une page de test</h1><p id="first">Bonjour <a id="link" href="/destination">le monde</a>. Ceci est un exemple de traduction.</p>
        <p id="second">La science est <strong id="bold">importante</strong> pour comprendre le monde.</p>
        <input id="input" value="Ne changez pas cette valeur"><div id="dynamic"></div></body></html>'''.encode())
    def log_message(self, *args):
        pass

mock = r'''
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (url !== "https://api.openai.com/v1/responses") return realFetch(url, options);
  const body = JSON.parse(options.body);
  const paragraphs = JSON.parse(body.input).paragraphs;
  for (const p of Object.values(paragraphs)) for (const key in p) p[key] = "[EN] " + p[key];
  return new Response(JSON.stringify({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(paragraphs)}]}]}), {status:200});
};
'''
with TemporaryDirectory(prefix='twp-firefox-test-') as tmp:
    archive = Path(tmp) / 'test-addon.xpi'
    manifest = json.loads((ROOT/'src/manifest.json').read_text())
    manifest['background']['scripts'].append('/mock-test.js')
    with ZipFile(archive, 'w', ZIP_DEFLATED) as z:
        for path in (ROOT/'src').rglob('*'):
            if path.is_file() and path.name != 'manifest.json' and path != ROOT/'src/options/options.html':
                z.write(path, str(path.relative_to(ROOT/'src')))
        z.writestr('manifest.json', json.dumps(manifest))
        z.writestr('mock-test.js', mock)
        options_html = (ROOT/'src/options/options.html').read_text().replace('</body>', '<script src="test-bridge.js"></script></body>')
        z.writestr('options/options.html', options_html)
        z.writestr('options/test-bridge.js', '''window.twpTestConfigExport = () => twpConfig.export();
        window.twpTestSend = async action => {
          const tabs = await browser.tabs.query({});
          const tab = tabs.find(t => t.url.startsWith('http://127.0.0.1:'));
          await browser.tabs.sendMessage(tab.id, {action, targetLanguage:'en'});
        };''')
    server = ThreadingHTTPServer(('127.0.0.1', 0), Fixture)
    Thread(target=server.serve_forever, daemon=True).start()
    options = webdriver.FirefoxOptions()
    options.add_argument('-headless')
    service = Service(service_args=['--allow-system-access'])
    with webdriver.Firefox(options=options, service=service) as driver:
        driver.set_window_size(1150, 900)
        driver.install_addon(str(archive), temporary=True)
        driver.set_context('chrome')
        uuids = json.loads(driver.execute_script('return Services.prefs.getStringPref("extensions.webextensions.uuids")'))
        origin = 'moz-extension://' + uuids[manifest['browser_specific_settings']['gecko']['id']]
        driver.set_context('content')
        driver.get(origin + '/options/options.html#translations')
        wait = WebDriverWait(driver, 20)
        wait.until(lambda d: 'No API key' in d.find_element(By.ID, 'openaiFeedback').text)
        driver.find_element(By.ID, 'openaiKey').send_keys('fake-test-key')
        driver.find_element(By.ID, 'saveOpenAI').click()
        wait.until(lambda d: 'Saved.' in d.find_element(By.ID, 'openaiFeedback').text)
        driver.find_element(By.ID, 'testOpenAI').click()
        wait.until(lambda d: 'Test succeeded:' in d.find_element(By.ID, 'openaiFeedback').text)
        assert driver.find_element(By.ID, 'pageTranslatorService').get_attribute('value') == 'openai'
        exported = driver.execute_script('return window.twpTestConfigExport()')
        assert 'fake-test-key' not in exported and 'openaiCredentials' not in exported
        print('PASS Firefox: settings save, API test, default provider, credential-free export', flush=True)
        options_handle = driver.current_window_handle
        driver.switch_to.new_window('tab')
        page_handle = driver.current_window_handle
        url = f'http://127.0.0.1:{server.server_port}/'
        driver.get(url)
        driver.switch_to.window(options_handle)
        driver.execute_async_script("window.twpTestSend('translatePage').then(arguments[0], e => arguments[0](String(e)))")
        driver.switch_to.window(page_handle)
        wait.until(lambda d: '[EN]' in d.find_element(By.ID,'first').text)
        assert driver.find_element(By.ID,'link').get_attribute('href') == url+'destination'
        assert driver.find_element(By.ID,'bold').tag_name == 'strong'
        assert driver.find_element(By.ID,'input').get_attribute('value') == 'Ne changez pas cette valeur'
        print('PASS Firefox: full-page translation preserves links, formatting, and inputs', flush=True)
        driver.execute_script("document.getElementById('dynamic').innerHTML='<p>Un nouveau paragraphe.</p>'")
        wait.until(lambda d: '[EN]' in d.find_element(By.ID,'dynamic').text)
        print('PASS Firefox: dynamic page content', flush=True)
        driver.switch_to.window(options_handle)
        driver.execute_async_script("window.twpTestSend('restorePage').then(arguments[0], e => arguments[0](String(e)))")
        driver.switch_to.window(page_handle)
        wait.until(lambda d: '[EN]' not in d.find_element(By.ID,'first').text)
        assert driver.find_element(By.ID,'first').text == 'Bonjour le monde. Ceci est un exemple de traduction.'
        print('PASS Firefox: exact original text restored', flush=True)
        driver.switch_to.window(options_handle)
        driver.save_screenshot(str(ROOT/'build'/'openai-settings.png'))
        driver.get(origin + '/popup/popup-translate-text.html#text=Bonjour%20le%20monde.')
        wait.until(lambda d: '[EN]' in d.find_element(By.ID,'eTextTranslated').text)
        assert 'selected' in driver.find_element(By.ID,'sOpenAI').get_attribute('class')
        assert driver.find_element(By.ID,'sGoogle').is_displayed()
        driver.find_element(By.ID,'sOpenAI').click()
        wait.until(lambda d: '[EN]' in d.find_element(By.ID,'eTextTranslated').text)
        print('PASS Firefox: selected-text popup and OpenAI button', flush=True)
    server.shutdown()
