const BUTTON_STATE = "Metro-Core-ContextMenuButtons";
var ACTIVE_DATASOURCES = {};

const messageListener = function(request, sender, callback) {
  if(request.method == "initDatasource") {
    callback(initDataSource(request.data));
  }
}

chrome.runtime.onMessage.addListener(messageListener);

/*
  Creates a MetroClient for the given DataSource/User combo and returns it
*/
const createMetroClient = function(datasource, slug, username, projects, schema) {
  return {
    sendDatapoint: function(datapoint) {
      if(validateDatapoint(schema, datapoint)) {

        let datapointDetails = {
          'method': "push",
          'ds': slug,
          'username': username,
          'projects': projects,
          'datapoint': datapoint
        }
        console.log('Pushing datapoint for ' + datasource);
        chrome.runtime.sendMessage(datapointDetails, {});
      }
    },

    storeData: function(key, value) {
      // TODO: Can add validation here.
      let storageItem = {};
      storageItem[datasource+"-"+key] = value;

      chrome.storage.sync.set(storageItem);
    },

    readData: function(key, callback) {
      // TODO: Can add validation here.
      chrome.storage.sync.get(datasource+"-"+key, function(items) {
        let retVal = "-1";

        try {
          retVal = items[datasource+"-"+key];
        } catch (e) {
          console.log("Error reading data:");
          console.log(e);
        }

        callback(retVal);
      });
    },

    createContextMenuButton: function(buttonDetails, buttonFunction) {
      buttonDetails['datasource'] = datasource;
      var obj = {};
      obj[BUTTON_STATE] = [];
      chrome.storage.local.get(obj, function(contextMenuState) {
          if(contextMenuState[BUTTON_STATE].includes(buttonDetails.datasource)) {
            return false;
          } else {
            _createContextMenuButton(buttonDetails, buttonFunction);
            // Add the datasource to the current state and push it to storage
            contextMenuState[BUTTON_STATE].push(buttonDetails.datasource);

            chrome.storage.local.set(contextMenuState, function() {
                return;
            });
          }
        });
    },

    /*
     * Creates a modal dialog box with a text field, description and callback
     * function for when the text field is filled.
     *
     * dialogDetails is a dict with fields:
     *  - description: String description to put beside the input box.
     *  - submitCallback: Function to call when the input is submitted.
     */
    createModalForm: function(dialogDetails) {
      var inputs = dialogDetails['inputs']
      var submitCallback = dialogDetails['submitCallback'];

      var $parentDiv = $('<div>');
      $parentDiv.appendTo($(document.body));
      var shadow = setUpShadowDOM($parentDiv);

      $frame = setUpModal(shadow);

      // Set up some useful refs
      var $frameDocument = $frame.contents();
      var $frameWindow = $($frame[0].contentWindow);
      var $modal = $frameDocument.find('.mtr-modal-content');
      var $modalForm = $modal.find(".mtr-modal-form");

      for (var i = 0; i < inputs.length ; i++) {
        addModalInput($modalForm, inputs[i], i);
      }

      $('<input class="btn btn-success" type="submit" value="submit">').appendTo($modalForm);

      // Callback and then remove the modal, upon submit
      $modalForm.on('submit', function(e) {
        var res = {'inputs': []};

        $modalForm.find('.mtr-form-input-row').each(function(idx) {
          res['inputs'].push($(this).find('.mtr-form-input').val())
        })

        submitCallback(res);

        $parentDiv.remove(); // Remove modal when we're done
        // Stops the normal form processing.
        e.preventDefault();
      });

      // Remove modal when ESC is pressed
      $frameDocument.on('keyup.27', function(e) {
        if (e.which == 27) { // escape key maps to keycode `27`
          $parentDiv.remove();
        }
      });

      $(document).on('click', function(event) {
        if(!hasShadowParent(event.target)) {
          $parentDiv.remove();
        }
      });
    },
  }
}

/*
* Checks if the element is in a ShadowDOM
*/
function hasShadowParent(element) {
    while(element.parentNode && (element = element.parentNode)){
        if(element instanceof ShadowRoot){
            return true;
        }
    }
    return false;
}

/*
* Creates a row with two cols to hold the description and input for the input
*/
const addModalInput = function($modal, inputDetails, idx) {
  var $row = $('<div class="row mtr-form-input-row">').appendTo($modal);

  $('<p class="col-4">').text(inputDetails['description']).appendTo($row);

  var $elem = $('<' + inputDetails['type'] + '>').addClass('mtr-form-input col').attr('id', 'mtr-input-' + idx);
  if(inputDetails['type'] == 'select') {
    // Add the options for the select
    $(inputDetails['options']).each(function() {
     $elem.append($("<option>").attr('value',this.val).text(this.text));
    });

  }

  if(idx == 0) {
    // Set autofocus
    $elem.prop('autofocus', true);
  }
  $elem.appendTo($row);
}

