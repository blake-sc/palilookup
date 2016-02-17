
/* SharedWorker for handling Pali Lookup backend stuff */

"use strict";

var start = Date.now();

var window = self;

import Dexie from 'dexie';
import Levenshtein from 'fast-levenshtein';
import ajax from './lib/ajax.es6';
import './lib/runtime.js';
import pi from './lang/pi.es6';
import {setMessageHandler} from './lib/workermessage.es6';
import {asciify} from './lib/asciify.es6';
var db = null;

// Will be populated upon initialization
var settings = {}

async function initDexie(dbname, dataFile, glossaryFile) {
  Dexie.Promise.on('error', function(error) {
    console.error("Uncaught error: ", error);
  })
  self.postMessage({'progress': 'opening database'});
  db = new Dexie(dbname);
  db.version(1).stores({
    entries: 'term',
    meta: 'key',
    user: 'key',
    glossary: 'id,*term,*origin'
  });

  await db.on('ready');
  let count = await db.meta.count();
  if (count == 0) {
    var loadGlossaryPromise = loadGlossaryFile(glossaryFile); //Not await on purpose - run in parallel
    self.postMessage({'progress': 'fetching data'});
    let dataPromise = ajax(dataFile, {}, null, 'GET', sendDownloadProgress);
    let data = await dataPromise;

    await populateDatabase(db, data);
    await loadGlossaryPromise;
  }
  self.postMessage({'progress': 'ready'});
}

function sendDownloadProgress(e) {
  self.postMessage({progress: `downloaded ${Math.ceil(e.loaded / 1000000)}MB`});
}

async function loadGlossaryFile(glossaryFile) {
  let data = await ajax(glossaryFile, {}, null, 'GET');

  await loadGlossaryData(data);
  return {'status': 'success'}
}

function makeGlossaryEntryId(entry) {
  return [entry.term, entry.context, entry.origin].join('-');
}

async function loadGlossaryData(data){
    //console.log({data});
  //console.log(`Loading ${data.length} entries into Glossary`);
  // First remove all old system entries
  await removeGlossaryEntries({origin: 'system'});
  // Now load new system entries
  await db.transaction('rw', db.glossary, () => {
    for (let [term, gloss, context]  of data) {
      term = term.toLowerCase();
      let origin = 'system';
      let comment = "";
      let id = makeGlossaryEntryId({term, context, origin});
      db.glossary.put({id, term, gloss, context, origin, comment});
    }
  })
  self.postMessage('Glossary Data Loaded');
  return {'status': 'success'}
}

async function addGlossaryEntry(entry) {
  if (!entry.term) {
    throw new ValueError('Entry has no term: ' + JSON.stringify(entry));
  }
  entry.id = makeGlossaryEntryId(entry);
  await db.glossary.put(entry)
  return {'status': 'success'}
}

async function addGlossaryEntries({entries, origin}) {
  if (!origin) {
    origin = 'user';
  }
  await db.transaction('rw', db.glossary, () => {
    for (entry of entries) {
      if (!entry.origin) {
        entry.origin = origin;
      }
      entry.id = makeGlossaryEntryId(entry);
      db.glossary.put(entry);
    }
  })
}

async function removeGlossaryEntries({origin}) {
  console.log('removing entries')
  let deletedCount = 0;
  await db.transaction('rw', db.glossary, () => {
    db.glossary.where('origin').equals(origin).each(entry => {
      console.log('deleting entry', entry);
      db.glossary.delete(entry.id);
      deletedCount += 1;
    })
  });
  return {deletedCount}
}

async function getGlossaryEntries({term, terms, origin}) {
  if (term) {
    terms = [term];
  }

  terms = terms.map( term => term.toLowerCase() )
  let conjugated = [];
  if (settings.fromLang == 'pi') {
    conjugated = [];
    for (let term of terms) {
      let result = pi.conjugate(term);
      conjugated = conjugated.concat(result);
    }
    conjugated = new Set(conjugated);
    for (let term of terms) {
      conjugated.delete(term);
    }
    conjugated = [...conjugated];
  }

  let count = await db.glossary.count();
  //console.log(`Glossary has ${count} entries`);
  //console.log(`Searching glossary for ${JSON.stringify({terms, conjugated})}`);
  let clauses = db.glossary.where('term').anyOf(terms);
  if (origin) {
    clauses = clauses.where('origin').equals(origin);
  }
  let matches = await clauses.toArray();
  let conjugatedMatches = await db.glossary.where('term').anyOf(conjugated).toArray();
  // Exact matches come first, followed by
  out = [...matches, ...conjugatedMatches];
  //console.log({matches, conjugatedMatches, out});
  return [...matches, ...conjugatedMatches]
}

