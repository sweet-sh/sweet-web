//okay so the below is the code that configures the quill.js text editor to work how we want it to vis-a-vis text formatting and using inline image and
//link preview elements, both of which i'm referring to as "embeds" bc i can't think of a better name. "inlines"?

//within-editor embeds utility functions:
function updateSubmitButtonState(postForm) {
    var button = postForm.find('.create-comment, #postSubmit');
    if (postForm.find('.still-loading').length == 0) {
        var button = postForm.find('.create-comment, #postSubmit');
        button.attr('disabled', false);
        if (button.hasClass('save-draft-button')) {
            button.html('Save <i class="fas fa-chevron-right"></i>');
        } else if (button.hasClass('create-comment')) {
            button.html('Reply <i class="fas fa-chevron-right"></i>');
        } else if (button.attr('id') == "postSubmit") {
            button.html('Send <i class="fas fa-chevron-right"></i>');
        }
    } else {
        button.attr('disabled', true);
        button.html("<i class='fas fa-spinner fa-spin'></i> Uploading");
    }
}

//attached directly to the onclick of the x in the embeds when a new one is created (bc of user action or rearrangement). this click event is also artificially triggered when an embed has an error
function clearEmbed(e) {
    e.preventDefault();
    var container = $(this).closest('.slidable-embed');
    if (container.hasClass('image-preview-container') && !container.attr('imagealreadysaved') && !container.hasClass('still-loading')) {
        $.post('/cleartempimage', { imageURL: container.attr('image-url') });
    }
    var quillController = container.closest('.ql-container')[0].__quill;
    quillController.updateContents(); //slightly hacky way to get quill to save the image description so it'll put it back if this deletion is undone
    quillController.focus();
    if (container[0].request && container[0].request.readyState != 4) { //if the request is still in progress
        container[0].request.abort();
    }
    var postform = container.closest('.new-comment-form, .contentForm');
    container.remove();
    updateSubmitButtonState(postform);
    createImageGroups(postform.find('.ql-editor'));
}

var newEmbedId = 0; //this increments every time an embed is added in an editor anywhere and before that is used to create their ids so they can all be uniquely identified
//in callbacks that affect embeds, they should be selected by their ids that are formed from this instead of using the existing node variable, bc the re-arranger may have replaced the original element
//actually i'm not completely sure if that's necessary, but anyway it's easy, just do var $("#embed" + id); (id is declared in the create function where the relevant callbacks are also created)

//register embed types!
let BlockEmbed = Quill.import('blots/block/embed');

