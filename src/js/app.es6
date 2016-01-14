import regneratorRuntime from './lib/runtime.js';
import adder from './lib.es6';

import {postMessageToWorker} from './lib/workermessage.es6';

console.log(adder(1,4));

var worker = new Worker('worker.js');

function sleepy(howlong){
  return new Promise(function(resolve, reject) {
    setTimeout(function(){
      let t = howlong / 1000;
      resolve(`I slept for ${t}s`);
    }, howlong);
  });
}

async function chatter(times) {
  if (!times) times = 2;
  for (let i = 0; i < times; i++) {
    let result = await sleepy((1 + i) * 250);
    console.log(result);
  }
}

postMessageToWorker(worker, "Hi There");
postMessageToWorker(worker, "Bye Now").then(function(result) {
  console.log('It worked! I got back a: ', result);
})
