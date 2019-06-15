# Changes

Removed .commentContainer class from .comment

.fullBoostList > .show-boosters-list

openReplyBox > open-reply-box
boostPost > boost-post
mutePost > unsubscribe-post
unmutePost > subscribe-post
deletePost > delete-post
<div id="replyForm" class="contentForm"> > <div class="new-comment-form">

# Types of comment

- Not community type
- Is community type, and:
    - The user is a member of this community
    - The user is NOT a member of this community (Hidden if you're not on the community page, hide comment form)
    -

    {{#if this.linkPreview.url}}
        <a class="link-preview-container" target="_blank" rel="noopener noreferrer" href="{{this.linkPreview.url}}">
        <img class="link-preview-image" src="{{this.linkPreview.image}}" />
        <div class="link-preview-text-container">
        <span class="link-preview-title">{{this.linkPreview.title}}</span>
        <span class="link-preview-description">{{this.linkPreview.description}}</span>
        <span class="link-preview-domain">{{this.linkPreview.domain}}</span>
        </div>
        </a>
    {{/if}}
