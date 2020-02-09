/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = "./vue/search.js");
/******/ })
/************************************************************************/
/******/ ({

/***/ "./node_modules/vue-loader/lib/index.js?!./vue/components/loading-spinner.vue?vue&type=script&lang=js&":
/*!***********************************************************************************************************************!*\
  !*** ./node_modules/vue-loader/lib??vue-loader-options!./vue/components/loading-spinner.vue?vue&type=script&lang=js& ***!
  \***********************************************************************************************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n//\n//\n//\n//\n//\n//\n//\n//\n//\n//\n//\n//\n\r\n/* harmony default export */ __webpack_exports__[\"default\"] = ({\r\n    props: ['loading', 'message']\r\n});\r\n\n\n//# sourceURL=webpack:///./vue/components/loading-spinner.vue?./node_modules/vue-loader/lib??vue-loader-options");

/***/ }),

/***/ "./node_modules/vue-loader/lib/index.js?!./vue/components/search-page.vue?vue&type=script&lang=js&":
/*!*******************************************************************************************************************!*\
  !*** ./node_modules/vue-loader/lib??vue-loader-options!./vue/components/search-page.vue?vue&type=script&lang=js& ***!
  \*******************************************************************************************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var _loading_spinner_vue__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./loading-spinner.vue */ \"./vue/components/loading-spinner.vue\");\n/* harmony import */ var _infinite_loader_mixin_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./infinite-loader-mixin.js */ \"./vue/components/infinite-loader-mixin.js\");\n//\n//\n//\n//\n//\n//\n//\n//\n//\n//\n//\n//\n//\n//\n//\n//\n//\n//\n//\n//\n//\n//\n//\n//\n\r\n\r\n\r\n//TODO: replace with proper routing, someday\r\nconst path = window.location.pathname\r\nconst initialQuery = path[path.length-1] == '/' ? '' : path.split('/')[2]\r\n/* harmony default export */ __webpack_exports__[\"default\"] = ({\r\n  \r\n    components: {\r\n      loadingSpinner: _loading_spinner_vue__WEBPACK_IMPORTED_MODULE_0__[\"default\"]\r\n    },\r\n\r\n    mixins: [_infinite_loader_mixin_js__WEBPACK_IMPORTED_MODULE_1__[\"default\"]],\r\n\r\n    data: function () { return {\r\n        query: initialQuery,\r\n        searchBox: initialQuery\r\n    } },\r\n\r\n    // makes the initial request for results if we have a query from the url initially; uses the history api to change the query without reloading the page\r\n    // every time a new search is made\r\n    created: function() {\r\n        if (this.query !== '') {\r\n            this.startLoading('/showsearch/'+this.query+'/')\r\n        }\r\n        history.replaceState({ query: this.query }, this.query, \"/search/\" + this.query)\r\n        window.onpopstate = (event) => {\r\n            console.log(event)\r\n            this.query = event.state.query\r\n            this.searchBox = event.state.query\r\n            this.startLoading('/showsearch/' + event.state.query + '/')\r\n        }\r\n    },\r\n\r\n    methods: {\r\n      // called directly by the event listener\r\n      searchSubmit: function() {\r\n          this.query = this.searchBox\r\n          history.pushState({ query: this.query }, this.query, \"/search/\" + this.query)\r\n          this.startLoading(\"/showsearch/\" + this.query + '/')\r\n      }          \r\n    }\r\n});\r\n\r\nVue.component('search-result', {\r\nprops: ['image'],\r\ntemplate: `<div class=\"col commentContent\">\r\n          <p class=\"text-muted\"><slot name=\"typeLabel\"></slot></p>\r\n          <p class=\"mb-2\" style=\"font-size:1.3em\">\r\n              <img class=\"postAuthorImage\" v-bind:src=\"image\" />\r\n              <slot name=\"title\"></slot>\r\n          </p>\r\n            <slot name=\"description\"></slot>\r\n        </div>`})\r\n\r\nVue.component('tag-result', {\r\nprops: ['result'],\r\ntemplate: `<search-result image=\"/images/biscuit.svg\">\r\n\r\n            <template v-slot:typeLabel>\r\n              <i class=\"fas fa-hashtag\"></i> Tag\r\n            </template>\r\n\r\n            <template v-slot:title>\r\n              <strong><a class=\"authorLink\" v-bind:href=\"'/tag/'+result.name\">#{{ result.name }}</a></strong>\r\n            </template>\r\n\r\n            <template v-slot:description>\r\n              <p>{{result.posts}} post{{(result.posts === 1 ? '' : 's')}}</p>\r\n            </template>\r\n\r\n          </search-result>`})\r\n\r\nVue.component('user-result', {\r\n  props: ['result'],\r\n  template:`<search-result v-bind:image=\"result.imageEnabled ? '/images/' + result.image : '/images/cake.svg'\">\r\n\r\n            <template v-slot:typeLabel>\r\n              <i class=\"fas fa-user\"></i> User\r\n            </template>\r\n\r\n            <template v-if=\"result.displayName\" v-slot:title>\r\n              <strong><a class=\"authorLink\" v-bind:href=\"'/' + result.username\">{{result.displayName}}</a></strong> &middot; <span class=\"text-muted\">@{{result.username}}</span>\r\n              <i v-if=\"result.flagged\" class=\"fas fa-exclamation-triangle text-danger\"></i>\r\n            </template>\r\n            <template v-else v-slot:title>\r\n              <strong><a class=\"authorLink\" v-bind:href=\"'/' + result.username\">@{{result.username}}</a></strong>\r\n              <i v-if=\"result.flagged\" class=\"fas fa-exclamation-triangle text-danger\"></i>\r\n            </template>\r\n\r\n            <template v-slot:description>\r\n              <p v-html=\"result.aboutParsed\"></p>\r\n            </template>\r\n\r\n          </search-result>`})\r\n\r\nVue.component('community-result', {\r\n  props: ['result'],\r\n  template: `<search-result v-bind:image=\"result.imageEnabled ? '/images/communities/' + result.image : '/images/communities/cake.svg'\">\r\n              <template v-slot:typeLabel>\r\n                <i class=\"fas fa-leaf\"></i> Community\r\n              </template>\r\n\r\n              <template v-slot:title>\r\n                <strong>\r\n                  <a class=\"authorLink\" v-bind:href=\"'/community/' + result.slug\">{{result.name}}</a> &middot;\r\n                </strong>\r\n                <span class=\"text-muted\">\r\n                  {{result.membersCount}} member{{(result.membersCount === 1 ? '' : 's')}}\r\n                </span>\r\n              </template>\r\n\r\n              <template v-slot:description>\r\n                <p v-html=\"result.descriptionParsed\"></p>\r\n              </template>\r\n\r\n            </search-result>`})\r\n\r\n\n\n//# sourceURL=webpack:///./vue/components/search-page.vue?./node_modules/vue-loader/lib??vue-loader-options");