/*
  Initialized a DataSource by creating its MetroClient and adding it to the currently active datasources
*/
const initDataSource = function(data) {
  datasource = data['datasource']
  slug = data['slug'],
  username = data['username']
  projects = data['projects']
  schema = data['schema']

  if(slug in ACTIVE_DATASOURCES) {
    console.log("DataSource " + slug + " is already active");
    return false;
  }

  // Create the client:
  var metroClient = createMetroClient(datasource, slug, username, projects, schema);

  ACTIVE_DATASOURCES[slug] = {
    'metroClient': metroClient
  }
  return true;
}

/*
  The DataSource calls this to start itself
*/
function registerDataSource(datasource) {
  if(datasource['name'] in ACTIVE_DATASOURCES) {
    var ds = ACTIVE_DATASOURCES[datasource['name']];
    ds['datasource'] = datasource;

    ds['datasource'].initDataSource(ds['metroClient']);

    console.log("DataSource " + datasource['name'] + " enabled.");
  } else {
    console.log("DataSource " + datasource['name'] + " not initialized. Won't start it.")
  }
}

/*
  Given a div, set up a Shadow DOM inside it
*/
function setUpShadowDOM($parentDiv) {
  var shadow = $parentDiv[0].createShadowRoot();

  return shadow;
}

/*
  Given a reference to a Shadow DOM, set up an iFrame for the modalDialog inside it
*/
function setUpModal(shadow) {
  // Add the iFrame CSS
  var iframeStyleUrl = chrome.extension.getURL('src/static/css/iframe.css');
  $('<link>', {
    rel: 'stylesheet',
    type: 'text/css',
    href: iframeStyleUrl
  }).appendTo($(shadow));

  // Add the iFrame
  var modalFullURL = chrome.extension.getURL('src/static/components/modalDialog.html');
  var $frame = $('<iframe>', {
    src: modalFullURL,
    class: 'mtr-iframe'
  })
  $frame.appendTo($(shadow));

  // Hacky re-write of the iFrame so we can access its DOM; due to security restrictions
  $frame[0].contentDocument.open();
  $frame[0].contentDocument.write(getFrameHtml(modalFullURL));
  $frame[0].contentDocument.close();

  var bootstrapURL= chrome.extension.getURL('src/vendor/bootstrap/bootstrap.css');
  $('<link>', {
    rel: 'stylesheet',
    type: 'text/css',
    href: bootstrapURL
  }).appendTo($($frame[0].contentDocument).find('body'));

  return $frame;
}

/*
  Given a reference to a Shadow DOM, set up an iFrame for the counter
*/
function setUpCounterFrame(shadow) {
  // Add the iFrame CSS
  var overlayStyleUrl = chrome.extension.getURL('src/static/css/overlay.css');
  $('<link>', {
    rel: 'stylesheet',
    type: 'text/css',
    href: overlayStyleUrl
  }).appendTo($(shadow));

  // Add the iFrame
  var overlayFullURL = chrome.extension.getURL('src/static/components/datasourceCounter.html');
  var $frame = $('<iframe>', {
    src: overlayFullURL,
    class: 'mtr-overlay'
  })
  $frame.appendTo($(shadow));

  // Hacky re-write of the iFrame so we can access its DOM; due to security restrictions
  $frame[0].contentDocument.open();
  $frame[0].contentDocument.write(getFrameHtml(overlayFullURL));
  $frame[0].contentDocument.close();

  return $frame;
}

/*
  Synchronous call to get the contents of a local file

  **LOCAL FILES ONLY**
*/
function getFrameHtml(url) {
  // Uses synchronous call because it's a small local file
  var xmlhttp = new XMLHttpRequest();
  xmlhttp.open("GET", url, false);
  xmlhttp.send();

  return xmlhttp.responseText;
}

/*
* Create a contextMenu item
*/
const _createContextMenuButton = function(buttonDetails, buttonFunction) {
  buttonDetails['method'] = 'contextMenu-create';
  // Send message telling background script to create the `contextMenu` button
  chrome.runtime.sendMessage(buttonDetails, function(response) {
    if(response == true) {
      // Create listener which checks `functionName` and calls the appropriate function
      chrome.runtime.onMessage.addListener(function(message, sender, callback) {
        if(message['type'] == buttonDetails['type'] && message['functionName'] == buttonDetails['functionName']) {
          callback(buttonFunction(message['contextInfo'])); // Pass the contextInfo from the contextMenu callback
        }
      });
    } else {
      console.log("Error creating contextMenu button");
    }
  });
}

/**
 * Returns true if the two objects have the same keys.
 */
const sameJSONStructure = function (o1, o2) {
  var equal = true;
  for(i in o1) {
    if(!o2.hasOwnProperty(i)) {
      equal = false;
    }
  }

  return equal;
}

