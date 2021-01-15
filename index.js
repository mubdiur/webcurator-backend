const express = require("express")
const https = require("https")
const fs = require('fs');

const app = express();

app.use(express.json()) // for parsing application/json
app.use(express.urlencoded({
    extended: true
})) // for parsing application/x-www-form-urlencoded


app.post('/', async (req, res, next) => {

    // Verify ID token

    res.send("");
})


// http
// app.listen(8321);

// https
https.createServer({
    key: fs.readFileSync("/etc/letsencrypt/live/mubdiur.com/privkey.pem"),
    cert: fs.readFileSync("/etc/letsencrypt/live/mubdiur.com/fullchain.pem")
}, app).listen(8321);