/***/ }),

/***/ "./node_modules/vue-loader/lib/loaders/templateLoader.js?!./node_modules/vue-loader/lib/index.js?!./vue/components/loading-spinner.vue?vue&type=template&id=766b78c6&":
/*!*********************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/vue-loader/lib/loaders/templateLoader.js??vue-loader-options!./node_modules/vue-loader/lib??vue-loader-options!./vue/components/loading-spinner.vue?vue&type=template&id=766b78c6& ***!
  \*********************************************************************************************************************************************************************************************************/
/*! exports provided: render, staticRenderFns */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"render\", function() { return render; });\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"staticRenderFns\", function() { return staticRenderFns; });\nvar render = function() {\n  var _vm = this\n  var _h = _vm.$createElement\n  var _c = _vm._self._c || _h\n  return _c(\"div\", { staticClass: \"page-load-status\" }, [\n    _vm.loading\n      ? _c(\"div\", { staticClass: \"loader-ellips infinite-scroll-request\" }, [\n          _c(\"span\", { staticClass: \"loader-ellips__dot\" }),\n          _vm._v(\" \"),\n          _c(\"span\", { staticClass: \"loader-ellips__dot\" }),\n          _vm._v(\" \"),\n          _c(\"span\", { staticClass: \"loader-ellips__dot\" }),\n          _vm._v(\" \"),\n          _c(\"span\", { staticClass: \"loader-ellips__dot\" })\n        ])\n      : _c(\"p\", [_vm._v(_vm._s(_vm.message))])\n  ])\n}\nvar staticRenderFns = []\nrender._withStripped = true\n\n\n\n//# sourceURL=webpack:///./vue/components/loading-spinner.vue?./node_modules/vue-loader/lib/loaders/templateLoader.js??vue-loader-options!./node_modules/vue-loader/lib??vue-loader-options");

