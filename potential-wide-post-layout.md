<section class="content{{#if this.contentWarnings}} content-warning-post{{/if}}">
    <div class="row-content-and-images row">
        <div class="column-content col-md-6 mb-1 mb-md-0">
            {{#if this.contentWarnings}}
                <aside class="content-warning">
                    {{this.contentWarnings}}
                </aside>
                <div class="abbreviated-content content-warning-content" style="height:0">
            {{/if}}
            {{{this.parsedContent}}}
            {{#if this.contentWarnings}}
                </div>
                <button type="button" class="button grey-button content-warning-show-more" data-state="contracted">Show post</button>
            {{/if}}
        </div>
        <div class="column-images col-md-6">
            {{#if this.images}}
                {{> imagegallery }}
            {{/if}}
        </div>
    </div>
</section>
