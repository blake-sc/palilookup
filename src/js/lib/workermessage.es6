var callbacks = new Map();
var next_msg_id = 1;
var listeners = new Map();

function handleMessage(event) {
  let result = event.data.result;
  let msg_id = event.data.id;

  console.log(`Recieved back message ${result}, ${msg_id}`);

  if (callbacks[msg_id]) {
    callbacks[msg_id][0](result);
    callbacks.delete(msg_id);
  } else {
    console.error('Message from worker has no handler', event)
  }
}

export function postMessageToWorker(worker, msg) {
  let msg_id = next_msg_id++;
  if (!(worker in listeners)) {
    listeners[worker] = worker.addEventListener('message', handleMessage);
  }
  worker.postMessage({id: msg_id, source: msg})
  return new Promise(function(resolve, reject) {
    callbacks[msg_id] = [resolve, reject];
  })
}

export function setMessageHandler(handler) {
  if (self.document !== undefined) {
    console.error('Function should not be called from renderer thread');
  }
  self.onmessage = async function(event) {
    console.log(JSON.stringify(event.data));
    var source = event.data.source,
        msg_id = event.data.id;
    console.log(`Received a message: ${source}, ${msg_id}`);

    let result = await handler(source);
    console.log('Posting back result: ', result);
    self.postMessage({id:msg_id, result: result});
  }
}
