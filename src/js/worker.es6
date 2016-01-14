import regneratorRuntime from './lib/runtime.js';
import {setMessageHandler} from './lib/workermessage.es6';

console.log('Worker Started');

setMessageHandler(function(msg) {
  console.log('Handling message, ', msg);
  return new Promise(function(resolve, reject) {
    setTimeout(function(){
      console.log('Resolving message');
      resolve('Howdy there!');
    }, 1000);
  });
});