/***/ }),

/***/ "./node_modules/vue-loader/lib/loaders/templateLoader.js?!./node_modules/vue-loader/lib/index.js?!./vue/components/search-page.vue?vue&type=template&id=2cc07a5c&":
/*!*****************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/vue-loader/lib/loaders/templateLoader.js??vue-loader-options!./node_modules/vue-loader/lib??vue-loader-options!./vue/components/search-page.vue?vue&type=template&id=2cc07a5c& ***!
  \*****************************************************************************************************************************************************************************************************/
/*! exports provided: render, staticRenderFns */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"render\", function() { return render; });\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"staticRenderFns\", function() { return staticRenderFns; });\nvar render = function() {\n  var _vm = this\n  var _h = _vm.$createElement\n  var _c = _vm._self._c || _h\n  return _c(\n    \"div\",\n    { staticClass: \"row justify-content-center\", attrs: { id: \"homeBody\" } },\n    [\n      _c(\n        \"div\",\n        { staticClass: \"col-lg-8\" },\n        [\n          _c(\n            \"h3\",\n            { staticClass: \"page-header mx-2\", attrs: { id: \"searchTitle\" } },\n            [_vm._v(_vm._s(_vm.query ? \"Search: \" + _vm.query : \"Search\"))]\n          ),\n          _vm._v(\" \"),\n          _c(\"form\", { attrs: { id: \"searchForm\" } }, [\n            _c(\"input\", {\n              directives: [\n                {\n                  name: \"model\",\n                  rawName: \"v-model\",\n                  value: _vm.searchBox,\n                  expression: \"searchBox\"\n                }\n              ],\n              staticClass: \"form-control mr-2\",\n              staticStyle: { flex: \"1\" },\n              attrs: {\n                id: \"searchQuery\",\n                type: \"text\",\n                placeholder: \"Search for users, communities, and tags.\"\n              },\n              domProps: { value: _vm.searchBox },\n              on: {\n                input: function($event) {\n                  if ($event.target.composing) {\n                    return\n                  }\n                  _vm.searchBox = $event.target.value\n                }\n              }\n            }),\n            _vm._v(\" \"),\n            _c(\n              \"button\",\n              {\n                staticClass: \"button\",\n                on: {\n                  click: function($event) {\n                    $event.preventDefault()\n                    return _vm.searchSubmit($event)\n                  }\n                }\n              },\n              [_vm._v(\"Search\")]\n            )\n          ]),\n          _vm._v(\" \"),\n          _vm.firstPageFetched\n            ? _c(\n                \"div\",\n                {\n                  staticClass: \"compact-container\",\n                  attrs: { id: \"resultsContainer\" }\n                },\n                [\n                  _vm._l(_vm.results, function(result) {\n                    return [\n                      _c(\n                        \"div\",\n                        { key: result._id, staticClass: \"content-box\" },\n                        [\n                          _c(\n                            \"div\",\n                            { staticClass: \"row\" },\n                            [\n                              result.type == \"tag\"\n                                ? _c(\"tag-result\", {\n                                    attrs: { result: result }\n                                  })\n                                : result.type == \"user\"\n                                ? _c(\"user-result\", {\n                                    attrs: { result: result }\n                                  })\n                                : result.type == \"community\"\n                                ? _c(\"community-result\", {\n                                    attrs: { result: result }\n                                  })\n                                : _vm._e()\n                            ],\n                            1\n                          )\n                        ]\n                      )\n                    ]\n                  })\n                ],\n                2\n              )\n            : _vm._e(),\n          _vm._v(\" \"),\n          _c(\"loadingSpinner\", {\n            attrs: {\n              loading: _vm.loading,\n              message: _vm.loading\n                ? \"\"\n                : _vm.firstPageFetched\n                ? \"No more results.\"\n                : \"No results found, sorry.\"\n            }\n          })\n        ],\n        1\n      )\n    ]\n  )\n}\nvar staticRenderFns = []\nrender._withStripped = true\n\n\n\n//# sourceURL=webpack:///./vue/components/search-page.vue?./node_modules/vue-loader/lib/loaders/templateLoader.js??vue-loader-options!./node_modules/vue-loader/lib??vue-loader-options");

