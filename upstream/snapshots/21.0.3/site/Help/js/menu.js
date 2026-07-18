// SET TARGET PLATFORM HERE BEFORE BUILDING
// 1 = Web, 2 = App (not finished - use Web instead), 3 = Console
const TargetPlatform = 1;

// Add jQuery accordion
$(function () {
    $("#accordion:nth-child(1n)").accordion({
        heightStyle: "content",
        collapsible: true,
        active: false,
    });
});

/**
 * Determine whether the file loaded from PhoneGap or not
 * http://stackoverflow.com/questions/8068052/
 */
function isPhoneGap() {
    return (
        (window.cordova || window.PhoneGap || window.phonegap) &&
        /^file:\/{3}[^\/]/i.test(window.location.href) &&
        /ios|iphone|ipod|ipad|android/i.test(navigator.userAgent)
    );
}

/**
 * Determine whether JSON index files are present
 */
function isJsonPresent() {
    return TargetPlatform == 1; // Separate JSON index file only present in web version
}

/**
 * Determine whether search is supported
 */
function isSearchSupported() {
    return TargetPlatform != 3; // Search only supported on non-console platforms
}

/**
 * Determine whether we're running the files on a console
 */
function isOnAConsole() {
    return TargetPlatform == 3; // Return true if on a console
}

/**
 * Angular app
 */
