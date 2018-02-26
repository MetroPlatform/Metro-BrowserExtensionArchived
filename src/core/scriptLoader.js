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
 * Actually pushes the datapoint to the lambda function.
 */
const pushDatapoint = function(datasource, username, projects, datapoint) {
  var xhr = new XMLHttpRequest();
  var url = "https://push.metro.exchange";

  xhr.open("POST", url, true);
  xhr.setRequestHeader("Content-type", "application/json");

  var data = {
    "datasource": datasource,
    "projects": projects,
    "timestamp": Date.now(),
    "data": datapoint,
    "user": username
  };

  console.log("Pushing: ");
  console.log(data);

  // Only send datapoint to lambda if not in dev mode:
  chrome.storage.sync.get("Settings-devModeCheckbox", function(items) {
    if(chrome.runtime.error) {
      return false;
    } else {
      if(items["Settings-devModeCheckbox"]) {
        console.log("Not publishing the datapoint as running in dev mode.");
      } else {
        // Push with the API key:
        getKeyAndPush(xhr, JSON.stringify(data));
      }
    }
  });
}

/*
 * Gets the API Gateway key and pushed the data with it.
 */
const getKeyAndPush = function(xhr, data) {
  let keyRequester = new XMLHttpRequest();
  keyRequester.open("GET", "https://metro.exchange/api/profile/api_key/", true);

  keyRequester.onreadystatechange = function() {
    if(keyRequester.readyState == 4) {
      keyResponse = JSON.parse(keyRequester.responseText);
      apiKey = keyResponse['content']['key'];

      xhr.setRequestHeader("X-API-Key", apiKey);

      console.log("Pushing data with API key.");
      xhr.send(data);
    }
  }

  keyRequester.send();
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
            pushDatapoint(DS, username, projects, datapoint);
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

      let sourceURL = "https://raw.githubusercontent.com/RoryOfByrne/MetroDataSources/master/datasources/" + currentDS['name'];

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