/***/ }),

/***/ "./node_modules/vue-loader/lib/runtime/componentNormalizer.js":
/*!********************************************************************!*\
  !*** ./node_modules/vue-loader/lib/runtime/componentNormalizer.js ***!
  \********************************************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"default\", function() { return normalizeComponent; });\n/* globals __VUE_SSR_CONTEXT__ */\n\n// IMPORTANT: Do NOT use ES2015 features in this file (except for modules).\n// This module is a runtime utility for cleaner component module output and will\n// be included in the final webpack user bundle.\n\nfunction normalizeComponent (\n  scriptExports,\n  render,\n  staticRenderFns,\n  functionalTemplate,\n  injectStyles,\n  scopeId,\n  moduleIdentifier, /* server only */\n  shadowMode /* vue-cli only */\n) {\n  // Vue.extend constructor export interop\n  var options = typeof scriptExports === 'function'\n    ? scriptExports.options\n    : scriptExports\n\n  // render functions\n  if (render) {\n    options.render = render\n    options.staticRenderFns = staticRenderFns\n    options._compiled = true\n  }\n\n  // functional template\n  if (functionalTemplate) {\n    options.functional = true\n  }\n\n  // scopedId\n  if (scopeId) {\n    options._scopeId = 'data-v-' + scopeId\n  }\n\n  var hook\n  if (moduleIdentifier) { // server build\n    hook = function (context) {\n      // 2.3 injection\n      context =\n        context || // cached call\n        (this.$vnode && this.$vnode.ssrContext) || // stateful\n        (this.parent && this.parent.$vnode && this.parent.$vnode.ssrContext) // functional\n      // 2.2 with runInNewContext: true\n      if (!context && typeof __VUE_SSR_CONTEXT__ !== 'undefined') {\n        context = __VUE_SSR_CONTEXT__\n      }\n      // inject component styles\n      if (injectStyles) {\n        injectStyles.call(this, context)\n      }\n      // register component module identifier for async chunk inferrence\n      if (context && context._registeredComponents) {\n        context._registeredComponents.add(moduleIdentifier)\n      }\n    }\n    // used by ssr in case component is cached and beforeCreate\n    // never gets called\n    options._ssrRegister = hook\n  } else if (injectStyles) {\n    hook = shadowMode\n      ? function () { injectStyles.call(this, this.$root.$options.shadowRoot) }\n      : injectStyles\n  }\n\n  if (hook) {\n    if (options.functional) {\n      // for template-only hot-reload because in that case the render fn doesn't\n      // go through the normalizer\n      options._injectStyles = hook\n      // register for functioal component in vue file\n      var originalRender = options.render\n      options.render = function renderWithStyleInjection (h, context) {\n        hook.call(context)\n        return originalRender(h, context)\n      }\n    } else {\n      // inject component registration as beforeCreate hook\n      var existing = options.beforeCreate\n      options.beforeCreate = existing\n        ? [].concat(existing, hook)\n        : [hook]\n    }\n  }\n\n  return {\n    exports: scriptExports,\n    options: options\n  }\n}\n\n\n//# sourceURL=webpack:///./node_modules/vue-loader/lib/runtime/componentNormalizer.js?");

/***/ }),

