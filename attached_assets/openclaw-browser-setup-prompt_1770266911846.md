# Prompt: Fix OpenClaw Browser on VPS

## Context

I'm running **OpenClaw** (the open-source AI assistant, formerly Clawdbot/Moltbot) on a **Linux VPS** (Ubuntu). I have it connected to Telegram and the gateway is working. However, the **browser tool is not working**. Here's what I've tried so far:

1. Installed `chromium` via apt — OpenClaw doesn't detect it (likely a snap stub issue on Ubuntu).
2. Installed Chrome via `npx playwright install chromium` — OpenClaw still doesn't pick it up.

The browser control service either times out or says it can't reach the browser.

---

## What I Need You to Do

Write and run a **bash setup script** that does the following, **in this exact order**:

### Step 1: Clean up broken browser installs

```
- Remove any snap-based chromium (snap remove chromium) if present
- Remove any apt chromium-browser package if present
- These cause conflicts because OpenClaw tries to launch the stub binary directly instead of going through the snap runner, so the CDP endpoint never opens
```

### Step 2: Install Google Chrome stable (non-snap, direct .deb)

```
- Download and install Google Chrome stable from the official .deb package:
    wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
    apt install -y ./google-chrome-stable_current_amd64.deb
    apt --fix-broken install -y
- Verify it's installed: google-chrome --version
- Note the executable path (should be /usr/bin/google-chrome)
```

### Step 3: Install Playwright with system dependencies

```
- Make sure Node.js 22+ is installed
- Install Playwright globally: npm install -g playwright
- Install Chromium browser binary WITH system deps: npx playwright install --with-deps chromium
- The --with-deps flag is critical — it installs all missing system libraries (libatk, libcups, libxcomposite, libnss3, libgbm, etc.) that headless Chrome needs on a server
```

### Step 4: Find the correct browser binary path

```
- Check if google-chrome is available: which google-chrome
- Also find Playwright's bundled Chromium: find ~/.cache/ms-playwright -name "chrome" -type f 2>/dev/null
- Also check: find /root/.cache/ms-playwright -name "chrome" -type f 2>/dev/null
- Pick whichever path exists. Prefer /usr/bin/google-chrome if available.
```

### Step 5: Update the OpenClaw config

Read the current config file at `~/.openclaw/openclaw.json` (or `~/.clawdbot/clawdbot.json` or `~/.moltbot/moltbot.json` — check which one exists). Then **merge** the following into the existing config, preserving all other settings (channels, agents, etc.):

```json
{
  "browser": {
    "enabled": true,
    "headless": true,
    "noSandbox": true,
    "executablePath": "<THE_PATH_FROM_STEP_4>",
    "defaultProfile": "openclaw"
  }
}
```

Key points:
- `headless: true` — this is a VPS with no display/GUI
- `noSandbox: true` — required on most Linux VPS environments, especially running as root
- `executablePath` — this is the critical fix; without this, OpenClaw's auto-detection finds the broken snap stub or misses Playwright's binary entirely
- `defaultProfile: "openclaw"` — use the managed isolated browser profile, not the Chrome extension relay (which requires a GUI)

**Do NOT overwrite the rest of the config.** Read the existing JSON, merge the `browser` key in, and write it back.

### Step 6: Restart and verify

```bash
openclaw gateway restart

# Wait a few seconds, then check status
sleep 5
openclaw gateway status --deep

# Try launching the browser
openclaw browser --browser-profile openclaw start

# Try a test navigation
openclaw browser open https://example.com
openclaw browser snapshot
```

### Step 7: If it still fails, try remote CDP fallback

If the managed browser still won't launch, set up Chrome as a standalone CDP process:

```bash
# Launch Chrome headless with remote debugging
google-chrome \
  --headless=new \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage \
  --remote-debugging-port=9222 \
  --remote-debugging-address=127.0.0.1 &

# Verify CDP is responding
sleep 3
curl -s http://127.0.0.1:9222/json/version
```

Then update the OpenClaw config to use remote CDP instead:

```json
{
  "browser": {
    "enabled": true,
    "profiles": {
      "openclaw": {
        "cdpUrl": "http://127.0.0.1:9222"
      }
    }
  }
}
```

And restart the gateway again.

---

## Important Notes

- The VPS is headless (no GUI/display). Everything must run in headless mode.
- I'm likely running as root. `--no-sandbox` is required when running Chrome as root.
- On Ubuntu 24.04, the `chromium` apt package is often a snap redirect — that's why my first install didn't work. Real `.deb` Google Chrome avoids this.
- OpenClaw uses Playwright on top of CDP for advanced browser features (click, type, snapshots, screenshots, PDF). Without Playwright properly installed, it returns 501 errors for those operations.
- The config file location could be `~/.openclaw/openclaw.json`, `~/.clawdbot/clawdbot.json`, or `~/.moltbot/moltbot.json` depending on the version. Check all three and use whichever exists.
- After fixing the browser, run `openclaw doctor` to verify everything is healthy.
