const ContextMenuButtons = "Metro-Core-ContextMenuButtons";

/**
 * Actually pushes the datapoint to the lambda function.
 */
chrome.runtime.onMessage.addListener(
  function(message, sender, callback) {
    // Receive all messages here and differentiate by the `type` field?
    if(message['type'] == 'contextMenu') {
      callback(handleContextMenuMessage(message));
    } else {
      let datapointDetails = message;
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

      callback(JSON.stringify(data));
    }
  }
);

/*
* Handles a contextMenu message from the content script
*/
const handleContextMenuMessage = function(message) {
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
          buttonFunction: message['buttonFunction']
        }, function(response) {
          if(response == false) {
            console.log("Error running " + message['buttonFunction']);
            return false;
          }
        });
      });
    }
  });
  return true;
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

const cleanStorage = function() {
  chrome.storage.local.remove(ContextMenuButtons, function() {
    console.log("ContextMenuButtons cleared");
  })
}

chrome.runtime.onInstalled.addListener(function() {
  cleanStorage();
});
