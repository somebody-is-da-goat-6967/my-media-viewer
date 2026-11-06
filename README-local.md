# Run the media viewer locally

## Desktop app

Install Node.js, then run these commands from this folder:

```powershell
npm install
npm start
```

The desktop app opens the same viewer from a local HTTP server, so it can load `manifest.json` without browser `file://` restrictions. The manifest points to the GitHub release media, so that library still needs an internet connection.

To use files from your computer, select **Load local folder** and choose a folder. The files are loaded into the current session and do not need to be uploaded. In **Video + images**, choose the number of images and videos, then select **Open separate windows**. The desktop app opens one resizable, always-on-top window per selected file. Choose 0–4 of each type, up to eight windows total.

## Web app in Chrome

The same controls are in the web viewer. **Both in PiP** puts the selected number of images and videos into one configurable Picture-in-Picture window. Chrome limits web pages to one PiP window, so separate always-on-top windows are provided by the local desktop app.

The web viewer can also open local folders with **Load local folder**. This works for the current browser session; choosing files again is required after a refresh.
