import {postMessageToWorker} from './lib/workermessage.es6';
import {setMessageHandler} from './lib/workermessage.es6';

function isString(thing) {
  return (typeof thing == 'string') || (thing instanceof String);
}

export class LookupWorker {
  constructor(src, options={}){
    if (options.timings) {
      this.timings = true
    }
    this.worker = new Worker(src);
  }

  setMessageHandler(handler) {
    return this.worker.addEventListener('message', handler);
  }

  postMessage(message) {
    let req = postMessageToWorker(this.worker, message);
    if (this.timings) {
      let msgstr = JSON.stringify(message);
      console.time(msgstr);
      req.then(()=> console.timeEnd(msgstr));
    }
    return req
  }

  init({fromLang, toLang, dataFile, glossaryFile, dbname}) {
    if (!dbname) {
      dbname = `${fromLang}2${toLang}Lookup`;
    }
    if (!dataFile) {
      dataFile = `/json/${fromLang}2${toLang}-entries.json`;
    }
    if (!glossaryFile) {
      glossaryFile  = `/json/${fromLang}2${toLang}-glossary.json`;
    }
    this.ready = this.postMessage({init: {fromLang, toLang, dataFile, glossaryFile, dbname}});
    return this.ready;
  }

  store({key, value}) {
    if (!key) {
      throw new TypeError('Message to be stored must define key');
    }
    return this.postMesasge({store: {key, value}});
  }

  retrieve(key) {
    if (key.key) key = key.key;
    if (!key) {
      throw new TypeError('key must be defined and not falsely')
    }
    return this.postMessage({retrieve: {key}});
  }

  getEntry({term}) {
    if (!term || !isString(term)) {
      throw new TypeError('term must be defined and be a string');
    }
    return this.postMessage({getEntry: {term}});
  }

  rank({term, terms, conjugated}) {
    if (!term && (!terms || terms.length == 0)) {
      throw new TypeError('either term or terms must be defined');
    }
    return this.postMessage({rank: {term, terms, conjugated}});
  }

  addGlossaryEntry(entry) {
    return this.postMessage({addGlossaryEntry: entry});
  }

  getGlossaryEntries({term, terms, exact}) {
    if (!term && (!terms || terms.length == 0)) {
      throw new TypeError('either term or terms must be defined');
    }
    if (term !== undefined && !isString(term)) {
      throw new TypeError('term must be a string');
    }
    if (terms !== undefined && !(terms instanceof Array)) {
      throw new TypeError('terms must be an array');
    }
    return this.postMessage({getGlossaryEntries: {term, terms, exact}})
  }
}