//taken from https://stackoverflow.com/questions/19377262/regex-for-youtube-url
var youtubeUrlFindingRegex = /^((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?$/
//taken from https://github.com/regexhq/vimeo-regex/blob/master/index.js
var vimeoUrlFindingRegex = /^(http|https)?:\/\/(www\.)?vimeo.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|)(\d+)(?:|\/\?)$/
class LinkPreview extends BlockEmbed {
    //this is called when the quill api is used to create an embed with type 'LinkPreview' (which is where you pass in the url)
    static create(url) {
        var isVideo = (youtubeUrlFindingRegex.test(url) || vimeoUrlFindingRegex.test(url));
        let node = super.create();
        node.setAttribute('id', 'embed' + newEmbedId);
        node.setAttribute('linkUrl', url);
        var id = newEmbedId;
        newEmbedId++;
        node.setAttribute('data-url', url);
        node.setAttribute('contenteditable', false);
        node.innerHTML = $("#new-post-link-preview-contents")[0].innerHTML;
        var n = $(node);
        n.addClass('still-loading');
        n.addClass('slidable-embed');
        n.find('.link-preview-image').on('error', function(e) {
            $(this).replaceWith('<div class="link-preview-image""><i class="fas fa-link"></i></div>');
        })
        node.request = $.post("/api/newpostform/linkpreviewdata", { url: url }, function(data, status, jqXHR) {
            var m = $("#embed" + id);
            if (!m.length) { return; }
            m.removeClass('still-loading');
            if (data == "invalid url i guess") {
                bootbox.alert("Sorry, we couldn't connnect to that url (" + url + ") to obtain a preview :(");
                endMovement(); //in case this link preview is currently being dragged
                m.find('.image-clear').click();
            } else {
                var linkInfo = JSON.parse(data);
                console.log(JSON.stringify(linkInfo, null, 4));
                node.setAttribute('href', linkInfo.linkUrl);
                if (linkInfo.image) {
                    m.find(".link-preview-image").replaceWith('<img class="link-preview-image" src="' + linkInfo.image + '" />')
                } else {
                    m.find(".link-preview-image").replaceWith('<div class="link-preview-image"><i class="fas fa-link"></i></div>');
                }
                m.find('.link-preview-title').html(linkInfo.title);
                m.find('.link-preview-description').html(linkInfo.description);
                m.find('.link-preview-domain').html(linkInfo.domain + (isVideo ? ' (will open as embed)' : ''));
                updateSubmitButtonState(m.closest('.new-comment-form, .contentForm'));
            }
        })
        node.request.fail(function(jqXHR, textStatus, error) {
            var m = $("#embed" + id);
            if (!m.length) { return; }
            m.removeClass('still-loading');
            bootbox.alert("Sorry, we couldn't connect to that url (" + url + ") to obtain a preview :(");
            endMovement(); //in case this link preview is currently being dragged
            m.find('.image-clear').click();
            if (error != "abort") {
                $.post("/admin/reporterror", { errorstring: "error creating link preview for url " + url + ":\n" + error });
            }
        })

        n.find('.image-clear').click(clearEmbed);
        n.find('.image-move').on('mousedown', mousedownOnHandle);
        n.find('.image-move')[0].addEventListener('touchstart', touchStartOnHandle, { passive: false });

        return node;
    }

    //quill calls this function to find out what value it should put for this embed in the object it returns when you call getContents() on it
    //(or what value to pass to create() if it has to recreate this object bc of an undo)
    static value(node) {
        return node.getAttribute('data-url');
    }

    //quill calls this function to find out what attributes it should put for this embed in the object it returns when you call getContents() on it
    static formats(node) {
        var n = $(node);
        if (n.hasClass('still-loading') || n.hasClass('onthemove') || n.hasClass('embedspacer')) {
            return {};
        }
        return { title: n.find('.link-preview-title').html(), description: n.find('.link-preview-description').html(), domain: n.find('.link-preview-domain').html().replace(' (will open as embed)', ''), image: n.find('.link-preview-image').attr('src') }
    }
}

LinkPreview.blotName = 'LinkPreview';
LinkPreview.tagName = 'a';
LinkPreview.className = 'link-preview-container';
Quill.register(LinkPreview);

var files = {}; //each file object is stored in this object under the container's id so that if a user deletes an image embed and then undoes that action, quill can find the file in here and reconstitute the embed from it.
class PostImage extends BlockEmbed {

    //this is called when the quill api is used to create an embed with type 'PostImage' (which is where you pass in the file). it's also called to recreate one of these if it's
    //deleted and then that's undone, in which case if the image is already on the server we want to use that instead of uploading a new copy, so a string with the full url of the
    //image will be passed in in that case (quill gets it from the value() function)
    static create(fileOrUrl) {
        if (typeof fileOrUrl == "string") {
            var url = fileOrUrl;
            let node = super.create();
            node.setAttribute('contenteditable', false);
            node.setAttribute('imagealreadysaved', 'true');
            node.setAttribute('fullsavedurl', url);
            node.innerHTML = $("#new-post-image-preview-contents")[0].innerHTML;
            node.setAttribute('id', 'embed' + newEmbedId);
            newEmbedId++;
            var n = $(node);
            n.addClass('slidable-embed');
            n.find(".fader").remove();
            n.find(".image-preview").css('background-image', 'url(' + url + ')');
            n.find('.image-clear').click(clearEmbed);
            n.find('.image-move').on('mousedown', mousedownOnHandle);
            n.find('.image-move')[0].addEventListener('touchstart', touchStartOnHandle, { passive: false });
            return node;
        }

        var file = fileOrUrl;

        if (file.type != "image/jpeg" && file.type != "image/png" && file.type != "image/gif") {
            bootbox.alert("Sorry, but this appears to be an unsupported file type! We only take JPG, PNG, and GIF images at the moment");
            throw (file.name ? file.name : "") + " of unsupported mime type";
            return undefined;
        } else if (!(((file.type === "image/jpeg" || file.type === "image/png") && file.size < 10485760) || (file.type === "image/gif" && file.size < 5242880))) {
            bootbox.alert("Sorry, but this file appears to be too large! The maximum size for GIF images is 5MB and for JPG and PNG images is 10MB.");
            throw (file.name ? file.name : "") + " too large";
            return undefined;
        }
        let node = super.create();
        node.setAttribute('id', 'embed' + newEmbedId);
        files[node.getAttribute('id')] = file; //store the file in case quill needs to re-create the embed with it bc of an undo action (or redo i guess?)
        var id = newEmbedId;
        newEmbedId++;
        node.setAttribute('contenteditable', false);
        node.setAttribute('image-url', 'loading...');
        node.innerHTML = $("#new-post-image-preview-contents")[0].innerHTML;
        var n = $(node);
        n.addClass("still-loading");
        n.addClass('slidable-embed');
        //generate "virtual url" for the file and use it to display the preview of the image
        var fileURL = URL.createObjectURL(file);
        n.find('.image-preview')[0].style.backgroundImage = "url(" + fileURL + ")";

        //make the image-uploading ajax request
        var fd = new FormData();
        fd.append('image', file);

        node.request = $.ajax({
            xhr: function() {
                var uploader = new XMLHttpRequest();
                uploader.upload.addEventListener("progress", function(e) {
                    var percentage = Math.round(e.loaded / e.total * 100);
                    var m = $("#embed" + id)
                    m.find('progress').attr('value', percentage);
                    m.find("#percentage").html(percentage == 100 ? percentage + '%!!!' : percentage + '%')
                });
                return uploader;
            },
            url: '/api/image/v2',
            type: 'POST',
            data: fd,
            processData: false,
            contentType: false,
            error: function(jqxhr, status, error) {
                var m = $("#embed" + id)
                m.find('progress').attr('value', 0);
                m.find("#percentage").html("Upload error :( Hit the X and try again?");
                console.log("image upload error: " + error);
                m.removeClass('still-loading');
                updateSubmitButtonState(m.closest('.new-comment-form, .contentForm'));
                if (error != "abort") {
                    $.post("/admin/reporterror", { errorstring: "error uploading image:\n" + error });
                }
            },
            success: function(data, status, jqXHR) {
                var m = $("#embed" + id)
                m.removeClass("still-loading");
                var serverResponse = JSON.parse(data);
                //check for file errors. shouldn't ever happen bc of the check at the beginning of this function, but we need server-side checking still anyway, so...
                if (serverResponse.error) {
                    if (serverResponse.error == "filesize") {
                        bootbox.alert("Image too large! The maximum size for GIF images is 5MB and for JPG and PNG images is 10MB.");
                    } else if (serverResponse.error == "filetype") {
                        bootbox.alert("We cannot use this fileOrUrl! Please make sure you are uploading a JPG, PNG, or GIF from this universe.");
                    }
                    endMovement(); //in case this link preview is currently being dragged
                    m.find('.image-clear').click();
                } else {
                    if (serverResponse.thumbnail) {
                        fetch(serverResponse.thumbnail).then(res => res.blob()).then(blob => {
                            m.find('.image-preview').css('background-image', "url(" + URL.createObjectURL(blob) + ")"); //we want the server-created thumbnail bc it will be exif-rotated and transparency-removed as seen fit
                        })
                    }
                    m.find('.fader').remove();
                    m.attr('image-url', serverResponse.url);
                    updateSubmitButtonState(m.closest('.new-comment-form, .contentForm'));
                    setTimeout(function() {
                        var o = $("#embed" + id);
                        if (o.length) {
                            if (!$(".bootbox-alert.show").length) { //so if multiple images are expiring (almost) at once it only creates one alert
                                bootbox.alert("hey your images are expired and stuff whoops sorry! this tab has apparently been open for a week. or maybe linear time has ceased to function. i guess you can reupload? you probably weren't going to finish this post anyway? geez");
                            }
                            var text = o.find("#postImageDescription").val();
                            if (text.trim()) {
                                o.replaceWith("<p>Image: " + text.trim() + (file.name ? " (" + file.name + ")" : "") + "</p>");
                            } else if (file.name) { //image.png is the placeholder for pasted images at least on chrome + firefox
                                if (file.name != "image.png") {
                                    o.replaceWith("<p>Image: " + file.name + "</p>");
                                } else {
                                    o.replaceWith("<p>Pasted image</p>");
                                }
                            } else {
                                o.replaceWith("<p>Image</p>");
                            }
                            createImageGroups(o.parent());
                        }
                    }, 7 * 24 * 60 * 60 * 1000);
                }
            }
        });

        n.find('.image-clear').click(clearEmbed);

        n.find('.image-move').on('mousedown', mousedownOnHandle);
        n.find('.image-move')[0].addEventListener('touchstart', touchStartOnHandle, { passive: false });

        return node;
    }

    //quill calls this function to find out what value it should put for this embed in the object it returns when you call getContents() on it (although we don't use this there)
    //or what value to pass to create() if it has to recreate this object bc of an undo. when that happens, we want it to be recreated using the file that created it if the image
    //is not yet saved on the server (if this is a new post) or using the image from the server if that's saved in public view (if this is an image that was already in a post
    //that's now being edited)
    static value(node) {
        if (node.getAttribute("imagealreadysaved")) {
            return node.getAttribute('fullsavedurl')
        } else {
            return files[node.getAttribute('id')];
        }
    }

    //quill calls this function to find out what attributes it should put for this embed in the object it returns when you call getContents() on it
    static formats(node) {
        return { description: $(node).find('#postImageDescription').val(), imageURL: node.getAttribute('image-url') };
    }

    //when quill recreates one of these after undoing it will reapply the formats established by the method above
    format(name, value) {
        if (name == "description") {
            $(this.domNode).find("#postImageDescription").val(value);
        } else if (name == "imageURL") {
            this.domNode.setAttribute('image-url', value);
        }
    }
}
PostImage.blotName = 'PostImage';
PostImage.tagName = 'div';
PostImage.className = 'image-preview-container';
Quill.register(PostImage);

//element is the div that will now become the container for the quill editor and will have the class ql-container. not to be confused with the ql-editor div inside.
function attachQuill(element, placeholder, embedsForbidden) {
    var quill = new Quill(element, {
        formats: ['bold', 'italic', 'list', 'link', 'blockquote', 'PostImage', 'LinkPreview'],
        modules: {
            toolbar: ['bold', 'italic', { 'list': 'bullet' }, 'link', 'blockquote'],
            keyboard: {
                bindings: {
                    //this just blocks the default quill ordered list adding thing that happens when you type like "1. "
                    'list autofill': {
                        key: 32,
                        handler: function() {
                            return true;
                        }
                    },
                    //if the user hits backspace at the beginning of a blockquote, remove that formatting (quill already does this by default for lists)
                    blqtBksp: {
                        key: 'backspace',
                        collapsed: true,
                        format: ['blockquote'],
                        offset: 0,
                        handler: function(range, context) {
                            this.quill.format('blockquote', false);
                        }
                    },
                    //also, if the user hits backspace with the cursor on a newline after an embed, delete the newline instead of the embed before it
                    embedBksp: {
                        key: 'backspace',
                        collapsed: true,
                        offset: 0,
                        handler: function(range, context) {
                            if (this.quill.getText(range.index, 1) == "\n") {
                                var before = this.quill.getContents(range.index - 1, 1);
                                if (before.ops.length && before.ops[0].insert && (before.ops[0].insert.LinkPreview || before.ops[0].insert.PostImage)) {
                                    this.quill.deleteText(range.index, 1);
                                    return false;
                                }
                            }
                            return true;
                        }
                    }
                }
            }
        },
        placeholder: placeholder ? placeholder : 'Write something, highlight text to format.',
        theme: 'bubble'
    });
    //copying and pasting embeds has been erratic for me so this just blocks it, although that probably deserves a second look someday
    quill.clipboard.addMatcher(Node.ELEMENT_NODE, function(node, delta) {
        for (var i = 0; i < delta.ops.length; i++) {
            if (typeof delta.ops[i].insert != "string") { //if it's not a string, it is an embed
                delta.ops[i].insert = "";
            }
        }
        return delta;
    })
    //most unwanted formatting won't be pasted in because of the formats array in the options object quill was initialized with, but ordered lists have to 
    //targeted specifically here, bc for some reasons they can't be disallowed with that array without also blocking unordered lists
    quill.clipboard.addMatcher("ol", function(node, delta) {
        for (var i = 0; i < delta.ops.length; i++) {
            if (delta.ops[i].attributes && delta.ops[i].attributes.list && delta.ops[i].attributes.list == 'ordered') {
                delete delta.ops[0].attributes.list;
            }
        }
        return delta;
    })
    //prompt the user to add a link preview when a youtube or vimeo url is placed on a new line
    var linkPrompter = new MutationObserver(function(mutationsList) {
        var linkPreviewPrompt = "<div class='link-preview-prompt'><div class='link-preview-prompt-text'>Click to add link preview</div><div class='link-preview-prompt-dismiss'><i class='fa fa-times'></i></div></div>";
        for (var i = 0; i < mutationsList.length; i++) {
            if (mutationsList[i].type == "childList" && mutationsList[i].target.nodeName == "P") {
                if (mutationsList[i].addedNodes.length == 1) {
                    if (mutationsList[i].addedNodes[0].nodeType == Node.TEXT_NODE) {
                        var newText = mutationsList[i].addedNodes[0].nodeValue;
                        var newTextNode = mutationsList[i].addedNodes[0];
                        var newTextCont = mutationsList[i].target;
                        if (youtubeUrlFindingRegex.test(newText) || vimeoUrlFindingRegex.test(newText)) {
                            $('.link-preview-prompt').remove();
                            var prompt = $(linkPreviewPrompt);
                            $(element).append(prompt);
                            prompt.css('left', newTextCont.offsetLeft + 'px').css('top', newTextCont.offsetTop + newTextCont.offsetHeight + 'px');
                            var parentWatcher = new MutationObserver(function() {
                                //remove the prompt if the new line containing the url is removed
                                if (!newTextCont.parentNode || !newTextCont.parentNode.contains(newTextCont)) {
                                    prompt.remove();
                                    this.disconnect();
                                } else {
                                    //make sure the prompt is still positioned directly underneath the url in case stuff is being added/removed above it
                                    prompt.css('left', newTextCont.offsetLeft + 'px').css('top', newTextCont.offsetTop + newTextCont.offsetHeight + 'px');
                                }
                            })
                            console.log('watching parent node ', newTextCont.parentNode);
                            parentWatcher.observe(newTextCont.parentNode, { childList: true });
                            var metaWatcher = new MutationObserver(function() {
                                //remove the prompt if the url itself is altered or deleted
                                if (!newTextCont || !newTextCont.innerText || newTextCont.innerText.indexOf(newText) != 0) {
                                    prompt.remove();
                                    this.disconnect();
                                    parentWatcher.disconnect();
                                }
                            })
                            metaWatcher.observe(newTextCont, { subtree: true, characterData: true });
                            prompt.click(function(e) {
                                console.log(e);
                                metaWatcher.disconnect();
                                parentWatcher.disconnect();
                                var cursorPos = quill.getText().indexOf(newText);
                                if (cursorPos != -1) {
                                    cursorPos += $(newTextCont).prevAll('.slidable-embed').length;
                                    newTextNode.nodeValue = newTextNode.nodeValue.replace(newText, '');
                                    if (newTextCont.innerHTML == '') {
                                        newTextCont.parentElement.removeChild(newTextCont);
                                    }
                                    element.addLinkPreview(newText, cursorPos);
                                    quill.setSelection(cursorPos + 1);
                                }
                                prompt.remove();
                            })
                            prompt.find('.link-preview-prompt-dismiss').click(function() {
                                prompt.remove();
                                metaWatcher.disconnect();
                                parentWatcher.disconnect();
                            })
                        }
                    }
                }
            }
        }
    })
    linkPrompter.observe(element, { subtree: true, childList: true });
    //save the most recent cursor position when the editor loses focus for emoji picker placement.
    quill.on('selection-change', function(range, oldRange, source) {
        if (!range) {
            element.lastCursorPos = oldRange.index;
        }
    })
    element.insertEmojiAtCursor = function(emojiString) {
        var range = undefined;
        if (range = quill.getSelection()) { //if editor has focus
            if (range.length > 0) { //if there is some text selected
                quill.deleteText(range.index, range.length);
            }
            quill.insertText(range.index, emojiString)
        } else if (element.lastCursorPos) { //if editor has had focus and thus an active cursor position previously
            quill.insertText(element.lastCursorPos, emojiString)
        } else { //if the editor has not yet been focused (and so will be empty so just put the emoji at the beginning)
            quill.insertText(0, emojiString)
            quill.focus()
            quill.setSelection(emojiString.length, 0)
        }
    }
    element.hasContent = function() {
        //if there is some text the first will be true; if there are > 0 embeds, the second will be true
        return (quill.getText().trim().length > 0 || quill.getLength() > quill.getText().length);
    }
    //when embeds are forbidden in community pages and whatever a simple selector is used to get the html contents instead of this function
    element.getContents = function() {
        if (element.imagesAdded() > 0 || element.linkPreviewsAdded() > 0) {
            var elements = $(element).children('.ql-editor').children();
            var textWEmbedsArray = [];
            elements.each(function(i, n) {
                var n = $(n);
                if (n.hasClass('still-loading') || n.hasClass('onthemove') || n.hasClass('embedspacer') || n.attr('image-url') == "loading...") {
                    return;
                }
                if (n.hasClass('link-preview-container')) {
                    textWEmbedsArray.push({ type: "link-preview", linkUrl: n.attr('linkUrl') });
                } else if (n.hasClass('image-preview-container')) {
                    var prevE = textWEmbedsArray[textWEmbedsArray.length - 1];
                    if (prevE && typeof prevE != "string" && prevE.type == "image(s)") {
                        prevE.imageDescriptions.push(n.find('#postImageDescription').val());
                        prevE.images.push(n.attr('image-url'));
                    } else {
                        textWEmbedsArray.push({ type: "image(s)", imageDescriptions: [n.find('#postImageDescription').val()], images: [n.attr('image-url')] })
                    }
                } else {
                    textWEmbedsArray.push(n[0].outerHTML);
                }
            })
            return textWEmbedsArray;
        } else {
            return $(element).children('.ql-editor').html();
        }
    }
    element.getQuill = function() {
        return quill;
    }
    //the following code deals with embeds and is not used when embeds are forbidden, which is currently on community rules and descriptions pages.
    if (!embedsForbidden) {
        //prevent there from ever being embeds at the end of the content with no new lines after to type text on
        quill.on('text-change', function(range, oldRange, source) {
            if (quill.getText() === "") {
                quill.insertText(quill.getLength(), "\n");
            }
        })
        //addImage and addLinkPreview functions! embeds are added at the bottom of the editor unless the cursor is on a blank line with text somewhere below it (my heuristic for "was intentionally placed there")
        element.addLinkPreview = function(url, pos) { //pos is very, very optional
            if (pos === undefined) {
                var sel = quill.getSelection(true);
                var range = sel.index;
                if (sel.length == 0 && quill.getText(range, 1) == "\n" && quill.getText(range + 1, 1) != "") {
                    quill.deleteText(range, 1);
                    var addEmbedAt = range;
                } else {
                    var addEmbedAt = quill.getLength();
                }
            } else {
                var addEmbedAt = pos;
            }
            quill.insertEmbed(addEmbedAt, 'LinkPreview', url, Quill.sources.USER);
            updateSubmitButtonState($(element).closest('.contentForm, .new-comment-form'));
        }

        element.addImage = function(file) {
            var sel = quill.getSelection(true);
            var range = sel ? sel.index : 0;
            if (sel.length == 0 && quill.getText(range, 1) == "\n" && quill.getText(range + 1, 1) != "") {
                quill.deleteText(range, 1);
                var addEmbedAt = range;
            } else {
                var addEmbedAt = quill.getLength();
            }
            try {
                quill.insertEmbed(addEmbedAt, 'PostImage', file, Quill.sources.USER);
            } catch (err) {
                console.log("image type/size unsupported!");
                console.log(err);
            }
            updateSubmitButtonState($(element).closest('.contentForm, .new-comment-form'));
            createImageGroups($(element).children('.ql-editor'));
        }

        element.imagesAdded = function() {
            return $(element).children('.ql-editor').children('.image-preview-container').length;
        }
        element.linkPreviewsAdded = function() {
            return $(element).children('.ql-editor').children('.link-preview-container').length;
        }

        //create a blank line when someone clicks on the space below an embed if it's the last thing in the editor
        element.onclick = function(e) {
            var et = $(e.target);
            if (et.hasClass('ql-editor')) {
                var c = et.children();
                var firstChild = c.first();
                var lastChild = c.last();
                if (firstChild.hasClass('slidable-embed') && e.clientY < getTop(firstChild)) {
                    quill.insertText(0, '\n');
                    quill.setSelection(0);
                } else if (lastChild.hasClass('slidable-embed') && e.clientY > getTop(lastChild) + lastChild.outerHeight(false)) {
                    quill.insertText(quill.getLength(), '\n');
                    quill.setSelection(quill.getLength());
                } else {
                    var prev = undefined;
                    var lineAdded = false;
                    et.children().each(function(i, child) {
                        if (!lineAdded) {
                            child = $(child);
                            if (prev) {
                                if (child.hasClass('slidable-embed') && prev.hasClass('slidable-embed')) {
                                    if (e.clientY < getTop(child) && e.clientY > getTop(prev) + prev.outerHeight(false)) {
                                        var newLine = $('<p></p>')
                                        prev.after(newLine);
                                        var sel = window.getSelection();
                                        var range = document.createRange();
                                        range.setStart(newLine[0], 0);
                                        range.collapse(true);
                                        sel.removeAllRanges();
                                        sel.addRange(range);
                                        lineAdded = true;
                                        createImageGroups(et);
                                    }
                                }
                            }
                            prev = child;
                        }
                    })
                }
            }
        }
        //listen for and use pasted image data
        element.onpaste = function(e) {
            // event.originalEvent.clipboard for newer chrome versions
            var items = (event.clipboardData || event.originalEvent.clipboardData).items;
            for (var i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") === 0) {
                    if (element.imagesAdded() > 3) {
                        bootbox.alert("sorry, we only take 4 images at once atm");
                        break;
                    } else {
                        e.preventDefault();
                        element.addImage(items[i].getAsFile());
                    }
                }
            }
        }
        //listen for and use dragged-and-dropped images
        element.ondrop = function(ev) {
            ev.preventDefault();
            $(".post-controls").css('display', 'flex'); //just in case the user hasn't previously clicked in the text area
            if (ev.dataTransfer.items) {
                for (var i = 0; i < ev.dataTransfer.items.length; i++) {
                    if (element.imagesAdded() > 3) {
                        bootbox.alert("sorry, we only take 4 images at once atm");
                        break;
                    } else if (ev.dataTransfer.items[i].kind === 'file' && ev.dataTransfer.items[i].type.indexOf("image") === 0) {
                        element.addImage(ev.dataTransfer.items[i].getAsFile());
                    }
                }
            } else {
                for (var i = 0; i < ev.dataTransfer.files.length; i++) {
                    if (element.imagesAdded() > 3) {
                        bootbox.alert("sorry, we only take 4 images at once atm");
                        break;
                    } else if (ev.dataTransfer.files[i].type.indexOf("image") === 0) {
                        element.addImage(ev.dataTransfer.files[i]);
                    }
                }
            }
            removeBodyFader(ev);
        }
        if (!dragFaderActivated) {
            $(function() {
                //this stuff is for to the drag-and-drop handling code for the quill editor above
                //this activates the fader that dims non-drag-and-drop elements (has a z-index 1 lower than the editor areas)
                document.body.ondragover = function(e) {
                    e.preventDefault();
                    var dt = e.dataTransfer;
                    //if statement so it won't react if just some text or image from the page is being dragged around
                    if (dt.types && (dt.types.indexOf ? dt.types.indexOf('Files') != -1 : dt.types.contains('Files'))) {
                        if (!faded) {
                            $('body').append('<div id="bodyFader"></div>');
                            $("#bodyFader").fadeIn(100);
                            faded = true;
                        }
                    }
                }

                //neutralize a drag-and-drop if it doesn't hit a specific text entry area - assume they just missed
                document.body.ondragend = removeBodyFader;
                document.body.ondrop = removeBodyFader
                //some byzantine logic required to detect when the dragged thing leaves our window entirely:
                window.ondragenter = function(e) {
                    e.preventDefault();
                    dragcounter++;
                }
                window.ondragleave = function(e) {
                    dragcounter--;
                    if (dragcounter < 1) {
                        removeBodyFader(e);
                    }
                }
            })
            dragFaderActivated = true;
        }
    }
}


