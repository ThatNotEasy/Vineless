import "../../protobuf.min.js";
import "../../license_protocol.js";
import { SettingsManager } from "../../util.js";

document.getElementById('fileInput').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    await SettingsManager.importPRDevice(file);
    document.write("Imported successfully!");
    window.close();
});

document.getElementById('urlImport').addEventListener('click', async () => {
    try {
        const url = document.getElementById('urlInput').value;
        const res = await fetch(url);
        const blob = await res.blob();
        blob.name = url.split('/').pop();
        await SettingsManager.importPRDevice(blob);
        document.write("Imported successfully!");
        window.close();
    } catch (e) {
        console.error(e);
        document.write("Failed to import!\n" + e.stack);
    }
});