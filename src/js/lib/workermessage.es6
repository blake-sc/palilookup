
var callbacks = new Map();
var next_msg_id = 1;
var listeners = new Map();

function handleMessage(event) {
  "use strict";
  let result = event.data.result;
  let msg_id = event.data.id;
  let worker = event.target;

  if (msg_id === undefined) {
    return true
  }

  if (callbacks[msg_id]) {
    callbacks[msg_id][0](result);
    callbacks.delete(msg_id);
    event.stopImmediatePropagation();
  }
}

export function postMessageToWorker(worker, msg) {
  if (!(worker instanceof Worker)) {
    throw new TypeError('First parameter should be a Worker');
  }
  let msg_id = next_msg_id++;
  if (!(worker in listeners)) {
    listeners[worker] = worker.addEventListener('message', handleMessage);
  }
  worker.postMessage({id: msg_id, source: msg})
  return new Promise(function(resolve, reject) {
    callbacks[msg_id] = [resolve, reject];
  })
}

export function setMessageHandler(selfOrPort, handler) {
  selfOrPort.onmessage = async function(event) {
    var source = event.data.source,
        msg_id = event.data.id;
    let result = await handler(source);
    selfOrPort.postMessage({id:msg_id, result: result});
  }
}
