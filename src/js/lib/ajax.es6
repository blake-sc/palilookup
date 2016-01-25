export default function ajax(url, data, callback, type) {
  return new Promise(function(resolve, reject, progress) {
    var data_array, data_string, idx, req, value;
    if (data == null) {
      data = {};
    }
    if (callback == null) {
      callback = function() {};
    }
    if (type == null) {
      //default to a GET request
      type = 'GET';
    }
    data_array = [];
    for (idx in data) {
      value = data[idx];
      data_array.push("" + idx + "=" + value);
    }
    data_string = data_array.join("&");
    req = new XMLHttpRequest();
    req.open(type, url, false);
    req.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    req.onload = function() {
      if (this.status >= 200 && this.status < 300) {
        if (/\.json$/.test(url)){
          resolve(JSON.parse(req.responseText));
        } else {
          resolve(req.responseText);
        }
      } else {
        reject({
          status: this.status,
          statusText: this.statusText
        })
      }
    }
    req.onerror = function() {
      reject({
        status: this.status,
        statusText: this.statusText
      })
    }

    req.onprogress = function() {
      progress({
        loaded: this.loaded,
        total: this.total
      })
    }
    req.send(data_string);
    return req;
  })
}