//incremented and decremented and reset by drag event listeners to keep track of whether the dragged thing is still in our window or not
var dragcounter = 0;

var faded = false;
dragFaderActivated = false;

function removeBodyFader(e) {
    e.preventDefault();
    $("#bodyFader").fadeOut(100, function() {
        $("#bodyFader").remove();
        dragcounter = 0;
        faded = false;
    });
}

//scripts for rearranging the embeds within the text editor

//these two event listener functions are initially attached to the embeds' movement handles,when they're created, above

function mousedownOnHandle(mouseDownEvent) {
    mouseDownEvent.preventDefault();
    $(this).addClass('in-use');
    var selectedEmbed = $(this).parent().parent();

    //turms selectedEmbed into a spacer element. floatyEmbed is going to contain the embed now instead.
    var floatyEmbed = prepareEmbedForMoving(selectedEmbed);

    //this is the distance from the top of the embed to the mouse at the moment of mousedown, when the mouse moves this offset is maintained which moves the embed
    floatyEmbed[0].pointerOffset = mouseDownEvent.originalEvent.clientY - getTop(floatyEmbed);

    prevPointerY = mouseDownEvent.originalEvent.clientY;

    $(document).mousemove(function(e) {
        e.preventDefault();
        moveEmbed(e.originalEvent.clientY, floatyEmbed, selectedEmbed);
        return false;
    });

    $(document).on('mouseup', function(e) {
        endMovement();
        $(document).off('mousemove');
        $(document).off('mouseup');
    });
}

