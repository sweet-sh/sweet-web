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
import loadingSpinner from './SharedSubComponents/loadingSpinner.vue'
import infiniteLoader from './SharedSubComponents/infiniteLoaderMixin.js'
import tagResult from './SearchPageComponents/tagResult.vue'
import userResult from './SearchPageComponents/userResult.vue'
import communityResult from './SearchPageComponents/communityResult.vue'
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
            this.startLoading('/showsearch/' + event.state.query + '/', true)
        }
    },

    methods: {
      // called directly by the event listener
      searchSubmit: function() {
          this.query = this.searchBox
          history.pushState({ query: this.query }, this.query, "/search/" + this.query)
          this.startLoading("/showsearch/" + this.query + '/', false)
      }
    }
}
</script>