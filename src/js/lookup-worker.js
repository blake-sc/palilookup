/* SharedWorker for handling Pali Lookup backend stuff */

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
    glossary: 'term,*origin'
  });

  await db.on('ready');
  let count = await db.meta.count();
  if (count == 0) {
    var loadGlossaryPromise = loadGlossaryData(glossaryFile); //Not await on purpose - run in parallel
    self.postMessage({'progress': 'fetching data'});
    let data = await ajax(dataFile, {}, null, 'GET');
    self.postMessage({'progress': 'populating database'});
    await populateDatabase(db, data);
    await loadGlossaryPromise();
  }
  self.postMessage({'progress': 'ready'});
}

async function loadGlossaryFile(glossaryFile) {
  let data = await ajax(glossaryFile, {}, null, 'GET');
  await loadGlossaryData(data);
  return {'status': 'success'}
}

async function loadGlossaryData(data){
  // First remove all old system entries
  await db.transaction('rw', db.glossary, () => {
    db.glossary.where('origin').equals('system').each(entry => {
      db.glossary.delete(entry.term);
    })
  });
  // Now load new system entries
  await db.transaction('rw', db.glossary, () => {
    for (let [term, gloss, context]  of data) {
      let origin = 'system';
      let comment = "";
      db.glossary.put({term, gloss, context, origin, comment});
    }
  })
  self.postMessage('Glossary Data Loaded');
  return {'status': 'success'}
}

async function addGlossaryEntry(entry) {
  if (!entry.term) {
    throw new ValueError('Entry has no term: ' + JSON.stringify(entry));
  }
  await db.glossary.put(entry)
  return {'status': 'success'}
}

async function getGlossaryEntries(query) {
  let terms = query.terms;
  if (query.term) {
    terms = [query.term];
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

  let matches = await db.entries.where('term').anyOf(terms).toArray();
  let conjugatedMatches = await db.entries.where('term').anyOf(conjugated).toArray();

  // Exact matches come first, followed by
  return [...matches, ...conjugatedMatches]
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
    self.postMessage({'progress': 'Loading: ' + chunk[0].term});
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
  let results = db.entries.where('term').anyOf(terms).toArray();
  return results
}

async function getAndRankMatches(query) {

  let terms = query.terms;
  if (!terms && query.term) {
    terms = [query.term];
  }
  let lang = query.lang;
  let conjugated = query.conjugated;
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

  let matchingTerms = await getMatchingTerms(terms);
  let matchingTermsFolded = await getMatchingTermsFolded(terms);
  let matchingTermsConjugated = await getMatchingTerms(conjugated);
  let matchingTermsConjugatedFolded = await getMatchingTermsFolded(conjugated);
  let matchingTermsFuzzy = await getMatchingTermsFuzzy(terms);

  let allMatchingTerms = new Set([...matchingTerms,
                           ...matchingTermsFolded,
                           ...matchingTermsConjugated,
                           ...matchingTermsConjugatedFolded,
                           ...matchingTermsFuzzy]);
  let scores = {};
  for (term of allMatchingTerms) {
    let score = 0;
    if (matchingTerms.has(term)) {
      score += 1;
    }
    else if (matchingTermsFolded.has(term)) {
      score += 0.25;
    }

    if (matchingTermsConjugated.has(term)) {
      score += 1;
    } else if (matchingTermsConjugatedFolded.has(term)) {
      score += 0.25;
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
    throw new Error('Terms matched, but bodies not found: ', JSON.stringify(Object.keys(scores)));
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
  // Folded results are arrays of possible original worlds
  // asi = ["āsi", "asi"]
  // Flatten these arrays
  let foldedTerms = terms.map(asciify);
  return new Set([].concat(...intersection(foldedTerms, allFoldedTerms)));
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

      if (!dataFile) {
        dataFile = `/json/${fromLang}2${toLang}.auto.json`;
      }
      if (!glossaryFile) {
        glossaryFile  = `/json/${fromLang}2${toLang}.json`;
      }
      if (!dbname) {
        dbname = `${fromLang}2${toLang}Lookup`;
      }
      Object.assign(settings, {fromLang, toLang, dbname, dataFile});
      await initDexie(dbname, dataFile, glossaryFile)
      return {status: 'success'}
    }

    if ('store' in message) {
      await db.user.put(message.store);
      return {status: 'success'}
    }
    if ('retrieve' in message) {
      let result = await db.user.get(message.retrieve.key);
      return result
    }
    if ('rank' in message) {
      let result = await getAndRankMatches(message.rank);
      return result
    }

    if ('addGlossaryEntry' in message) {
      let result = await addGlossaryEntry(message.addGlossaryEntry);
      return result
    }

    if ('getGlossaryEntries' in message) {
      let result = await getGlossaryEntries(message.getGlossaryEntries);
      return result
    }

    throw new Error('Message invalid, no action found: ' + JSON.stringify(message));
}

setMessageHandler(self, messageHandler);
