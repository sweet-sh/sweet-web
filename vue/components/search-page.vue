<template>
    <div id="homeBody" class="row justify-content-center">
        <div class="col-lg-8">
            <h3 id="searchTitle" class="page-header mx-2" v-cloak>{{query ? "Search: " + query : "Search"}}</h3>
            <form id="searchForm">
                <input v-model="searchBox" id="searchQuery" style="flex:1" type="text" class="form-control mr-2" placeholder="Search for users, communities, and tags." />
                <button v-on:click.prevent="searchSubmit" class="button">Search</button>
            </form>
            <div v-cloak v-if="firstPageFetched" class="compact-container" id="resultsContainer">
                <template v-for="result in results">
                    <div v-bind:key="result._id" class="content-box">
                        <div class="row">
                            <tag-result v-bind:result="result" v-if="result.type=='tag'"></tag-result>
                            <user-result v-bind:result="result" v-else-if="result.type=='user'"></user-result>
                            <community-result v-bind:result="result" v-else-if="result.type=='community'"></community-result>
                        </div>
                    </div>
                </template>
            </div>
            <loadingSpinner v-bind:loading="loading" v-bind:message="loading ? '' : (firstPageFetched ? 'No more results.' : 'No results found, sorry.')" />
        </div>
    </div>
</template>

<script>
import loadingSpinner from './loading-spinner.vue'
import infiniteLoader from './infinite-loader-mixin.js'
//TODO: replace with proper routing, someday
const path = window.location.pathname
const initialQuery = path[path.length-1] == '/' ? '' : path.split('/')[2]
export default {
  
    components: {
      loadingSpinner
    },

    mixins: [infiniteLoader],

    data: function () { return {
        query: initialQuery,
        searchBox: initialQuery
    } },

    // makes the initial request for results if we have a query from the url initially; uses the history api to change the query without reloading the page
    // every time a new search is made
    created: function() {
        if (this.query !== '') {
            this.startLoading('/showsearch/'+this.query+'/')
        }
        history.replaceState({ query: this.query }, this.query, "/search/" + this.query)
        window.onpopstate = (event) => {
            console.log(event)
            this.query = event.state.query
            this.searchBox = event.state.query
            this.startLoading('/showsearch/' + event.state.query + '/')
        }
    },

    methods: {
      // called directly by the event listener
      searchSubmit: function() {
          this.query = this.searchBox
          history.pushState({ query: this.query }, this.query, "/search/" + this.query)
          this.startLoading("/showsearch/" + this.query + '/')
      }          
    }
}

Vue.component('search-result', {
props: ['image'],
template: `<div class="col commentContent">
          <p class="text-muted"><slot name="typeLabel"></slot></p>
          <p class="mb-2" style="font-size:1.3em">
              <img class="postAuthorImage" v-bind:src="image" />
              <slot name="title"></slot>
          </p>
            <slot name="description"></slot>
        </div>`})

Vue.component('tag-result', {
props: ['result'],
template: `<search-result image="/images/biscuit.svg">

            <template v-slot:typeLabel>
              <i class="fas fa-hashtag"></i> Tag
            </template>

            <template v-slot:title>
              <strong><a class="authorLink" v-bind:href="'/tag/'+result.name">#{{ result.name }}</a></strong>
            </template>

            <template v-slot:description>
              <p>{{result.posts}} post{{(result.posts === 1 ? '' : 's')}}</p>
            </template>

          </search-result>`})

Vue.component('user-result', {
  props: ['result'],
  template:`<search-result v-bind:image="result.imageEnabled ? '/images/' + result.image : '/images/cake.svg'">

            <template v-slot:typeLabel>
              <i class="fas fa-user"></i> User
            </template>

            <template v-if="result.displayName" v-slot:title>
              <strong><a class="authorLink" v-bind:href="'/' + result.username">{{result.displayName}}</a></strong> &middot; <span class="text-muted">@{{result.username}}</span>
              <i v-if="result.flagged" class="fas fa-exclamation-triangle text-danger"></i>
            </template>
            <template v-else v-slot:title>
              <strong><a class="authorLink" v-bind:href="'/' + result.username">@{{result.username}}</a></strong>
              <i v-if="result.flagged" class="fas fa-exclamation-triangle text-danger"></i>
            </template>

            <template v-slot:description>
              <p v-html="result.aboutParsed"></p>
            </template>

          </search-result>`})

Vue.component('community-result', {
  props: ['result'],
  template: `<search-result v-bind:image="result.imageEnabled ? '/images/communities/' + result.image : '/images/communities/cake.svg'">
              <template v-slot:typeLabel>
                <i class="fas fa-leaf"></i> Community
              </template>

              <template v-slot:title>
                <strong>
                  <a class="authorLink" v-bind:href="'/community/' + result.slug">{{result.name}}</a> &middot;
                </strong>
                <span class="text-muted">
                  {{result.membersCount}} member{{(result.membersCount === 1 ? '' : 's')}}
                </span>
              </template>

              <template v-slot:description>
                <p v-html="result.descriptionParsed"></p>
              </template>

            </search-result>`})

</script>