async function getAllGlossaryEntries({origin}) {
  let result = await db.glossary.where('origin').equals(origin).toArray();
  return result
}

async function populateDatabase(db, data) {
  var offset = 0,
      chunkSize = Math.floor(1 + data.length / 100),
      chunks = [];

  while (offset < data.length) {
      chunks.push(data.slice(offset, offset + chunkSize));
      offset += chunkSize;
  }

  for (chunk of chunks) {
    self.postMessage({'progress': 'initializing: ' + chunk[0].term + '…'});
    await db.transaction('rw', db.entries, function() {
      chunk.forEach(function(entry) {
        db.entries.put(entry);
      })
    })
  }

  var terms = new Set(data.map(entry => entry.term));
  var termsFolded = new Map();
  for (var term of terms) {
    var folded = asciify(term);
    if (termsFolded.has(folded)) {
      termsFolded.get(folded).push(term);
    }  else {
      termsFolded.set(folded, [term])
    }
  }
  await db.transaction('rw', db.meta, function() {
    db.meta.put({key: 'terms', value: terms});
    db.meta.put({key: 'termsFolded', value: termsFolded})
    db.meta.put({key: 'ready'})
  })
}

var _cache = {}
async function getTerms() {
  if (_cache._terms === undefined) {
    let req = await db.meta.get('terms');
    _cache._terms = req.value;
  }
  return _cache._terms;
}

async function getTermsFolded() {
  if (_cache._foldedTerms === undefined) {
    let req = await db.meta.get('termsFolded');
    _cache._foldedTerms = req.value;
  }
  return _cache._foldedTerms;
}

async function getTermBodies(terms) {
  terms = [...terms];
  let results = await db.entries.where('term').anyOf(terms).toArray();
  return results
}

async function getEntry({term}) {
  let results = await getTermBodies([term]);
  if (results.length) {
    return results[0];
  }
  return null;
}

async function getAndRankMatches({term, terms, priorityTerms, indeclinables, conjugated, excludeFuzzy}) {
  if (!terms && term) {
    terms = [term];
  }
  if (!conjugated && settings.fromLang == 'pi') {
    conjugated = [];
    for (let term of terms) {
      let result = pi.conjugate(term);
      conjugated = conjugated.concat(result);
    }
    conjugated = [... new Set(conjugated)];
  }

  if (!conjugated) {
    conjugated = [];
  }
  //console.log({priorityTerms});
  if (!priorityTerms) {
    priorityTerms = [];
  }

  let matchingTerms = await getMatchingTerms(terms);
  let matchingTermsIndeclinable = new Set();
  if (indeclinables) {
    matchingTermsIndeclinable = await getMatchingTerms(indeclinables);
  }
  let matchingTermsFolded = await getMatchingTermsFolded(terms);
  let matchingTermsConjugated = await getMatchingTerms(conjugated);
  let matchingTermsConjugatedFolded = await getMatchingTermsFolded(conjugated);

  let matchingTermsFuzzy = new Set();
  if (!excludeFuzzy) {
    machingTermsFuzzy = await getMatchingTermsFuzzy(terms);
  }

  console.log({matchingTerms, matchingTermsIndeclinable, matchingTermsFolded, matchingTermsConjugated, matchingTermsConjugatedFolded, matchingTermsFuzzy})
  let allMatchingTerms = new Set([...priorityTerms,
                           ...matchingTerms,
                           ...matchingTermsIndeclinable,
                           ...matchingTermsFolded,
                           ...matchingTermsConjugated,
                           ...matchingTermsConjugatedFolded,
                           ...matchingTermsFuzzy]);
  let scores = {};
  for (term of allMatchingTerms) {
    let score = 0;
    let priorityTermsIndex = priorityTerms.indexOf(term);
    if (priorityTermsIndex != -1) {
      score += 5 + 1 / (1 + priorityTermsIndex);
    }
    if (matchingTerms.has(term)) {
      score += 1;
    }
    else if (matchingTermsFolded.has(term)) {
      score += 0.5;
    }

    if (matchingTermsIndeclinable.has(term)) {
      score += 1;
    }

    if (matchingTermsConjugated.has(term)) {
      score += 1;
    } else if (matchingTermsConjugatedFolded.has(term)) {
      score += 0.5;
    }

    if (matchingTermsFuzzy.has(term)) {
      let fuzzyDistance = 0;

      for (originalTerm of terms) {
        fuzzyDistance += Levenshtein.get(term, originalTerm);
        fuzzyDistance += Levenshtein.get(asciify(term), asciify(originalTerm));
      }
      fuzzyDistance /= (0.0 + terms.length);
      score += 1 / (1 + fuzzyDistance);
    }
    scores[term] = score
  }
  let results = await getTermBodies(allMatchingTerms);

  for (result of results) {
    if (!(result.term in scores)) {
      throw new Error('No score for term: ', result.term);
    }
    result.score = scores[result.term];
    delete scores[result.term]
  }

  if (Object.keys(scores).length > 0) {
    console.error('Terms matched, but bodies not found: ' + JSON.stringify(Object.keys(scores)));
  }

  results.sort((a,b) => b.score - a.score);
  return results
}

