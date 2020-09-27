import Vue from 'vue'
import axios from 'axios';
const loginForm = new Vue({
  el: '#login-form',
  data: {
    email: '',
    password: '',
    errorMessage: '',
    loading: false
  },
  methods: {
    /** 
     * This is all in aid of acquiring a valid JWT from the Sweet API server
     * before we actually log in the user through the convoluted Passport.js
     * mechanism on the Node.js backend.
     * 1. Do some basic form validation, attempt to login to Sweet API
     * 2. On success, attempt to login to Old Sweet
     * 3. On failure, display some helpful error messages.
     */
    handleLogin: function (event) {
      event.preventDefault();
      this.loading = true;
      if (this.email && this.password) {
        axios.post('https://api.sweet.sh/api/login', {
          email: this.email,
          password: this.password
        })
          .then((response) => {
            console.log(response.data);
            // Save response JWT to localStorage
            localStorage.setItem('JWT', response.data.data);
            // And then login to Old Sweet
            axios.post('/login', {
              email: this.email,
              password: this.password
            }).then((response) => {
              // Whatever the response, Sweet won't let us enter the /home
              // endpoint without a valid session
              window.location.assign('/home');
            }).catch((error) => { this.errorMessage = error })
          })
          .catch((error) => {
            this.loading = false;
            if (error.response.status === 401) {
              // Unauthorized
              this.errorMessage = "We can't log you in. Check your email and password and try again."
              this.password = '';
            } else if (error.response.status === 403) {
              // Account not verified
              this.errorMessage = "This email address has not been verified. <a class='message-link' href='https://sweet.sh/resend-token'>Need a new verification token?</a>"
              this.password = '';
            }
          })
      } else {
        this.loading = false;
        this.errorMessage = "Can't have you logging in with all those empty fields!"
      }
    }
  }
})
