const express = require("express")
const https = require("https")
const fs = require('fs');
var admin = require('firebase-admin');
var mysql = require('mysql');
const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const util = require('util');
const { finished } = require("stream");

// Prepare puppeteer
let browserInstance = null
let pageInstance = null

async function getPage() {
    if (browserInstance == null)
        browserInstance = await puppeteer.launch();
    if (pageInstance == null)
        pageInstance = await browserInstance.newPage()
    return pageInstance
}

// Initialize firebase admin sdk
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: "https://webcurator-33fea.firebaseio.com"
});

// Prepare the object for mysql connection
var con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: 'webcurator'
});


const query = util.promisify(con.query).bind(con);
// Prepare the object for express server
const app = express();

app.use(express.json()) // for parsing application/json
app.use(express.urlencoded({
    extended: true
})) // for parsing application/x-www-form-urlencoded

app.post('/', (req, res, next) => {

    // Verify ID token
    if (req.body.token != "") {
        admin
            .auth()
            .verifyIdToken(req.body.token)
            .then((decodedToken) => {
                // Get the User ID directly from firebase  
                // based on the client's ID token
                const uid = decodedToken.uid;
                (async () => {
                    const respose = await databaseOperations(req.body, uid)
                    res.send(respose)
                })()
            })
            .catch((error) => {
                console.log(error.message)
                res.send({
                    message: "invalid token!"
                });
            });
    } else {
        console.log("empty token")
        res.send({
            message: "token cannot be empty!"
        });
    }
})


async function databaseOperations(request, uid) {
    console.log("ordered operation: " + request.operation)
    switch (request.operation) {
        // ------ 1. FETCH operations ---------- //
        // network 1
        case "getUserFeeds":
            return await getUserFeeds(uid)
        // network 2
        // if the operation is to get the notification status
        case "getSitesForFeed":
            return await getSitesForFeed(request.feedid)
        // network 3
        case "getContentsForFeed":
            return await getContentsForFeed(request.feedid)
        // network 4
        case "getUpdateCount":
            return await getUpdateCount(request.feedid)
        // network 5
        case "getTopic":
            return String(uid)
        // network 6
        // if the operation is to get the notification status
        case "getNotificationStatus":
            return await getNotificationStatus(request.feedid, uid)


        // ------ 2. INSERT operations ---------- //

        // if the operation is to insert a feed
        // network 7 
        case "insertFeed":
            return await insertFeed(request.feed, uid)
        // network 8
        case "insertOneSite":
            return await insertOneSite(request.feedid, request.site)

        // ------ 3. UPDATE operations ---------- //
        // network 9
        case "setNotification":
            return await setNotification(request.feedid, request.notification)
        // network 10
        case "modifyFeed":
            return await modifyFeed(request.feedid, request.title, request.description)
        // network 10.1
        case "markFeedRead":
            return await markFeedRead(request.feedid)
        // network 10.2
        case "markAllRead":
            return await markAllRead(uid)
        // network 10.3
        case "curateContentsFeed":
            return await curateContentsFeed(request.feedid)
        // ------ 4. DELETE operations ---------- //
        // network 11
        case "deleteSite":
            return await deleteSite(request.siteid)
        // network 12
        case "deleteFeed":
            return await deleteFeed(request.feedid)
        // ------ DEFAULT operation ---------- //

        default:
            return " did not match any case!"
    }
}



// --------------- DATABASE UNIT FUNCTIONS ---------------------

// ----------- get functions -----------------
// network 1
async function getUserFeeds(uid) {
    return await query("SELECT * FROM feeds where uid = ?", [uid])
}
// network 2
async function getSitesForFeed(feedid) {
    return await query("SELECT * FROM sites where feedid = ?", [feedid])
}
async function getPathsForSite(siteid) {
    return await query("SELECT * FROM paths where siteid = ?", [siteid])
}
async function getContentsForSite(siteid) {
    return await query("SELECT * FROM contents where siteid = ?", [siteid])
}
// network 3
async function getContentsForFeed(feedid) {
    let setOfContent = new Set()
    const sites = await getSitesForFeed(feedid)

    for (site of sites) {
        const contents = await getContentsForSite(site.id)
        for (content of contents) {
            setOfContent.add(content)
        }
    }
    return setOfContent
}
// network 4
async function getUpdateCount(feedid) {
    const res = await query("SELECT updates FROM feeds where id = ?", [feedid])
    return res[0].updates
}

async function getOneFeed(feedid) {
    const res = await query("SELECT * FROM feeds where id = ?", [feedid])
    return res[0]
}
async function getAllFeeds() {
    return await query("SELECT * FROM feeds")
}
// network 6
async function getNotificationStatus(feedid) {
    const res = await query("SELECT notification FROM feeds where id = ?", [feedid])
    return res[0].notification
}



// ----------- insert functions -------------

async function insertContents(siteid, contents, source) {
    var count = 0
    for (content of contents) {
        oneContent = {
            siteid: siteid,
            text: content,
            source: source
        }
        await query("INSERT INTO contents SET?", oneContent)
        count++
    }
    return count
}


