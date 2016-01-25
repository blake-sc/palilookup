import regneratorRuntime from './lib/runtime.js';
import adder from './lib.es6';
import ajax from './lib/ajax.es6';
import {postMessageToWorker} from './lib/workermessage.es6';

function sleep(time) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, time);
  });
}

async function init() {
  worker.addEventListener('message', function(e){
    if (e.data.progress) {
      console.log('Progress: ' + e.data.progress);
    }
  });
  let result = await postMessageToWorker(worker,
    {
      init: {
        fromLang: 'pi',
        toLang: 'en'
      }
    });
  console.log('Initialized: ' + JSON.stringify(result));
  console.time('Search: bhavati');
  result = await postMessageToWorker(worker, {rank: {term: 'bhavati'}});
  console.log(result);
  console.timeEnd('Search: bhavati');
  console.time('Search: santussi');
  result = await postMessageToWorker(worker, {rank: {term: 'santussi'}});
  console.log(result);
  console.timeEnd('Search: santussi');
}

function LookupUtility(settings) {
  this.popups = [];
  this.init(settings);
}

lookupUtility.prototype = {
  sources: {
      cped: {
          'brief': 'CPD',
          'name': 'Concise Pali English Dictionary'
      },
      pts_ped: {
          'brief': 'PTS',
          'name': 'PTS Pali English Dictionary'
      },
      dhammika_ff: {
          'brief': 'N&E',
          'name': "Nature and the Environment in Early Buddhism by S. Dhammika"
      },
      sc_dppn: {
          'brief': 'PPN',
          'name': 'Pali Proper Names'
      }
  },
  progressHandler: function(event) {
    if (e.data.progress) {
      console.log('Progress: ' + e.data.progress);
    }
  },
  postMessage: async function(message) {
    let result = await postMessageToWorker(this.lookupWorker, message);
    return result
  }
  init: async function({fromLang, toLang, dataFile, glossaryFile}) {
    this.lookupWorker = new Worker('lookupWorker.js');
    this.lookupWorker.addEventListener((e)=> this.progressHandler(e));
    this.ready = await this.postMessage({
      init: {fromLang, toLang, dataFile, glossaryFile}
    });
  },
  mouseoverHandler: async function(event) {
    var target = $(event.target);
    if (target.parents('.text-popup').length > 0) {
      return
    }

    await sleep(50);
    if ($(e.target).is(':hover')) {
      await this.lookup({node: e.target, includeGlossary: true});
    }
  },
  clickHandler: function(event) {
    this.clearPopups();
    this.decomposeMode(event.target);
  },
  getDefaultMain: function(){
    return $('main, body').first();
  },
  addHandlers: function({selector, main}) {
    if (selector === undefined) {
      throw new TypeError('selector must be defined');
    }
    if (main === undefined) {
      main = this.getDefaultMain();
    }

    $(main).on('click.lookup', selector, e => this.clickHandler(e));
    $(main).on('mouseover.lookup', selector, e => this.mouseoverHandler(e));

  },
  removeHandlers: function({main}) {
    if (main === undefined) {
      main = this.getDefaultMain();
    }
    $(main).off('.lookup');
    this.clearPopups();
  },
    deTiTerm: function(term) {
        return term.replace(/n[”’]+ti$/, 'ṃ').replace(/[”’]+ti$/, '');
    },
    normalizeTerm: function(term) {
        return term.toLowerCase()
                   .normalize('NFC')
                   .replace(/\xad/g, '')
                   .replace(/ṁ/g, 'ṃ')
                   .replace(/ṃ([gk])/g, 'ṅ$1')
                   .replace(/n[”’]+ti/, 'ṃ')
                   .replace(/[”’]+ti/, '')
    },
    getTerm: function(node) {
        var term = node.childNodes[1].nodeValue;
        if (!term || term.match(/^\s+$/)) return null
        return term
    },
    getTermNormalized: function(node) {
        var term = this.getTerm(node)
        term = this.normalizeTerm(term)
        term = this.deTiTerm(term);
        return term
    },
    lookup: async function({node, term, parent, includeGlossary}) {
        if (!term) {
          term = this.getTerm(node);
          if (term == null) return
        }
        //console.log('Lookup: ' + term);
        this.clearPopups();
        let result = await this.postMessage({rank: {priorityTerms: [], terms: [term]}})

        self.msearch(query).then(function(results) {
            var hits = self.getScoredHits(results.responses, weights),
                table = $('<table class="pali"/>'),
                maxScore = _(hits).chain().pluck('_score').max().value(),
                hiddenCount = 0;
            hits.forEach(function(hit) {
                var tr = $('<tr/>').appendTo(table);
                if (hit._score < 5) {
                    tr.addClass('poor-match')
                }
                if (maxScore > 1 && hit._score < 5 && hit._score < maxScore) {
                    tr.addClass('hide');
                    hiddenCount += 1;
                }
                $('<td class="term"/>').text(hit._source.term).appendTo(tr);
                var meaning = $('<td class="meaning"/>').appendTo(tr);
                var ul = $('<ul/>').appendTo(meaning);
                hit._source.entries.forEach(function(entry) {
                    var li = $('<li/>').appendTo(ul);

                    var content = $('<div class="content"/>').append(entry.html_content)
                                               .appendTo(li);
                    $('<a class="source"/>').text(self.sources[entry.source].brief)
                                            .attr('title', self.sources[entry.source].name)
                                            .prependTo(content).css('float', 'left');
                    content.find('dt').remove();
                    content.find('dd > p:first-child').contents().unwrap();
                });
            });

            if (includeGlossary) {
                $('<tfoot><tr class="glossary"><td colspan=2></td></tr></tfoot>')
                           .appendTo(table)
                           .find('td')
                           .append(self.glossary.createInputBar(term));
            }
            self.addUnhideBar(table);
            if (preFn) {
                preFn(table);
            }
            var popupAnchor = $(node).children('.lookup-word-marker');
            popup = sc.popup.popup(popupAnchor[0], table);
            popup.data('parent', parent);

            if (popup) {
                popup.find('li').addClass('expandable');
                popup.on('click', 'li', function(e) {
                    $(this).addClass('clicked');
                    self.expandEntry(this, popup);
                    return false
                });

                if (popup.tipsy) {
                    popup.find('[title]').removeAttr('title');
                }
                /*
                if (window.PTL) {
                    popup.find('.poor-match .term').each(function(){
                        var ele = $(this),
                            searchTerm = ele.text();

                        if (term == searchTerm) return

                        ele.html(window.PTL.editor.doDiff(term, searchTerm));
                        var last = ele.contents().last()
                        if (last.is('.diff-delete') && last.text() == 'ṃ') {
                            last.remove();
                        }
                    });
                }
                */


            }
        });
    },
    addUnhideBar: function(table) {
        var self = this,
            hiddenCount = table.find('tr.hide').length;

        if (hiddenCount > 0) {
            var string = hiddenCount == 1 ? ' fuzzy result…' : ' fuzzy results…',
                tr = $('<tr><td colspan=2 class="unhide">' + hiddenCount + string + '</td></tr>')
                .appendTo(table);
            tr.one('click', function() {
                table.find('tr.hide')
                     .slice(0, hiddenCount == 5 ? 5 : 4)
                     .removeClass('hide');
                tr.remove();
                self.addUnhideBar(table);
                if (table.parent().length) {
                    table.parent().data('alignFn')();
                }
            });
        }
    },
    expandEntry: function(entry, popup) {
        var textField = $('<div class="popup-text-overlay"/>').html($(entry).html()),
            closeButton = $('<div class="popup-close-button">✖</div>').css('float', 'right');
        textField.children('.content').prepend(closeButton);
        popup.append(textField);
        textField.find('[original-title]').attr('original-title', '');
        textField.height(Math.max(popup.height(),
                         Math.min(textField.children('.content').height(), popup.width() * 0.6)));
        setTimeout(function(){
            textField.on('click', function(e) {
                if ($(e.target).is('.popup-text-overlay, .popup-close-button')) {
                    textField.remove();
                    return false
                }
            });
        }, 400);
    },
    charRex: /(?:[aiueoāīū]|br|[kgcjtṭdḍbp]h|[kgcjtṭdḍp](?!h)|[mnyrlvshṅṇṃṃñḷ]|b(?![rh]))/ig,
    decomposeMode: function(node) {
        var self = this,
            term = self.deTiTerm(self.getTerm(node)),
            popup = $('<div class="decomposed"/>');
        if (!term) return

        term.match(self.charRex).forEach(function(char) {
            popup.append($('<span class="letter"/>').text(char))
        });
        var em = Number(getComputedStyle(node, "").fontSize.match(/(\d*(\.\d*)?)px/)[1])
        var pos = $(node).offset();
        var popupAnchor = $(node).children('.lookup-word-marker')
        var dPopup = sc.popup.popup(popupAnchor.offset(), popup, true);
        var offset = popupAnchor.offset();
        offset.top -= em / 3;
        offset.left -= em / 2;

        popup.parent().offset(offset);
        popup.on('mouseover click', '.letter', function(e) {
            $('.letter.selected').removeClass('selected');
            var letters = $(e.target).add($(e.target).nextAll());
            letters.addClass('selected');
            var out = letters.map(function(i, e) {return $(e).text()})
                             .get()
                             .join('');
            out = self.normalizeTerm(out);
            sc.popup.clear();
            var query = self.buildQueryDecomposed(out);
            self.lookup({node: node,
                         term: out,
                         parent: dPopup,
                         query: query.query,
                         weights: query.weights,
                         preFn: function(popup){
                             popup.find('tr').each(function() {
                                var tr = $(this),
                                    td = $('<td class="accept">✓</td>'),
                                    thisTerm = tr.children('.term').text();
                                if ((self.termBreakCache.retrieve(term) || []).indexOf(thisTerm) != -1) {
                                    td.addClass('accepted');
                                }
                                tr.append(td);
                            })
                            popup.on('click', '.accept', function(){
                                var thisTerm = $(this).siblings('.term').text();
                                if ($(this).hasClass('accepted')) {
                                    $(this).removeClass('accepted');
                                    self.termBreakCache.unstore(term, thisTerm);
                                } else {
                                    self.termBreakCache.store(term, thisTerm);
                                    $(this).addClass('accepted');
                                }
                            });
                         }
                        })
            return false
        })
    },
    decomposeVowels: function(term) {
        var table = {
                'a': ['a'],
                'ā': ['ā', 'a'],
                'i': ['i'],
                'ī': ['ī', 'i'],
                'u': ['u'],
                'ū': ['ū', 'u'],
                'e': ['e', 'a', 'i'],
                'o': ['o', 'a', 'u']
            },
            firstChar = term[0],
            lastChar = term.slice(-1),
            terms = [];
        if (table[firstChar]) {
            table[firstChar].forEach(function(char) {
                terms.push(char + term.slice(1));
            })
        } else {
            terms.push(term);
        }
        terms2 = [];
        if (table[lastChar]) {
            terms.forEach(function(term) {
                table[lastChar].forEach(function(char) {
                    terms2.push(term.slice(0, -1) + char);
                });
            });
        } else {
            terms2 = terms;
        }
        return terms2;
    },
    decompose: function(term, callback) {
        term = this.deTiTerm(term)
        var out = this.conjugate(term),
            chars = term.match(this.charRex);

        for (var j = chars.length - 1; j > 0; j--) {
            subTerm = chars.slice(0, j).join('');
            if (subTerm.length <= 2) continue
            out = out.concat(this.decomposeVowels(subTerm));
        }
        return out;
    },
    storeInCache: function(term, resp) {
        this._cache[term] = resp;
    },
    retrieveFromCache: function(term, success, failure) {
        if (false || this._cache[term]) {
            success(this._cache[term])
        } else {
            failure()
        }
    },
    source: ['gloss', 'entries', 'term'],
    exactQuery: function(term) {
        return {
            _source: this.source,
            filter: {
                term: {
                    'term': term
                }
            }
        }
    },
    exactQueryTerms: function(terms) {
        return {
            _source: this.source,
            filter: {
                terms: {
                    'term.folded': _.map(terms, asciify)
                }
            }
        }
    },
    conjugatedQuery: function(term) {
        return {
            _source: this.source,
            filter: {
                terms: {
                  'term.folded': _.map(this.conjugate(term), asciify)
                }
            }
        }
    },
    fuzzyQuery: function(term) {
        if (term.match(/ṃ$/)) {
            return {
                "_source": this.source,
                "query": {
                    "bool": {
                        "should": [
                            {
                                "fuzzy": {
                                    "term.folded": {
                                        "max_expansions": 10,
                                        "prefix_length": 3,
                                        "value": asciify(term)
                                    }
                                }
                            },
                            {
                                "fuzzy": {
                                    "term.folded": {
                                        "max_expansions": 10,
                                        "prefix_length": 2,
                                        "value": asciify(term.replace(/ṃ$/, ''))
                                }
                              }
                            }
                        ]
                    }
                }
            }
        } else {
            return {
                _source: this.source,
                "query": {
                    "fuzzy": {
                        "term.folded": {
                            "max_expansions": 5,
                            "prefix_length": 3,
                            "value": asciify(term)
                        }
                    }
                }
            }
        }
    },
    decomposedQuery: function(term) {
        return {
            _source: ['gloss', 'entries', 'term'],
            query: {
                constant_score: {
                    filter: {
                        terms: {
                          'term.folded': _.map(this.decompose(term), asciify)
                        }
                    }
                }
            }
        }
    },
    buildQueryStandard: function(term) {
        var self = this,
            term = this.normalizeTerm(term),
            body = [
                    {}, this.exactQuery(term),
                    {}, this.conjugatedQuery(term),
                    {}, this.fuzzyQuery(term)
                   ],
            weights = [10, 5, 1],
            components = this.termBreakCache.retrieve(term);
        if (components) {
            components.forEach(function(component) {
                body.push({});
                body.push(self.exactQuery(component));
                weights.push(8);
            });
        }
        return {
            query: {
                index: this.index,
                type: this.type,
                body: body
            },
            weights: weights
        }
    },
    buildQueryDecomposed: function(term) {
        return {
            query: {
                index: this.index,
                type: this.type,
                body: [
                    {}, this.decomposedQuery(term)
                ]
            },
            weights: [5]
        }
    },
    /**
     * Create a unique key from a query, guaranteed to not collide.
     * Basically JSON but with sorted keys.
     * @param {Object} query - An object representable as JSON.
     * @returns {String}
     */
    keyify: function(query, method) {
        var key = 'a',
            string = orderedStringify(query),
            m = /"(?:term(?:\.[^"]+)?|folded|normalized)":\[?"([^"]+)"/.exec(string);
        if (!m) {
            //console.log(string);
        }
        key = method + '_' + m ? m[1] : '';
        key += murmurhash3_32_gc(string);
        return key
    },
    cachedQuery: function(method, query) {
        //console.log(method, query)
        var self = this
            fn = _.bind(sc.paliLookup.client[method], sc.paliLookup.client),
            key = self.keyify(query, method);

        self._last_queries.push(query)
        if (self._last_queries.length > 10) {
            self._last_queries.splice(0, self._last_queries.length - 10)
        }

        var cached_value = self._promise_cache.retrieve(key);
        if (cached_value) {
            return cached_value;
        }

        if (self._idbcache.available) {
            //console.log('Returning from IDB cache')
            var promise = self._idbcache.get(key)
                                 .then(function(result) {
                                    //console.log('Result: ', result);
                                    return result.data;
                                 })
                                 .fail(function(e){
                                    return fn(query).then(function(result) {
                                                //console.log('Adding to cache [' + key +']: ', result);
                                                self._idbcache.add(key, result);
                                                return result
                                            });
                                 });
        } else {
            //console.log(promise);
            promise = fn(query)
            promise.fail(function(){
                //console.log('Error when running query with method: ' + method);
                //console.log(query)
            });
        }
        self._promise_cache.add(key, promise);
        return promise
    },
    /**
     * search "wrapper" which adds caching
     * @param {Object} query
     * @returns {Promise}
     */
    search: function(query) {
        return this.cachedQuery('search', query);
    },
    /**
     * msearch "wrapper" which adds caching
     * @param {Array} msearch_query - As required by elastic.js msearch
     * @returns {Promise}
     */
    msearch: function(msearch_query) {
        return this.cachedQuery('msearch', msearch_query)
    },
    /** Precache queries, returns nothing. Stampede safe.
     * @param {Array} queries to be requested and cached.
     */
    msearchPrecache: function(queries) {
        //console.log('Performing precache ', queries);
        var self = this,
            new_queries = [],
            keys = [];
        queries.forEach(function(msearch_query) {
            var key = self.keyify(msearch_query, 'msearch');
            if (key in self._promise_cache) {
                return
            }
            new_queries.push(msearch_query);
            keys.push(key);
        })
        var r = self._msearchBuffered(new_queries);
        keys.forEach(function(key, i) {
            self._promise_cache[key] = r[i];
        });
    },
    /** Perform multiple multi searches in a single request
     * @param {Array} msearch_queries
     * @returns {Array} Array of promises in the same order as the queries.
     */
    _msearchBuffered: function(msearch_queries) {
        var self = sc.paliLookup,
            out = [],
            deferred = [];

        if (msearch_queries.length == 0) {
            return deferred
        }

        var combined = _.clone(msearch_queries[0]);
            combined.body = [];

        msearch_queries.forEach(function(query, i) {
            combined.body.push.apply(combined.body, query.body);
            deferred.push($.Deferred());
        });

        self.msearch(combined).then(function(resp) {
            var responses = resp.responses,
                place = 0;

            msearch_queries.forEach(function(query, i) {
                var count = query.body.length / 2;

                deferred[i].resolve({responses: responses.slice(place, place + count)});
                place += count;
            });
        });
        return deferred;
    },
    termBreakCache: {
        storage: {},
        mapping: {},
        updateMapping: function(key) {
            var self = this;
            if (key === undefined) {
                _.each(this.storage, function(value, key) {
                    self.updateMapping(key);
                });
                return
            }
            var conjugations = {};
            sc.paliLookup.conjugate(key).forEach(function(t) {
                conjugations[t] = key;
            })
            _.extend(this.mapping, conjugations);
        },
        keyize: function(term) {
            return sc.paliLookup.normalizeTerm(sc.paliLookup.deTiTerm(term));
        },
        store: function(term, component) {
            var key = this.keyize(term)
                components = this.storage[key] || [];
            if (components.indexOf(component) == -1) {
                components.push(component);
                this.storage[key] = components;
                this.updateMapping(key);
                this.saveToServer();
            }
        },
        unstore: function(term, component) {
            var key = this.keyize(term),
                components = this.storage[key] || [],
                index = components.indexOf(component);
            if (index >= 0) {
                components.splice(index, 1);
                this.storage[key] = components;
            }
        },
        retrieve: function(term) {
            var key = this.keyize(term),
                result = this.storage[key];
            if (!result || result.length == 0) {
                var terms = sc.paliLookup.conjugate(key);
                for (var i = 0; i < terms.length; ++i) {
                    var mappedTerm = this.mapping[terms[i]];
                    if (mappedTerm) {
                        result = this.storage[mappedTerm];
                        break
                    }
                }
            }
            return result
        },
        remove: function(term) {
            delete this.storage[this.keyize(term)];
        },
        saveToServer: async function() {
          this.postMessage({'store': {key: 'termBreakCache.user', value: this.storage}})
            sc.paliLookup.client.index({
                index: 'pali-lookup',
                type: 'compounds',
                id: 'localuser',
                body: {
                    data: this.storage
                }
            })
        },
        loadFromServer: function() {
            var self = this;
            sc.paliLookup.client.get({
                index: 'pali-lookup',
                type: 'compounds',
                id: 'localuser'
            }).then(function(resp) {
                self.storage = resp._source.data;
                self.updateMapping();
            }).fail(function() {
                return
            });
        }
    },
    // suffix, keep count, min word length, replacement
    endings: [
        ["ati",0,"a"],
        ["āti",0,"ā"],
        ["eti",0,"e"],
        ["oti",0,"o"],
        ["o",0,"a"],
        ["ā",0,"a"],
        ["aṃ",0,"a"],
        ["ṃ",0,""],
        ["e",0,"a"],
        ["ena",0,"a"],
        ["ehi",0,"a"],
        ["ebhi",0,"a"],
        ["āya",0,"a"],
        ["ssa",0,""],
        ["ānaṃ",0,"a"],
        ["smā",0,""],
        ["mhā",0,""],
        ["smiṃ",0,""],
        ["mhi",1,""],
        ["esu",0,"a"],
        ["ayo",1,"i"],
        ["inā",1,"i"],
        ["īhi",1,"ī"],
        ["hi",2,""],
        ["ībhi",1,"ī"],
        ["bhi",1,""],
        ["ino",1,"i"],
        ["īnaṃ",1,"ī"],
        ["īsu",1,"ī"],
        ["i",2,"ī"],
        ["inaṃ",0,"i"],
        ["avo",1,"u"],
        ["ave",1,"u"],
        ["unā",1,"u"],
        ["ūhi",1,"ū"],
        ["ūbhi",1,"ū"],
        ["uno",1,"u"],
        ["ūnaṃ",1,"ū"],
        ["ūsu",1,"ū"],
        ["ū",2,"u"],
        ["āni",2,"a"],
        ["īni",2,"ī"],
        ["ūni",2,"ū"],
        ["a",2,"ā"],
        ["āyo",0,"a"],
        ["āhi",0,"a"],
        ["ābhi",0,"a"],
        ["āyaṃ",0,"a"],
        ["āsu",0,"a"],
        ["iyo",0,"i"],
        ["iyā",0,"i"],
        ["iyaṃ",0,"i"],
        ["iyā",0,"ī"],
        ["iyaṃ",0,"ī"],
        ["iyaṃ",0,"i"],
        ["āya",0,"ī"],
        ["ī",0,"a"],
        ["inī",0,"a"],
        ["uyo",0,"u"],
        ["uyā",0,"u"],
        ["uyaṃ",0,"u"],
        ["ā",0,"ant"],
        ["a",3,"ant"],
        ["ataṃ",3,"ant"],
        ["antaṃ",3,"ant"],
        ["anto",3,"ant"],
        ["antā",3,"ant"],
        ["ante",3,"ant"],
        ["atā",3,"ant"],
        ["antehi",3,"ant"],
        ["ato",3,"ant"],
        ["antānaṃ",3,"ant"],
        ["ati",3,"ant"],
        ["antesu",3,"ant"],
        ["ā",3,"anta"],
        ["a",3,"anta"],
        ["ataṃ",3,"anta"],
        ["ataṃ",3,"ati"],
        ["antaṃ",3,"anta"],
        ["anto",3,"anta"],
        ["antā",3,"anta"],
        ["ante",3,"anta"],
        ["atā",3,"anta"],
        ["antehi",3,"anta"],
        ["ato",3,"anta"],
        ["antānaṃ",3,"anta"],
        ["ati",3,"anta"],
        ["antesu",3,"anta"],
        ["ā",2,"ar"],
        ["āraṃ",2,"ar"],
        ["ārā",2,"ar"],
        ["u",2,"ar"],
        ["uno",2,"ar"],
        ["ari",2,"ar"],
        ["āro",2,"ar"],
        ["ūhi",2,"ar"],
        ["ūbhi",2,"ar"],
        ["ūnaṃ",2,"ar"],
        ["ārānaṃ",2,"ar"],
        ["ūsu",2,"ar"],
        ["ā",2,"ar"],
        ["a",2,"ar"],
        ["araṃ",2,"ar"],
        ["arā",2,"ar"],
        ["aro",2,"ar"],
        ["unā",2,"ar"],
        ["arehi",2,"ar"],
        ["arebhi",2,"ar"],
        ["ānaṃ",2,"ar"],
        ["arānaṃ",2,"ar"],
        ["unnaṃ",2,"ar"],
        ["ito",2,"ar"],
        ["uyā",2,"ar"],
        ["yā",2,"ar"],
        ["yaṃ",2,"ar"],
        ["uyaṃ",2,"ar"],
        ["aṃ",0,"ā"],
        ["āya",0,"ā"],
        ["asā",0,"o"],
        ["aso",0,"o"],
        ["asi",0,"o"],
        ["ā",0,"o"],
        ["aṃ",0,"o"],
        ["e",0,"o"],
        ["ena",0,"o"],
        ["ehi",0,"o"],
        ["ebhi",0,"o"],
        ["āya",0,"o"],
        ["assa",0,"o"],
        ["ānaṃ",0,"o"],
        ["asmā",0,"o"],
        ["amhā",0,"o"],
        ["asmiṃ",0,"o"],
        ["amhi",0,"o"],
        ["esu",0,"o"],
        ["ato",2,"ati"],
        ["atā",2,"ati"],
        ["ato",2,"āti"],
        ["atā",2,"āti"],
        ["eto",2,"eti"],
        ["etā",2,"eti"],
        ["oto",2,"oti"],
        ["otā",2,"oti"],
        ["ahi",1,"a"],
        ["to",2,""],
        ["annaṃ",1,"a"],
        ["unnaṃ",1,"u"],
        ["innaṃ",1,"i"],
        ["atā",1,"ati"],
        ["iya",2,"a"],
        ["uyaṃ",0,""],
        ["anti",0,"ati"],
        ["si",3,"ti"],
        ["asi",0,"ati"],
        ["atha",0,"āti"],
        ["āmi",0,"ati"],
        ["āma",0,"ati"],
        ["āmi",0,"āti"],
        ["āma",0,"āti"],
        ["onti",0,"oti"],
        ["osi",0,"oti"],
        ["otha",0,"oti"],
        ["omi",0,"oti"],
        ["oma",0,"oti"],
        ["enti",0,"eti"],
        ["esi",0,"eti"],
        ["etha",0,"eti"],
        ["emi",0,"eti"],
        ["ema",0,"eti"],
        ["hi",3,"ti"],
        ["atu",2,"ati"],
        ["antu",1,"ati"],
        ["ohi",0,"oti"],
        ["otu",0,"oti"],
        ["ontu",0,"oti"],
        ["etu",0,"eti"],
        ["entu",0,"eti"],
        ["ehi",0,"eti"],
        ["eti",2,"ati"],
        ["enti",2,"ati"],
        ["esi",2,"ati"],
        ["etha",2,"ati"],
        ["emi",2,"ati"],
        ["ema",2,"ati"],
        ["eti",2,"āti"],
        ["enti",2,"āti"],
        ["esi",2,"āti"],
        ["etha",2,"āti"],
        ["emi",2,"āti"],
        ["ema",2,"āti"],
        ["entu",2,"ati"],
        ["ayitvā",2,"eti"],
        ["ayitvāna",2,"eti"],
        ["vāna",2,"i"],
        ["āpetvā",0,"ati"],
        ["itvāna",0,"ati"],
        ["itvāna",0,"āti"],
        ["itvāna",0,"eti"],
        ["etvāna",0,"ati"],
        ["tvāna",0,"ti"],
        ["itvā",0,"ati"],
        ["itvā",0,"āti"],
        ["itvā",0,"eti"],
        ["etvā",0,"ati"],
        ["tvā",0,"ti"],
        ["āya",0,"ati"],
        ["āya",0,"ati"],
        ["āya",0,"āti"],
        ["āya",0,"eti"],
        ["tuṃ",0,"ti"],
        ["ituṃ",0,"ati"],
        ["ituṃ",0,"āti"],
        ["a",3,"ati"],
        ["i",3,"ati"],
        ["imha",0,"ati"],
        ["imhā",0,"ati"],
        ["iṃsu",1,"ati"],
        ["ittha",0,"ati"],
        ["uṃ",0,"ati"],
        ["suṃ",0,"ti"],
        ["siṃ",0,"ti"],
        ["iṃ",0,"ati"],
        ["a",3,"āti"],
        ["i",3,"āti"],
        ["imha",0,"āti"],
        ["imhā",0,"āti"],
        ["iṃsu",1,"āti"],
        ["ittha",0,"āti"],
        ["uṃ",0,"āti"],
        ["iṃ",0,"āti"],
        ["a",3,"eti"],
        ["i",3,"eti"],
        ["imha",0,"eti"],
        ["imhā",0,"eti"],
        ["iṃsu",1,"eti"],
        ["ayiṃsu",1,"eti"],
        ["ittha",0,"eti"],
        ["uṃ",0,"eti"],
        ["iṃ",0,"eti"],
        ["iyaṃ",0,"eti"],
        ["eyya",0,"ati"],
        ["eyyaṃ",0,"ati"],
        ["eyyuṃ",0,"ati"],
        ["eyyati",0,"ati"],
        ["eyyasi",0,"ati"],
        ["eyyātha",0,"ati"],
        ["eyyāmi",0,"ati"],
        ["eyyāsi",0,"ati"],
        ["eyyāma",0,"ati"],
        ["eyyanti",0,"ati"],
        ["eyya",0,"āti"],
        ["eyyaṃ",0,"āti"],
        ["eyyuṃ",0,"āti"],
        ["eyyati",0,"āti"],
        ["eyyasi",0,"āti"],
        ["eyyātha",0,"āti"],
        ["eyyāmi",0,"āti"],
        ["eyyāsi",0,"āti"],
        ["eyyāma",0,"āti"],
        ["eyyanti",0,"āti"],
        ["eyya",0,"eti"],
        ["eyyaṃ",0,"eti"],
        ["eyyuṃ",0,"eti"],
        ["eyyati",0,"eti"],
        ["eyyasi",0,"eti"],
        ["eyyātha",0,"eti"],
        ["eyyāmi",0,"eti"],
        ["eyyāsi",0,"eti"],
        ["eyyāma",0,"eti"],
        ["eyyanti",0,"eti"],
        ["eyya",0,"oti"],
        ["eyyaṃ",0,"oti"],
        ["eyyuṃ",0,"oti"],
        ["eyyati",0,"oti"],
        ["eyyasi",0,"oti"],
        ["eyyātha",0,"oti"],
        ["eyyāmi",0,"oti"],
        ["eyyāsi",0,"oti"],
        ["eyyāma",0,"oti"],
        ["eyyanti",0,"oti"],
        ["issa",2,"ati"],
        ["issā",2,"ati"],
        ["issaṃsu",2,"ati"],
        ["issatha",2,"ati"],
        ["issaṃ",2,"ati"],
        ["issāmi",2,"ati"],
        ["issati",3,"ati"],
        ["issāma",2,"ati"],
        ["issa",2,"āti"],
        ["issā",2,"āti"],
        ["issaṃsu",2,"āti"],
        ["issa",2,"āti"],
        ["issatha",2,"āti"],
        ["issaṃ",2,"āti"],
        ["issāma",2,"āti"],
        ["essa",2,"eti"],
        ["essā",2,"eti"],
        ["essaṃsu",2,"eti"],
        ["essa",2,"eti"],
        ["essatha",2,"eti"],
        ["essaṃ",2,"eti"],
        ["essāma",2,"eti"],
        ["issanti",3,"ati"]
    ]
    ,
    /* Glossary Sub Module */
    glossary: {
        index: 'pi2en-glossary',
        type: 'entry',
        client: null,
        init: function() {
            this.client = sc.paliLookup.client;
        },
        addEntry: function(term, context, gloss, comment) {
            if (typeof(term) == "string") {
                var body = {
                    term: term,
                    context: context,
                    gloss: gloss,
                    comment: comment
                }
            } else {
                var body = term;
            }
            body.normalized = sc.paliLookup.normalizeTerm(body.term);
            body.source = body.source || 'user';
            return this.client.index({
                index: this.index,
                type: this.type,
                id: body.context ? body.term + '-' + body.context : body.term,
                body: body
            })
        },
        getEntry: function(term) {
            term = sc.paliLookup.normalizeTerm(term);
            var body = {
                query: {
                    constant_score: {
                        filter: {
                            term: {
                                'normalized': term
                            }
                        }
                    }
                }
            }
            return sc.paliLookup.search({index: this.index,
                                         type: this.type,
                                         body: body});
        },
        buildQueryBody: function(terms) {
            terms = _(terms).map(sc.paliLookup.normalizeTerm);
            return {
                query: {
                    bool: {
                        should: [
                            {
                                constant_score: {
                                    filter: {
                                        terms: {
                                            'normalized': _.map(terms, asciify)
                                        }
                                    }
                                }
                            },
                            {
                                constant_score: {
                                    filter: {
                                        terms: {
                                          'normalized': _(terms).chain()
                                                          .map(_.bind(sc.paliLookup.conjugate, sc.paliLookup))
                                                          .flatten()
                                                          .compact()
                                                          .unique()
                                                          .map(asciify)
                                                          .value()
                                        }
                                    }
                                }
                            }
                        ]
                    }
                }
            }
        },
        getEntries: function(terms, args) {
            if (typeof(terms) == "string") {
                terms = terms.split(sc.paliLookup.markupGenerator.splitRex);
                terms = _(terms).filter(_.bind(RegExp.prototype.test,
                                               sc.paliLookup.markupGenerator.paliAlphaRex))
            }

            var body = this.buildQueryBody(terms);
            var query = {index: this.index,
                         type: this.type,
                         body: body}
            if (args) {
                _.extend(query, args);
            }
            return sc.paliLookup.search(query);
        },
        createInputBar: function(term) {
            var self = this;
            term = sc.paliLookup.normalizeTerm(term);
            var form = $('<form disabled class="add-glossary-entry">' +
              '<input name="term" value="' + term + '" required>' +
              '<input name="gloss" placeholder="gloss" value="">' +
              '<input name="context" placeholder="context" value="">' +
              '<input name="comment" placeholder="comment">' +
              '<input name="user" type="hidden" value="user">' +
              '<button>+</button>' +
              '</form>');

            this.getEntry(term).then(function(result) {
                if (!result.hits) {
                    //console.log('Bad Results for ' + term + '!');
                    //console.log(result);
                    return
                }
                if (result.hits.total > 0) {
                    _(result.hits.hits[0]._source).each(function(value, name) {
                        if (value) {
                            form.find('[name=' + name + ']').val(value);
                        }
                    });
                }
            });

            form.on('submit', function(e) {
                e.preventDefault();

                var items = _(form.serializeArray()).chain()
                                                    .map(function(o){return [o.name, o.value]})
                                                    .object()
                                                    .value()
                if (!items.gloss && !items.comment) {
                    return
                }

                items.term = items.term.toLowerCase();
                items.normalized = sc.paliLookup.normalizeTerm(items.term);
                self.addEntry(items).then(function(e){
                    form.find('button').text('✓');
                });
                form.children().attr('disabled', 'disabled');
                return false
            });
            return form
        }
    },
    /* Markup Generator Sub Component*/
    markupGenerator: {
        paliAlphaRex: /([aiueokgcjtdnpbmyrlvshāīūṭḍṅṇṃñḷ])/i,
        paliRex: /([aiueokgcjtdnpbmyrlvshāīūṭḍṅṇṃñḷ’­”]+)/ig,
        splitRex: /(&[a-z]+;|<\??[a-z]+[^>]*>|[^  \n,.– —:;?!"'“‘\/\-]+)/i,
        excludeFn: function(node) {
            if (node.parentNode.nodeName == 'A') {
                if ($(node.parentNode).parents('h1,h2,h3,h4,h5').length == 0) {
                    return false
                }
                return true
            }
            return false
        },
        wrapWords: function(node, markupOpen, markupClose, excludeFn) {
            var self = this,
                contents = $(node).contents(),
                excludeFn = self.excludeFn;

            $(node).textNodes().each(function(i, node){
                if (excludeFn && excludeFn(node)) {
                    return
                }
                var text = node.nodeValue;
                if (text.search(self.paliAlphaRex) == -1) {
                    return
                }
                var newHtml = text.replace(self.paliRex, function(m, word) {
                    return markupOpen + word + markupClose;
                });
                var proxy = $('<span/>')[0];
                node.parentNode.replaceChild(proxy, node);
                proxy.outerHTML = newHtml;
            });
        }
    },
    /* General Initialization Code */
    mouseovertarget: '#text',
    targets: 'p, h1, h2, h3, h4, h5',
    exclusions: '.text-popup *',
    isActive: false,
    activate: function() {
        var self = this;
        if (self.isActive) return
        self.isActive = true;
        $(self.mouseovertarget).on('mouseover.lookupMarkup', self.targets , function(e) {

            var target = $(e.target);
            if (!target.is(self.targets)) {
                return true
            }
            if (target.is(self.exclusions)) {
                return true
            }
            if (target.hasClass('lookup-marked-up')) {
                return
            }

            sc.paliLookup.markupGenerator.wrapWords(target, '<span class="lookup"><span class="lookup-word-marker"></span>', '</span>')
            target.addClass('lookup-marked-up');
        })
        sc.paliLookup.init({elasticUrl: sc.exports.elasticsearch_api_url, target: '.lookup'});
        sc.paliLookup.addHandlers();
    },
    deactivate: function() {
        $('#text').off('mouseover.lookupMarkup')
        sc.paliLookup.removeHandlers();
        this.isActive = false;
    },
    toggleOn: false,
    toggle: function() {
        var state = !this.toggleOn;
        if (state) {
            this.activate()
        } else {
            this.deactivate()
        }
    }
}
_.bindAll(sc.paliLookup, "lookup")
_.bindAll(sc.paliLookup.termBreakCache, "keyize", "store", "unstore", "retrieve", "remove", "saveToServer", "loadFromServer");
