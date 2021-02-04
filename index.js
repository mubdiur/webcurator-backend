const express = require("express")
const https = require("https")
const fs = require('fs')
var admin = require('firebase-admin')
var mysql = require('mysql')
const puppeteer = require("puppeteer")
const cheerio = require("cheerio")
const util = require('util')


let rawData = fs.readFileSync('secrets.json')
let secrets = JSON.parse(rawData)

const machine = secrets.machine

const SITE_CONTENT_LIMIT = 30

// Prepare puppeteer
let browserInstance = null

async function getBrowserInstance() {
    if (browserInstance == null) {
        try {
            if (machine === 'local') {
                browserInstance = await puppeteer.launch({
                    args: [
                        '--ignore-certificate-errors',
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        "--disable-accelerated-2d-canvas",
                        "--disable-gpu",
                        "--disable-breakpad",
                        "--no-zygote",
                        "--no-first-run",
                        "--disable-web-security",
                        "--disable-desktop-notifications",
                        "--disable-permissions-api",
                        "--disable-sync",
                        "--hide-scrollbars",
                        "--single-process"
                    ],
                    userDataDir: secrets.datadir,
                    ignoreHTTPSErrors: true,
                    headless: true
                })
            } else if (machine === 'server') {
                browserInstance = await puppeteer.launch({
                    args: [
                        '--ignore-certificate-errors',
                        '--no-sandbox',
                        '--disable-setuid-sandbox',],
                    userDataDir: secrets.datadir,
                    ignoreHTTPSErrors: true,
                    headless: true
                })
            } else {
                console.log("Please give a valid value to machine")
            }
        } catch (err) {
            console.log("Browser Launch: ", err);
        }
    }
    return browserInstance
}



// Initialize firebase admin sdk

var serviceAccount = require(secrets.serviceacc)

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://webcurator-33fea.firebaseio.com"
});

// Prepare the object for mysql connection
var con = mysql.createConnection({
    host: "localhost",
    user: secrets.user,
    password: secrets.password,
    database: 'webcurator'
});


const query = util.promisify(con.query).bind(con);
// Prepare the object for express server
const app = express();

app.use(express.json()) // for parsing application/json
app.use(express.urlencoded({
    extended: true
})) // for parsing application/x-www-form-urlencoded

// server starts here
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
                    const respose = await databaseOperations(req.body, uid).catch(console.dir)
                    res.send(JSON.stringify(respose))
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
    switch (request.operation) {
        // ------ 1. FETCH operations ---------- //
        case "getHtml":
            return await getHtml(request.url)
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

// network 0
async function getHtml(url) {
    const browser = await getBrowserInstance()
    const page = await browser.newPage()
    await page.setCacheEnabled(false)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (req.resourceType() == 'stylesheet' || req.resourceType() == 'font' || req.resourceType() == 'image') {
            req.abort();
        }
        else {
            req.continue();
        }
    });
    page.goto(url, { waitUntil: 'load', timeout: 0 }).catch(console.dir)
    await page.waitForSelector('body')
    await delay(2000)
    await page._client.send("Page.stopLoading")
    const html = await page.content()
    await page.close()
    const htmlResponse = {
        html: html
    }
    return htmlResponse
}
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
    let contentList = []
    const sites = await getSitesForFeed(feedid)

    for (site of sites) {
        const contents = await getContentsForSite(site.id)
        for (content of contents) {
            contentList.push(content)
        }
    }
    return contentList
}
// network 4
async function getUpdateCount(feedid) {
    const res = await query("SELECT updates FROM feeds where id = ?", [feedid])
    if (res[0]) return res[0].updates
    else return 0
}

async function getOneFeed(feedid) {
    const res = await query("SELECT * FROM feeds where id = ?", [feedid])
    if (res[0]) return res[0]
    else return 0
}
async function getAllFeeds() {
    return await query("SELECT * FROM feeds")
}
// network 6
async function getNotificationStatus(feedid) {
    const res = await query("SELECT notification FROM feeds where id = ?", [feedid])
    if (res[0]) return res[0].notification
    else return 0
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
async function insertContentObject(site, contentObject) {
    oneContent = {
        siteid: site.id,
        text: contentObject.text,
        source: site.url,
        new: contentObject.new
    }
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
    await curateContentsFeed(res.insertId)
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
    await curateContentsFeed(feedid)
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
    await query("UPDATE feeds SET updates = ? where id = ?", [0, feedid])
    const sites = await getSitesForFeed(feedid)
    for (site of sites) {
        await query("UPDATE contents SET new = ? where siteid = ?", [0, site.id])
    }
    return true
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

    var updateCount = 0


    const sites = await getSitesForFeed(feedid)

    for (site of sites) {

        const oldContents = await getContentsForSite(site.id)
        const curatedContents = new Map()

        const html = await getHtml(site.url)
        const $ = await cheerio.load(html)

        const paths = await getPathsForSite(site.id)

        for (path of paths) {
            var x = 0
            $(path.path).each(
                function (index, element) {
                    if (x == SITE_CONTENT_LIMIT) return
                    curatedContents.set($(this).text().trim(), 1)
                    x++
                }
            )
        }

        await deleteContentsForSite(site.id)
        const seenContents = oldContents.filter(content => content.new == 0)
        for (content of seenContents) {
            curatedContents.set(content.text.trim(), 0)
        }
        for (let [key, value] of curatedContents) {
            const contentObj = {
                text: key,
                new: value
            }
            await insertContentObject(site, contentObj)
        }
    } // all sites done
    const allContents = await getContentsForFeed(feedid)
    for (content of allContents) {
        if (content.new === 1) {
            updateCount++
        }
    }
    return updateCount
}




// updater
const updateChecker = async function () {
    const feeds = await getAllFeeds()

    for (feed of feeds) {

        const updateCount = await curateContentsFeed(feed.id)

        if (feed.notification == 1) {
            if (updateCount > 0) {
                let lastPart = " new updates"
                if (updateCount === 1) {
                    lastPart = " new update"
                }
                // trigger notification
                const message = {
                    notification: {
                        title: feed.title,
                        body: updateCount + lastPart
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
    setTimeout(updateChecker, 300)
}
async function run() {
    await getBrowserInstance()
    await updateChecker()
}
run().catch(console.dir)

// UTILITY
async function delay(ms) {
    // return  for better  stack trace support in case of errors.
    return new Promise(resolve => setTimeout(resolve, ms));
}






/**
* --------------------------------------------------------------------
* --------------- Listen to port -------------------------------------
* --------------------------------------------------------------------
*/

if (machine === 'local') {
    // http
    app.listen(8321);
} else if (machine === 'server') {
    // https
    https.createServer({
        key: fs.readFileSync("/etc/letsencrypt/live/mubdiur.com/privkey.pem"),
        cert: fs.readFileSync("/etc/letsencrypt/live/mubdiur.com/fullchain.pem")
    }, app).listen(8321)
} else {
    console.log("Please give a valid value to machine")
}