/***/ "./vue/components/infinite-loader-mixin.js":
/*!*************************************************!*\
  !*** ./vue/components/infinite-loader-mixin.js ***!
  \*************************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony default export */ __webpack_exports__[\"default\"] = ({\r\n  data: function () {\r\n    return {\r\n      loading: false,\r\n      oldestResultLoaded: new Date().getTime(),\r\n      results: [],\r\n      allResultsLoaded: false,\r\n      baseURL: '',\r\n      listener: () => {\r\n        const w = $(window)\r\n        if ($(document).height() - (w.scrollTop() + w.height()) < 400) {\r\n          this.fetchResults()\r\n        }\r\n      }\r\n    }\r\n  },\r\n  computed: {\r\n    firstPageFetched: function () {\r\n      return this.results.length > 0\r\n    }\r\n  },\r\n  destroyed: function () {\r\n    window.removeEventListener('scroll', this.listener)\r\n  },\r\n  methods: {\r\n    startLoading: function (baseURL) {\r\n      this.loading = false\r\n      this.baseURL = baseURL\r\n      this.oldestResultLoaded = new Date().getTime()\r\n      this.allResultsLoaded = false\r\n      this.results = []\r\n      window.addEventListener('scroll', this.listener)\r\n      this.fetchResults()\r\n    },\r\n    fetchResults: function () {\r\n      if (this.allResultsLoaded || this.loading) {\r\n        return\r\n      }\r\n      this.loading = true\r\n      var vueData = this\r\n      const thisReqsBaseURL = this.baseURL\r\n      $.get(thisReqsBaseURL + this.oldestResultLoaded, null, function (results) {\r\n        if (!results.oldestTimestamp) {\r\n          console.error('oldestTimestamp not present in items loaded by infinite-loader')\r\n        }\r\n        if (vueData.baseURL !== thisReqsBaseURL) {\r\n          console.log('old results rejected')\r\n          return // this means that the query has changed since the request was made\r\n        }\r\n        vueData.oldestResultLoaded = results.oldestTimestamp\r\n        vueData.results = vueData.results.concat(results.results)\r\n        vueData.loading = false\r\n        // if the page isn't filled up yet, load more\r\n        if ($(document).height() <= $(window).height()) {\r\n          vueData.fetchResults()\r\n        }\r\n      }, 'json').fail(function () { // recieving a 404 response from the server is currently how we find out we're out of results; this should be changed to be less ambiguous\r\n        vueData.allResultsLoaded = true\r\n        vueData.loading = false\r\n      })\r\n    }\r\n  }\r\n});\r\n\n\n//# sourceURL=webpack:///./vue/components/infinite-loader-mixin.js?");

/***/ }),

/***/ "./vue/components/loading-spinner.vue":
/*!********************************************!*\
  !*** ./vue/components/loading-spinner.vue ***!
  \********************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var _loading_spinner_vue_vue_type_template_id_766b78c6___WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./loading-spinner.vue?vue&type=template&id=766b78c6& */ \"./vue/components/loading-spinner.vue?vue&type=template&id=766b78c6&\");\n/* harmony import */ var _loading_spinner_vue_vue_type_script_lang_js___WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./loading-spinner.vue?vue&type=script&lang=js& */ \"./vue/components/loading-spinner.vue?vue&type=script&lang=js&\");\n/* empty/unused harmony star reexport *//* harmony import */ var _node_modules_vue_loader_lib_runtime_componentNormalizer_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../node_modules/vue-loader/lib/runtime/componentNormalizer.js */ \"./node_modules/vue-loader/lib/runtime/componentNormalizer.js\");\n\n\n\n\n\n/* normalize component */\n\nvar component = Object(_node_modules_vue_loader_lib_runtime_componentNormalizer_js__WEBPACK_IMPORTED_MODULE_2__[\"default\"])(\n  _loading_spinner_vue_vue_type_script_lang_js___WEBPACK_IMPORTED_MODULE_1__[\"default\"],\n  _loading_spinner_vue_vue_type_template_id_766b78c6___WEBPACK_IMPORTED_MODULE_0__[\"render\"],\n  _loading_spinner_vue_vue_type_template_id_766b78c6___WEBPACK_IMPORTED_MODULE_0__[\"staticRenderFns\"],\n  false,\n  null,\n  null,\n  null\n  \n)\n\n/* hot reload */\nif (false) { var api; }\ncomponent.options.__file = \"vue/components/loading-spinner.vue\"\n/* harmony default export */ __webpack_exports__[\"default\"] = (component.exports);\n\n//# sourceURL=webpack:///./vue/components/loading-spinner.vue?");