var touchinprogress = false;

function touchStartOnHandle(e) {
    if (e.cancelable) {
        e.preventDefault();
    }

    if (touchinprogress) {
        return; //don't want to try to move two embeds at once
    }
    touchinprogress = true;

    var selectedEmbed = $(this).parent().parent();
    var floatyEmbed = prepareEmbedForMoving(selectedEmbed);
    floatyEmbed[0].pointerOffset = e.changedTouches[0].clientY - getTop(floatyEmbed);
    prevPointerY = e.changedTouches[0].clientY;

    //function to be passed to the touchmove handler and then later removed from it
    function touchmoveevent(event) {
        //this should always be true, if it's not preventDefault raises an error instead of preventing page scrolling and we have Problems
        if (event.cancelable) {
            event.preventDefault();
        }
        moveEmbed(event.changedTouches[0].clientY, floatyEmbed, selectedEmbed);
    }

    this.addEventListener("touchmove", touchmoveevent, { passive: false });

    this.addEventListener('touchend', function(e) {
        touchinprogress = false;
        this.removeEventListener('touchmove', touchmoveevent);
        endMovement();
    });

    this.addEventListener('touchcancel', function(e) {
        touchinprogress = false;
        this.removeEventListener('touchmove', touchmoveevent);
        endMovement();
    });
}

