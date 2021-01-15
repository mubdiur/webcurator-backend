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
                responseHandler(req.body, uid, res)
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

/**
 * 
 * 
 * 
 *  Below is the code for providing the response
 * 
 * 
 * 
 * 
 */


async function responseHandler(request, uid, callback) {
    switch (request.operation) {
        case "insertFeed":
            await insertFeed(request.data, uid, callback)
            break
        case "getFeeds":
            return await getFeeds(uid, callback)
        default:
            console.log(request.operation + " did not match any case!")
    }
}



async function getFeeds(uid, callback) {
    await con.query("SELECT * FROM feeds", (err, res) => {
        if (err) console.log(err)
        else {
            callback.send(res)
        }
    })
}



async function insertPaths(siteid, pathList, callback) {
    pathList.forEach(async path => {
        onePath = {
            siteid: siteid,
            path: path
        }
        await con.query("INSERT INTO paths SET?", onePath, (err, res) => {
            if (err) console.log(err)
            else {
                //...
            }
        })
    })
}


async function insertSites(feedid, siteList, callback) {
    siteList.forEach(async site => {
        oneSite = {
            feedid: feedid,
            url: site.url
        }
        await con.query("INSERT INTO sites SET?", oneSite, (err, res) => {
            if (err) console.log(err)
            else {
                insertPaths(res.insertId, site.paths, callback)
            }
        })
    })
}


async function insertFeed(data, uid, callback) {
    await con.connect()
    var obj = JSON.parse(data)
    var oneFeed = {
        uid: String(uid),
        title: obj.title,
        description: obj.description,
        notification: false,
        updates: 0
    }
    await con.query("INSERT INTO feeds SET ?", oneFeed, (err, res) => {
        if (err) console.log(err)
        else {
            insertSites(res.insertId, obj.sites, callback)
        }
    })
    callback.send("")
}



// http
// app.listen(8321);

// https
https.createServer({
    key: fs.readFileSync("/etc/letsencrypt/live/mubdiur.com/privkey.pem"),
    cert: fs.readFileSync("/etc/letsencrypt/live/mubdiur.com/fullchain.pem")
}, app).listen(8321);