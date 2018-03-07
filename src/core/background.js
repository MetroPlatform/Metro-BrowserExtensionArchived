/**
 * Actually pushes the datapoint to the lambda function.
 */
chrome.runtime.onMessage.addListener(
  function(datapointDetails, sender, callback) {
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
);

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
