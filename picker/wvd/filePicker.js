import "../../protobuf.min.js";
import "../../license_protocol.js";
import { SettingsManager } from "../../util.js";

document.getElementById('fileInput').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    await SettingsManager.importDevice(file).then(() => {
        window.close();
    });
});