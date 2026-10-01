# The Harpooner PhotoBooth

A local, event-ready photo booth for **The Harpooner**. It runs in a web browser on Windows, captures four photos from a laptop webcam or supported Canon camera, applies staff-created strip designs, and prepares accurate print layouts for an Epson printer.

The server binds to `127.0.0.1`, so the booth remains available only on the computer running it.

## Features

- Laptop webcam and external-camera selection
- Four-photo sessions with an on-screen countdown
- Branded photo strips with downloadable JPEG output
- Canva-style staff design studio with templates, layers, shapes, text, stickers, and uploaded elements
- Custom event-category tabs such as General, Valentines, and Graduation
- Saved-strip gallery with full-size preview
- A4 and Letter print layouts with portrait or landscape orientation
- Configurable copies, strip width, margins, spacing, alignment, and free arrangement
- Exact-size print CSS for consistent physical output
- Optional camera-free developer preview controlled from the staff page

## Requirements

- Windows 11
- [Node.js](https://nodejs.org/) LTS
- Google Chrome or Microsoft Edge for camera access
- A webcam, or a camera that Windows exposes as a webcam
- Epson L3250 or another installed printer

For a Canon EOS R50, install Canon EOS Webcam Utility if the camera does not appear as a normal Windows camera. Connect it by USB, switch it to the appropriate movie/webcam mode, and close other programs that may already be using it.

## Installation

```powershell
git clone https://github.com/mo-rale/TheHarpoonerPhotoBooth.git
cd TheHarpoonerPhotoBooth
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

The project has a `start-booth.bat` helper that starts the server and opens Chrome in kiosk mode. It also enables Chrome kiosk printing, which can print directly to the default Windows printer.

## Pages

| Page | Address | Purpose |
| --- | --- | --- |
| Guest booth | `http://localhost:3000/` | Camera check, capture, design selection, download, and printing |
| Staff workspace | `http://localhost:3000/admin.html` | Design management, developer options, and saved-strip gallery |

## Typical booth workflow

1. Start the server and open the guest booth.
2. Choose the laptop webcam or connected external camera.
3. Continue to the booth and take four photos.
4. Select a strip design.
5. Download the strip, retake the session, or press **Print strip**.
6. Configure the print document and continue to the system printer.

## Staff design studio

The staff workspace supports:

- Creating, editing, and deleting reusable strip designs
- Custom event-tab names
- Background, text, accent, and border colors
- Solid, checkerboard, and diagonal-stripe backgrounds
- Original, black-and-white, sepia, and vivid photo effects
- Editorial or modern typography
- Photo spacing, borders, margins, footer size, logo, date, and tagline controls
- Draggable text, emoji stickers, and uploaded PNG/JPEG/WebP elements
- Rectangle, circle, and line elements with color, size, rotation, and opacity controls
- Layer ordering, duplication, deletion, and one-click canvas alignment
- Direct mouse handles for moving, resizing, and rotating canvas elements
- Undo and redo, zoom controls, optional grid snapping, and keyboard nudging
- Keyboard shortcuts for undo/redo, duplicate, delete, and fine positioning

Designs are stored locally in `data/designs.json`.

### Developer preview

On the staff page, enable **Developer options → Show preview button** to display **Preview without camera** on the guest camera screen. This produces simulated photos for layout testing and does not add the sample strip to the saved gallery.

## Printing

The print editor supports A4 and Letter paper. The 4-inch strip-width preset is available only for A4. The app keeps the requested strip width when it fits and reduces it when necessary to preserve the complete strip on the selected page.

For correct physical sizing in the Chrome print window:

1. Select the same paper size and orientation shown in the app.
2. Choose **100%** or **Actual size** for Scale.
3. Select **None** for additional browser margins.
4. Turn off browser headers and footers.
5. Confirm that the Epson driver is also using the same paper size and orientation.

Avoid **Fit to page**, which makes the strips smaller.

`start-booth.bat` uses `--kiosk-printing`, so verify the Windows default printer and its preferences before an event.

## Saved files

- Finished strips are written to `photos/` as JPEG files.
- Reusable designs are stored in `data/designs.json`.
- Generated photos are intentionally excluded from Git.

## Configuration

Session defaults are defined in the `CONFIG` object near the top of `public/app.js`:

```js
const CONFIG = {
  brandName: 'The Harpooner',
  footerText: 'THE HARPOONER',
  shots: 4,
  countdownSeconds: 3,
  pauseBetweenShots: 700,
  mirrorCaptures: true,
  cameraNameHint: 'Canon',
  resolution: { width: 1920, height: 1080 },
};
```

## Project structure

```text
.
├── data/
│   └── designs.json       Reusable staff-created strip designs
├── photos/                Locally saved session strips (ignored by Git)
├── public/
│   ├── admin.html         Staff design studio and gallery
│   ├── admin.css          Canva-style studio layout and controls
│   ├── admin.js           Design editor, layers, history, and API integration
│   ├── app.js             Booth, camera, strip, preview, and print logic
│   ├── harpooner-logo.jpg Brand logo
│   ├── index.html         Guest booth interface
│   └── style.css          Guest and print styling
├── server.js              Local Express server and JSON/photo APIs
├── start-booth.bat        Windows kiosk launcher
└── package.json
```

## Local API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/designs` | List strip designs |
| `POST` | `/api/designs` | Create a strip design |
| `PUT` | `/api/designs/:id` | Update a strip design |
| `DELETE` | `/api/designs/:id` | Delete a strip design |
| `POST` | `/api/save` | Save a finished JPEG strip |
| `GET` | `/api/photos` | List saved strips |
| `DELETE` | `/api/photos/:name` | Delete a saved strip |

## Troubleshooting

### The camera is not listed

- Use Chrome or Edge rather than an embedded preview browser.
- Allow camera permission for `http://localhost:3000`.
- Close Camera, Zoom, Teams, OBS, and other apps using the webcam.
- Reconnect the USB cable and refresh the camera list.
- Confirm that Windows recognizes the camera as an imaging/webcam device.
- For the EOS R50, install or restart Canon EOS Webcam Utility when required.

### A design cannot be saved

- Start the app with `npm start`; opening the HTML file directly does not provide the local API.
- Confirm that the project folder and `data/` directory are writable.
- Check the terminal running `server.js` for an error.

### The printed strip is too small

- Set browser Scale to **100%** or **Actual size**.
- Do not use **Fit to page**.
- Match the paper size and orientation in both the app and Epson driver.
- Remove extra browser margins and disable headers and footers.

### Port 3000 is already in use

Stop the other server, or start this app on a different port:

```powershell
$env:PORT = 3001
npm start
```

Then open `http://localhost:3001`.

## Privacy and deployment

This application is designed for a single local booth computer. It has no authentication and should not be exposed directly to the public internet. Photos, designs, and settings remain on the local machine unless someone deliberately copies or uploads them.