/***/ }),

/***/ "./vue/components/loading-spinner.vue?vue&type=script&lang=js&":
/*!*********************************************************************!*\
  !*** ./vue/components/loading-spinner.vue?vue&type=script&lang=js& ***!
  \*********************************************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var _node_modules_vue_loader_lib_index_js_vue_loader_options_loading_spinner_vue_vue_type_script_lang_js___WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! -!../../node_modules/vue-loader/lib??vue-loader-options!./loading-spinner.vue?vue&type=script&lang=js& */ \"./node_modules/vue-loader/lib/index.js?!./vue/components/loading-spinner.vue?vue&type=script&lang=js&\");\n/* empty/unused harmony star reexport */ /* harmony default export */ __webpack_exports__[\"default\"] = (_node_modules_vue_loader_lib_index_js_vue_loader_options_loading_spinner_vue_vue_type_script_lang_js___WEBPACK_IMPORTED_MODULE_0__[\"default\"]); \n\n//# sourceURL=webpack:///./vue/components/loading-spinner.vue?");

/***/ }),

/***/ "./vue/components/loading-spinner.vue?vue&type=template&id=766b78c6&":
/*!***************************************************************************!*\
  !*** ./vue/components/loading-spinner.vue?vue&type=template&id=766b78c6& ***!
  \***************************************************************************/
/*! exports provided: render, staticRenderFns */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var _node_modules_vue_loader_lib_loaders_templateLoader_js_vue_loader_options_node_modules_vue_loader_lib_index_js_vue_loader_options_loading_spinner_vue_vue_type_template_id_766b78c6___WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! -!../../node_modules/vue-loader/lib/loaders/templateLoader.js??vue-loader-options!../../node_modules/vue-loader/lib??vue-loader-options!./loading-spinner.vue?vue&type=template&id=766b78c6& */ \"./node_modules/vue-loader/lib/loaders/templateLoader.js?!./node_modules/vue-loader/lib/index.js?!./vue/components/loading-spinner.vue?vue&type=template&id=766b78c6&\");\n/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, \"render\", function() { return _node_modules_vue_loader_lib_loaders_templateLoader_js_vue_loader_options_node_modules_vue_loader_lib_index_js_vue_loader_options_loading_spinner_vue_vue_type_template_id_766b78c6___WEBPACK_IMPORTED_MODULE_0__[\"render\"]; });\n\n/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, \"staticRenderFns\", function() { return _node_modules_vue_loader_lib_loaders_templateLoader_js_vue_loader_options_node_modules_vue_loader_lib_index_js_vue_loader_options_loading_spinner_vue_vue_type_template_id_766b78c6___WEBPACK_IMPORTED_MODULE_0__[\"staticRenderFns\"]; });\n\n\n\n//# sourceURL=webpack:///./vue/components/loading-spinner.vue?");

/***/ }),

/***/ "./vue/components/search-page.vue":
/*!****************************************!*\
  !*** ./vue/components/search-page.vue ***!
  \****************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var _search_page_vue_vue_type_template_id_2cc07a5c___WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./search-page.vue?vue&type=template&id=2cc07a5c& */ \"./vue/components/search-page.vue?vue&type=template&id=2cc07a5c&\");\n/* harmony import */ var _search_page_vue_vue_type_script_lang_js___WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./search-page.vue?vue&type=script&lang=js& */ \"./vue/components/search-page.vue?vue&type=script&lang=js&\");\n/* empty/unused harmony star reexport *//* harmony import */ var _node_modules_vue_loader_lib_runtime_componentNormalizer_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../node_modules/vue-loader/lib/runtime/componentNormalizer.js */ \"./node_modules/vue-loader/lib/runtime/componentNormalizer.js\");\n\n\n\n\n\n/* normalize component */\n\nvar component = Object(_node_modules_vue_loader_lib_runtime_componentNormalizer_js__WEBPACK_IMPORTED_MODULE_2__[\"default\"])(\n  _search_page_vue_vue_type_script_lang_js___WEBPACK_IMPORTED_MODULE_1__[\"default\"],\n  _search_page_vue_vue_type_template_id_2cc07a5c___WEBPACK_IMPORTED_MODULE_0__[\"render\"],\n  _search_page_vue_vue_type_template_id_2cc07a5c___WEBPACK_IMPORTED_MODULE_0__[\"staticRenderFns\"],\n  false,\n  null,\n  null,\n  null\n  \n)\n\n/* hot reload */\nif (false) { var api; }\ncomponent.options.__file = \"vue/components/search-page.vue\"\n/* harmony default export */ __webpack_exports__[\"default\"] = (component.exports);\n\n//# sourceURL=webpack:///./vue/components/search-page.vue?");