//gets the position to the element's top relative to the top of the screen, which is the same distance that the css "top" property sets when position:fixed.
function getTop(e) {
    return e.offset().top - $(window).scrollTop();
}

//called by the mousedown or touchstart event listener when movement is initiated
//this functions creates and returns a new, floaty version of the element you pass in and turns the original into an empty "spacer"
function prepareEmbedForMoving(selectedEmbed) {

    var spacer = selectedEmbed;

    var floatingVersion = selectedEmbed.clone(false);
    floatingVersion.find('.image-move')[0].addEventListener('touchstart', touchStartOnHandle, { passive: false });
    floatingVersion.find('.image-move').on('mousedown', mousedownOnHandle);
    floatingVersion.find('.image-clear').click(clearEmbed);

    floatingVersion.css("width", spacer.outerWidth(true) + "px");
    floatingVersion.css("left", spacer.offset().left + "px");
    floatingVersion.css("top", getTop(spacer) + "px");

    if (selectedEmbed.hasClass('ipc-group')) {
        createImageGroups(selectedEmbed.parent());
    }

    spacer.addClass("embedspacer");
    spacer.attr('id', '');
    spacer.removeClass('ipc-group ipc-group-top ipc-group-bottom')

    $('body').append(floatingVersion);

    //these can be put in the css file under .onthemove if that's preferred. I guess I would rather have them here
    floatingVersion.css("position", "fixed");
    floatingVersion.css("z-index", 2147483647); // over 9000
    floatingVersion.removeClass('ipc-group ipc-group-top ipc-group-bottom');

    floatingVersion.addClass("onthemove");

    spacer.empty();

    floatingVersion[0].scrollPrompterId = setInterval(function() { scrollPrompter(floatingVersion, spacer.closest('.ql-editor')) }, 50);

    lastWindowPos = window.scrollY;
    $(window).on('scroll', function(e) {
        if (window.scrollY > lastWindowPos) {
            moveEmbed(prevPointerY, floatingVersion, spacer, "down")
        } else if (window.scrollY < lastWindowPos) {
            moveEmbed(prevPointerY, floatingVersion, spacer, "up")
        }
        lastWindowPos = window.scrollY;
    })

    return floatingVersion;
}

