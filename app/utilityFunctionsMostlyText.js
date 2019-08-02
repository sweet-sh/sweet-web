const Autolinker = require('autolinker');
var sanitize = require('mongo-sanitize');
var sanitizeHtml = require('sanitize-html');
var got = require('got');
const urlp = require('url');
const metascraper = require('metascraper')([
    require('metascraper-description')(),
    require('metascraper-image')(),
    require('metascraper-title')(),
    require('metascraper-url')()
])

module.exports = {
    // Parses new post and new comment content. Input: a text string. Output: a parsed text string.
    parseText: async function(rawText, cwsEnabled = false, mentionsEnabled = true, hashtagsEnabled = true, urlsEnabled = true) {
        console.log("Parsing content")
        if (rawText.ops) {
            var parsedDelta = await this.parseDelta(rawText);
            rawText = parsedDelta.text;
            var embeds = parsedDelta.embeds;
        } else {
            var embeds = [];
        }
        let splitContent = rawText.split('</p>');
        let parsedContent = [];
        var mentionRegex = /(^|[^@\w])@([\w-]{1,30})[\b-]*/g
        var mentionReplace = '$1<a href="/$2">@$2</a>';
        var hashtagRegex = /(^|>|\n|\ |\t)#(\w{1,60})\b/g
        var hashtagReplace = '$1<a href="/tag/$2">#$2</a>';
        splitContent.forEach(function(line) {
            line += '</p>'
            if (line.replace(/<[^>]*>/g, "") != "") { // Filters out lines which are just HTML tags
                if (urlsEnabled) {
                    line = Autolinker.link(line);
                }
                if (mentionsEnabled) {
                    line = line.replace(mentionRegex, mentionReplace)
                }
                if (hashtagsEnabled) {
                    line = line.replace(hashtagRegex, hashtagReplace);
                }
                parsedContent.push(line);
            }
        })
        parsedContent = parsedContent.join('');
        parsedContent = sanitize(parsedContent);

        parsedContent = this.sanitizeHtmlForSweet(parsedContent);

        if (!cwsEnabled) {
            let contentWordCount = wordCount(parsedContent);
            if (contentWordCount > 160) {
                parsedContent = '<div class="abbreviated-content">' + parsedContent + '</div><button type="button" class="button grey-button show-more" data-state="contracted">Show more</button>';
            }
        }

        let mentionsArray = Array.from(new Set(rawText.replace(/<[^>]*>/g, " ").match(mentionRegex)))
        let tagsArray = Array.from(new Set(rawText.replace(/<[^>]*>/g, " ").match(hashtagRegex)))
        let trimmedMentions = []
        let trimmedTags = []
        if (mentionsArray) {
            mentionsArray.forEach((el) => {
                trimmedMentions.push(el.replace(/(@|\s)*/i, ''));
            })
        }
        if (tagsArray) {
            tagsArray.forEach((el) => {
                trimmedTags.push(el.replace(/(#|\s)*/i, ''));
            })
        }

        return {
            text: parsedContent,
            mentions: trimmedMentions,
            tags: trimmedTags,
            embeds: [] //replace this when these are working
        };
    },
    //i'm gonna keep it real, i did not expect this to get this complicated
    parseDelta: async function(delta) {
        //taken from https://stackoverflow.com/questions/19377262/regex-for-youtube-url
        var youtubeUrlFindingRegex = /^((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?$/
        //taken from https://github.com/regexhq/vimeo-regex/blob/master/index.js
        var vimeoUrlFindingRegex = /^(http|https)?:\/\/(www\.)?vimeo.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|)(\d+)(?:|\/\?)$/
        var linesOfParsedString = ["<p>"];
        var embeds = [];
        var resultLengthSoFar = 0;
        var withinList = false;
        var lineOpen = true;
        for (op of delta.ops) {
            if (op.insert) { // otherwise something is badly wrong
                if (typeof op.insert == "string" && op.insert !== "") {
                    lineOpen = true;
                    var formattingStartTags = "";
                    var formattingEndTags = "";
                    if (op.attributes) {
                        if (op.attributes.bold) {
                            formattingStartTags = "<strong>" + formattingStartTags;
                            formattingEndTags = formattingEndTags + "</strong>";
                        } else if (op.attributes.italic) {
                            formattingStartTags = "<em>" + formattingStartTags;
                            formattingEndTags = formattingEndTags + "</em>";
                        } else if (op.attributes.link) {
                            formattingStartTags = '<a href="' + op.attributes.link + '" target="_blank">' + formattingStartTags;
                            formattingEndTags = formattingEndTags + "</a>";
                        } else if (op.attributes.blockquote) {
                            if (withinList) {
                                //if we were within a list, run the list end code on the previous line and make the current line a blockquote line (it will be starting with <li> right now) and then start the next line with <p>
                            } else {
                                //if we weren't within a list, this line will be starting with a <p>, replace that with a blockquote, end this line with a blockquote, start the next line with a <p> for now 
                                linesOfParsedString[linesOfParsedString.length - 1] = "<blockquote>" + linesOfParsedString[linesOfParsedString.length - 1].substring(3, linesOfParsedString[linesOfParsedString.length - 1].length) + "</blockquote>";
                                resultLengthSoFar += linesOfParsedString[linesOfParsedString.length - 1].length;
                                linesOfParsedString.push("<p>");
                            }
                            continue;
                        } else if (op.attributes.list == "bullet") {
                            if (!withinList) {
                                withinList = true;
                                linesOfParsedString[linesOfParsedString.length - 1] = "<ul><li>" + linesOfParsedString[linesOfParsedString.length - 1].substring(3, linesOfParsedString[linesOfParsedString.length - 1].length) + "</li>";
                                resultLengthSoFar += linesOfParsedString[linesOfParsedString.length - 1].length;
                                linesOfParsedString.push("<li>");
                                continue;
                            } else {
                                linesOfParsedString[linesOfParsedString.length - 1] += "</li>";
                                resultLengthSoFar += linesOfParsedString[linesOfParsedString.length - 1].length;
                                linesOfParsedString.push("<li>");
                                continue;
                            }
                        }
                    }
                    var lines = op.insert.split('\n');
                    linesOfParsedString[linesOfParsedString.length - 1] += formattingStartTags + lines[0] + formattingEndTags;
                    for (var i = 1; i < lines.length; i++) {
                        if (withinList) {
                            withinList = false;
                            linesOfParsedString[linesOfParsedString.length - 2] += "</ul>";
                            resultLengthSoFar += 5;
                            linesOfParsedString[linesOfParsedString.length - 1] = "<p>" + linesOfParsedString[linesOfParsedString.length - 1].substring(4, linesOfParsedString[linesOfParsedString.length - 1]);
                        }
                        linesOfParsedString[linesOfParsedString.length - 1] += "</p>";
                        resultLengthSoFar += linesOfParsedString[linesOfParsedString.length - 1].length;
                        linesOfParsedString.push("<p>" + formattingStartTags + lines[i] + formattingEndTags);
                    }

                } else if (op.insert.LinkPreview) {
                    /*
                    yeah i don't think we need this actually, it should always have a newline between text and an embed in the first place
                    if (lineOpen) {
                        if (withinList) {
                            withinList = false;
                            linesOfParsedString[linesOfParsedString.length - 2] += "</ul>";
                            resultLengthSoFar += 5;
                            linesOfParsedString[linesOfParsedString.length - 1] = "<p>" + linesOfParsedString[linesOfParsedString.length - 1].substring(4, linesOfParsedString[linesOfParsedString.length - 1]);
                        }
                        linesOfParsedString[linesOfParsedString.length - 1] += "</p>";
                        resultLengthSoFar += linesOfParsedString[linesOfParsedString.length - 1].length;
                        linesOfParsedString.push("<p>");
                        lineOpen = false;
                    }*/
                    console.log("link preview at position " + resultLengthSoFar);
                    //add link preview object to embeds array, if the url matches the vimeo or youtube regexes make it a video embed.
                } else if (op.insert.PostImage) {
                    /*
                    if (lineOpen) {
                        if (withinList) {
                            withinList = false;
                            linesOfParsedString[linesOfParsedString.length - 2] += "</ul>";
                            resultLengthSoFar += 5;
                            linesOfParsedString[linesOfParsedString.length - 1] = "<p>" + linesOfParsedString[linesOfParsedString.length - 1].substring(4, linesOfParsedString[linesOfParsedString.length - 1]);
                        }
                        linesOfParsedString[linesOfParsedString.length - 1] += "</p>";
                        resultLengthSoFar += linesOfParsedString[linesOfParsedString.length - 1].length;
                        linesOfParsedString.push("<p>");
                        lineOpen = false;
                    }
                    */
                    console.log("image at position " + resultLengthSoFar);
                    //add post image object to embeds array. if it has the same position as the last one (resultLengthSoFar hasn't changed) they're grouped into a single object. figure out if they're horizontal and vertical and stuff
                }
            }
        }
        if (withinList) {
            if (typeof delta.ops[delta.ops.length - 1].insert == "string" && (!delta.ops[delta.ops.length - 1].attributes || !delta.ops[delta.ops.length - 1].attributes.list)) {
                linesOfParsedString[linesOfParsedString.length - 2] += "</ul>";
                linesOfParsedString[linesOfParsedString.length - 1] = "<p>" + linesOfParsedString[linesOfParsedString.length - 1].substring(4, linesOfParsedString[linesOfParsedString.length - 1].length) + "</p>";
            } else {
                linesOfParsedString[linesOfParsedString.length - 1] += "</li></ul>"
            }
        } else {
            linesOfParsedString[linesOfParsedString.length - 1] += "</p>"
        }
        return { text: linesOfParsedString.join(""), embeds: embeds }; // \n not strictly necessary but will make the resulting html easier to look at
    },
    //maybe just have the metascaper function in here (will also be used directly above) and have that route in viewingsweet or whatever just call it and send back the result
    isEven: function(n) {
        return n % 2 == 0;
    },
    isOdd: function(n) {
        return Math.abs(n % 2) == 1;
    },
    slugify: function(string) {
        const a = 'àáäâãåăæçèéëêǵḧìíïîḿńǹñòóöôœṕŕßśșțùúüûǘẃẍÿź·/_,:;'
        const b = 'aaaaaaaaceeeeghiiiimnnnoooooprssstuuuuuwxyz------'
        const p = new RegExp(a.split('').join('|'), 'g')

        return string.toString().toLowerCase()
            .replace(/\s+/g, '-') // Replace spaces with -
            .replace(p, c => b.charAt(a.indexOf(c))) // Replace special characters
            .replace(/&/g, '-and-') // Replace & with 'and'
            .replace(/[^\w\-]+/g, '') // Remove all non-word characters
            .replace(/\-\-+/g, '-') // Replace multiple - with single -
            .replace(/^-+/, '') // Trim - from start of text
            .replace(/-+$/, '') // Trim - from end of text
    },
    sanitizeHtmlForSweet: function(parsedContent) {
        return sanitizeHtml(parsedContent, {
            allowedTags: ['blockquote', 'ul', 'li', 'em', 'i', 'b', 'strong', 'a', 'p', 'br'],
            allowedAttributes: {
                'a': ['href', 'target']
            },
            transformTags: {
                'a': function(tagName, attribs) {
                    //if a link is not explicitly relative due to an initial / (like mention and hashtag links are) and doesn't already include the // that makes it non-relative
                    if (attribs.href.substring(0, 1) != "/" && !attribs.href.includes('//')) {
                        //make the link explicitly non-relative
                        attribs.href = "//" + attribs.href;
                    }
                    attribs.target = "_blank";
                    return {
                        tagName: 'a',
                        attribs: attribs
                    };
                }
            }
        });
    },
    //takes a post or comment documents and returns its parsedText with the embed html placed at its position according to the embeds array. never actually tested with more than one embed.
    mixInEmbeds: function(post) { //actually, can also be a comment
        if (post.embeds && post.embeds.length > 0) {
            var index = 0;
            var withEmbeds = "";
            if (post.embeds.length == 1 && typeof post.embeds[0].position == "undefined") { //old, positionless single embed scheme
                return post.parsedContent + post.cachedHTML.embedsHTML[0];
            } else {
                for (var i = 0; i < post.embeds.length; i++) { //new, positioned embed scheme
                    withEmbeds += post.parsedContent.substring(index, post.embeds[i].position);
                    withEmbeds += post.cachedHTML.embedsHTML[i];
                    index = post.embeds[i].position;
                }
                withEmbeds += post.parsedContent.substring(post.embeds[post.embeds.length - 1].position, post.parsedContent.length);
                return withEmbeds;
            }
        }
    }
}

function wordCount(str) {
    return str.split(' ')
        .filter(function(n) {
            return n != ''
        })
        .length;
}