/***/ }),

/***/ "./vue/components/search-page.vue?vue&type=script&lang=js&":
/*!*****************************************************************!*\
  !*** ./vue/components/search-page.vue?vue&type=script&lang=js& ***!
  \*****************************************************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var _node_modules_vue_loader_lib_index_js_vue_loader_options_search_page_vue_vue_type_script_lang_js___WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! -!../../node_modules/vue-loader/lib??vue-loader-options!./search-page.vue?vue&type=script&lang=js& */ \"./node_modules/vue-loader/lib/index.js?!./vue/components/search-page.vue?vue&type=script&lang=js&\");\n/* empty/unused harmony star reexport */ /* harmony default export */ __webpack_exports__[\"default\"] = (_node_modules_vue_loader_lib_index_js_vue_loader_options_search_page_vue_vue_type_script_lang_js___WEBPACK_IMPORTED_MODULE_0__[\"default\"]); \n\n//# sourceURL=webpack:///./vue/components/search-page.vue?");

/***/ }),

/***/ "./vue/components/search-page.vue?vue&type=template&id=2cc07a5c&":
/*!***********************************************************************!*\
  !*** ./vue/components/search-page.vue?vue&type=template&id=2cc07a5c& ***!
  \***********************************************************************/
/*! exports provided: render, staticRenderFns */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var _node_modules_vue_loader_lib_loaders_templateLoader_js_vue_loader_options_node_modules_vue_loader_lib_index_js_vue_loader_options_search_page_vue_vue_type_template_id_2cc07a5c___WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! -!../../node_modules/vue-loader/lib/loaders/templateLoader.js??vue-loader-options!../../node_modules/vue-loader/lib??vue-loader-options!./search-page.vue?vue&type=template&id=2cc07a5c& */ \"./node_modules/vue-loader/lib/loaders/templateLoader.js?!./node_modules/vue-loader/lib/index.js?!./vue/components/search-page.vue?vue&type=template&id=2cc07a5c&\");\n/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, \"render\", function() { return _node_modules_vue_loader_lib_loaders_templateLoader_js_vue_loader_options_node_modules_vue_loader_lib_index_js_vue_loader_options_search_page_vue_vue_type_template_id_2cc07a5c___WEBPACK_IMPORTED_MODULE_0__[\"render\"]; });\n\n/* harmony reexport (safe) */ __webpack_require__.d(__webpack_exports__, \"staticRenderFns\", function() { return _node_modules_vue_loader_lib_loaders_templateLoader_js_vue_loader_options_node_modules_vue_loader_lib_index_js_vue_loader_options_search_page_vue_vue_type_template_id_2cc07a5c___WEBPACK_IMPORTED_MODULE_0__[\"staticRenderFns\"]; });\n\n\n\n//# sourceURL=webpack:///./vue/components/search-page.vue?");

/***/ }),

/***/ "./vue/search.js":
/*!***********************!*\
  !*** ./vue/search.js ***!
  \***********************/
/*! no exports provided */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var _components_search_page_vue__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./components/search-page.vue */ \"./vue/components/search-page.vue\");\n\r\nnew Vue({\r\n    el: '#searchCont',\r\n    template: '<searchPage />',\r\n    components: { searchPage: _components_search_page_vue__WEBPACK_IMPORTED_MODULE_0__[\"default\"] }\r\n})\n\n//# sourceURL=webpack:///./vue/search.js?");

/***/ })

/******/ });