//auto-scrolls when the floating element is less than 100px away from the top or bottom and the top or bottom of the editor is offscreen.
//called through setInterval, which is started in prepareEmbedForMoving, and then canceled in endMovement
function scrollPrompter(floatingEmbed, editor) {
    var t = getTop(floatingEmbed)
    var h = floatingEmbed.outerHeight();
    var b = t + h;
    var et = getTop(editor);
    var eb = et + editor.outerHeight();
    var modal = editor.closest('.modal');
    var w = $(window);
    var wst = w.scrollTop();
    var wh = w.height();
    if (t < 100 && et < 50) {
        if (modal.length) {
            modal.scrollTop(modal.scrollTop() - 10);
        } else {
            w.scrollTop(wst - 10);
        }
    } else if (b > wh - 100 && eb > wh) {
        if (modal.length) {
            modal.scrollTop(modal.scrollTop() + 10);
        } else {
            w.scrollTop(wst + 10);
        }
    }
}

//this function is called when the user moves either their mouse or finger to reposition the embed or the screen scrolls in a scrollDirection
function moveEmbed(pointerY, floatingEmbed, spacer, scrollDirection) {
    var deltaY = pointerY - prevPointerY;
    prevPointerY = pointerY;
    //move the floaty element:
    var floatingEmbedtop = getTop(floatingEmbed);
    var spacertop = getTop(spacer);
    var floatingEmbedh = floatingEmbed.outerHeight(true);
    //new y pos is the pointer's y less the original offset unless that's less than the parent's top bound or more than (the parent's bottom bound - the height of the element)
    var newYPos = Math.min(Math.max(pointerY - floatingEmbed[0].pointerOffset, getTop(spacer.parent())), getTop(spacer.parent()) + (spacer.parent().outerHeight(true) - spacer.outerHeight(true))); //beauty
    floatingEmbed.css("top", newYPos + "px");

    //move the spacer (maybe):

    //if moving down, we move the spacer below the element below the floating element if the floating element's bottom edge has passed over the middle of that element or is less than 70px away from that element's bottom edge, whichever comes last
    if (scrollDirection == "down" || deltaY > 0) { //moving down
        var elementBelow = spacer.next();
        while (elementBelow.length && elementBelow.next().length && (floatingEmbedtop + floatingEmbedh) > (getTop(elementBelow) + elementBelow.outerHeight(true))) {
            elementBelow = elementBelow.next();
        }
        if (elementBelow.length) {
            var ebt = getTop(elementBelow);
            var line = Math.max(ebt + (0.5 * elementBelow.outerHeight(true)), ebt + elementBelow.outerHeight(true) - 70);
            if ((floatingEmbedtop + floatingEmbedh) > line) {
                spacer.insertAfter(elementBelow);
            }
        }
        //if moving up, we move the spacer above the element above the floating element if the floating element's top edge has passed over the middle of that element or is less than 70px away from that element's top edge, whichever comes last
    } else if (scrollDirection == "up" || deltaY < 0) { //moving up
        var elementAbove = spacer.prev();
        while (elementAbove.length && elementAbove.prev().length && floatingEmbedtop < getTop(elementAbove)) {
            elementAbove = elementAbove.prev();
        }
        if (elementAbove.length) {
            var line = Math.min(getTop(elementAbove) + (0.5 * elementAbove.outerHeight(true)), getTop(elementAbove) + 70);
            if (floatingEmbedtop < line) {
                spacer.insertBefore(elementAbove);
            }
        }
    }

    createImageGroups(spacer.parent());
}

