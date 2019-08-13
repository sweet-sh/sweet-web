importScripts("/js/resizer.js");
onmessage = function(e) {
    Module['onRuntimeInitialized'] = function() {
        Module['FS_createDataFile']('/', 'image', e.data, true, true, true);
        Module.ccall('profileImage', null, [], null);
        var imageResult = FS.readFile("output.jpg", { encoding: "binary" });
        var blob = new Blob([imageResult], { 'type': 'image/jpg' });
        postMessage(blob);
        FS.unlink("/image");
        FS.unlink("/output.jpg");
        clearTimeout(talker);
    };
}