/**
 * Script to check that the schema of the datasource matches the datapoint.
 * It only validates that the keys match.
 */
const validateDatapoint = function (schema, datapoint) {
  return sameJSONStructure(schema, datapoint);
}

/**
 * Loads raw data from a URL and passes it to a callback.
 */
const getDataFromURL = function loadURL(url, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);

  xhr.onreadystatechange = function() {
    if(xhr.readyState == 4) {
      callback(xhr.responseText);
    }
  }

  xhr.send();
}

/**
 * Given a base URL, load the manifest, see if the source is allowed and if so,
 * run it.
 */
const loadSourceFromBaseURL = function(baseURL, projects, slug, username, devMode) {
  let dsDetails = {
    "method": "load",
    "baseURL": baseURL,
    "projects": projects,
    "slug": slug,
    "username": username,
    "devMode": devMode
  }

  chrome.runtime.sendMessage(dsDetails, {});
}

/*
*  Set the counter on the page showing the number of currently running DataSources
*/
const setUpCounter = function(count) {
  if(count == 0) {
    return;
  }

  chrome.storage.sync.get("Settings-showCounterCheckbox", function(items) {
    if(chrome.runtime.error) {
      return false;
    } else {
      if(items["Settings-showCounterCheckbox"]) {
        initializeCounter(count);
      } else {
        return;
      }
    }
  });
}

/*
* Initialize the DS Counter in the bottom left of the page
*/

const initializeCounter = function(count) {
  var $parentDiv = $('<div>');
  $parentDiv.appendTo($(document.body));
  var shadow = setUpShadowDOM($parentDiv); // Shadow DOM to encapsulate our CSS

  $frame = setUpCounterFrame(shadow);

  // Set up some useful refs
  var $frameDocument = $frame.contents();
  var $frameWindow = $($frame[0].contentWindow);
  var $counter = $frameDocument.find('#mtr-datasource-counter');
  $counter.find('span.count').text(count);

  $frame.hover(function() { // Handle the change when we hover
    $counter.append($( '<span class="text"> DataSources Active </span>' ))
  }, function() {
    $counter.find( "span:last" ).remove();
  });
}

/**
 * Given a response from the API, enables any sources which should be allowed
 * to run on the current site.
 */
const parseAllowedSources = function(response) {
  response = JSON.parse(response);

  if(response['status'] == 1) {
    let allowedSources = response['content']['datasources'];
    let username = response['content']['username'];
    let datasourceCount = 0;

    for(var i=0, len=allowedSources.length; i<len; i++) {
      let currentDS = allowedSources[i];
      let siteRegexes = currentDS['sites'];

      for(var j=0, lenSites=siteRegexes.length; j<lenSites; j++) {
        let regex = new RegExp(siteRegexes[j]);

        // If the current site matches one of the manifest regexes...
        if(regex.test(window.location.toString())) {

          let projects = [];
          for(var projectIndex=0; projectIndex<currentDS['projects'].length; projectIndex++) {
            projects.push(currentDS['projects'][projectIndex]['slug']);
          }

          let slug = currentDS['slug'];

          let sourceURL = "https://raw.githubusercontent.com/MetroPlatform/Metro-DataSources/master/datasources/" + currentDS['name'];

          loadSourceFromBaseURL(sourceURL, projects, slug, username, false);
          datasourceCount++;
        }
      }
    }

    setUpCounter(datasourceCount);

  } else {
    console.log("Error loading datasources from API:");
    console.log(response['message']);
  }
}

/**
 * Loads and enables any DataSource a user has enabled on the site, or the devMode script if devMode is on
 */
const loadScripts = function() {
  // Check the devMode setting
  chrome.storage.sync.get("Settings-devModeCheckbox", function(items) {
    if(chrome.runtime.error) {
      return false;
    } else {
      if(items["Settings-devModeCheckbox"]) {
        // Load the dev DataSource if necessary
        // Get the Github URL.
        chrome.storage.sync.get("Settings-devModeGithubURL", function(items) {
          if(chrome.runtime.error) {
            console.log("Runtime error getting the Github URL from chrome storage.");
          } else {
            // Load the devMove DataSource
            loadSourceFromBaseURL(items["Settings-devModeGithubURL"], null, "test-datasource", "test-user", true);
          }
        });
      } else {
        // Otherwise load the "real" DataSources.
        getDataFromURL("https://getmetro.co/api/profile/datasources/", parseAllowedSources);
      }
    }
  });
}

// Only load the relevant scripts if we are allowed to monitor.
chrome.storage.sync.get("Settings-shouldMonitorCheckbox", function(items) {
  if(items["Settings-shouldMonitorCheckbox"]) {
    // Clear the contextMenu on every page load
    chrome.runtime.sendMessage({'method': "contextMenu-removeAll"}, {});

    loadScripts();
  }
});