angular
    .module("sslLiveHelp", ["ngSanitize", "ngAnimate", "ngStorage"])
    .run(function () {
        FastClick.attach(document.body);
    })
    .controller("NavController", [
        "$http",
        "$scope",
        "$localStorage",
        function ($http, $scope, $localStorage) {
            var vm = this;

            /**
             * Base dir - for PhoneGap app can't use absolute paths :(
             * @type {String}
             */
            vm.baseDir = window.baseDir;

            /**
             * Whether in PhoneGap app
             * @type {Boolean}
             */
            vm.isPhoneGap = isPhoneGap();

            /**
             * Whether JSON index files are present
             * @type {Boolean}
             */
            vm.jsonPresent = isJsonPresent();

            /**
             * Whether search is supported on the target platform
             * @type {Boolean}
             */
            vm.isSearchSupported = isSearchSupported();

            /**
             * Whether running on a console
             * @type {Boolean}
             */
            vm.onAConsole = isOnAConsole();

            /**
             * Sets the top margin of the nav content based on the presence of the search box.
             * Prevents an empty space between between the top of the nav bar and the content.
             * @type {expression}
             */
            vm.styleBasedOnSearchSupported = { top: vm.isSearchSupported ? "48px" : "0px" }; // TODO: Fix magic number to use grid defined in sass-styles.scss instead
            /**
             * Whether to keep screen on - stored in localstorage
             * so state retained between page loads
             * @type {Boolean}
             */
            vm.keepScreenOn = $localStorage.keepScreenOn || false;

            // Watch for state changes
            $scope.$watch("vm.keepScreenOn", function (newVal, oldVal) {
                // Update value in local storage
                $localStorage.keepScreenOn = newVal ? true : false;

                if (window.plugins && window.plugins.insomnia) {
                    if ($localStorage.keepScreenOn) {
                        window.plugins.insomnia.keepAwake();
                    } else {
                        window.plugins.insomnia.allowSleepAgain();
                    }
                }
            });

            /**
             * Whether the nav panel is visible
             * @type {Boolean}
             */
            vm.visible = false;

            /**
             * Nav menu data structure loaded from JSON file
             * @type {Array}
             */
            vm.nav = [];

            /**
             * Nav items that are expanded - an array of titles
             * @type {Array}
             */
            vm.navExpanded = [];

            if (vm.jsonPresent) {
                // Load nav structure from JSON file
                $http.get(vm.baseDir + "nav.json").then(function (response) {
                    vm.nav = response.data.nav;

                    // Handle web / PhoneGap paths
                    vm.currentPage = window.location.pathname.split("www/").pop().replace(/^\//, "") || "index.html";

                    // Auto-expand the nav items for current page
                    vm.nav.forEach(function (item) {
                        // Expand top-level menu item
                        if (item.url === vm.currentPage) {
                            vm.navExpanded.push(item.title);
                        }
                        // Expand sub menu item
                        (item.children || []).forEach(function (sub) {
                            if (sub.url === vm.currentPage) {
                                vm.navExpanded.push(item.title, sub.title);
                            }
                            // Select sub-sub menu item
                            (sub.children || []).forEach(function (subsub) {
                                if (subsub.url === vm.currentPage) {
                                    vm.navExpanded.push(item.title, sub.title, subsub.title);
                                }
                            });
                        });
                    });
                });
            } else {
                //console.log(angular.fromJson(window.data).nav);

                // Load nav structure from local copy of index
                vm.nav = angular.fromJson(window.data).nav; //window.data.nav;

                // Handle web / PhoneGap paths
                vm.currentPage = window.location.pathname.split("www/").pop().replace(/^\//, "") || "index.html";

                // Auto-expand the nav items for current page
                vm.nav.forEach(function (item) {
                    // Expand top-level menu item
                    if (item.url === vm.currentPage) {
                        vm.navExpanded.push(item.title);
                    }
                    // Expand sub menu item
                    (item.children || []).forEach(function (sub) {
                        if (sub.url === vm.currentPage) {
                            vm.navExpanded.push(item.title, sub.title);
                        }
                        // Select sub-sub menu item
                        (sub.children || []).forEach(function (subsub) {
                            if (subsub.url === vm.currentPage) {
                                vm.navExpanded.push(item.title, sub.title, subsub.title);
                            }
                        });
                    });
                });
            }

            /**
             * Toggle nav menu expansion
             * @param {String} nav item title
             */
            vm.toggleExpanded = function (title) {
                var index = vm.navExpanded.indexOf(title);
                // Push to array
                if (index === -1) {
                    vm.navExpanded.push(title);
                }
                // Remove from array
                else {
                    vm.navExpanded.splice(index, 1);
                }
            };

            /**
             * Check if a certain nav item is expanded
             * @param {String} nav item title
             * @return {Boolean}
             */
            vm.isExpanded = function (title) {
                return vm.navExpanded.indexOf(title) > -1;
            };

            /**
             * A function to return an excerpt from the supplied
             * string and search term.  The search term is bolded
             * @param {String} text - full text of document
             * @param {String} query - the search query
             * @return {String} - excerpt with query bolded (if found)
             */
            vm.getExcerpt = function (text, query) {
                // Remove newline chars
                var t = text.replace(/[\n\r]/g, " ");

                var excerptLength = 70;
                var start = t.toLowerCase().indexOf(query.toLowerCase());

                // Query not found - return start of document
                if (start === -1) {
                    return t.substring(0, excerptLength);
                }

                // Start position of excerpt
                var p1 = Math.max(0, start - excerptLength / 2);
                var excerpt = t.substring(p1, p1 + excerptLength);

                // Bold query term in excerpt
                var r = new RegExp(query, "ig");

                // Bold query term in excerpt
                excerpt = excerpt.replace(r, "<strong>" + query + "</strong>");

                // Add ellipsis if text truncated
                if (p1 > 0) {
                    excerpt = "&hellip;" + excerpt;
                }
                if (p1 + excerptLength < t.length) {
                    excerpt = excerpt + "&hellip;";
                }
                return excerpt;
            };

            // *** Comment out from here when running on a console; breaks rendering for some reason. TODO.

            if (vm.isSearchSupported) {
                if (vm.jsonPresent) {
                    /**
                     * Load search index from JSON file and parse with Lunr
                     * @type {Object}
                     */
                    vm.idx = null;
                    $http
                        .get(vm.baseDir + "search-index.json")
                        .then(function (response) {
                            vm.idx = lunr.Index.load(response.data);
                        })
                        .catch(function (err) {
                            console.log(err);
                        });

                    /**
                     * Load a list of documents from the JSON file
                     * @type {Array}
                     */
                    vm.docs = [];
                    $http
                        .get(vm.baseDir + "file-index.json")
                        .then(function (response) {
                            vm.docs = response.data;

                            // Create an array of the doc IDs for faster retrieval later
                            vm.docIds = vm.docs.map(function (doc) {
                                return doc.id;
                            });
                        })
                        .catch(function (err) {
                            console.log(err);
                        });
                } else {
                    /**
                     * Load search index from local copy and parse with Lunr
                     * @type {Object}
                     */
                    console.log(angular.fromJson(window.data).search);
                    vm.idx = lunr.Index.load(angular.fromJson(window.data).search); //(window.data.search);

                    /**
                     * Load a list of documents from local index
                     * @type {Array}
                     */
                    console.log(angular.fromJson(window.data).fileIndex);
                    vm.docs = angular.fromJson(window.data).fileIndex; //window.data.fileIndex;

                    // Create an array of the doc IDs for faster retrieval later
                    vm.docIds = vm.docs.map(function (doc) {
                        return doc.id;
                    });
                }
            }

            /**
             * Watch for changes to search field
             */
            $scope.$watch("vm.query", function (newVal, oldVal) {
                if (newVal === oldVal || newVal === "") {
                    vm.results = [];
                } else {
                    // Get search results from Lunr index
                    var results = vm.idx.search(newVal);

                    // Get array of document IDs
                    var ids = results.map(function (result) {
                        return result.ref;
                    });

                    // Build list of results using IDs
                    vm.results = ids.reduce(function (acc, id) {
                        var docIndex = vm.docIds.indexOf(id);

                        // Was document found
                        if (docIndex > -1) {
                            // Append document from index plus excerpt to the accumulator
                            return [
                                ...acc,
                                {
                                    ...vm.docs[docIndex],
                                    excerpt: vm.getExcerpt(vm.docs[docIndex].text, vm.query),
                                },
                            ];
                        }
                        return acc;
                    }, []);
                }
            });

            // *** Stop commenting out here

            /**
             * Toggle nav panel visibility
             */
            vm.toggleVisibility = function () {
                vm.visible = vm.visible ? false : true;

                // Focus search field
                // Shouldn't really use jQuery here but works OK
                /*if(vm.visible) {
                    $('input[type=search]').focus();
                }*/
            };
        },
    ]);
