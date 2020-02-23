<template>
  <div id="homeBody" class="row justify-content-center">
    <div class="col-lg-8">
      <h3 id="searchTitle" class="page-header mx-2" v-cloak>
        {{ query ? "Search: " + query : "Search" }}
      </h3>
      <form id="searchForm">
        <input
          v-model="searchBox"
          id="searchQuery"
          style="flex:1"
          type="text"
          class="form-control mr-2"
          placeholder="Search for users, communities, and tags."
        >
        <button @click.prevent="searchSubmit" class="button">
          Search
        </button>
      </form>
      <div v-cloak v-if="firstPageFetched" class="compact-container" id="resultsContainer">
        <template v-for="result in results">
          <div :key="result._id" class="content-box">
            <div class="row">
              <tagResult v-bind="result" v-if="result.type=='tag'" />
              <userResult v-bind="result" v-else-if="result.type=='user'" />
              <communityResult v-bind="result" v-else-if="result.type=='community'" />
            </div>
          </div>
        </template>
      </div>
      <loadingSpinner
        v-if="loading || allResultsLoaded"
        :loading="loading"
        :message="loading ? '' : (firstPageFetched ? 'No more results.' : 'No results found, sorry.')"
      />
    </div>
  </div>
</template>

<script>
import loadingSpinner from './SharedSubComponents/loadingSpinner.vue'
import infiniteLoader from './SharedSubComponents/infiniteLoaderMixin.js'
import tagResult from './SearchPageComponents/tagResult.vue'
import userResult from './SearchPageComponents/userResult.vue'
import communityResult from './SearchPageComponents/communityResult.vue'
import initialPageState from '../initialPageState'
export default {

  components: {
    loadingSpinner, tagResult, userResult, communityResult
  },

  mixins: [infiniteLoader],

  data: function () {
    return {
      query: initialPageState.query,
      searchBox: initialPageState.query
    }
  },

  // makes the initial request for results if we have a query from the url initially;
  // uses the history api to change the query without reloading the page every time
  // a new search is made
  created: function () {
    // TODO: replace with proper routing, someday
    const path = window.location.pathname.split('/')
    const initialQuery = path[2] || ''
    if (initialQuery !== '') {
      this.query = initialQuery
      this.searchBox = initialQuery
      this.startLoading('/showsearch/' + this.query + '/', false)
    }
    history.replaceState({ query: this.query }, this.query, '/search/' + this.query)
    window.onpopstate = (event) => {
      console.log('popping state')
      this.query = event.state.query
      this.searchBox = event.state.query
      this.startLoading('/showsearch/' + event.state.query + '/', true)
    }
  },

  methods: {
    // called directly by the event listener
    searchSubmit: function () {
      this.query = this.searchBox
      history.pushState({ query: this.query }, this.query, '/search/' + this.query)
      this.startLoading('/showsearch/' + this.query + '/', false)
    }
  }
}
</script>