//this function is called when the user lifts their finger from their screen or mouse button and the image can find its spot. it's all called to just
//generally cancel drag and dropping when an alert has to be displayed about an upload, just in case drag and dropping is going on
function endMovement() {
    var floatingEmbed = $('.onthemove');
    if (floatingEmbed.length) {
        clearInterval(floatingEmbed[0].scrollPrompterId);
        $(window).off('scroll');
        $('.embedspacer').after($('.onthemove'));
        floatingEmbed.css("position", "").css("border", "").css('width', '').css('left', '').css('top', '').css('height', '').css("z-index", 10); //seems like a good number
        floatingEmbed.removeClass("onthemove");
        floatingEmbed.find('.image-move').removeClass('in-use');
        var spacer = $('.embedspacer');
        spacer.remove();
        createImageGroups(floatingEmbed.closest('.ql-editor'));
    }
}

function createImageGroups(qlEditorElement) {
    var kids = qlEditorElement.children();
    var containersInARow = 0;
    for (var i = 0; i < kids.length; i++) {
        var kid = $(kids[i]);
        if (kid.hasClass('image-preview-container') && !kid.hasClass('embedspacer')) {
            containersInARow++;
            if (containersInARow > 1) {
                if (containersInARow == 2) {
                    $(kids[i - 1]).addClass('ipc-group ipc-group-top').removeClass('ipc-group-bottom');
                } else {
                    $(kids[i - 1]).addClass('ipc-group').removeClass('ipc-group-top ipc-group-bottom');
                }
            }
        } else {
            if (containersInARow > 1) {
                $(kids[i - 1]).addClass('ipc-group ipc-group-bottom').removeClass('ipc-group-top');
            } else if (containersInARow == 1) {
                $(kids[i - 1]).removeClass('ipc-group ipc-group-top ipc-group-bottom')
            }
            containersInARow = 0;
        }
    }
    if (containersInARow > 1) {
        $(kids[kids.length - 1]).addClass('ipc-group ipc-group-bottom').removeClass('ipc-group-top');
    } else if (containersInARow == 1) {
        $(kids[kids.length - 1]).removeClass('ipc-group ipc-group-top ipc-group-bottom')
    }
}

window.addEventListener("beforeunload", function(e) {
    var wip = false;
    $active('.ql-container:not(.form-control)').each(function(i, e) { //community editor fields will have content in them but we're ignoring that
        if (!wip && e.hasContent()) {
            wip = true;
        }
    })
    if (wip) {
        e.preventDefault();
        e.stopPropagation();
        e.returnValue = 'there is content in the post box, would you like to perhaps save it as draft first'; //this text isn't actually displayed by many browsers but oh well
        return 'there is content in the post box, would you like to perhaps save it as draft first';
    }
});

window.addEventListener('unload', function(e) {
    $("div.image-preview-container:not(.still-loading)").each(function(i, e) {
        if (!e.getAttribute('imagealreadysaved')) {
            $.post('/cleartempimage', { imageURL: e.getAttribute('image-url') });
        }
    })
})

$('body').on('click', '.ql-editor .link-preview-container', function(e) {
    e.preventDefault();
})