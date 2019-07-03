const Autolinker = require('autolinker');
var sanitize = require('mongo-sanitize');
var sanitizeHtml = require('sanitize-html');

module.exports = {
    // Parses new post and new comment content. Input: a text string. Output: a parsed text string.
    parseText: function(rawText, cwsEnabled = false, mentionsEnabled = true, hashtagsEnabled = true, urlsEnabled = true, youtubeEnabled = false) {
        let splitContent = rawText.split('</p>');
        let parsedContent = [];
        var mentionRegex = /(^|[^@\w])@([\w-]{1,30})[\b-]*/g
        var mentionReplace = '$1<a href="/$2">@$2</a>';
        var hashtagRegex = /(^|[^#\w])#(\w{1,60})\b/g
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
                line = line.replace(/<div[^>]*>|<\/div>/g, ''); // Removes DIV tags
                parsedContent.push(line);
            }
        })
        parsedContent = parsedContent.join('');
        parsedContent = sanitize(parsedContent);

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

        parsedContent = this.sanitizeHtmlForSweet(parsedContent);

        if (youtubeEnabled) {
            var embedsAllowed = 1; //harsh, i know
            var embedsAdded = 0;
            //sometimes when you paste a url into mediumeditor it's immediately a link and sometimes not and i have no clue why so just for now we have to deal with both cases
            var linkFindingRegex = /<p>(<br \/>)*<a href="(.*?)">(.*?)<\/a>(<br \/>)*<\/p>/g //matches all links with a line to themselves. the <br /> only in there bc mediumeditor is being naughty >:(
            var urlFindingRegex = /<p>((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?<\/p>/g //matches all unlinked youtube urls with a line to themselves
            //taken from https://stackoverflow.com/questions/19377262/regex-for-youtube-url
            var youtubeUrlFindingRegex = /^((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?$/

            if (parsedContent.search(linkFindingRegex) != -1) {
                var searchableParsedContent = parsedContent.replace(/&amp;/, '&');
                var r = linkFindingRegex.exec(searchableParsedContent);
                var s = urlFindingRegex.exec(searchableParsedContent);
                var parsedContentWEmbeds = searchableParsedContent.slice(); //need a copy of searchableParsedContent that we can modify without throwing off lastIndex in RegExp.exec
                while (r && embedsAdded < embedsAllowed) {
                    if (r[2].search(youtubeUrlFindingRegex) != -1 && r[3].search(youtubeUrlFindingRegex) != -1) {
                        var videoid = youtubeUrlFindingRegex.exec(r[2])[5];
                        parsedContentWEmbeds = parsedContentWEmbeds.replace(r[0], '<p><iframe width="560" height="315" style="max-width:100%;" src="https://www.youtube.com/embed/' + videoid + '" frameborder="0" allowfullscreen></iframe></p>');
                        ++embedsAdded;
                    }
                    r = linkFindingRegex.exec(searchableParsedContent);
                }
                while (s && embedsAdded < embedsAllowed) {
                    var videoid = s[5];
                    parsedContentWEmbeds = parsedContentWEmbeds.replace(s[0], '<p><iframe width="560" height="315" style="max-width:100%;" src="https://www.youtube.com/embed/' + videoid + '" frameborder="0" allowfullscreen></iframe></p>');
                    ++embedsAdded;
                    s = urlFindingRegex.exec(searchableParsedContent);
                }
                parsedContent = parsedContentWEmbeds.replace(/&/, '&amp;');
            }
        }

        return {
            text: parsedContent,
            mentions: trimmedMentions,
            tags: trimmedTags
        };
    },
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
            allowedTags: ['blockquote', 'ul', 'li', 'i', 'b', 'strong', 'a', 'p', 'br'],
            allowedAttributes: {
                'a': ['href']
            },
            transformTags: {
                'a': function(tagName, attribs) {
                    if (!attribs.href.includes('//')) {
                        attribs.href = "//" + attribs.href;
                    }
                    return {
                        tagName: 'a',
                        attribs: attribs
                    };
                }
            }
        });
    }
}

function wordCount(str) {
    return str.split(' ')
        .filter(function(n) {
            return n != ''
        })
        .length;
}