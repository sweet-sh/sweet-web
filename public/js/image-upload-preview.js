var FileUploadWithPreview = function() {
    "use strict";
    Element.prototype.matches || (Element.prototype.matches = Element.prototype.matchesSelector || Element.prototype.mozMatchesSelector || Element.prototype.msMatchesSelector || Element.prototype.oMatchesSelector || Element.prototype.webkitMatchesSelector || function(A) {
            for (var g = (this.document || this.ownerDocument).querySelectorAll(A), B = g.length; --B >= 0 && g.item(B) !== this;);
            return B > -1
        }), Array.prototype.findIndex || Object.defineProperty(Array.prototype, "findIndex", {
            value: function(A) {
                if (null == this) throw new TypeError('"this" is null or not defined');
                var g = Object(this),
                    B = g.length >>> 0;
                if ("function" != typeof A) throw new TypeError("predicate must be a function");
                for (var E = arguments[1], C = 0; C < B;) {
                    var I = g[C];
                    if (A.call(E, I, C, g)) return C;
                    C++
                }
                return -1
            },
            configurable: !0,
            writable: !0
        }),
        function() {
            if ("function" == typeof window.CustomEvent) return !1;

            function A(A, g) {
                g = g || {
                    bubbles: !1,
                    cancelable: !1,
                    detail: null
                };
                var B = document.createEvent("CustomEvent");
                return B.initCustomEvent(A, g.bubbles, g.cancelable, g.detail), B
            }
            A.prototype = window.Event.prototype, window.CustomEvent = A
        }();
    var A = function(A, g) {
        if (!A) throw new Error("No uploadId found. You must initialize file-upload-with-preview with a unique uploadId.");
        if (this.uploadId = A, this.options = g || {}, this.options.showDeleteButtonOnImages = !this.options.hasOwnProperty("showDeleteButtonOnImages") || this.options.showDeleteButtonOnImages, this.options.text = this.options.hasOwnProperty("text") ? this.options.text : {
                chooseFile: "Choose file..."
            }, this.options.text.chooseFile = this.options.text.hasOwnProperty("chooseFile") ? this.options.text.chooseFile : "Choose file...", this.options.text.browse = this.options.text.hasOwnProperty("browse") ? this.options.text.browse : "Browse", this.cachedFileArray = [], this.selectedFilesCount = 0, this.el = document.querySelector('.custom-file-container[data-upload-id="' + this.uploadId + '"]'), !this.el) throw new Error("Could not find a 'custom-file-container' with the id of: " + this.uploadId);
        if (this.input = this.el.querySelector('input[type="file"]'), this.inputLabel = this.el.querySelector(".custom-file-container__custom-file__custom-file-control"), this.imagePreview = this.el.querySelector(".custom-file-container__image-preview"), this.clearButton = this.el.querySelector(".custom-file-container__image-clear"), this.inputLabel.innerHTML = this.options.text.chooseFile, this.addBrowseButton(this.options.text.browse), !(this.el && this.input && this.inputLabel && this.imagePreview && this.clearButton)) throw new Error("Cannot find all necessary elements. Please make sure you have all the necessary elements in your html for the id: " + this.uploadId);
        this.options.images = this.options.hasOwnProperty("images") ? this.options.images : {}, this.baseImage = this.options.images.hasOwnProperty("baseImage") ? this.options.images.baseImage : "/images/imagePreviewWindowDefault.jpg", this.bindClickEvents(), this.imagePreview.style.backgroundImage = 'url("' + this.baseImage + '")'
    };
    return A.prototype.bindClickEvents = function() {
        var A = this,
            g = this;
        g.input.addEventListener("change", function() {
            if (0 !== this.files.length) {
                g.input.multiple ? g.selectedFilesCount += this.files.length : (g.selectedFilesCount = this.files.length, g.cachedFileArray = []);
                for (var A = 0; A < this.files.length; A++) {
                    var B = this.files[A];
                    B.token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15), g.cachedFileArray.push(B), g.processFile(B)
                }
                var E = new CustomEvent("fileUploadWithPreview:imageSelected", {
                    detail: {
                        uploadId: g.uploadId,
                        cachedFileArray: g.cachedFileArray,
                        selectedFilesCount: g.selectedFilesCount
                    }
                });
                window.dispatchEvent(E)
            }
        }, !0), this.clearButton.addEventListener("click", function() {
            A.clearImagePreviewPanel()
        }, !0), this.imagePreview.addEventListener("click", function(g) {
            if (g.target.matches(".custom-file-container__image-multi-preview__single-image-clear__icon")) {
                var B = g.target.getAttribute("data-upload-token"),
                    E = A.cachedFileArray.findIndex(function(A) {
                        return A.token === B
                    });
                A.cachedFileArray.splice(E, 1), A.imagePreview.innerHTML = "", A.selectedFilesCount = A.cachedFileArray.length, A.cachedFileArray.forEach(function(g) {
                    return A.processFile(g)
                }), A.cachedFileArray.length || A.clearImagePreviewPanel();
                var C = new CustomEvent("fileUploadWithPreview:imageDeleted", {
                    detail: {
                        uploadId: A.uploadId,
                        cachedFileArray: A.cachedFileArray,
                        selectedFilesCount: A.selectedFilesCount
                    }
                });
                window.dispatchEvent(C)
            }
        })
    }, A.prototype.processFile = function(A) {
        var g = this;
        0 === this.selectedFilesCount ? this.inputLabel.innerHTML = this.options.text.chooseFile : 1 === this.selectedFilesCount ? this.inputLabel.innerHTML = A.name : this.inputLabel.innerHTML = this.selectedFilesCount + " files selected", this.addBrowseButton(this.options.text.browse), this.imagePreview.classList.add("custom-file-container__image-preview--active");
        var B = new FileReader;
        B.readAsDataURL(A), B.onload = function() {
            g.input.multiple || (A.type.match("image/png") || A.type.match("image/jpeg") || A.type.match("image/gif") ? g.imagePreview.style.backgroundImage = 'url("' + B.result + '")' : A.type.match("application/pdf") ? g.imagePreview.style.backgroundImage = 'url("' + g.successPdfImage + '")' : A.type.match("video/*") ? g.imagePreview.style.backgroundImage = 'url("' + g.successVideoImage + '")' : g.imagePreview.style.backgroundImage = 'url("' + g.successFileAltImage + '")'), g.input.multiple && (g.imagePreview.style.backgroundImage = 'url("' + g.backgroundImage + '")', A.type.match("image/png") || A.type.match("image/jpeg") || A.type.match("image/gif") ? g.options.showDeleteButtonOnImages ? g.imagePreview.innerHTML += '\n <div>\n <span\n class="custom-file-container__image-multi-preview"\n style="background-image: url(\'' + B.result + '\'); "\n >\n <span class="custom-file-container__image-multi-preview__single-image-clear">\n <span\n class="custom-file-container__image-multi-preview__single-image-clear__icon"\n data-upload-token="' + A.token + '"\n >&times;</span>\n </span>\n </span>\n\n </div>\n ' : g.imagePreview.innerHTML += '\n <div>\n <span\n class="custom-file-container__image-multi-preview"\n style="background-image: url(\'' + B.result + "'); \"\n ></span>\n </div>\n " : A.type.match("application/pdf") ? g.options.showDeleteButtonOnImages ? g.imagePreview.innerHTML += '\n <div>\n <span\n class="custom-file-container__image-multi-preview"\n style="background-image: url(\'' + g.successPdfImage + '\'); "\n >\n <span class="custom-file-container__image-multi-preview__single-image-clear">\n <span\n class="custom-file-container__image-multi-preview__single-image-clear__icon"\n data-upload-token="' + A.token + '"\n >&times;</span>\n </span>\n </span>\n\n </div>\n ' : g.imagePreview.innerHTML += '\n <div>\n <span\n class="custom-file-container__image-multi-preview"\n style="background-image: url(\'' + g.successPdfImage + "'); \"\n ></span>\n </div>\n " : A.type.match("video/*") ? g.options.showDeleteButtonOnImages ? g.imagePreview.innerHTML += '\n <div>\n <span\n class="custom-file-container__image-multi-preview"\n style="background-image: url(\'' + g.successVideoImage + '\'); "\n >\n <span class="custom-file-container__image-multi-preview__single-image-clear">\n <span\n class="custom-file-container__image-multi-preview__single-image-clear__icon"\n data-upload-token="' + A.token + '"\n >&times;</span>\n </span>\n </span>\n\n </div>\n ' : g.imagePreview.innerHTML += '\n <div>\n <span\n class="custom-file-container__image-multi-preview"\n style="background-image: url(\'' + g.successVideoImage + "'); \"\n ></span>\n </div>\n " : g.options.showDeleteButtonOnImages ? g.imagePreview.innerHTML += '\n <div>\n <span\n class="custom-file-container__image-multi-preview"\n style="background-image: url(\'' + g.successFileAltImage + '\'); "\n >\n <span class="custom-file-container__image-multi-preview__single-image-clear">\n <span\n class="custom-file-container__image-multi-preview__single-image-clear__icon"\n data-upload-token="' + A.token + '"\n >&times;</span>\n </span>\n </span>\n\n </div>\n ' : g.imagePreview.innerHTML += '\n <div>\n <span\n class="custom-file-container__image-multi-preview"\n style="background-image: url(\'' + g.successFileAltImage + "'); \"\n ></span>\n </div>\n ")
        }
    }, A.prototype.addBrowseButton = function(A) {
        this.inputLabel.innerHTML += '<span class="custom-file-container__custom-file__custom-file-control__button"> ' + A + " </span>"
    }, A.prototype.selectImage = function() {
        this.input.click()
    }, A.prototype.clearImagePreviewPanel = function() {
        this.input.value = "", this.inputLabel.innerHTML = this.options.text.chooseFile, this.addBrowseButton(this.options.text.browse), this.imagePreview.style.backgroundImage = 'url("' + this.baseImage + '")', this.imagePreview.classList.remove("custom-file-container__image-preview--active"), this.cachedFileArray = [], this.selectedFilesCount = 0
    }, A
}();