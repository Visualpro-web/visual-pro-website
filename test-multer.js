const express = require('express');
const upload = require('./backend/middlewares/upload');
const app = express();
app.post('/test', upload.single('finalVideoFile'), (req, res) => {
    res.json({ body: req.body, file: !!req.file });
});
const server = app.listen(10001, () => {
    console.log('Test SERVER up');
    require('child_process').exec('curl -s -X POST http://localhost:10001/test -F "finalVideoUrl=https://vimeo.com/"', (err, stdout) => {
        console.log(stdout);
        server.close();
    });
});
