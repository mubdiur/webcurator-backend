const express = require("express")
const https = require("https")
const fs = require('fs');
var admin = require('firebase-admin');
var mysql = require('mysql');



admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: "https://webcurator-33fea.firebaseio.com"
});

var con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: 'webcurator'
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
                var response = await responseHandler(req.body, uid)
                res.send(response);
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



async function responseHandler(request, uid) {
    switch (request.operation) {
        case "insertfeed":
            await insertFeed(request.data, uid)
            break
        default:
    }
}




async function insertPaths(siteid, pathList) {
    pathList.forEach(async path => {
        onePath = {
            siteid: siteid,
            path: path
        }
        await con.query("INSERT INTO paths SET?", onePath, (err, res) => {
            if (err) console.log(err)
            else {
                console.log("success!");
            }
        })
    })
}


async function insertSites(feedid, siteList) {
    siteList.forEach(async site => {
        oneSite = {
            feedid: feedid,
            url: site.url
        }
        await con.query("INSERT INTO sites SET?", oneSite, (err, res) => {
            if (err) console.log(err)
            else {
                insertPaths(res.insertId, site.paths)
            }
        })
    })
}


async function insertFeed(data, uid) {
    await con.connect()
    var oneFeed = {
        uid: uid,
        title: data.title,
        description: data.description,
        notification: false,
        updates: 0
    }
    var siteList = data.sites
    await con.query("INSERT INTO feeds SET ?", oneFeed, (err, res) => {
        if (err) console.log(err)
        else {
            insertSites(res.insertId, siteList)
        }
    })
}



// http
// app.listen(8321);

// https
https.createServer({
    key: fs.readFileSync("/etc/letsencrypt/live/mubdiur.com/privkey.pem"),
    cert: fs.readFileSync("/etc/letsencrypt/live/mubdiur.com/fullchain.pem")
}, app).listen(8321);