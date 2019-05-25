const fs = require('fs');

module.exports = function (app) {

    //Fun stats tracker. Non-interactive.
    var cameOnlineAt = new Date();
    app.get('/admin/sweet-stats', function (req, res) {
        var currentTime = new Date();
        var uptime = new Date(currentTime - cameOnlineAt).toISOString().slice(11, -1);
        Post.count().then(numberOfPosts => {
            Image.count().then(numberOfImages => {
                Post.find({
                    timestamp: {
                        $gte: new Date(new Date().setDate(new Date().getDate() - 1))
                    }
                }).then(posts => {
                    var daysImages = 0;
                    var daysReplies = 0;
                    posts.forEach(post => {
                        var imageCount = post.images.length;
                        post.comments.forEach(comment => {
                            if (comment.images) {
                                imageCount += comment.images.length;
                            }
                        })
                        daysImages += imageCount;
                        daysReplies += post.comments.length;
                    });
                    var funstats = [
                        "uptime " + uptime,
                        "logged in users " + helper.loggedInUsers(),
                        "peak logged in users (since last restart) " + helper.peakLoggedInUsers(),

                        "totals... " +
                        " posts " + numberOfPosts +
                        ", images " + numberOfImages,

                        "last 24 hours... " +
                        " posts " + posts.length +
                        ", images " + daysImages +
                        ", comments " + daysReplies
                    ];
                    if (req.isAuthenticated()) {
                        var loggedInUserData = req.user;
                        res.render('systempost', {
                            postcontent: funstats,
                            loggedIn: true,
                            loggedInUserData: loggedInUserData
                        });
                    } else {
                        res.render('systempost', {
                            postcontent: funstats,
                            loggedIn: false
                        });
                    }
                })
            })
        })
    })

    app.get("/admin/buildpostgraph", function (req, res) {
        rebuildPostTable();
        res.send("building...");
    })

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    app.get("/admin/postgraph", function(req, res) {
        if (req.isAuthenticated()) {
            var loggedInUserData = req.user;
            res.render('asyncPage', {
                getUrl: "/admin/justpostgraph",
                loggedIn: true,
                loggedInUserData: loggedInUserData
            });
        } else {
            res.render('asyncPage', {
                getUrl: "/admin/justpostgraph",
                loggedIn: false
            });
        }
    });

    app.get("/admin/justpostgraph", async function (req, res) {
        if (!fs.existsSync("postTimeline.csv")) {
            rebuildPostTable();
        }
        while (rebuildingPostTable) {
            await sleep(500);
        }
        parseTableForGraph("postTimeline.csv").then((datapoints) => {
            res.render('partials/timeGraph', {
                layout: false,
                label: "cumulative sweet posts",
                datapoint: datapoints
            })
        })
    })
};

var postCountByDay = [];
var rebuildingPostTable = false;
var postTableFileName = "postTimeline.csv";

function postTableUpToDate() {
    var lastLine = "";
    fs.readFileSync(postTableFileName, 'utf-8').split('\n').forEach(function (line) {
        if (line && line != "\n") {
            lastLine = line;
        }
    });
    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (lastLine.split(",")[0] == yesterday.toDateString()) {
        return true;
    } else {
        return false;
    }
}

function rebuildPostTable() {
    rebuildingPostTable = true;
    var today = new Date(new Date().setDate(new Date().getDate() - 1));
    today.setHours(23)
    today.setMinutes(59);
    today.setSeconds(59);
    today.setMilliseconds(999);
    Post.find({}).sort('timestamp').then(posts => {

        var startDate = posts[0].timestamp;
        var before = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 23, 59, 59, 999);

        getPostsAtEndOfDay(new Date(before));

        var totalDays = (today.getTime() - before.getTime()) / (24 * 60 * 60 * 1000) + 1;

        var everyHowMany = Math.ceil(totalDays / 100);

        var howManyDaysWeUse = Math.floor(totalDays / everyHowMany);

        for (var i = 0; i < howManyDaysWeUse - 1; i++) {
            before.setDate(before.getDate() + everyHowMany);
            getPostsAtEndOfDay(new Date(before), howManyDaysWeUse);
        }
    })
}

function getPostsAtEndOfDay(day, totalDays) {
    Post.find({
        timestamp: {
            $lte: day
        }
    }).then(posts => {
        day.postCount = posts.length;
        postCountByDay.push(day);

        if (postCountByDay.length == totalDays) {
            sortCounts(postTableFileName, postCountByDay);

        }
    })
}

function sortCounts(fileName, countByDay, notRebuilding = false) {
    if (fs.existsSync(fileName) && !notRebuilding) {
        fs.unlinkSync(fileName);
    }
    var ourFile = fs.createWriteStream(fileName);
    ourFile.on('close', () => {
        rebuildingPostTable = false;
        postCountByDay = [];
    })
    countByDay.sort(function (a, b) {
        return a - b
    });
    countByDay.forEach(date => {
        ourFile.write(date.toDateString() + "," + date.getFullYear() + "," + date.getMonth() + "," + date.getDate());
        ourFile.write("," + date.postCount + "\n");
    })
    ourFile.end();
}

async function parseTableForGraph(filename) {
    jsonVersion = [];
    fs.readFileSync(filename, 'utf-8').split('\n').forEach(function (line) {
        if (line && line !== "\n") {
            var lineComps = line.split(",");
            jsonVersion.push({
                label: lineComps[0],
                year: lineComps[1],
                month: lineComps[2],
                date: lineComps[3],
                hour: 23,
                minute: 59,
                second:59,
                postcount: lineComps[4]
            });
        }
    });
    var now = new Date();
    await Post.count().then((numberOfPosts) => {
        jsonVersion.push({
            label: now.toLocaleString(),
            year: now.getFullYear(),
            month: now.getMonth(),
            date: now.getDate(),
            hour: now.getHours(),
            minute: now.getMinutes(),
            second: now.getSeconds(),
            postcount: numberOfPosts
        });
    })
    return jsonVersion;
}