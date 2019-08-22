//this is here bc it's called after a post is made, although it's ALSO called when you click on the "new posts available" notice
function restartInfiniteScroll(timestamp) {
    if (!timestamp) {
        timestamp = new Date().getTime();
    }
    $(".infinite-scroll-last, .infinite-scroll-error").css('display', 'none');
    $(".infinite-scroll-request").css('display', 'block');
    var postsContainer = $('#postsContainer');
    postsContainer.fadeOut(250, function() {
        postsContainer.html("");
        needPostsOlderThan = timestamp;
        pageLoadTime = timestamp;
        postsContainer.infiniteScroll("destroy");
        postsContainer[0].fadedOut = true;
        startInfiniteScroll();
        $(".page-load-status").css('display', 'block');
    });
}

//NEW POST FORM CODE

$(function() {

    var editor = undefined;
    if (editor = document.getElementById('editor')) {
        attachQuill(editor)
    }

    $(".ql-editor").focus(function(e) {
        if (e.target.parentElement.id == "editor") {
            $(".post-controls").css('display', 'flex');
        }
    })

    $('body').on('focus', '.ql-editor', function(e) {
        $(this).closest('.editable-text').addClass('focused');
    })
    $('body').on('focusout', '.ql-editor', function(e) {
        $(this).closest('.editable-text').removeClass('focused');
    })

    $('body').on('click', "#postContentWarningsButton", function() {
        var postCWCont = $(this).closest('.contentForm').find("#postContentWarningsContainer");
        postCWCont.removeClass("bounce")
        if (postCWCont.is(":hidden")) {
            postCWCont.slideDown("fast");
        } else if (postCWCont.is(":visible") && !postCWCont.find("#postContentWarnings").val()) {
            postCWCont.slideUp("fast");
        } else {
            postCWCont.addClass("bounce")
        }
    })
    $('body').on('change', "#postPrivacy-private, #editPostPrivacy-private", function() {
        if (this.checked) {
            var cont = $(this).closest('.contentForm');
            if ($(window).width() > 350) {
                cont.find("#privatePrivacyLabel").html("<i class='fas fa-eye-slash'></i> Private");
            } else {
                cont.find("#privatePrivacyLabel").html("<i class='fas fa-eye-slash'></i>");
            }
            cont.find("#publicPrivacyLabel").html("<i class='fas fa-eye'></i>");
            cont.find("#draftLabel").html("<i class='fas fa-pencil-ruler'></i>");
            cont.find("#postSubmit").html("Send <i class='fas fa-chevron-right'></i>").removeClass('save-draft-button');
        }
    });
    $('body').on('change', "#postPrivacy-public, #editPostPrivacy-public", function() {
        if (this.checked) {
            var cont = $(this).closest('.contentForm');
            if ($(window).width() > 350) {
                cont.find("#publicPrivacyLabel").html("<i class='fas fa-eye'></i> Public");
            } else {
                cont.find("#publicPrivacyLabel").html("<i class='fas fa-eye'></i>");
            }
            cont.find("#privatePrivacyLabel").html("<i class='fas fa-eye-slash'></i>");
            cont.find("#draftLabel").html("<i class='fas fa-pencil-ruler'></i>");
            cont.find("#postSubmit").html("Send <i class='fas fa-chevron-right'></i>").removeClass('save-draft-button');
        }
    });
    $('body').on('change', "#pseudoPrivacy-draft, #editPseudoPrivacy-draft", function() {
        if (this.checked) {
            var cont = $(this).closest('.contentForm');
            if ($(window).width() > 350) {
                cont.find("#draftLabel").html("<i class='fas fa-pencil-ruler'></i> Draft");
            } else {
                cont.find("#draftLabel").html("<i class='fas fa-pencil-ruler'></i>");
            }
            cont.find("#privatePrivacyLabel").html("<i class='fas fa-eye-slash'></i>");
            cont.find("#publicPrivacyLabel").html("<i class='fas fa-eye'></i>");
            cont.find("#postSubmit").html("Save <i class='fas fa-chevron-right'></i>").addClass('save-draft-button');
        }
    });
    $('body').on('click', ".show-emoji-picker", function() {
        var cont = $(this).closest('.contentForm, .new-comment-form');
        cont.find('.emoji-picker').slideToggle("fast");
        cont.find(".ql-editor").focus();
    });
    $('body').on('click', '.replyEmojiWindowButton', function() {
        emojiPicker = $(this).closest('.new-comment-form').find('.emoji-picker')
        editor = $(this).closest('.new-comment-form').find('.ql-editor')
        emojiPicker.slideToggle("fast");
        editor.focus()
    });

    $('body').on('click', ".emoji-picker>.add-emoji", function() {
        var cont = $(this).closest('.contentForm, .new-comment-form');
        cont.find(".ql-container")[0].insertEmojiAtCursor(event.target.innerHTML);
    })

    $('body').on('click', '.edit-post', function() {
        var button = $(this);
        button.html('<i class="fas fa-spinner fa-spin"></i>');
        var existingModal = $("#editPostModal");
        var postContainer = button.closest('.post');
        var postID = postContainer.attr("data-post-id");
        //instead of removing the post editing modal right away, potentially causing a user to lose in-progress work, we'll keep it around
        //and ressurect it if the user goes to edit the same post again after closing it. if the user goes to edit a different post, though,
        //we'll assume that they don't need their work from the old one and remove it.
        if (existingModal.length && existingModal.attr('data-post-id') == postID) {
            existingModal.modal();
            if (button.hasClass('edit-draft-post')) {
                button.html('<i class="fas fa-fw fa-pencil-alt"></i>');
            } else {
                button.html('<i class="fas fa-fw fa-pencil-alt"></i> Edit');
            }
        } else {
            if (existingModal.length) {
                existingModal.remove();
            }
            $.post("/createposteditor/" + postID, function(response) {
                $('body').append(response.editor);
                var editModal = $('#editPostModal');
                //we have to first create the editor, then attach quill, then append the content, quill will get angry if we attach it to a div with embeds already in it
                attachQuill(editModal.find('#editPostContent')[0]);
                var newEditor = editModal.find('.ql-editor');
                if (tribute) {
                    tribute.attach(newEditor);
                }
                newEditor.empty(); //bc the editor is automatically supplied with a blank line at the top at first
                newEditor.append(response.content);
                newEditor.find('.image-move').each(function(i, e) { e.addEventListener('touchstart', touchStartOnHandle, { passive: false }) });
                newEditor.find('.image-move').on('mousedown', mousedownOnHandle);
                newEditor.find('.image-clear').click(clearEmbed);
                createImageGroups(newEditor);
                editModal[0].postContainer = postContainer[0]; //retrieved to set the new html contents of it upon edit submission
                if (button.hasClass('edit-draft-post')) {
                    button.html('<i class="fas fa-fw fa-pencil-alt"></i>');
                } else {
                    button.html('<i class="fas fa-fw fa-pencil-alt"></i> Edit');
                }
                editModal.modal();
            })
        }
    })
    $('body').on('click', '#editPostSubmit', function(e) {
        e.preventDefault();
        var button = $(this)
        var cont = button.closest('.modal-content');
        var editor = cont.find('.ql-container')[0];
        if (editor.hasContent()) {
            button.attr('disabled', true);
            button.html('<i class="fas fa-spinner fa-spin"></i> Sending...')
            var content = editor.getContents();
            var editModal = $("#editPostModal");
            var postContainer = $(editModal[0].postContainer);
            var postID = editModal.attr('data-post-id');
            var contentWarnings = cont.find('#postContentWarnings').val().trim();
            var originalPrivacy = editModal.attr('data-original-privacy');
            var currentPrivacy = ($('#editPostPrivacy-public').is(':checked') || editModal.attr("data-is-community") ? 'public' : 'private');
            var wasDraft = editModal.attr('data-is-draft');
            var isDraft = $("#editPseudoPrivacy-draft").is(":checked");
            $.post('/saveedits/' + postID, {
                postContent: JSON.stringify(content),
                postContentWarnings: contentWarnings,
                postPrivacy: currentPrivacy,
                isDraft: isDraft ? true : ""
            }).done(function(newPostHTML) {
                var privacyChanged = (currentPrivacy !== originalPrivacy || (wasDraft && !isDraft));
                var contentContainer = postContainer.children('.content').first();
                if (contentWarnings) {
                    contentContainer.addClass('content-warning-post');
                }
                if (privacyChanged) {
                    var newPrivacyHtml = (isDraft ? '<i class="fa fa-pencil-ruler"></i>' : currentPrivacy == "public" ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>');
                    postContainer.find(".post-visibility").html(newPrivacyHtml);
                }
                if (wasDraft && !isDraft) {
                    postContainer.find(".metadata").find('.post-edited').remove();
                    postContainer.find('.toolbar').remove();
                } else {
                    postHasEditedTag = !!(postContainer.find(".metadata").find('.post-edited').length);
                    if (!postHasEditedTag && !(wasDraft && !isDraft)) {
                        postContainer.find(".metadata").append('&nbsp;&middot;&nbsp;<span class="post-edited">Edited</span>');
                    }
                }
                contentContainer.html(newPostHTML);
                var images = contentContainer.find('.post-images a');
                if (images.length) {
                    images.simpleLightbox();
                }
                //remove the modal whose contents were just saved in the database through this event listener which will immediately self destruct
                $('body').on('hidden.bs.modal', '#editPostModal', function(e) { e.target.remove();
                    $('body').off('hidden.bs.modal'); })
                $("#editPostModal").modal('hide');
                //scroll to the newly edited post if the top or bottom is offscreen
                var posttop = postContainer.offset().top;
                var postbottom = posttop + postContainer.outerHeight();
                var postheight = postbottom - posttop;
                var wst = $(window).scrollTop();
                var wheight = $(window).height();
                var wsb = wst + wheight;
                if (wst + 75 > posttop) { //scroll up to put the top of the post into view
                    $('html').animate({ scrollTop: (Math.max(0, posttop - 100)) });
                } else if (postbottom > wsb && postheight < wheight) { //scroll down to put the bottom of the post into view unless that will move the top of the post offscreen
                    $('html').animate({ scrollTop: wst + (postbottom - wsb) + 10 });
                }
            }).fail(function() {
                editModal.modal('hide');
                bootbox.alert('this edit operation failed somehow, sorry... maybe wait a few seconds and try again', function() { editModal.modal() });
                button.attr('disabled', false);
                button.html('Try again... <i class="fas fa-chevron-right"></i>');
            })
        } else {
            bootbox.alert('If you want to delete your post there is a... much better way to do that');
        }
    })

    $('body').on('click', '.reply-to-comment', function() {
        // First, check if the reply form is already open - if it is, just scroll to it
        var commentContainer = $(this).closest('.comment');
        var postID = commentContainer.closest('.post').attr("data-post-id");
        var commentID = commentContainer.attr("data-comment-id");
        var checkFormExists = commentContainer.find('.new-comment-form[data-comment-id="' + commentID + '"]');
        if (checkFormExists.length) {
            if (checkFormExists[0].getBoundingClientRect().bottom > $(window).height() - 50) {
                $("html, body").animate({ scrollTop: checkFormExists.offset().top - 200 }, 200);
            }
            console.log("Form already exists!")
            return;
        }

        // Create new comment form
        var newForm = $(document.getElementById("new-comment-form-template").innerHTML);
        newForm.attr('data-comment-type', 'child').attr('data-post-id', postID).attr('data-comment-id', commentID);
        newForm.appendTo(commentContainer);
        attachQuill(newForm.find('.editable-text')[0], "Reply to this post with a good reply")
        tribute.attach(newForm.find(".ql-editor"));
        //Scroll to newly created form
        if (newForm[0].getBoundingClientRect().bottom > $(window).height() - 50) {
            $("html, body").animate({ scrollTop: newForm.offset().top - 200 }, 200);
        }
    })
})

$(function() {
    $("body").on('click', '#postImageButton', function(e) {
        let ourFileInputGuy = $(this).closest('.contentForm, .new-comment-form').children('.file-input');
        var n = $(this).closest('.contentForm, .new-comment-form').find('.ql-container')[0];
        if (n.imagesAdded() < 4) {
            //attach the function to the file input object events when necessary. can't do them all at once 'cause they're not loaded all at once
            if (!ourFileInputGuy[0].changeEventAttached) {
                ourFileInputGuy.change(function(e) {
                    for (var i = 0; i < this.files.length; i++) {
                        if (n.imagesAdded() > 3) {
                            bootbox.alert("we only take 4 images at a time right now, sorry");
                            break;
                        } else {
                            n.addImage(this.files[i]);
                        }
                    }
                    $(this).val(''); //ensures change event will fire, even if the user picks the same image again
                });
                ourFileInputGuy[0].changeEventAttached = true;
            }
            ourFileInputGuy.click();
        } else {
            bootbox.alert("we only take 4 images at a time right now, sorry");
        }
    })

    $("body").on('click', '#postLinkButton', function(e) {
        var urlEntry = $(this).closest('.contentForm, .new-comment-form').children('.link-form-cont');
        if (urlEntry.is(':hidden')) {
            urlEntry.slideDown('fast', function() { urlEntry.find('input').focus() });
        } else {
            urlEntry.slideUp('fast');
        }
    })

    $("body").on('click', ".link-add", function(e) {
        var input = $(this).siblings('input')
        var url = input.val();
        if (!url) {
            url = input.attr('placeholder');
        }
        input.val('');
        var subject = $(this).closest('.contentForm, .new-comment-form').find('.ql-container')[0];
        if (subject.linkPreviewsAdded() < 4) {
            subject.addLinkPreview(url);
        } else {
            bootbox.alert("we only take 4 link previews per post, sorry");
        }
    })

    $("body").on('keyup', "#linkPreviewUrlEntry", function(e) {
        if (e.keyCode == 13) { //activate on pressing enter
            $(this).siblings('.link-add').click();
        }
    })

    //function for very specifically submitting a post, not a comment
    $("#postSubmit").click(function(e) {
        e.preventDefault();
        $("#editPostModal").remove(); //so if it's on the page (hidden) we don't accidentally select elements in it
        let editor = $('#editor');
        let postContent = editor[0].getContents(); //array of paragraphs and embeds if we have embeds; normal html string if not
        if (editor[0].hasContent()) {
            var button = $(this);
            button.attr('disabled', true);
            $.ajax({
                url: '/createpost',
                type: 'POST',
                data: {
                    communityId: $('#postForm').attr("communityId"),
                    isDraft: $("#pseudoPrivacy-draft").is(":checked") ? true : "",
                    postPrivacy: ($('#postPrivacy-public').is(':checked') ? 'public' : 'private'), //public posts are public; private posts and drafts are private
                    postContent: JSON.stringify(postContent), //doesn't actually need to be stringified if it happens to just be html (in a no embeds situation) but, doesn't hurt, the server JSON.parses this field regardless
                    postContentWarnings: $('#postContentWarnings').val(),
                }
            }).done(function(postTimestamp) { //this will be a string with timestamp 1 millisecond later than the new post's timestamp
                $('#postContentWarnings').val("");
                $("#postContentWarningsContainer").slideUp("fast");
                $("#new-post-emoji-picker").slideUp("fast");
                $(".link-form-cont").slideUp("fast");
                var innerEditor = editor.find(".ql-editor");
                innerEditor.html("");
                button.attr('disabled', false);
                //restart the feed to show the new post, unless we've just created a draft and aren't currently looking at our drafts and thus won't see it anyway, in which case just display a message talking about the draft in the editor
                if (!$("#pseudoPrivacy-draft").is(":checked") || (typeof draftsMode != "undefined" && draftsMode)) {
                    if (!$("#pseudoPrivacy-draft").is(":checked") && typeof draftsMode != "undefined" && draftsMode) {
                        //if we've just created a regular post and are currently looking at our drafts, we need to switch to looking at regular posts to see our new post
                        draftsMode = false;
                    }
                    restartInfiniteScroll(postTimestamp) //we'll requests posts older than that specific timestamp, so the new post should always be on top, with any even newer posts not shown.
                } else {
                    innerEditor.attr("data-placeholder", 'Post saved to drafts; view those through your profile.');
                    innerEditor.focus(function() {
                        innerEditor.attr("data-placeholder", editor[0].__quill.options.placeholder); //this will retrieve the editor's original placeholder and looks weird
                        innerEditor.off("focus"); //don't need to reset the placeholder more than once
                    })
                }
            }).fail(function() {
                bootbox.alert("this post failed to post! maybe try again in a bit?");
                button.attr('disabled', false);
            });
        } else {
            bootbox.alert("This post appears to be... empty");
        }
    });

    //function for sumbitting a comment and then placing the new comment on the page
    $('body').on('click', '.create-comment', function() {
        let commentButton = $(this);
        let commentForm = commentButton.closest('.new-comment-form');
        let commentType = commentForm.attr('data-comment-type');
        let postID = commentForm.attr('data-post-id');
        let commentID = commentForm.attr('data-comment-id');
        let commentContainer = commentForm.find(".ql-container");
        let commentEditor = commentForm.find('.ql-editor');
        let commentContent = commentContainer[0].getContents(); //array of paragraphs and embeds if we have embeds; normal html if not
        if (commentType == "primary") {
            commentsContainer = commentButton.closest('.comments').find('.comments-container');
        } else if (commentType == "child") {
            commentsContainer = commentButton.closest('.comments-container').find('.comment[data-comment-id=' + commentID + ']').find('.replies')[0];
        }
        let emojiWindow = commentForm.find('.emoji-picker');

        if (commentContainer[0].hasContent()) {
            commentButton.prop('disabled', true);
            $.post("/createcomment/" + postID + "/" + commentID, { commentContent: JSON.stringify(commentContent) }, //doesn't actually need to be stringified if it happens to just be html (in a no embeds situation) but, doesn't hurt, the server JSON.parses this field regardless
                function(data) {
                    if (data != 'nope') {
                        commentEditor.html('');
                        var appendedComment = $(data.comment).hide().appendTo(commentsContainer).fadeIn();
                        //scroll to place the comment at the top if its top or bottom is offscreen
                        var acTop = appendedComment.offset().top;
                        var acBottom = acTop + appendedComment.outerHeight();
                        if (acTop - 100 < $(window).scrollTop() || acBottom > $(window).scrollTop() + $(window).height()) {
                            $('html').animate({ scrollTop: (Math.max(0, acTop - 100)) });
                        }
                        //add the lightbox listener to the newly appended comment images
                        var commentimages = appendedComment.find('.post-images a');
                        if (commentimages.length) {
                            commentimages.simpleLightbox();
                        }

                        let counterToChange = commentButton.closest(".post").find(".show-comments").find('.comments-number')[0];
                        if (counterToChange.textContent === "") {
                            counterToChange.innerHTML = "1";
                        } else {
                            let newCommentCount = parseInt(counterToChange.textContent) + 1;
                            counterToChange.innerHTML = counterToChange.innerHTML.replace((newCommentCount - 1), newCommentCount);
                        }
                        // Reset (or DESTROY) comment form
                        if (commentType == "primary") {
                            commentButton.prop('disabled', false);
                            emojiWindow.hide();
                        } else if (commentType == "child") {
                            commentForm.remove();
                        }
                    } else {
                        let html = '<article class="comment"><div class="message alert">There has been a problem posting your comment. Sorry! Please copy the comment text, refresh the page, and try again.</div></article>'
                        $(html).hide().appendTo(commentsContainer).fadeIn();
                        // commentButton.prop('disabled', false); // Probably don't disable the reply button if an error occurs because god knows what else has happened to the form
                    }
                });
        }
    })
})