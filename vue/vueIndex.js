import Vue from 'vue'
import initialPageState from './initialPageState'
// import page level components
import TheCommunitiesPage from './components/TheCommunitiesPage.vue'
import TheSearchPage from './components/TheSearchPage.vue'

//TODO: replace with proper router so that pages can be switched out by client-side code
let pageSetup
switch(initialPageState.page){
  case 'search':
    pageSetup = {
      components: {TheSearchPage},
      render: (elementCreator) => elementCreator('TheSearchPage', { props: { initialQuery: initialPageState.query }})
    }
    break;
  case 'communities':
    pageSetup = {
      components: {TheCommunitiesPage},
      render: (elementCreator) => elementCreator('TheCommunitiesPage', { props: { initialJoinedCommunities: initialPageState.joinedCommunities }})
    }
}

if(!pageSetup) {
  throw Error("Vue page not initialized with proper state!")
}

pageSetup.el = "#vueCont"
new Vue(pageSetup)
