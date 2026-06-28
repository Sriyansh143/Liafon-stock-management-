# OpenWA (WhatsApp API) Setup Guide

OpenWA is an optional integration that lets Liafon send WhatsApp messages
directly via API. **If you don't set up OpenWA, the app still works** —
it falls back to `wa.me` deep links (opens WhatsApp Web with the message
pre-filled; the user just clicks "Send").

---

## Option 1: Install Docker Desktop (Recommended)

### Windows
1. Download Docker Desktop from https://docs.docker.com/desktop/install/windows-install/
2. Run the installer and restart your computer
3. Open Docker Desktop and wait for it to start (whale icon in system tray)
4. Open PowerShell and verify:
   ```powershell
   docker --version
   ```
5. Clone and start OpenWA:
   ```powershell
   cd C:\Users\SRIYAANSH
   git clone https://github.com/openwa/openwa.git
   cd openwa
   docker compose -f docker-compose.dev.yml up -d
   ```
6. Open http://localhost:2785 in your browser and scan the QR code with your phone's WhatsApp
7. Copy the API key from the OpenWA dashboard
8. Add to your Liafon `.env`:
   ```
   OPENWA_API_URL=http://localhost:2785/api
   OPENWA_API_KEY=your-api-key-here
   OPENWA_SESSION=default
   ```
9. Restart Liafon (`npm run dev`)

### macOS
```bash
brew install --cask docker
open -a Docker
# Wait for Docker to start, then:
git clone https://github.com/openwa/openwa.git
cd openwa
docker compose -f docker-compose.dev.yml up -d
```

### Linux
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in, then:
git clone https://github.com/openwa/openwa.git
cd openwa
docker compose -f docker-compose.dev.yml up -d
```

---

## Option 2: Run OpenWA with Node.js (No Docker)

If you can't install Docker, you can run OpenWA directly with Node.js.

### Prerequisites
- Node.js 18+ (already installed for Liafon)
- A phone with WhatsApp installed

### Steps

```powershell
# 1. Clone OpenWA
cd C:\Users\SRIYAANSH
git clone https://github.com/openwa/openwa.git
cd openwa

# 2. Install dependencies
npm install

# 3. Start OpenWA
npm start
```

4. A QR code will appear in your terminal. Scan it with your phone:
   - Open WhatsApp on your phone
   - Go to Settings → Linked Devices → Link a Device
   - Scan the QR code

5. Once connected, OpenWA will display:
   ```
   Server is running on http://localhost:2785
   API Key: <your-api-key>
   ```

6. Copy the API key and add to your Liafon `.env`:
   ```
   OPENWA_API_URL=http://localhost:2785/api
   OPENWA_API_KEY=your-api-key-here
   OPENWA_SESSION=default
   ```

7. Restart Liafon:
   ```powershell
   cd C:\Users\SRIYAANSH\Downloads\Liafon-Stock-Management\liafon
   npm run dev
   ```

8. Test the connection in Liafon → Settings → WhatsApp tab → "Test Connection"

---

## Option 3: Skip OpenWA Entirely

If you don't want to set up OpenWA, the app works fine without it.
When you click the WhatsApp share button on a sale/purchase, it opens
`https://wa.me/<phone>?text=<message>` in your browser, which opens
WhatsApp Web with the message pre-filled. You just click "Send" manually.

No configuration needed — this is the default behavior.

---

## Troubleshooting

### "docker is not recognized"
Docker Desktop is not installed. Either:
- Install Docker Desktop (Option 1 above)
- Run OpenWA with Node.js instead (Option 2 above)
- Skip OpenWA entirely (Option 3 above)

### OpenWA QR code doesn't appear
- Make sure you're in the `openwa` directory
- Try `npx @open-wa/wa-automate` instead of `npm start`
- Check that port 2785 isn't already in use: `netstat -ano | findstr 2785`

### OpenWA says "session not found"
- Make sure OpenWA is running (the terminal window must stay open)
- Check that `OPENWA_SESSION=default` in your `.env` matches the session name shown in the OpenWA dashboard
- Restart both OpenWA and Liafon

### "Failed to connect to OpenWA" in Liafon
- Verify `OPENWA_API_URL` is correct (should be `http://localhost:2785/api`)
- Verify `OPENWA_API_KEY` matches what OpenWA shows
- Make sure OpenWA is running (don't close the terminal)
- Check the OpenWA console for errors
- Try accessing `http://localhost:2785/sessions/default/status` in your browser — it should return JSON

### WhatsApp got disconnected
- Open the OpenWA dashboard at `http://localhost:2785`
- Click "Reconnect" or scan the QR code again
- Restart OpenWA: `Ctrl+C` then `npm start`
