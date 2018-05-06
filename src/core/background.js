const BUTTON_STATE = "Metro-Core-ContextMenuButtons";

chrome.runtime.onMessage.addListener(
  function(data, sender, callback) {
    if(data['method'] == "push") {
      // Handler called when we want to send a datapoint.
      pushToLambda(data);
    } else if(data['method'] == "load") {
      // Handler called when we load a page.
      // This handles getting the datasource code to run within the tab.
      onPageLoad(data, sender);
    } else if(data['method'] == "contextMenu-create") {
      // Handle the creation of a new right-click menu button
      callback(createContextMenuButton(data));
    } else if(data['method'] == "contextMenu-removeAll") {
      // Clear all contextMenu items
      clearContextMenu();
    }
  }
);

/*
 * It might seem strange to run a background script on each page load being
 * triggered from a content script. The reason is so that we can load in the DS
 * code and execute it on the page asynchronously.
 */
const onPageLoad = function(data, sender) {
  tab = sender.tab;
  baseURL = data['baseURL'];
  projects = data['projects'];
  DS = data['DS'];
  username = data['username'];

  let manifestURL = baseURL + "/manifest.json";

  getDataFromURL(manifestURL, function(manifestText) {
    let manifest = JSON.parse(manifestText);
    let siteRegexes = manifest['sites'];

    for(var i=0, len=siteRegexes.length; i<len; i++) {
      let regex = new RegExp(siteRegexes[i]);

      // If the current site matches one of the manifest regexes...
      if(regex.test(tab.url)) {
        let scriptURL = baseURL + "/plugin.js";
        let schemaURL = baseURL + "/schema.json";

        runDataSource(tab.id, manifest['name'], scriptURL, schemaURL, projects, DS, username);
      }
    }
  });
}

/**
 * Actually runs the datasource given the scriptURL and the schemaURL.
 */
const runDataSource = function(tabID, datasource, scriptURL, schemaURL, projects, DS, username) {
  getDataFromURL(scriptURL, function(script) {
    getDataFromURL(schemaURL, function(schemaText) {
      let schema = JSON.parse(schemaText);

      chrome.tabs.executeScript(tabID, {"code": script}, function() {
        // Run the DataSource.
        chrome.tabs.sendMessage(tabID, {
          "method": "initDatasource",
          "data": {
            "DS": DS,
            "datasource": datasource,
            "username": username,
            "projects": projects,
            "schema": schema
          }
        });
      });

      console.log("Source " + datasource + " enabled.");
    });
  });
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

/*
*   Creates a contextMenu button
*/
const createContextMenuButton = function(message) {
  // This is the MetroClient telling the background script to create
  // a `contextMenu` button...
  chrome.contextMenus.create({
    title: message['buttonTitle'],
    contexts: message['contexts'],
    onclick: function(info, tab) {
      // When the button is clicked, we send a msg to the content script
      // signaling to execute the function `functionName`
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: message['type'],
          functionName: message['functionName']
        }, function(response) {
          // Here we deal with the response from the buttonFunction
          if(response['status'] == 0) {
            console.log("Error running contextMenu function");
            // FF can't open alerts from the background script, so gotta do it the hacky way
            var alertCode = "alert('" + response['msg'] + "');";
            chrome.tabs.executeScript({'code': alertCode});
          }
        });
      });
    }
  });
  return true;
}
/**
 * Actually pushes the datapoint to the lambda function.
 */
const pushToLambda = function(datapointDetails) {
    datasource = datapointDetails['ds'];
    username = datapointDetails['username'];
    projects = datapointDetails['projects'];
    datapoint = datapointDetails['datapoint'];

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

const clearContextMenu = function() {
  chrome.contextMenus.removeAll(function() {
    clearContextMenuStorage();
    console.log("ContextMenu cleared");
  });
}

const clearContextMenuStorage = function() {
  chrome.storage.local.remove(BUTTON_STATE, function() {
    console.log("ContextMenuState cleared");
  })
}

chrome.runtime.onInstalled.addListener(function() {
  clearContextMenu();
});
