# Run the media viewer locally

## Desktop app

Install Node.js, then run these commands from this folder:

```powershell
npm install
npm start
```

The desktop app opens the same viewer from a local HTTP server, so it can load `manifest.json` without browser `file://` restrictions. The manifest points to the GitHub release media, so that library still needs an internet connection.

To use files from your computer, select **Load local folder** and choose a folder. The files are loaded into the current session and do not need to be uploaded. In **Video + images**, choose the number of images and videos, then select **Open as windows**. The desktop app opens one large, resizable, always-on-top window per selected file. Choose 0–4 of each type, up to eight windows total. Video windows advance through the video list when playback ends; enable **Loop** in a video window to keep its current video playing.

## Web app in Chrome

The web viewer uses **Open as windows** to open one browser popup per selected image or video. Chrome requires popups to be allowed for the site. Chrome limits a page to one true PiP window, so these are separate resizable browser windows rather than PiP windows.

The web viewer can also open local folders with **Load local folder**. This works for the current browser session; choosing files again is required after a refresh.
