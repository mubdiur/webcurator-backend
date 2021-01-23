const express = require("express")
const https = require("https")
const fs = require('fs');
var admin = require('firebase-admin');
var mysql = require('mysql');
const puppeteer = require("puppeteer");
var HTMLParser = require('node-html-parser');

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
con.connect()
// Prepare the object for express server
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
                // Get the User ID directly from firebase  
                // based on the client's ID token
                const uid = decodedToken.uid;
                databaseOperations(req.body, uid, res)
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





/**
 * --------------------------------------------------------------------
 *  Below is the code for DB operations
 * --------------------------------------------------------------------
 */


async function databaseOperations(request, uid, callback) {
    console.log("ordered operation: " + request.operation)
    switch (request.operation) {
        // ------ 1. FETCH operations ---------- //
        // network 1
        case "getUserFeeds":
            await getUserFeeds(uid, res => {
                callback.send(res)
            })
            break
        // network 2
        // if the operation is to get the notification status
        case "getSitesForFeed":
            await getSitesForFeed(request.feedid, res => {
                callback.send(res)
            })
            break
        // network 3
        case "getContentsForFeed":
            await getContentsForFeed(request.feedid, res => {
                callback.send(res)
            })
            break
        // network 4
        case "getUpdateCount":
            await getUpdateCount(request.feedid, res => {
                callback.send(res)
            })
            break
        // network 5
        case "getTopicForFeed":
            await getTopicForFeed(request.feedid, res => {
                callback.send(res)
            })
            break
        // network 6
        // if the operation is to get the notification status
        case "getNotificationStatus":
            await getNotificationStatus(request.feedid, uid, res => {
                callback.send(res)
            })
            break


        // ------ 2. INSERT operations ---------- //

        // if the operation is to insert a feed
        // network 7 
        case "insertFeed":
            await insertFeed(request.feed, uid)
            callback.send("")
            break
        // network 8
        case "insertOneSite":
            await insertOneSite(request.feedid, request.site)
            callback.send("")
            break

        // ------ 3. UPDATE operations ---------- //
        // network 9
        case "setNotification":
            await setNotification(request.feedid, request.notification)
            callback.send("")
            break
        // network 10
        case "modifyFeed":
            await modifyFeed(request.feedid, request.title, request.description)
            callback.send("")
            break
        // ------ 4. DELETE operations ---------- //
        // network 11
        case "deleteSite":
            await deleteSite(request.siteid)
            callback.send("")
            break
        // network 12
        case "deleteFeed":
            await deleteFeed(request.feedid)
            callback.send("")
            break
        // ------ DEFAULT operation ---------- //

        default:
            console.log(request.operation + " did not match any case!")
    }
}

asyncLoop()
// get the set of contents from database using the siteid as oldSet
await getContentsForSite(site.id, contents => {
    contents.forEach(content => {
        oldSet.add(content.text.toString())
    })
})
// find updatedSet of new contents newSet - oldSet
oldSet.forEach(item => {
    newSet.delete(item)
})

if (newSet.length > 0) {
    // New updates found!

    // total number of updates += updatedSet.length()
    await getUpdateCount(site.feedid, count => {
        setUpdateCount(site.feedid, count + newSet.length)
    })

    // insert the contents with siteid
    await insertContents(site.id, newSet)



    // Trigger Notification



    await getOneFeed(site.feedid, async feed => {
        // get topic for the feed
        if (feed.notification == 1) {
            await getTopicForFeed(feed.id, topic => {

                var message = {
                    notification: {
                        title: feed.title,
                        body: feed.updates.toString() + ' new updates!'
                    },
                    topic: topic
                };

                admin.messaging().send(message)
                    .catch((error) => {
                        console.log('Error sending message: ', error);
                    });
            })
        }
    })
}
}

/**
 * --------------------------------------------------------------------
 * -----------------  CHECK UPDATES IN INTERVAL -----------------------
 * --------------------------------------------------------------------
 */

var checkForAllUpdates = async function () {
    // fetch all feeds

    if (isUpdateDone) {
        console.log("--------------Starting updates-----------------")
        isUpdateDone = false
        await getAllFeeds(feeds => {
            // for each feed id 
            (async () => {
                var index = 0
                var asyncLoop = async function () {
                    if (index < feeds.length) {
                        await updateContentsForFeed(feeds[index].id)
                        console.log("from updateContentsForFeed to getAllFeeds")
                        index++
                        setTimeout(asyncLoop, 5)
                    }
                }
                asyncLoop()
            })()
        })
    }
    setTimeout(checkForAllUpdates, 5)
}

checkForAllUpdates()

// UTILITY

// async function delay(ms) {
//     // return await for better async stack trace support in case of errors.
//     return await new Promise(resolve => setTimeout(resolve, ms));
// }






/**
 * --------------------------------------------------------------------
 * --------------- Listen to port -------------------------------------
 * --------------------------------------------------------------------
 */


// http
app.listen(8321);

// https
// https.createServer({
//     key: fs.readFileSync("/etc/letsencrypt/live/mubdiur.com/privkey.pem"),
//     cert: fs.readFileSync("/etc/letsencrypt/live/mubdiur.com/fullchain.pem")
// }, app).listen(8321);







// comments
// async function saveText(url) {
//     page = await getPage()
//     page.goto(url);
//     await page.waitForSelector("html")

//     text = await page.evaluate(() => {
//         var pageText = document.body.innerText
//         window.stop()
//         return pageText
//     })
//     await fs.writeFile("output.txt", text, (err) => { })
// }