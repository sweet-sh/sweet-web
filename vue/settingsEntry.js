import Vue from 'vue'
import Settings from './components/Settings.vue'

new Vue({
  el: '#settings-app',
  template: `<settings v-if="canMount"/>`,
  components: { Settings },
  data() {
    return {
      canMount: false
    }
  },
  beforeMount() {
    if (localStorage.getItem('JWT')) {
      this.canMount = true;
    }
  }
})
