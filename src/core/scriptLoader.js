const BUTTON_STATE = "Metro-Core-ContextMenuButtons";

const messageListener = function(request, sender, callback) {
  if(request.method == "initDatasource") {
    initMetroClient(request.data);
  }
}

chrome.runtime.onMessage.addListener(messageListener);

const initMetroClient = function(data) {
  datasource = data['datasource']
  DS = data['DS']
  username = data['username']
  projects = data['projects']
  schema = data['schema']

  // Create the object:
  var metroClient = {
    sendDatapoint: function(datapoint) {
      if(validateDatapoint(schema, datapoint)) {

        let datapointDetails = {
          'method': "push",
          'ds': DS,
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
  }

  initDataSource(metroClient);
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
const loadSourceFromBaseURL = function(baseURL, projects, DS, username) {
  let dsDetails = {
    "method": "load",
    "baseURL": baseURL,
    "projects": projects,
    "DS": DS,
    "username": username
  }

  chrome.runtime.sendMessage(dsDetails, {});
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

    for(var i=0, len=allowedSources.length; i<len; i++) {
      let currentDS = allowedSources[i];
      let projects = [];
      for(var projectIndex=0; projectIndex<currentDS['projects'].length; projectIndex++) {
        projects.push(currentDS['projects'][projectIndex]['slug']);
      }

      let DS = currentDS['slug'];

      let sourceURL = "https://raw.githubusercontent.com/MetroPlatform/Metro-DataSources/master/datasources/" + currentDS['name'];

      loadSourceFromBaseURL(sourceURL, projects, DS, username);
    }

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
            loadSourceFromBaseURL(items["Settings-devModeGithubURL"], "test-user");
          }
        });
      } else {
        // Otherwise load the "real" DataSources.
        getDataFromURL("https://metro.exchange/api/profile/datasources/", parseAllowedSources);
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
