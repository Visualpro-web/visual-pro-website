const http = require('http');

console.log("Sending POST to http://localhost:10000/api/clients");

const data = JSON.stringify({
    name: "Manny API Flow Test",
    email: "munelstg0@gmail.com",
    phone: "8095550000",
    propertyAddress: "Render Fix Avenue",
    projectTitle: "Live Flow Check",
    projectType: "Commercial",
    desiredDate: "2026-05-01"
});

const options = {
    hostname: 'localhost',
    port: 10000,
    path: '/api/clients',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        console.log(`HTTP Status: ${res.statusCode}`);
        console.log(`Response Body: ${body}`);
    });
});

req.on('error', error => {
    console.error("HTTP Request Failed:", error.message);
    if (error.code === 'ECONNREFUSED') {
        console.error("The local server is not running on port 10000. Please start the server using 'node backend/server.js'");
    }
});

req.write(data);
req.end();
