/**
 * Displays all the extensions stored data.
 */
function dumpStoredData() {
  chrome.storage.sync.get(null, function(items) {
    for(var key in items) {
      // Add the settings node to the Settings list.
      if(key.indexOf("Settings-") == 0) {
        let li = $('<li/>');
        li.addClass("list-group-item");
        var setting_name = $('<span />').addClass('text-main').html(key + ": ").appendTo(li);
        li.append(items[key]);
        $("#settingsList").append(li);
      } else {
        // Just dump out the rest.
        document.getElementById('storedData').innerHTML += key + ": " + items[key] + "<br/>";
      }
    }
  });
}

/**
 * Registers a handler that when the clearStorage button is pressed, clears the
 * storage. To be used in dev mode.
 */
function setClearStorageHandler() {
  let button = document.getElementById("clearStorageButton");

  button.addEventListener('click', function() {
    console.log("Storage cleared.");
    chrome.storage.sync.clear();
    dumpStoredData();
  });
}

/**
 * By default, links in the popup don't open...
 * This sets any link to open in new tabs when clicked.
 */
function allowLinks() {
  var links = document.getElementsByTagName("a");
  for(var i = 0; i < links.length; i++) {
    (function () {
      var ln = links[i];
      var location = ln.href;
      ln.onclick = function () {
        chrome.tabs.create({active: true, url: location});
      };
    })();
  }
}

/**
 * Sets the correct initial value for a checkbox and stores a click handler for
 * its change. It also runs the clickCallback after setting the initial value
 * of the checkboxes.
 */
function initCheckbox(id, clickCallback, initialValue) {
  let button = document.getElementById(id);

  // First set the checkbox to the stored value.
  chrome.storage.sync.get("Settings-"+id, function(items) {
    if('Settings-'+id in items) {
      console.log("Setting found");
      button.checked = items["Settings-"+id];
    } else {
      console.log(id + " checkbox has never been set. Setting it to " + initialValue + ".");
      // Set it manually
      let storageItem = {};
      storageItem["Settings-"+id] = initialValue;
      chrome.storage.sync.set(storageItem);
      button.checked = initialValue;
    }

    // Simulate a click after setting the checkbox value.
    clickCallback();
  });

  // Then set click handler to update storage on change.
  button.addEventListener('click', function() {
    let storageItem = {};
    storageItem["Settings-"+id] = button.checked;
    chrome.storage.sync.set(storageItem);

    clickCallback();
  });
}

/**
 * Sets the URL input box for dev mode.
 */
function setDevModeGithub() {
  let inputBox = document.getElementById("devModeGithubInput");

  // Set its value to the stored URL:
  chrome.storage.sync.get("Settings-devModeGithubURL", function(items) {
    if(chrome.runtime.error) {
      console.log("Dev Mode Github URL has never been set. Setting it to \" \".");
      // Assume worst - set it manually to "".
      let storageItem = {};
      storageItem["Settings-devModeGithubURL"] = " ";
      chrome.storage.sync.set(storageItem);
      inputBox.value = " ";
    } else {
      inputBox.value = items["Settings-devModeGithubURL"];
    }
  });

  // Now set it to store when enter is pressed in it:
  inputBox.addEventListener('keyup', function(event) {
    event.preventDefault();

    if(event.keyCode == 13) {
      let storageItem = {};
      storageItem["Settings-devModeGithubURL"] = inputBox.value;
      chrome.storage.sync.set(storageItem);
    }
  });
}

/**
 * Makes developer mode hidden unless the devModeCheckbox is set and displays
 * any data it initially should.
 */
function initDevMode() {
  if(!document.getElementById("devModeCheckbox").checked) {
    // If not in dev mode, hide the devModeContainer.
    document.getElementById("devModeContainer").className += " invisible";
  } else {
    console.log("Checked");
    // In dev mode:
    // Remove invisible class
    let container = document.getElementById("devModeContainer");
    container.className = container.className.replace("invisible", '');

    dumpStoredData();
    setClearStorageHandler();

    setDevModeGithub();
  }
}

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
*** Populates the user information in the browser extension with the data from the Metro API
**/
const populateUserInfo = function(response) {
  response = JSON.parse(response);

  if(response['status'] == 1) {
    let username = response['content']['username'];
    $('#username').append(username);
  } else {
    $('#username').addClass('text-danger').text('ERROR');
  }

}

/*
*
*/
const populateVersionInfo = function(response) {
  let ver = chrome.runtime.getManifest().version;
  $('#version').append(ver);

  response = JSON.parse(response);
  let currentVer = response['content']['chromeVersion'];

  currentVer = parseInt(currentVer.replace(/\D/g,''));
  ver = parseInt(ver.replace(/\D/g,''));

  if(currentVer > ver) {
    $('#newVersion').removeClass('d-none');
  }

  console.log(currentVer);
  console.log(ver);
}


// Entry point:
document.addEventListener('DOMContentLoaded', () => {
  getDataFromURL("https://getmetro.co/api/profile/", populateUserInfo);
  getDataFromURL("https://getmetro.co/api/extension/status", populateVersionInfo);
  initCheckbox("shouldMonitorCheckbox", () => {}, true);
  initCheckbox("showCounterCheckbox", () => {}, true);
  initCheckbox("devModeCheckbox", initDevMode, false);

  allowLinks();
});
