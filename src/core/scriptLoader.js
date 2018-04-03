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
 * Actually runs the datasource given the scriptURL and the schemaURL.
 */
const runDataSource = function(datasource, scriptURL, schemaURL, projects, DS, username) {
  getDataFromURL(scriptURL, function(script) {
    getDataFromURL(schemaURL, function(schemaText) {
      let schema = JSON.parse(schemaText);

      // Create the object:
      var metroClient = {
        sendDatapoint: function(datapoint) {
          if(validateDatapoint(schema, datapoint)) {
            console.log("Pushing datapoint for " + DS);
            let datapointDetails = {
              'ds': DS,
              'username': username,
              'projects': projects,
              'datapoint': datapoint
            }

            chrome.runtime.sendMessage(datapointDetails, function(response) {
              console.log(response);
            });
          }
        },

        createContextMenuButton: function(buttonDetails, buttonFunction) {
          console.log("createContextMenuButton hit");
          buttonDetails['type'] = 'contextMenu';
          // Send message telling background script to create the `contextMenu` button
          chrome.runtime.sendMessage(buttonDetails, function(response) {
            console.log("addContextMenuButton response: " + response);
          });

          // Create receiver which checks `functionName` and calls the appropriate function
          // NOTE: Should one listener handle all `contextMenu` buttons?
          // ...Or is this ok? A new listener each time `addContextMenuButton` is called
          chrome.extension.onMessage.addListener(function(message, sender, callback) {
            console.log("Received message from background script");
            console.log(message);
            if(message['type'] == buttonDetails['type']
               && message.buttonFunction = buttonDetails.buttonFunction) {
              buttonFunction();
            }
          })
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
        }
      }

      eval(script);

      // Run the DataSource.
      initDataSource(metroClient);

      console.log("Source " + datasource + " enabled.");
    });
  });
}

/**
 * Given a base URL, load the manifest, see if the source is allowed and if so,
 * run it.
 */
const loadSourceFromBaseURL = function(baseURL, projects, DS, username) {
  let manifestURL = baseURL + "/manifest.json";

  getDataFromURL(manifestURL, function(manifestText) {
    let manifest = JSON.parse(manifestText);
    let siteRegexes = manifest['sites'];

    for(var i=0, len=siteRegexes.length; i<len; i++) {
      let regex = new RegExp(siteRegexes[i]);

      // If the current site matches one of the manifest regexes...
      if(regex.test(window.location.href)) {
        let scriptURL = baseURL + "/plugin.js";
        let schemaURL = baseURL + "/schema.json";

        runDataSource(manifest['name'], scriptURL, schemaURL, projects, DS, username);
      }
    }
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
 * Loads any dev mode scripts if needed.
 */
const loadDevScripts = function() {
  chrome.storage.sync.get("Settings-devModeCheckbox", function(items) {
    if(chrome.runtime.error) {
      return false;
    } else {
      if(items["Settings-devModeCheckbox"]) {
        // Get the Github URL.
        chrome.storage.sync.get("Settings-devModeGithubURL", function(items) {
          if(chrome.runtime.error) {
            console.log("Runtime error getting the Github URL from chrome storage.");
          } else {
            loadSourceFromBaseURL(items["Settings-devModeGithubURL"], "test-user");
          }
        });
      }
    }
  });
}

/**
 * Loads and enables any DataSource a user has enabled on the site.
 */
const loadScripts = function() {
  // Will load any dev scripts if needed.
  loadDevScripts();

  // And then the "real" ones.
  getDataFromURL("https://metro.exchange/api/profile/datasources/", parseAllowedSources);
}

// Only load the relevant scripts if we are allowed to monitor.
chrome.storage.sync.get("Settings-shouldMonitorCheckbox", function(items) {
  if(items["Settings-shouldMonitorCheckbox"]) {
    loadScripts();
  }
});