async function insertPaths(siteid, pathList) {
    var count = 0
    for (path of pathList) {
        onePath = {
            siteid: siteid,
            path: path
        }
        await query("INSERT INTO paths SET?", onePath)
        count++
    }
    return count
}

async function insertSites(feedid, siteList) {
    var count = 0
    for (site of siteList) {
        oneSite = {
            feedid: feedid,
            url: site.url
        }
        const res = await query("INSERT INTO sites SET?", oneSite)
        await insertPaths(res.insertId, site.paths)
        count++
    }
    return count
}

// network 7
async function insertFeed(feed, uid) {
    const feedObject = JSON.parse(feed)
    var oneFeed = {
        uid: String(uid),
        title: feedObject.title,
        description: feedObject.description,
        notification: false,
        updates: 0
    }
    const res = await query("INSERT INTO feeds SET ?", oneFeed)
    await insertSites(res.insertId, feedObject.sites);
    return res
}
// network 8
async function insertOneSite(feedid, site) {
    const siteObject = JSON.parse(site)
    oneSite = {
        feedid: feedid,
        url: siteObject.url
    }
    const res = await query("INSERT INTO sites SET?", oneSite)
    await insertPaths(res.insertId, siteObject.paths);
    return res
}



// --------------- update/set functions -----------------


async function setUpdateCount(feedid, updates) {
    return await query("UPDATE feeds SET updates = ? where id = ?", [updates, feedid])
}
// network 9
async function setNotification(feedid, value) {
    return await query("UPDATE feeds SET notification = ? where id = ?", [value, feedid])
}
// network 10
async function modifyFeed(feedid, title, description) {
    return await query("UPDATE feeds SET title = ?, description = ? where id = ?", [title, description, feedid])
}

// network 10.1
async function markFeedRead(feedid) {
    return await query("UPDATE feeds SET updates = ? where id = ?", [0, feedid])
}

// network 10.2
async function markAllRead(uid) {
    var count = 0
    const feeds = await getUserFeeds(uid)
    for (feed of feeds) {
        await markFeedRead(feed.id)
        count++
    }
    return count
}

// ---------------- Delete functions -----------------

async function deleteContentsForSite(siteid) {
    return await query("DELETE from contents where siteid = ?", [siteid])
}
// network 11
async function deleteSite(siteid) {
    return await query("DELETE from sites where id = ?", [siteid])
}
// network 12
async function deleteFeed(feedid) {
    return await query("DELETE from feeds where id = ?", [feedid])
}



// ------------------ end of database functions ---------------


/**
 * --------------------------------------------------------------------
 * -----------------  The CURATION part is here -----------------------
 * --------------------------------------------------------------------
 */

async function curateContentsFeed(feedid) {

    const page = await getPage()

    // get sites from feedid
    const sites = await getSitesForFeed(feedid)

    const feedUpdates = new Set()
    const siteContents = new Set()

    for (site of sites) {

        await page.setCacheEnabled(false)
        page.goto(site.url).catch(console.dir)
        await page.waitForSelector("html")

        const html = await page.content()

        const $ = cheerio.load(html)

        siteContents.clear()
        // populate new set
        const paths = await getPathsForSite(site.id)
        for (path of paths) {
            $(path.path).each(function (i, el) {
                siteContents.add($(this).text())
                feedUpdates.add($(this).text())
            })
        }
        // remove existing
        const contents = await getContentsForSite(site.id)
        for (content of contents) {
            feedUpdates.delete(content.text)
        }

        // clear old content from db
        await deleteContentsForSite(site.id)
        // insert contents 
        await insertContents(site.id, siteContents, site.url)
    }

    if (feedUpdates.size > 0) {
        const updates = await getUpdateCount(feedid)
        const newCount = updates + feedUpdates.size
        await setUpdateCount(feedid, newCount)
    }
    return feedUpdates.size
}
// updater
const updateChecker = async function () {

    const feeds = await getAllFeeds()
    const idList = []

    for (feed of feeds) {
        idList.push(feed.id)

        // notify
        if (feed.notification == 1) {
            if (feed.updates > 0) {
                // trigger notification
                const message = {
                    notification: {
                        title: feed.title,
                        body: feed.updates + ' new updates!'
                    },
                    topic: feed.uid
                };

                admin.messaging().send(message)
                    .catch((error) => {
                        console.log('Error sending message: ', error);
                    });
            }
        }
    } // for feed of feeds

    for (feedid of idList) {
        // curate
        await curateContentsFeed(feedid)
    }
    setTimeout(updateChecker, 5000)
}
updateChecker()
// UTILITY

// async function delay(ms) {
//   // return  for better  stack trace support in case of errors.
//   return new Promise(resolve => setTimeout(resolve, ms));
// }






/**
* --------------------------------------------------------------------
* --------------- Listen to port -------------------------------------
* --------------------------------------------------------------------
*/


// http
// app.listen(8321);

// https
https.createServer({
    key: fs.readFileSync("/etc/letsencrypt/live/mubdiur.com/privkey.pem"),
    cert: fs.readFileSync("/etc/letsencrypt/live/mubdiur.com/fullchain.pem")
}, app).listen(8321);