function intersection(a, b) {
  if (b.length > a.length) {
    [a, b] = [b, a];
  }
  return new Set([...a].filter(value => b.has(value)));
}

async function getMatchingTerms(terms) {
  let allTerms = await getTerms();
  return intersection(terms, allTerms);
}

async function getMatchingTermsFolded(terms) {
  let allFoldedTerms = await getTermsFolded();
  let foldedTerms = terms.map(asciify);
  let result = [];
  let matches = intersection(foldedTerms, allFoldedTerms);
  // Folded results are arrays of possible original worlds
  // asi = ["āsi", "asi"]
  // Flatten these arrays
  for (match of matches) {
    result.push(...allFoldedTerms.get(match));
  }
  return new Set(result)
}

async function getMatchingTermsFuzzy(terms) {
  "use strict";
  let results = new Set();
  let foldedTerms = await getTermsFolded();

  for (let term of terms) {
    let foldedTerm = asciify(term);
    let prefixLength = 2 + Math.floor(term.length / 5);
    let maxEditDistance = term.length < 5 ? 0 : (term.length < 10 ? 1 : 2);
    if (maxEditDistance == 0) {
      continue
    }

    let rex = RegExp('^' + foldedTerm.slice(0, prefixLength));
    let thisTermSuffix = foldedTerm.slice(prefixLength);
    for (let [otherTerm, originalTerms] of foldedTerms.entries()) {
      if (rex.test(otherTerm)) {
        let otherTermSuffix = otherTerm.slice(prefixLength);
        if (Math.abs(thisTermSuffix.length - otherTermSuffix.length) > maxEditDistance) {
          continue
        }
        let editDistance = Levenshtein.get(thisTermSuffix, otherTermSuffix);
        if (editDistance <= maxEditDistance) {
          for (let originalTerm of originalTerms) {
            results.add(originalTerm);
          }
        }
      }
    }
  }
  return results;
}



var examples = {
  init: {
    fromLang: "pi",
    toLang: "en"
  },
  store: {
    key: 'stuff',
    value: 'whatever'
  },
  retrieve: {
    key: 'stuff'
  },
  rank: {
    terms: ['sati']
  },
  addGlossaryEntry: {
    term: 'sati',
    gloss: 'memory',
    context: 'original'
  },
  getGlossaryEntries: {
    terms: ['sati']
  }
}

async function messageHandler(message) {
  let msgstr = JSON.stringify(message);
    if (typeof(message) == "string") {
      throw new TypeError('Does not understand strings, please use objects: ' + msgstr)
    }
    if (Object.keys(message).length > 1) {
      throw new Error('Message invalid, more than one action: ' + msgstr)
    }
    if ('init' in message) {
      let {fromLang,
           toLang,
           dataFile,
           glossaryFile,
           dbname
         } = message.init;

      Object.assign(settings, {fromLang, toLang, dbname, dataFile});
      await initDexie(dbname, dataFile, glossaryFile)
      return {status: 'success'}
    }

    let result = null;

    if ('store' in message) {
      await db.user.put(message.store);
      result = {status: 'success'}
    }

    else if ('retrieve' in message) {
      result = await db.user.get(message.retrieve.key);
    }

    else if ('rank' in message) {
      result = await getAndRankMatches(message.rank);
    }

    else if ('getEntry' in message) {
      result = await getEntry(message.getEntry);
    }

    else if ('getGlossaryEntries' in message) {
      result = await getGlossaryEntries(message.getGlossaryEntries);
    }

    else if ('getAllGlossaryEntries' in message){
      result = await getAllGlossaryEntries(message.getAllGlossaryEntries);
    }

    else if ('addGlossaryEntry' in message) {
      result = await addGlossaryEntry(message.addGlossaryEntry);
    }

    else if ('addGlossaryEntries' in message) {
      result = await addGlossaryEntries(message.addGlossaryEntries);
    }

    else if ('removeGlossaryEntries' in message) {
      result = await removeGlossaryEntries(message.removeGlossaryEntries);
    }

    else {
      throw new Error('Message invalid, no action found: ' + JSON.stringify(message));
    }

    return result
}

setMessageHandler(self, messageHandler);
