export default {
  methods: {
    debounce(func, delay) {
      let debounceTimer;
      return function() {
        console.log("debouncing call..");
        const context = this;
        const args = arguments;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(context, args), delay);
        console.log("..done");
      };
    }
  }
};