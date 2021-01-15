const express = require("express")
const https = require("https")
const fs = require('fs');
var admin = require('firebase-admin');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://webcurator-33fea.firebaseio.com"
});






const app = express();

app.use(express.json()) // for parsing application/json
app.use(express.urlencoded({
    extended: true
})) // for parsing application/x-www-form-urlencoded

app.post('/', async (req, res, next) => {

    // Verify ID token
    if (req.body.token != "") {
        admin
            .auth()
            .verifyIdToken(req.body.token)
            .then((decodedToken) => {
                const uid = decodedToken.uid;
                // ...
                console.log("success")
                res.send({
                    message: "Success"
                });
            })
            .catch((error) => {
                console.log(error.message)
                res.send({
                    message: "invalid token!"
                });
            });
    } else
        res.send({
            message: "token cannot be empty!"
        });
})


// http
// app.listen(8321);

// https
https.createServer({
    key: fs.readFileSync("/etc/letsencrypt/live/mubdiur.com/privkey.pem"),
    cert: fs.readFileSync("/etc/letsencrypt/live/mubdiur.com/fullchain.pem")
}, app).listen(8321);